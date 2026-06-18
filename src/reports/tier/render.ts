// 年标准人效达标率 — 面板渲染（7 模块），用新设计系统组件。数据字段不变（口径冻结）。
import { TierViewData, OverviewRow, Person } from "../../model/canonical";
import { TIERS, GROWTH_TIERS } from "../../transforms/tier";
import { esc, f1, sectionCard, statCard, dataTable, statusTag, progressBar, tierChip, emptyState } from "../components";

export interface TrendEntry {
  date: string; rate: number; rank: number | null;
  passWeighted: number; totalWeighted: number; notReached: number;
  diffLe3: number; diff35: number; diff58: number; diffGt8: number;
  hanyang: number; wuchang: number; hankou: number;
}

const TIER_COLORS = ["var(--tier-1)", "var(--tier-2)", "var(--tier-3)", "var(--tier-4)", "var(--tier-5)", "var(--tier-6)", "var(--tier-7)"];
const tierColor = (t: string) => TIER_COLORS[Math.max(0, TIERS.indexOf(t))] || "var(--tier-7)";
const chg = (c: string) => c === "↑升" ? `<span class="pos">↑升</span>` : c === "↓降" ? `<span class="neg">↓降</span>` : `<span class="dim">—</span>`;
const deltaPP = (cur: number, base: number) => { const v = f1(cur - base); return v > 0 ? `<span class="pos">▲ +${v}pp</span>` : v < 0 ? `<span class="neg">▼ ${v}pp</span>` : `<span class="dim">—</span>`; };

/** 一个人的悬停明细行：姓名，X套，5月达成率→当前达成率。 */
const personTip = (p: Person) => `${p.name}，${f1(p.weighted)}套，${f1(p.mayRate)}%→${f1(p.rate)}%`;

/** 9 列流动表（总览 + 大区共用）。传 persons 则升级/降级/离职/升入/降入单元格挂个人明细 title（悬停可见）。 */
function flowTable(rows: OverviewRow[], persons?: Person[]): string {
  const head = `<tr><th>档位</th><th>5月</th><th>↑升级</th><th>↓降级</th><th>→离职</th><th>←升入</th><th>←降入</th><th>6月</th><th>变化</th></tr>`;
  // 流动单元格：有人数则挂 title（多行个人明细）+ hint 样式
  const mcell = (val: number, cls: string, pred: (p: Person) => boolean) => {
    if (!val) return `<td class="num dim">—</td>`;
    const tip = persons ? persons.filter(pred).map(personTip).join("\n") : "";
    return tip ? `<td class="num ${cls} hint" title="${esc(tip)}">${val}</td>` : `<td class="num ${cls}">${val}</td>`;
  };
  const cell = (r: OverviewRow) => {
    const t = r.tier;
    return `<td style="text-align:left">${tierChip(t, tierColor(t))}</td><td class="num">${r.may}</td>` +
      mcell(r.up, "pos", (p) => p.mayTier === t && p.tierChange === "↑升") +
      mcell(r.down, "neg", (p) => p.mayTier === t && p.tierChange === "↓降") +
      mcell(r.lost, "lost", (p) => p.mayTier === t && p.roster === "离职") +
      mcell(r.upIn, "pos", (p) => p.currentTier === t && p.tierChange === "↑升") +
      mcell(r.downIn, "neg", (p) => p.currentTier === t && p.tierChange === "↓降") +
      `<td class="num"><b>${r.june}</b></td>` +
      `<td class="num ${r.change > 0 ? "pos" : r.change < 0 ? "neg" : "dim"}">${r.change > 0 ? "+" + r.change : r.change || "—"}</td>`;
  };
  const body = rows.map((r) => `<tr>${cell(r)}</tr>`).join("");
  const sum = (k: keyof OverviewRow) => rows.reduce((s, r) => s + (r[k] as number), 0);
  const tot = `<tr class="total"><td style="text-align:left">合计</td><td class="num">${sum("may")}</td><td class="num">${sum("up")}</td><td class="num">${sum("down")}</td><td class="num">${sum("lost")}</td><td class="num">${sum("upIn")}</td><td class="num">${sum("downIn")}</td><td class="num">${sum("june")}</td><td class="num">${sum("change")}</td></tr>`;
  return dataTable(head, body + tot);
}

