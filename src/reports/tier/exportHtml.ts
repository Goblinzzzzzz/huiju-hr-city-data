// 7 模块看板产物（移植自 generate_tier_dashboard.py + 参考 HTML 的 CSS）。
// 模块：①全国城市排名 ②每日趋势 ③6月激励(+圈定明细) ④档位健康度总览 ⑤大区管理重点 ⑥新人首考 ⑦人员明细
import { TierViewData, OverviewRow } from "../../model/canonical";
import { GROWTH_TIERS, TIERS } from "../../transforms/tier";

export interface TrendEntry {
  date: string; rate: number; rank: number | null;
  passWeighted: number; totalWeighted: number; notReached: number;
  diffLe3: number; diff35: number; diff58: number; diffGt8: number;
  hanyang: number; wuchang: number; hankou: number;
}

const esc = (s: any) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
const f1 = (n: number) => Math.round(n * 10) / 10;
const chgCls = (c: string) => c === "↑升" ? "tier-up" : c === "↓降" ? "tier-down" : "";
const mnCls = (v: number) => v > 0 ? "trend-up" : v < 0 ? "tier-down" : "";

const CSS = `
* { margin:0; padding:0; box-sizing:border-box; }
body { font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; background:#f5f7fa; color:#333; padding:20px; }
.container { max-width:1400px; margin:0 auto; }
h1 { text-align:center; margin-bottom:10px; color:#1a1a2e; }
.update-time { text-align:center; color:#666; margin-bottom:20px; font-size:14px; }
.section { background:white; border-radius:12px; padding:20px; margin-bottom:20px; box-shadow:0 2px 8px rgba(0,0,0,0.08); }
.section-title { font-size:18px; font-weight:600; margin-bottom:15px; padding-bottom:10px; border-bottom:2px solid #e74c3c; }
.summary-bar { background:linear-gradient(135deg,#667eea,#764ba2); color:white; padding:12px 20px; border-radius:10px; margin-bottom:20px; text-align:center; font-size:15px; font-weight:500; }
.trend-table,.city-table,.overview-table,.dabu-table,.person-table,.sub-table { width:100%; border-collapse:collapse; }
.trend-table { font-size:14px; }
.trend-table th,.trend-table td { padding:10px 8px; text-align:center; border-bottom:1px solid #eee; }
.trend-table th { background:#f8f9fa; font-weight:600; }
.trend-up { color:#27ae60; font-weight:600; }
.city-table { font-size:13px; }
.city-table th,.city-table td { padding:8px 10px; text-align:center; border-bottom:1px solid #eee; }
.city-table th { background:#f8f9fa; font-weight:600; font-size:12px; }
.city-table tr.highlight { background:#fff9e6; }
.city-table tr.highlight td { font-weight:600; }
.incentive-cards { display:grid; grid-template-columns:repeat(3,1fr); gap:15px; margin-bottom:15px; }
.incentive-card { border:1px solid #eee; border-radius:12px; padding:15px; }
.incentive-card-header { display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; }
.incentive-card-title { font-weight:600; font-size:16px; }
.incentive-detail { font-size:13px; color:#666; margin-bottom:10px; }
.incentive-progress-bar { height:8px; background:#eee; border-radius:4px; margin-bottom:10px; overflow:hidden; }
.incentive-progress-fill { height:100%; background:linear-gradient(90deg,#3498db,#2ecc71); border-radius:4px; }
.incentive-footer { display:flex; justify-content:space-between; font-size:14px; }
.incentive-amount { font-weight:600; color:#e74c3c; }
.incentive-summary { background:#f8f9fa; padding:15px; border-radius:8px; text-align:center; font-size:15px; }
.overview-table { font-size:14px; }
.overview-table th,.overview-table td { padding:8px 10px; text-align:center; border-bottom:1px solid #eee; }
.overview-table th { background:#f8f9fa; font-weight:600; }
.dabu-cards { display:grid; grid-template-columns:repeat(3,1fr); gap:15px; }
.dabu-card { border:1px solid #eee; border-radius:12px; overflow:hidden; }
.dabu-header { padding:12px 15px; background:linear-gradient(135deg,#667eea 0%,#764ba2 100%); color:white; }
.dabu-header.warning { background:linear-gradient(135deg,#f093fb 0%,#f5576c 100%); }
.dabu-title { font-weight:600; font-size:16px; }
.dabu-rate { font-size:24px; font-weight:700; }
.dabu-table { font-size:13px; }
.dabu-table th,.dabu-table td { padding:6px 8px; text-align:center; border-bottom:1px solid #eee; }
.dabu-table th { background:#f8f9fa; font-weight:600; font-size:12px; }
.dabu-total-row { font-weight:700; background:#f0f0f0; }
.dabu-footer { padding:10px 15px; background:#f8f9fa; font-size:12px; line-height:1.8; display:flex; gap:14px; }
.dabu-highlight { color:#27ae60; font-weight:500; }
.dabu-warning { color:#e74c3c; font-weight:500; }
.tier-up { color:#27ae60; font-weight:700; }
.tier-down { color:#e74c3c; font-weight:700; }
.tier-lost-cell { color:#9c27b0; font-weight:700; }
.dim { color:#ccc; }
.rules-note { font-size:12px; color:#666; padding:10px; background:#f8f9fa; border-radius:8px; margin-top:10px; }
.filter-bar { display:flex; gap:10px; margin-bottom:15px; flex-wrap:wrap; }
.filter-bar select { padding:8px 12px; border:1px solid #ddd; border-radius:6px; font-size:14px; }
.person-list { max-height:640px; overflow-y:auto; }
.person-table { font-size:12px; }
.person-table th,.person-table td { padding:6px 8px; text-align:center; border-bottom:1px solid #eee; white-space:nowrap; }
.person-table th { background:#f8f9fa; font-weight:600; position:sticky; top:0; z-index:1; cursor:pointer; user-select:none; }
.person-table th:hover { background:#e8ecf0; }
.gonghao-cell { color:#999; font-family:monospace; }
.sub-table { font-size:12px; }
.sub-table th,.sub-table td { padding:6px 8px; text-align:center; border-bottom:1px solid #eee; }
.sub-table th { background:#f8f9fa; font-weight:600; }
.muted { color:#999; }
`;

