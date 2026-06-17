// tier 达标率看板核心计算（移植 generate_tier_dashboard.py 的口径）。
// 纯函数：输入三张原始表 + 租户配置 → TierViewData。可单测、可 node 验证、可双轨对账。
import {
  Person, Newcomer, OverviewRow, DabuCard, IncentiveCard, QaCheck, TierViewData, TenantCompute, CityRank, MayBaseline,
} from "../../model/canonical";
import { TIERS, GROWTH_TIERS, getTier, normalizeWorkId, safeFloat, dabuShort } from "../../transforms/tier";

// 奥丁 CSV「资管明细」列（0 起，按 SKILL.md）。导出供 odinSource 复用（避免列定义漂移）。
export const CSV = { city: 0, dabu: 1, area: 2, id: 3, name: 4, join: 5, target: 7, cumulative: 8, pass: 9, diff: 10, weighted: 11, onjob: 12, annualMonths: 13, annualTarget: 14 };
// 花名册列
export const ROSTER = { id: 0, status: 9, leave: 12 };

// 日期归一：SheetJS 解析 CSV/xlsx 时日期可能变成 Date 或 Excel 序列号，统一回 'YYYY-MM-DD'
function pad(n: number): string { return String(n).padStart(2, "0"); }
function toDateStr(v: any): string {
  if (v === null || v === undefined || v === "") return "";
  if (v instanceof Date) return `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}`;
  if (typeof v === "number" && v > 0) {
    const d = new Date(Math.round((v - 25569) * 86400 * 1000)); // Excel 序列号 → UTC 日期
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  }
  return String(v);
}

export interface ComputeInput {
  excelRows: any[][];   // 5月基准（含表头）
  csvRows: any[][];     // 当前资管明细（含表头）
  rosterRows: any[][];  // 花名册（含表头）
  config: TenantCompute;
  monthPrefix: string;  // 'YYYY-MM'，本月离职判断
  now: number;
}

