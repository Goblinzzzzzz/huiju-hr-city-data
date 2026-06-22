// 人工成本面板：成本分析 / 薪酬水平 / 绩效激励 三 tab。口径移植自 dashboard_v2，只渲染不改口径。
// k1/k2 直接展示数据里存的系数(c1/c2/c3/coeff)，不重算公式，避免口径漂移。
import { sectionCard, statCard, dataTable, statusTag, emptyState, skeletonGrid, f1, esc } from "../components";
import { CostView } from "./compute";
import { CostData } from "./model";

const wan = (v: number) => f1(v / 10000); // 元 → 万元
const yuan = (v: any) => (v == null ? "—" : f1(v));
const pctv = (v: any) => (v == null ? "—" : f1(v * 100) + "%");
const coef = (v: any) => (v == null ? "—" : (Math.round(v * 100) / 100).toFixed(2)); // 系数保留 2 位

// ============ Tab 1：成本分析 ============
function kpiCards(view: CostView): string {
  const cards = view.kpis.map((k) =>
    statCard(k.label, `${f1(k.value * 100)}<span class="unit">%</span>`, { delta: { text: k.note, kind: k.warn ? "neg" : "dim" } })
  ).join("");
  return `<div class="stat-row">${cards}</div>`;
}
function utilTable(view: CostView): string {
  const head = `<tr><th>团队</th><th>层级</th><th>预算成本(万)</th><th>实际成本(万)</th><th>成本使用率</th><th>预算HC</th><th>实际HC</th><th>人均成本(元)</th><th>人均固定</th><th>人均浮动</th></tr>`;
  const utilCell = (u: number | null) => {
    if (u == null) return `<td class="num dim">—</td>`;
    return `<td class="num ${u > 1 ? "neg" : u < 0.9 ? "pos" : ""}">${f1(u * 100)}%</td>`;
  };
  const body = view.util.map((r) =>
    `<tr><td style="text-align:left">${esc(r.team)}</td><td style="text-align:left">${esc(r.level)}</td>` +
    `<td class="num">${wan(r.budgetCost)}</td><td class="num">${wan(r.actualCost)}</td>${utilCell(r.costUtil)}` +
    `<td class="num">${r.budgetHC || "—"}</td><td class="num ${r.actualHC > r.budgetHC ? "neg" : ""}">${r.actualHC || "—"}</td>` +
    `<td class="num">${yuan(r.avg)}</td><td class="num dim">${yuan(r.fixed)}</td><td class="num dim">${yuan(r.variable)}</td></tr>`
  ).join("");
  const t = view.totals;
  const tot = `<tr class="total"><td style="text-align:left" colspan="2">合计</td><td class="num">${wan(t.budgetCost)}</td><td class="num">${wan(t.actualCost)}</td>${utilCell(t.budgetCost ? t.actualCost / t.budgetCost : null)}<td class="num">${t.budgetHC}</td><td class="num">${t.actualHC}</td><td class="num" colspan="3"></td></tr>`;
  return dataTable(head, body + tot, { scroll: true });
}

// ============ Tab 2：薪酬水平 ============
const LEVEL_LABELS: Record<string, string> = { zg_sd: "资管 S+D", kj_sd: "客经 S+D", zw_sd: "租务 S+D", zg_am: "资管 AM", kj_am: "客经 AM", zw_am: "租务 AM" };
const rk = (v: any) => (v == null || v === "" ? "" : ` <span class="dim">${esc(v)}</span>`);

function directorsTable(d: CostData, m: string): string {
  const dir = d.salaryDirectors || {};
  const names = Object.keys(dir);
  if (!names.length) return "";
  const head = `<tr><th>姓名</th><th>团队</th><th>职位</th><th>应发(元)</th><th>标准收入</th><th>管幅</th></tr>`;
  const body = names.map((n) => {
    const o = dir[n], mm = o.months?.[m] || {};
    return `<tr><td>${esc(n)}</td><td>${esc(o.team || "")}</td><td>${esc(o.title || "")}</td><td class="num">${yuan(mm.pay)}</td><td class="num">${mm.std == null ? "—" : yuan(mm.std)}</td><td class="num">${mm.span == null ? "—" : mm.span}</td></tr>`;
  }).join("");
  return `<div class="subhead">总监层</div>` + dataTable(head, body);
}