function overviewTable(rows: OverviewRow[], cls = "overview-table"): string {
  const cell = (r: OverviewRow) =>
    `<td>${r.tier}</td><td>${r.may}</td><td class="${r.up ? "tier-up" : ""}">${r.up || "—"}</td>` +
    `<td class="${r.down ? "tier-down" : ""}">${r.down || "—"}</td><td class="${r.lost ? "tier-lost-cell" : ""}">${r.lost || "—"}</td>` +
    `<td class="${r.upIn ? "tier-up" : ""}">${r.upIn || "—"}</td><td class="${r.downIn ? "tier-down" : ""}">${r.downIn || "—"}</td>` +
    `<td><b>${r.june}</b></td><td class="${r.change > 0 ? "tier-up" : r.change < 0 ? "tier-down" : ""}">${r.change > 0 ? "+" + r.change : r.change || "—"}</td>`;
  const body = rows.map((r) => `<tr>${cell(r)}</tr>`).join("");
  const sum = (k: keyof OverviewRow) => rows.reduce((s, r) => s + (r[k] as number), 0);
  const tot = `<tr class="dabu-total-row"><td>合计</td><td>${sum("may")}</td><td>${sum("up")}</td><td>${sum("down")}</td><td>${sum("lost")}</td><td>${sum("upIn")}</td><td>${sum("downIn")}</td><td>${sum("june")}</td><td>${sum("change")}</td></tr>`;
  return `<table class="${cls}"><thead><tr><th>档位</th><th>5月</th><th>↑升级</th><th>↓降级</th><th>→离职</th><th>←升入</th><th>←降入</th><th>6月</th><th>变化</th></tr></thead><tbody>${body}${tot}</tbody></table>`;
}