export function computeTier(input: ComputeInput): TierViewData {
  const { config, monthPrefix } = input;
  const EX = config.excelColumns;
  const districts = config.districts;

  // 全国城市排名：用全部行(不限城市)按城市聚合达标加权人次/考核加权人次
  const cityAgg = new Map<string, { pw: number; tw: number; n: number }>();
  for (const row of input.csvRows.slice(1)) {
    const city = String(row[CSV.city] ?? "").trim();
    if (!city) continue;
    const w = safeFloat(row[CSV.weighted]);
    const a = cityAgg.get(city) ?? { pw: 0, tw: 0, n: 0 };
    a.tw += w; if (String(row[CSV.pass] ?? "") === "是") a.pw += w; a.n++;
    cityAgg.set(city, a);
  }
  const cityRanking: CityRank[] = [...cityAgg.entries()]
    .map(([city, a]) => ({ city, rate: a.tw > 0 ? Math.round((a.pw / a.tw) * 1000) / 10 : 0, count: a.n, passWeighted: Math.round(a.pw * 10) / 10, totalWeighted: Math.round(a.tw * 10) / 10 }))
    .sort((x, y) => y.rate - x.rate);

  // 5月基准达标率（5月 xlsx 全量，城市=武汉；Col6 考核加权人次 / Col7 达标加权人次，SKILL §11）
  let mpw = 0, mtw = 0, mNot = 0;
  const mDabu = new Map<string, { pw: number; tw: number }>();
  for (const row of input.excelRows.slice(1)) {
    if (!row || !String(row[0] ?? "").includes(config.cityFilter)) continue;
    const tw = safeFloat(row[6]); const pw = safeFloat(row[7]);
    mtw += tw; mpw += pw;
    if (safeFloat(row[EX.mayRate]) < 1) mNot++;
    const db = dabuShort(String(row[EX.district] ?? ""), districts);
    const m = mDabu.get(db) ?? { pw: 0, tw: 0 }; m.pw += pw; m.tw += tw; mDabu.set(db, m);
  }
  const mayBaseline: MayBaseline = {
    rate: mtw > 0 ? Math.round((mpw / mtw) * 1000) / 10 : 0,
    passWeighted: Math.round(mpw * 10) / 10, totalWeighted: Math.round(mtw * 10) / 10, notReached: mNot,
    dabuRates: Object.fromEntries([...mDabu].map(([k, v]) => [k, v.tw > 0 ? Math.round((v.pw / v.tw) * 1000) / 10 : 0])),
  };

  // 5月基准：按工号建表（仅本城市）
  const excelById = new Map<string, any>();
  for (const row of input.excelRows.slice(1)) {
    if (!row || row.length <= EX.mayRate) continue;
    if (!row[EX.id] || !String(row[CSV.city] ?? row[0] ?? "").includes(config.cityFilter)) {
      // 城市列可能不在 EX；用第 0 列兜底
      if (!String(row[0] ?? "").includes(config.cityFilter)) continue;
    }
    const gh = normalizeWorkId(row[EX.id]);
    if (!gh) continue;
    const mr = safeFloat(row[EX.mayRate]) * 100;
    const [tn, tr] = getTier(mr);
    excelById.set(gh, {
      name: String(row[EX.name] ?? "").trim(),
      dabu: dabuShort(String(row[EX.district] ?? ""), districts),
      area: String(row[EX.area] ?? "").trim(),
      mayCumulative: safeFloat(row[EX.mayCumulative]),
      mayRate: mr, mayTier: tn, mayTierRank: tr,
    });
  }

  // 花名册：按工号 → 状态/离职日期
  const roster = new Map<string, { status: string; leave: string }>();
  for (const row of input.rosterRows.slice(1)) {
    if (!row) continue;
    const gh = normalizeWorkId(row[ROSTER.id]);
    if (gh) roster.set(gh, { status: String(row[ROSTER.status] ?? "").trim(), leave: toDateStr(row[ROSTER.leave]) });
  }

  // 分类
  const onjob: Person[] = [], lost: Person[] = [], newcomers: Newcomer[] = [];
  let excluded = 0;
  for (const row of input.csvRows.slice(1)) {
    if (!row || String(row[CSV.city] ?? "") !== config.cityFilter) continue;
    const gh = normalizeWorkId(row[CSV.id]);
    if (!gh) continue;
    const name = String(row[CSV.name] ?? "");
    const dabu = dabuShort(String(row[CSV.dabu] ?? ""), districts);
    const area = String(row[CSV.area] ?? "");
    const onJobCsv = String(row[CSV.onjob] ?? "") === "是";
    const target = safeFloat(row[CSV.target]);
    const cumulative = safeFloat(row[CSV.cumulative]);
    const weighted = safeFloat(row[CSV.weighted]);
    const isPass = String(row[CSV.pass] ?? "") === "是";
    const diff = safeFloat(row[CSV.diff]);
    const joinDate = toDateStr(row[CSV.join]);
    const ri = roster.get(gh) ?? { status: "", leave: "" };

    const ex = excelById.get(gh);
    if (ex) {
      const cr = target > 0 ? (cumulative / target) * 100 : 0;
      const [ct, ctr] = getTier(cr);
      const tc: Person["tierChange"] = ctr < ex.mayTierRank ? "↑升" : ctr > ex.mayTierRank ? "↓降" : "—";
      const p: Person = {
        gonghao: gh, name, dabu, area, joinDate,
        mayTier: ex.mayTier, mayTierRank: ex.mayTierRank, mayRate: Math.round(ex.mayRate * 10) / 10,
        mayCumulative: ex.mayCumulative,
        currentTier: ct, currentTierRank: ctr, tierChange: tc,
        rate: Math.round(cr * 10) / 10, target, cumulative,
        monthlyNew: Math.round((cumulative - ex.mayCumulative) * 10) / 10,
        diff, pass: isPass, weighted, onJob: onJobCsv,
        rosterStatus: ri.status, leaveDate: ri.leave,
        statusLabel: onJobCsv ? "在职在岗" : `离职(${ri.leave})`,
        roster: onJobCsv ? "在职" : "离职",
        annualMonths: safeFloat(row[CSV.annualMonths]),
        annualTarget: safeFloat(row[CSV.annualTarget]),
      };
      if (onJobCsv) onjob.push(p);
      else if (ri.leave && ri.leave.startsWith(monthPrefix)) lost.push(p);
      else excluded++;
    } else {
      if (ri.status === "在职在岗") newcomers.push({ gonghao: gh, name, dabu, area, cumulative, joinDate });
      else excluded++;
    }
  }

  // 档位流动（总览）
  const baseline = [...onjob, ...lost];
  const overview: OverviewRow[] = TIERS.map((t) => {
    const may = baseline.filter((p) => p.mayTier === t).length;
    const up = onjob.filter((p) => p.mayTier === t && p.tierChange === "↑升").length;
    const down = onjob.filter((p) => p.mayTier === t && p.tierChange === "↓降").length;
    const lostC = lost.filter((p) => p.mayTier === t).length;
    const upIn = onjob.filter((p) => p.currentTier === t && p.tierChange === "↑升").length;
    const downIn = onjob.filter((p) => p.currentTier === t && p.tierChange === "↓降").length;
    const june = onjob.filter((p) => p.currentTier === t).length;
    return { tier: t, may, up, down, lost: lostC, upIn, downIn, june, change: june - may };
  });

  // 大区卡
  const dabuMetrics = new Map<string, { pw: number; tw: number }>();
  for (const p of onjob) {
    const m = dabuMetrics.get(p.dabu) ?? { pw: 0, tw: 0 };
    m.tw += p.weighted; if (p.pass) m.pw += p.weighted;
    dabuMetrics.set(p.dabu, m);
  }
  const dabuCards: DabuCard[] = districts.map((d) => {
    const don = onjob.filter((p) => p.dabu === d), dlo = lost.filter((p) => p.dabu === d);
    const dall = [...don, ...dlo];
    const rows: OverviewRow[] = [];
    for (const t of TIERS) {
      const may = dall.filter((p) => p.mayTier === t).length;
      const june = don.filter((p) => p.currentTier === t).length;
      if (may === 0 && june === 0) continue;
      rows.push({
        tier: t, may,
        up: don.filter((p) => p.mayTier === t && p.tierChange === "↑升").length,
        down: don.filter((p) => p.mayTier === t && p.tierChange === "↓降").length,
        lost: dlo.filter((p) => p.mayTier === t).length,
        upIn: don.filter((p) => p.currentTier === t && p.tierChange === "↑升").length,
        downIn: don.filter((p) => p.currentTier === t && p.tierChange === "↓降").length,
        june, change: june - may,
      });
    }
    const m = dabuMetrics.get(d) ?? { pw: 0, tw: 0 };
    return {
      name: d, rate: m.tw > 0 ? Math.round((m.pw / m.tw) * 1000) / 10 : 0,
      up: don.filter((p) => p.tierChange === "↑升").length,
      down: don.filter((p) => p.tierChange === "↓降").length,
      lost: dlo.length, rows,
    };
  });

  // 激励
  const incentives: IncentiveCard[] = districts.map((d) => {
    const don = onjob.filter((p) => p.dabu === d);
    const growth = don.filter((p) => GROWTH_TIERS.includes(p.mayTier));
    const passG = growth.filter((p) => p.pass);
    const target = config.incentiveTargets[d] ?? 0;
    const actual = passG.length;
    return {
      dabu: d, growth: growth.length,
      c90: growth.filter((p) => p.mayTier === "成长90").length,
      c80: growth.filter((p) => p.mayTier === "成长80").length,
      c70: growth.filter((p) => p.mayTier === "成长70").length,
      actual, target, amount: target > 0 ? Math.round(Math.min((actual / target) * 2000, 2000)) : 0,
    };
  });

  // KPI
  let pw = 0, tw = 0;
  for (const p of onjob) { tw += p.weighted; if (p.pass) pw += p.weighted; }
  const dabuRates: Record<string, number> = {};
  for (const c of dabuCards) dabuRates[c.name] = c.rate;
  const up = overview.reduce((s, r) => s + r.up, 0);
  const down = overview.reduce((s, r) => s + r.down, 0);

  // QA：勾稽恒等式 + 占位
  const checks: QaCheck[] = [];
  const identityOk = overview.every((r) => r.may === r.june + r.up + r.down + r.lost - r.upIn - r.downIn);
  checks.push({ name: "勾稽恒等式", status: identityOk ? "ok" : "bad", detail: identityOk ? "5月 = 6月 + 升 + 降 + 离 - 升入 - 降入，全部平衡" : "档位流动不平衡，请检查口径" });
  checks.push({ name: "数据规模", status: onjob.length > 0 ? "ok" : "bad", detail: `在岗 ${onjob.length} · 离职 ${lost.length} · 新人 ${newcomers.length} · 排除 ${excluded}` });
  const blocked = checks.some((c) => c.status === "bad");

  return {
    generatedAt: input.now,
    counts: { onjob: onjob.length, lost: lost.length, newcomer: newcomers.length, excluded },
    summary: { up, down, hold: onjob.length - up - down },
    kpi: { rate: tw > 0 ? Math.round((pw / tw) * 1000) / 10 : 0, passWeighted: Math.round(pw * 10) / 10, totalWeighted: Math.round(tw * 10) / 10, notReached: onjob.filter((p) => !p.pass).length, dabuRates },
    overview, dabuCards, incentives,
    persons: [...onjob, ...lost].sort((a, b) => a.dabu.localeCompare(b.dabu) || a.mayTierRank - b.mayTierRank || b.rate - a.rate),
    newcomers, cityRanking, mayBaseline, qa: { checks, blocked },
  };
}