function levelTable(d: CostData, m: string): string {
  const lv = d.salaryLevel || {};
  const keys = Object.keys(LEVEL_LABELS).filter((k) => lv[k]?.[m]);
  if (!keys.length) return "";
  const head = `<tr><th>层级</th><th>HC</th><th>人均(元)</th><th>中位(元)</th><th>社平倍数</th><th>单房标准业绩</th><th>人均收房</th><th>人均出房</th><th>人均在管</th></tr>`;
  const body = keys.map((k) => {
    const o = lv[k][m];
    return `<tr><td style="text-align:left">${LEVEL_LABELS[k]}</td><td class="num">${o.hc ?? "—"}</td><td class="num">${yuan(o.avg)}</td><td class="num">${yuan(o.median)}</td>` +
      `<td class="num">${o.spRatio == null ? "—" : f1(o.spRatio) + rk(o.spRank)}</td><td class="num">${o.unitStd == null ? "—" : f1(o.unitStd) + rk(o.unitStdRank)}</td>` +
      `<td class="num">${o.acq == null ? "—" : f1(o.acq) + rk(o.acqRank)}</td><td class="num">${o.rental == null ? "—" : f1(o.rental) + rk(o.rentalRank)}</td><td class="num">${o.mgmt == null ? "—" : f1(o.mgmt) + rk(o.mgmtRank)}</td></tr>`;
  }).join("");
  return `<div class="subhead">S 层 / AM 层（人均·中位·13城排名）</div>` + dataTable(head, body, { scroll: true });
}

function drilldown(d: CostData, m: string): string {
  const dd = d.salaryDrilldown || {};
  const keys = Object.keys(LEVEL_LABELS).filter((k) => dd[k]);
  if (!keys.length) return "";
  const peopleTable = (people: any[]) => {
    const head = `<tr><th>姓名</th><th>${esc(m)}月(元)</th><th>累计(元)</th></tr>`;
    const body = (people || []).map((p) => `<tr><td>${esc(p.name)}</td><td class="num">${yuan(p.months?.[m])}</td><td class="num">${yuan(p.cum)}</td></tr>`).join("");
    return dataTable(head, body);
  };
  const blocks = keys.map((k) => {
    const node = dd[k];
    let inner = "";
    if (node.type === "flat") inner = peopleTable(node.people);
    else inner = (node.groups || []).map((g: any) => `<details class="dd-grp"><summary>${esc(g.name)} · 人均 ${yuan(g.avg?.[m])}</summary>${peopleTable(g.people)}</details>`).join("");
    return `<details class="dd-lv"><summary>${LEVEL_LABELS[k]} 下钻</summary>${inner}</details>`;
  }).join("");
  return `<div class="subhead">个人下钻</div>` + blocks;
}