export function exportTierHtml(d: TierViewData, opts: { city: string; month: string; trend?: TrendEntry[] }): string {
  const trend = opts.trend && opts.trend.length ? opts.trend : [];

  // ① 全国城市排名
  const cr = d.cityRanking;
  const cityRows = cr.map((c, i) => {
    const hl = c.city.includes("武汉") ? ' class="highlight"' : "";
    return `<tr${hl}><td>${i + 1}</td><td>${esc(c.city)}</td><td>${c.rate}%</td><td>${c.passWeighted}</td><td>${c.totalWeighted}</td><td>${c.count}</td></tr>`;
  }).join("");
  const cityTable = cr.length
    ? `<table class="city-table"><thead><tr><th>排名</th><th>城市</th><th>达标率</th><th>达标人次</th><th>考核人次</th><th>人数</th></tr></thead><tbody>${cityRows}</tbody></table>`
    : `<div class="muted" style="text-align:center;padding:20px">无城市数据（需全国下载）</div>`;
  const whRank = cr.findIndex((c) => c.city.includes("武汉")) + 1;

  // ② 每日趋势
  const trendRows = trend.map((e, i) => {
    const cs = i === 0 ? "— 基准" : (() => { const v = f1(e.rate - trend[i - 1].rate); return v > 0 ? `⬆️ +${v}pp` : v < 0 ? `⬇️ ${v}pp` : "—"; })();
    const rc = (v: number) => v >= 30 ? ' class="trend-up"' : "";
    return `<tr><td>${esc(e.date)}</td><td${rc(e.rate)}>${e.rate}%</td><td>${cs}</td><td>${e.rank ? "第" + e.rank + "名" : "—"}</td><td>${e.passWeighted}</td><td>${e.totalWeighted}</td><td>${e.notReached}人</td><td>${e.diffLe3}</td><td>${e.diff35}</td><td>${e.diff58}</td><td>${e.diffGt8}</td><td${rc(e.hanyang)}>${e.hanyang}%</td><td${rc(e.wuchang)}>${e.wuchang}%</td><td${rc(e.hankou)}>${e.hankou}%</td></tr>`;
  }).join("");
  const trendTable = trend.length
    ? `<table class="trend-table"><thead><tr><th>日期</th><th>达标率</th><th>变化</th><th>全国排名</th><th>达标人次</th><th>考核人次</th><th>未达标</th><th>差≤3</th><th>差3-5</th><th>差5-8</th><th>差&gt;8</th><th>汉阳</th><th>武昌</th><th>汉口</th></tr></thead><tbody>${trendRows}</tbody></table>`
    : `<div class="muted" style="text-align:center;padding:20px">暂无趋势历史（每天刷新会累计）</div>`;

  // ③ 6月激励
  const incCards = d.incentives.map((c) => {
    const pct = c.target > 0 ? Math.min(100, Math.round((c.actual / c.target) * 100)) : 0;
    return `<div class="incentive-card"><div class="incentive-card-header"><span class="incentive-card-title">${esc(c.dabu)}</span><span class="incentive-amount">${c.amount}元</span></div>
    <div class="incentive-detail">圈定 ${c.growth}人（成长90:${c.c90} 80:${c.c80} 70:${c.c70}）</div>
    <div class="incentive-progress-bar"><div class="incentive-progress-fill" style="width:${pct}%"></div></div>
    <div class="incentive-footer"><span>达标 ${c.actual}/${c.target}人</span><span>差${Math.max(0, c.target - c.actual)}人</span></div></div>`;
  }).join("");
  const tGrowth = d.incentives.reduce((s, c) => s + c.growth, 0);
  const tActual = d.incentives.reduce((s, c) => s + c.actual, 0);
  const tTarget = d.incentives.reduce((s, c) => s + c.target, 0);
  const tAmount = d.incentives.reduce((s, c) => s + c.amount, 0);
  const growth = d.persons.filter((p) => GROWTH_TIERS.includes(p.mayTier))
    .sort((a, b) => a.mayTierRank - b.mayTierRank || a.dabu.localeCompare(b.dabu) || b.rate - a.rate);
  const growthRows = growth.map((p) => {
    const junTarget = p.annualMonths > 0 ? f1(p.annualTarget * 6 / p.annualMonths) : 0;
    const junDiff = f1(junTarget - p.cumulative);
    return `<tr><td>${esc(p.name)}</td><td>${esc(p.dabu)}</td><td>${p.mayTier}</td><td>${f1(p.mayRate)}%</td><td>${p.mayRate >= 100 ? "✅" : "❌"}</td><td>${f1(p.rate)}%</td><td>${p.pass ? "✅" : "❌"}</td><td>${f1(p.target)}</td><td>${f1(p.cumulative)}</td><td class="${mnCls(p.monthlyNew)}">${f1(p.monthlyNew)}</td><td class="tier-down">${f1(p.diff)}</td><td>${junTarget}</td><td class="${junDiff > 0 ? "tier-down" : "trend-up"}">${junDiff}</td></tr>`;
  }).join("");
  const growthTable = `<div style="margin-top:15px"><div style="font-size:14px;font-weight:600;margin-bottom:8px">📋 圈定人员明细（${growth.length}人）</div>
  <div class="person-list"><table class="sub-table"><thead><tr><th>姓名</th><th>大区</th><th>5月档位</th><th>5月达成率</th><th>5月达标</th><th>当前达成率</th><th>当前达标</th><th>时间进度目标</th><th>累计收房</th><th>当月收房</th><th>距达标差</th><th>6月底目标</th><th>还差(6月)</th></tr></thead><tbody>${growthRows}</tbody></table></div></div>`;

  // ⑤ 大区管理重点
  const dabuCards = d.dabuCards.map((c) => {
    const warn = c.rate < 25 ? " warning" : "";
    const may = d.mayBaseline.dabuRates[c.name];
    let cmp = "";
    if (may != null) { const dv = f1(c.rate - may); cmp = `<span style="font-size:13px;font-weight:400;opacity:0.85">（5月${may}% ${dv > 0 ? "⬆️+" + dv : dv < 0 ? "⬇️" + dv : "—"}pp）</span>`; }
    return `<div class="dabu-card"><div class="dabu-header${warn}"><div class="dabu-title">${esc(c.name)}大区</div><div class="dabu-rate">${c.rate}%${cmp}</div><div style="font-size:12px;font-weight:400;opacity:0.9;margin-top:3px">↑${c.up}升 ↓${c.down}降 →${c.lost}离职</div></div>
    ${overviewTable(c.rows, "dabu-table")}</div>`;
  }).join("");

  // ⑥ 新人首考（目标 8 单）
  const ncRows = d.newcomers.map((n) =>
    `<tr><td>${esc(n.name)}</td><td>${esc(n.dabu)}</td><td>${esc(n.area)}</td><td>${esc(n.joinDate)}</td><td>8</td><td>${f1(n.cumulative)}</td><td>${n.cumulative >= 8 ? "✅" : "❌"}</td></tr>`).join("");
  const ncTable = `<table class="sub-table"><thead><tr><th>姓名</th><th>大区</th><th>区域</th><th>成为资管日期</th><th>目标</th><th>累计收房</th><th>达标</th></tr></thead><tbody>${ncRows}</tbody></table>`;

  // ⑦ 人员明细（15 列）
  const pr = d.persons.map((p) =>
    `<tr data-tier="${p.mayTier}" data-change="${p.tierChange}" data-roster="${p.roster}">` +
    `<td class="gonghao-cell">${esc(p.gonghao)}</td><td>${esc(p.name)}</td><td>${esc(p.joinDate)}</td><td>${esc(p.dabu)}</td>` +
    `<td>${p.mayTier}</td><td>${p.currentTier}</td><td class="${chgCls(p.tierChange)}">${p.tierChange}</td>` +
    `<td>${f1(p.rate)}%</td><td>${f1(p.target)}</td><td>${f1(p.cumulative)}</td><td>${f1(p.mayCumulative)}</td>` +
    `<td class="${mnCls(p.monthlyNew)}">${f1(p.monthlyNew)}</td><td>${f1(p.diff)}</td><td>${p.pass ? "✅" : "❌"}</td>` +
    `<td class="${p.roster === "离职" ? "tier-down" : ""}">${esc(p.statusLabel)}</td></tr>`).join("");
  const personTable = `<table class="person-table" id="ptable"><thead><tr>${["工号", "姓名", "成为资管日期", "大区", "5月档位", "当前档位", "变化", "达成率", "目标", "累计收房", "5月累计", "当月收房", "差距", "达标", "在职状态"].map((h, i) => `<th onclick="sortT(${i})">${h}</th>`).join("")}</tr></thead><tbody>${pr}</tbody></table>`;

  return `<!DOCTYPE html><html lang="zh"><head><meta charset="utf-8"><title>资管经理档位跟踪看板 · ${esc(opts.month)}</title><style>${CSS}</style></head>
<body><div class="container">
<h1>资管经理档位跟踪看板 · ${esc(opts.month)}</h1>
<div class="update-time">生成于 ${esc(new Date().toLocaleString())} · ${esc(opts.city)}</div>
<div class="summary-bar">📊 5月基准→当前（${d.counts.onjob}人在岗 + ${d.counts.lost}人本月离职）: <span style="color:#a8ff60">↑${d.summary.up}人升档</span> | <span style="color:#ffd0d0">↓${d.summary.down}人降档</span> | —${d.summary.hold}人持平 | 🆕${d.counts.newcomer}人新人首考</div>

<div class="section"><h2 class="section-title">📊 全国城市排名${whRank ? `（武汉第${whRank}名）` : ""}</h2>${cityTable}</div>

<div class="section"><h2 class="section-title">📈 每日趋势（武汉）</h2>${trendTable}</div>

<div class="section"><h2 class="section-title">💰 6月激励方案跟进</h2>
<div class="incentive-cards">${incCards}</div>
<div class="incentive-summary">💰 三大区合计: 圈定${tGrowth}人 | 达标${tActual}/${tTarget}人 | 预计激励 <span class="incentive-amount">${tAmount}元</span>/6000元</div>
${growthTable}
<div class="rules-note"><b>圈定:</b> 成长90+成长80+成长70 | <b>6月目标:</b> 汉阳11 / 武昌17 / 汉口12 | <b>激励:</b> 达成率×2000元，上限2000元/大区</div></div>

<div class="section"><h2 class="section-title">📊 档位健康度总览（5月基准 ${d.overview.reduce((s, r) => s + r.may, 0)}人 → 6月在岗 ${d.overview.reduce((s, r) => s + r.june, 0)}人 · 不含新人首考）</h2>${overviewTable(d.overview)}</div>

<div class="section"><h2 class="section-title">🎯 大区管理重点</h2><div class="dabu-cards">${dabuCards}</div></div>

<div class="section"><h2 class="section-title">🆕 新人首考（${d.newcomers.length}人）</h2>${ncTable}</div>

<div class="section"><h2 class="section-title">👥 人员明细（${d.persons.length}人）</h2>
<div class="filter-bar">
<select id="fTier" onchange="filterT()"><option value="">全部档位</option>${TIERS.map((t) => `<option value="${t}">${t}</option>`).join("")}</select>
<select id="fChange" onchange="filterT()"><option value="">全部变化</option><option value="↑升">↑升</option><option value="↓降">↓降</option><option value="—">持平</option></select>
<select id="fRoster" onchange="filterT()"><option value="">全部状态</option><option value="在职">在职</option><option value="离职">离职</option></select>
</div>
<div class="person-list">${personTable}</div></div>

</div>
<script>
function filterT(){var t=fTier.value,c=fChange.value,r=fRoster.value;document.querySelectorAll('#ptable tbody tr').forEach(function(row){var ok=(!t||row.dataset.tier===t)&&(!c||row.dataset.change===c)&&(!r||row.dataset.roster===r);row.style.display=ok?'':'none';});}
var sortDir={};
function sortT(i){var tb=document.querySelector('#ptable tbody');var rows=[].slice.call(tb.querySelectorAll('tr'));var dir=sortDir[i]=!sortDir[i];rows.sort(function(a,b){var x=a.cells[i].innerText.replace(/[%人✅❌]/g,'').trim(),y=b.cells[i].innerText.replace(/[%人✅❌]/g,'').trim();var nx=parseFloat(x),ny=parseFloat(y);var r=(!isNaN(nx)&&!isNaN(ny))?nx-ny:x.localeCompare(y,'zh');return dir?r:-r;});rows.forEach(function(rw){tb.appendChild(rw);});}
</script>
</body></html>`;
}