/** 大区升降级分析名单：升档 / 降档(按5月档位拆解) / 临界达标(差≤3套) / 潜力<50。 */
function regionNotes(name: string, persons: Person[]): string {
  const onjob = persons.filter((p) => p.dabu === name && p.roster === "在职");
  const names = (ps: Person[]) => ps.map((p) => esc(p.name)).join("、");
  const up = onjob.filter((p) => p.tierChange === "↑升");
  const down = onjob.filter((p) => p.tierChange === "↓降");
  const crit = onjob.filter((p) => !p.pass && p.diff <= 3).sort((a, b) => a.diff - b.diff);
  const low = onjob.filter((p) => p.currentTier === "潜力<50");
  const parts: string[] = [];
  if (up.length) parts.push(`<div class="rn ok">✅ 升档 ${up.length} 人：${names(up)}</div>`);
  if (down.length) {
    const grp = TIERS.map((t) => { const n = down.filter((p) => p.mayTier === t).length; return n ? `${t}降${n}人` : ""; }).filter(Boolean).join("、");
    parts.push(`<div class="rn warn">⚠️ 降档 ${down.length} 人（${grp}）：${names(down)}</div>`);
  }
  if (crit.length) parts.push(`<div class="rn crit">◆ 临界达标 ${crit.length} 人（差≤3套）：${crit.map((p) => `${esc(p.name)}(差${f1(p.diff)}套)`).join("、")}</div>`);
  if (low.length) parts.push(`<div class="rn low">▼ 潜力&lt;50 共 ${low.length} 人：${names(low)}</div>`);
  return parts.length ? `<div class="region-notes">${parts.join("")}</div>` : "";
}

