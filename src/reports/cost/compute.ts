// 人工成本「成本分析」tab 计算（口径移植自 dashboard_v2.html）。纯函数，只算不渲染。
import { CostData } from "./model";

export interface CostKpi { label: string; value: number; budget?: number; note: string; warn?: boolean; }
export interface CostUtilRow {
  team: string; level: string; key: string;
  actualCost: number; budgetCost: number; costUtil: number | null;
  actualHC: number; budgetHC: number;
  avg: number | null; fixed?: number; variable?: number;
}
export interface CostView {
  month: string; months: string[];
  kpis: CostKpi[];
  util: CostUtilRow[];
  totals: { actualCost: number; budgetCost: number; actualHC: number; budgetHC: number };
}

const LEVELS: Array<{ team: string; key: string; level: string }> = [
  { team: "资管", key: "zg_am", level: "AM 作业" },
  { team: "资管", key: "zg_sd", level: "S+D 管理塔" },
  { team: "客经", key: "kj_am", level: "AM 作业" },
  { team: "客经", key: "kj_sd", level: "S+D 管理塔" },
  { team: "租务", key: "zw_am", level: "AM 作业" },
  { team: "租务", key: "zw_sd", level: "S+D 管理塔" },
  { team: "职能", key: "zn_mid", level: "中台" },
  { team: "职能", key: "zn_func", level: "职能" },
];

const div = (a: number, b: number): number | null => (b ? a / b : null);

/** 选定月份计算成本视图。月份 = denom 与 teamCost 都有数据的最新月。 */
export function computeCost(d: CostData, monthArg?: string): CostView {
  const months = Object.keys(d.teamCost || {}).sort();
  const withDenom = Object.keys(d.denom || {}).filter((m) => d.teamCost?.[m]).sort();
  const month = monthArg || withDenom[withDenom.length - 1] || months[months.length - 1] || "";

  const tc = d.teamCost?.[month] || ({} as any);
  const den = d.denom?.[month] || ({} as any);
  const ni = den.net_income || 0;
  const kpis: CostKpi[] = [
    { label: "省心租占净收入比", value: div((tc.zg || 0) + (tc.kj || 0) + (tc.zw || 0), ni) ?? 0, note: "(资管+客经+租务)/净收入" },
    { label: "资管占净收入比", value: div(tc.zg || 0, ni) ?? 0, note: "资管/净收入" },
    { label: "资管占业绩比", value: div(tc.zg || 0, den.std_perf || 0) ?? 0, note: "资管/标准业绩" },
    { label: "客经占租金收入比", value: div(tc.kj || 0, den.kj_rent || 0) ?? 0, note: "客经/客经租金收入 · >60%即亏损", warn: (div(tc.kj || 0, den.kj_rent || 0) ?? 0) > 0.6 },
    { label: "租务占净收入比", value: div(tc.zw || 0, ni) ?? 0, note: "租务/净收入" },
    { label: "职能占净收入比", value: div((tc.zn_mid || 0) + (tc.zn_func || 0), ni) ?? 0, note: "(中台+职能)/净收入" },
  ];

  const td: any = d.teamDetail?.[month] || {};
  const bd: any = d.budgetDetail?.[month] || {};
  const bh: any = d.budgetHC?.[month] || {};
  const util: CostUtilRow[] = LEVELS.map(({ team, key, level }) => {
    const actualCost = td[key] || 0;
    const budgetCost = bd[key] || 0;
    const actualHC = td[key + "_hc"] || 0;
    const budgetHC = bh[key] || 0;
    const avg = d.avgCost?.[key]?.[month] ?? div(actualCost, actualHC);
    const br = d.avgCostBreakdown?.[key]?.[month];
    return { team, key, level, actualCost, budgetCost, costUtil: div(actualCost, budgetCost), actualHC, budgetHC, avg, fixed: br?.fixed, variable: br?.variable };
  });
  const totals = util.reduce((s, r) => ({ actualCost: s.actualCost + r.actualCost, budgetCost: s.budgetCost + r.budgetCost, actualHC: s.actualHC + r.actualHC, budgetHC: s.budgetHC + r.budgetHC }), { actualCost: 0, budgetCost: 0, actualHC: 0, budgetHC: 0 });

  return { month, months, kpis, util, totals };
}
