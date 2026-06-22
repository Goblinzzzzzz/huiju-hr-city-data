// 人工成本看板数据模型（对应原 dashboard_v2 的 window.D）。用户按月维护，存 vault `成本数据.json`。
// 缩写：zg=资管 kj=客经 zw=租务 zn=职能+中台 / am=一线作业 sd=管理塔 / mid=中台 func=职能 / hc=人头
// 口径见原项目「数据来源与取数规则.md」。本插件只渲染，不改口径。

/** 团队级月度值（成本或 HC）。 */
export interface TeamMonth { zg: number; kj: number; zw: number; zn_mid: number; zn_func: number; zn: number; total: number; }
/** 团队×层级明细（成本 + HC 同对象，hc 字段带 _hc 后缀）。 */
export interface TeamDetailMonth {
  zg_am: number; zg_sd: number; zg_am_hc: number; zg_sd_hc: number;
  kj_am: number; kj_sd: number; kj_am_hc: number; kj_sd_hc: number;
  zw_am: number; zw_sd: number; zw_am_hc: number; zw_sd_hc: number;
  zn_mid: number; zn_func: number; zn_mid_hc: number; zn_func_hc: number;
}
/** 预算明细（无 hc 后缀，HC 在 budgetHC）。 */
export interface BudgetDetailMonth {
  zg_am: number; zg_sd: number; kj_am: number; kj_sd: number;
  zw_am: number; zw_sd: number; zn_mid: number; zn_func: number;
}
/** 分母：净收入 / 标准业绩 / 客经租金收入。 */
export interface Denom { net_income: number; std_perf: number; sys_perf?: number; kj_rent: number; }

/** 完整成本数据（user 维护的 window.D）。Phase 1 只强类型用到的部分，其余留 any 供后续 tab 扩展。 */
export interface CostData {
  teamCost: Record<string, TeamMonth>;
  teamHC: Record<string, TeamMonth>;
  teamDetail: Record<string, TeamDetailMonth>;
  budgetDetail: Record<string, BudgetDetailMonth>;
  budgetHC: Record<string, BudgetDetailMonth>;
  denom: Record<string, Denom>;
  avgCost?: Record<string, Record<string, number>>;
  avgCostBreakdown?: Record<string, Record<string, { fixed: number; variable: number }>>;
  // 后续 tab（薪酬/绩效）字段，Phase 1 暂不强类型
  salaryDirectors?: any; salaryLevel?: any; salaryDrilldown?: any;
  k1?: any; k2?: any; budget?: any; zgAmMetrics?: any; kjAmMetrics?: any;
  costBreakdown?: any; budgetCostBreakdown?: any; perfCoeff?: any;
  [k: string]: any;
}