// ============ Tab 3：绩效激励 ============
function perfCards(d: CostData): string {
  const k1 = d.k1 || {}, k2 = d.k2 || {};
  const cards = [
    statCard("K1 利润系数", coef(k1.profitCoeff), { delta: { text: "C1×60%+C2×40% ×C3（数据存值）", kind: "dim" } }),
    statCard("C1 税前利润达成", coef(k1.profit?.c1), { delta: { text: `目标 ${wan(k1.profit?.target || 0)}万 / 预测 ${wan(k1.profit?.forecast || 0)}万`, kind: "dim" } }),
    statCard("C2 单房UE达成", coef(k1.unitUE?.c2), { delta: { text: `达成率 ${pctv(k1.unitUE?.achieveRate)}`, kind: (k1.unitUE?.achieveRate ?? 0) >= 1 ? "pos" : "neg" } }),
    statCard("C3 利润贡献", coef(k1.profitContrib?.c3), { delta: { text: "预计利润分档乘数", kind: "dim" } }),
    statCard("K2 规模×效率", coef(k2.scaleEff?.coeff), { delta: { text: `净增达成 ${pctv(k2.scale?.netAddRate)} · 排名 ${k2.scaleEff?.rank ?? "—"}/${k2.scale?.totalCities ?? 13}`, kind: "dim" } }),
    statCard("K2 服务系数", coef(k2.service?.serviceCoeff), { delta: { text: "客诉+整备+SA 加权", kind: (k2.service?.serviceCoeff ?? 0) < 0.9 ? "neg" : "dim" } }),
  ].join("");
  return `<div class="stat-row">${cards}</div>`;
}
function k2DetailTable(d: CostData): string {
  const k2 = d.k2 || {}, e = k2.efficiency || {}, s = k2.scale || {}, sv = k2.service || {};
  const row = (name: string, val: string, coe: any, note: string) => `<tr><td style="text-align:left">${name}</td><td class="num">${val}</td><td class="num">${coef(coe)}</td><td style="text-align:left" class="dim">${note}</td></tr>`;
  const head = `<tr><th>分项</th><th>达成值</th><th>系数</th><th>说明</th></tr>`;
  const body = [
    row("规模 · 净增达成", pctv(s.netAddRate), s.scaleCoeff, `净增 ${s.netAddActual ?? "—"} / 目标 ${k2.target?.netAdd ?? "—"}`),
    row("效率 · 标准人效", pctv(e.stdEffRate), e.stdEffCoeff, "人效进度达标率"),
    row("效率 · 首招成功率", pctv(e.firstOutRate), e.firstOutCoeff, "首出招租"),
    row("效率 · 二招成功率", pctv(e.secondOutRate), e.secondOutCoeff, "二出招租"),
    row("效率 · 合计", "—", e.effCoeff, "人效30%+首出35%+二出35%"),
    row("服务 · 客诉", pctv(sv.complaint?.rate), sv.complaint?.coeff, `排名 ${sv.complaint?.finalRank ?? "—"}`),
    row("服务 · 整备完单率", pctv(sv.preparation?.rate), sv.preparation?.coeff, sv.preparation?.note || ""),
    row("服务 · 房均SA时长", sv.saDuration?.value == null ? "—" : f1(sv.saDuration.value) + "min", sv.saDuration?.coeff, "达成×降幅加权"),
    row("安全系数", "—", k2.safety, k2.safety == null ? "暂无数据（年底）" : ""),
    row("综合评价", "—", k2.comprehensive, k2.comprehensive == null ? "暂无数据（年底）" : ""),
  ].join("");
  return `<div class="subhead">K2 重点工作明细</div>` + dataTable(head, body, { scroll: true });
}

// ============ 入口 ============
export function renderCostPanel(view?: CostView, data?: CostData): string {
  const navHtml = `<nav class="mod-nav"><a href="#c-cost">人工成本分析</a><a href="#c-salary">薪酬水平</a><a href="#c-perf">绩效激励</a></nav>`;
  const ph = (title: string, desc: string, n: number, id: string) => sectionCard(title, emptyState("数据待接入", desc) + skeletonGrid(n), { id, meta: "待接入" });
  if (!view || !data) {
    return [navHtml,
      ph("人工成本分析", "6 比率 KPI：省心租/资管/客经/租务/职能 占净收入比，实际 vs 预算偏差", 6, "c-cost"),
      ph("薪酬水平", "总监层 / S层 / AM层 分层薪资，支持下钻到个人", 3, "c-salary"),
      ph("绩效激励", "K1 利润系数（C1·C2·C3）+ K2 重点工作系数（规模效率/安全/服务）+ 13城对标", 4, "c-perf"),
    ].join("\n");
  }
  const m = view.month;

  const costBody = kpiCards(view) + utilTable(view);
  const salaryBody = directorsTable(data, m) + levelTable(data, m) + drilldown(data, m);
  const perfBody = perfCards(data) + k2DetailTable(data);

  return [navHtml,
    sectionCard("人工成本分析", costBody, { id: "c-cost", meta: `${m} 月 · 占比口径同原项目` }),
    sectionCard("薪酬水平", salaryBody || emptyState("无薪酬数据", "成本数据.json 缺 salaryDirectors/salaryLevel"), { id: "c-salary", meta: `${m} 月` }),
    sectionCard("绩效激励", perfBody, { id: "c-perf", meta: data.k1?.extractDate ? `K1 ${data.k1.extractDate}` : "" }),
  ].join("\n");
}