export function renderTierPanel(d: TierViewData, opts: { trend?: TrendEntry[] }): string {
  const trend = opts.trend && opts.trend.length ? opts.trend : [];
  const out: string[] = [];

  // 模块锚点导航
  out.push(`<nav class="mod-nav">` + [["m-city", "全国城市排名"], ["m-trend", "每日趋势"], ["m-inc", "6月激励"], ["m-overview", "档位健康度"], ["m-region", "大区管理"], ["m-new", "新人首考"], ["m-person", "人员明细"]].map(([h, t]) => `<a href="#${h}">${t}</a>`).join("") + `</nav>`);

  // 概览统计卡
  const whRank = d.cityRanking.findIndex((c) => c.city.includes("武汉")) + 1;
  out.push(`<div class="stat-row">` + [
    statCard("武汉达标率", `${d.kpi.rate}<span class="unit">%</span>`, { delta: { text: `vs 5月 ${f1(d.kpi.rate - d.mayBaseline.rate) >= 0 ? "+" : ""}${f1(d.kpi.rate - d.mayBaseline.rate)}pp`, kind: d.kpi.rate >= d.mayBaseline.rate ? "pos" : "neg" } }),
    statCard("全国排名", whRank ? `${whRank}` : "—", { unit: whRank ? ` / ${d.cityRanking.length}城` : "", }),
    statCard("在岗 / 本月离职", `${d.counts.onjob}`, { unit: ` / ${d.counts.lost}`, delta: { text: `新人首考 ${d.counts.newcomer} 人`, kind: "dim" } }),
    statCard("档位流动", `${d.summary.up}↑ ${d.summary.down}↓`, { delta: { text: `持平 ${d.summary.hold} 人`, kind: "dim" } }),
    statCard("未达标人数", `${d.kpi.notReached}`, { unit: " 人", delta: { text: `圈定激励 ${d.incentives.reduce((s, i) => s + i.growth, 0)} 人`, kind: "dim" } }),
  ].join("") + `</div>`);

  // ① 全国城市排名
  const cityHead = `<tr><th>排名</th><th>城市</th><th>达标率</th><th>达标人次</th><th>考核人次</th><th>人数</th></tr>`;
  const cityBody = d.cityRanking.map((c, i) => `<tr class="${c.city.includes("武汉") ? "hl" : ""}"><td class="num">${i + 1}</td><td style="text-align:left">${esc(c.city)}</td><td class="num">${c.rate}%</td><td class="num">${c.passWeighted}</td><td class="num">${c.totalWeighted}</td><td class="num">${c.count}</td></tr>`).join("");
  out.push(sectionCard("全国城市排名", d.cityRanking.length ? dataTable(cityHead, cityBody, { sortable: true }) : emptyState("无城市数据", "需全国下载资管明细"), { id: "m-city", meta: `${d.cityRanking.length} 城` }));

  // ② 每日趋势（含 5/31 基准；达标率列带迷你色条）
  const tHead = `<tr><th>日期</th><th>达标率</th><th>变化</th><th>全国排名</th><th>达标人次</th><th>考核人次</th><th>未达标</th><th>差≤3</th><th>差3-5</th><th>差5-8</th><th>差&gt;8</th><th>汉阳</th><th>武昌</th><th>汉口</th></tr>`;
  const tBody = trend.map((e, i) => {
    const cs = i === 0 ? statusTag("hold", "基准") : (() => { const v = f1(e.rate - trend[i - 1].rate); return v > 0 ? `<span class="pos">▲+${v}pp</span>` : v < 0 ? `<span class="neg">▼${v}pp</span>` : `<span class="dim">—</span>`; })();
    const rc = (v: number) => v >= 30 ? "pos" : "";
    return `<tr><td>${esc(e.date)}</td><td class="num ${rc(e.rate)}"><span class="spark" style="width:${Math.min(60, e.rate)}px"></span> ${e.rate}%</td><td>${cs}</td><td class="num">${e.rank ? "第" + e.rank : "—"}</td><td class="num">${e.passWeighted}</td><td class="num">${e.totalWeighted}</td><td class="num">${e.notReached}</td><td class="num">${e.diffLe3}</td><td class="num">${e.diff35}</td><td class="num">${e.diff58}</td><td class="num">${e.diffGt8}</td><td class="num ${rc(e.hanyang)}">${e.hanyang}%</td><td class="num ${rc(e.wuchang)}">${e.wuchang}%</td><td class="num ${rc(e.hankou)}">${e.hankou}%</td></tr>`;
  }).join("");
  out.push(sectionCard("每日趋势（武汉）", trend.length ? dataTable(tHead, tBody) : emptyState("暂无趋势历史", "每天刷新会累计；含 5/31 基准"), { id: "m-trend" }));

  // ③ 6月激励
  const inc = d.incentives.map((c) => {
    const pct = c.target > 0 ? Math.round((c.actual / c.target) * 100) : 0;
    return `<div class="inc"><div class="inc-top"><span class="inc-name">${esc(c.dabu)}</span><span class="inc-amt">${c.amount}元</span></div><div class="inc-detail">圈定 ${c.growth} 人 · 成长90:${c.c90} 80:${c.c80} 70:${c.c70}</div>${progressBar(pct, pct >= 100)}<div class="inc-foot"><span>达标 ${c.actual}/${c.target} 人</span><span>差 ${Math.max(0, c.target - c.actual)} 人</span></div></div>`;
  }).join("");
  const tg = d.incentives.reduce((s, i) => s + i.growth, 0), ta = d.incentives.reduce((s, i) => s + i.actual, 0), tt = d.incentives.reduce((s, i) => s + i.target, 0), tamt = d.incentives.reduce((s, i) => s + i.amount, 0);
  const growth = d.persons.filter((p) => GROWTH_TIERS.includes(p.mayTier)).sort((a, b) => a.mayTierRank - b.mayTierRank || a.dabu.localeCompare(b.dabu) || b.rate - a.rate);
  const gHead = `<tr><th>姓名</th><th>大区</th><th>5月档位</th><th>5月达成率</th><th>5月达标</th><th>当前达成率</th><th>当前达标</th><th>时间进度目标</th><th>累计收房</th><th>当月收房</th><th>距达标差</th><th>6月底目标</th><th>还差(6月)</th></tr>`;
  const gBody = growth.map((p) => {
    const jt = p.annualMonths > 0 ? f1(p.annualTarget * 6 / p.annualMonths) : 0; const jd = f1(jt - p.cumulative);
    return `<tr><td>${esc(p.name)}</td><td>${esc(p.dabu)}</td><td>${p.mayTier}</td><td class="num">${f1(p.mayRate)}%</td><td>${p.mayRate >= 100 ? statusTag("ok", "达标") : statusTag("no", "未达")}</td><td class="num">${f1(p.rate)}%</td><td>${p.pass ? statusTag("ok", "达标") : statusTag("no", "未达")}</td><td class="num">${f1(p.target)}</td><td class="num">${f1(p.cumulative)}</td><td class="num ${p.monthlyNew > 0 ? "pos" : p.monthlyNew < 0 ? "neg" : ""}">${f1(p.monthlyNew)}</td><td class="num neg">${f1(p.diff)}</td><td class="num">${jt}</td><td class="num ${jd > 0 ? "neg" : "pos"}">${jd}</td></tr>`;
  }).join("");
  const incBody = `<div class="inc-cards">${inc}</div><div class="inc-summary">三大区合计 · 圈定 <b>${tg}</b> 人 ｜ 已达标 <b>${ta}/${tt}</b> 人 ｜ 预计激励 <b class="pos">${tamt}元</b> / 6000元</div>` +
    `<div style="margin-top:16px;font-size:13px;font-weight:600;color:var(--ink-700);margin-bottom:8px">圈定人员明细（${growth.length} 人）</div>` + dataTable(gHead, gBody, { scroll: true });
  out.push(sectionCard("6月激励方案跟进", incBody, { id: "m-inc" }));

  // ④ 档位健康度总览
  out.push(sectionCard(`档位健康度总览`, flowTable(d.overview, d.persons), { id: "m-overview", meta: `5月基准 ${d.overview.reduce((s, r) => s + r.may, 0)}人 → 6月在岗 ${d.overview.reduce((s, r) => s + r.june, 0)}人 · 悬停升降单元格看名单` }));

  // ⑤ 大区管理重点
  const regions = d.dabuCards.map((c) => {
    const may = d.mayBaseline.dabuRates[c.name];
    const cmp = may != null ? ` ${deltaPP(c.rate, may)}` : "";
    const warn = c.rate < 25 ? " warn" : "";
    const rp = d.persons.filter((p) => p.dabu === c.name);
    return `<div class="region"><div class="region-head${warn}"><div class="region-name">${esc(c.name)}大区</div><div class="region-rate">${c.rate}%<small>${may != null ? "5月 " + may + "%" : ""}</small></div><div class="region-sub">↑${c.up}升 ↓${c.down}降 →${c.lost}离职${cmp}</div></div>${flowTable(c.rows, rp)}${regionNotes(c.name, d.persons)}</div>`;
  }).join("");
  out.push(sectionCard("大区管理重点", `<div class="region-cards">${regions}</div>`, { id: "m-region", flush: false }));

  // ⑥ 新人首考
  const ncHead = `<tr><th>姓名</th><th>大区</th><th>区域</th><th>成为资管日期</th><th>目标</th><th>累计收房</th><th>达标</th></tr>`;
  const ncBody = d.newcomers.map((n) => `<tr><td>${esc(n.name)}</td><td>${esc(n.dabu)}</td><td>${esc(n.area)}</td><td>${esc(n.joinDate)}</td><td class="num">8</td><td class="num">${f1(n.cumulative)}</td><td>${n.cumulative >= 8 ? statusTag("ok", "达标") : statusTag("no", "未达")}</td></tr>`).join("");
  out.push(sectionCard(`新人首考`, d.newcomers.length ? dataTable(ncHead, ncBody) : emptyState("本月无新人首考", ""), { id: "m-new", meta: `${d.newcomers.length} 人 · 目标 8 单` }));

  // ⑦ 人员明细
  const pHead = `<tr>${["工号", "姓名", "成为资管日期", "大区", "5月档位", "当前档位", "变化", "达成率", "目标", "累计收房", "5月累计", "当月收房", "差距", "达标", "在职状态"].map((h) => `<th>${h}</th>`).join("")}</tr>`;
  const pBody = d.persons.map((p) =>
    `<tr data-tier="${p.mayTier}" data-change="${p.tierChange}" data-roster="${p.roster}"${p.roster === "离职" ? ' class="muted"' : ""}>` +
    `<td class="gh">${esc(p.gonghao)}</td><td>${esc(p.name)}</td><td>${esc(p.joinDate)}</td><td>${esc(p.dabu)}</td>` +
    `<td>${tierChip(p.mayTier, tierColor(p.mayTier))}</td><td>${tierChip(p.currentTier, tierColor(p.currentTier))}</td><td>${chg(p.tierChange)}</td>` +
    `<td class="num">${f1(p.rate)}%</td><td class="num">${f1(p.target)}</td><td class="num">${f1(p.cumulative)}</td><td class="num">${f1(p.mayCumulative)}</td>` +
    `<td class="num ${p.monthlyNew > 0 ? "pos" : p.monthlyNew < 0 ? "neg" : ""}">${f1(p.monthlyNew)}</td><td class="num">${f1(p.diff)}</td>` +
    `<td>${p.pass ? statusTag("ok", "达标") : statusTag("no", "未达")}</td><td>${p.roster === "离职" ? statusTag("lost", esc(p.statusLabel)) : esc(p.statusLabel)}</td></tr>`).join("");
  const filter = `<div class="filter"><select id="fTier"><option value="">全部档位</option>${TIERS.map((t) => `<option value="${t}">${t}</option>`).join("")}</select><select id="fChange"><option value="">全部变化</option><option value="↑升">↑升</option><option value="↓降">↓降</option><option value="—">持平</option></select><select id="fRoster"><option value="">全部状态</option><option value="在职">在职</option><option value="离职">离职</option></select></div>`;
  out.push(sectionCard(`人员明细`, filter + dataTable(pHead, pBody, { id: "ptable", sortable: true, scroll: true }), { id: "m-person", meta: `${d.persons.length} 人 · 点表头排序` }));

  return out.join("\n");
}
