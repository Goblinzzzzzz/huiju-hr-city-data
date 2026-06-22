// 内置合成样例（假数据，无任何真实薪酬/人事 PII）。真实成本数据由用户放 vault `成本数据.json` 覆盖。
import { CostData } from "./model";

export const SAMPLE_COST: CostData = {
  teamCost: {
    "04": { zg: 3500000, kj: 900000, zw: 540000, zn_mid: 95000, zn_func: 640000, zn: 735000, total: 5675000 },
    "05": { zg: 3680000, kj: 910000, zw: 612000, zn_mid: 92000, zn_func: 657000, zn: 749000, total: 5951000 },
  },
  teamHC: {
    "04": { zg: 262, kj: 121, zw: 67, zn_mid: 11, zn_func: 32, zn: 43, total: 493 },
    "05": { zg: 310, kj: 128, zw: 71, zn_mid: 11, zn_func: 36, zn: 47, total: 556 },
  },
  teamDetail: {
    "04": { zg_am: 2700000, zg_sd: 800000, zg_am_hc: 230, zg_sd_hc: 32, kj_am: 700000, kj_sd: 200000, kj_am_hc: 110, kj_sd_hc: 11, zw_am: 510000, zw_sd: 30000, zw_am_hc: 63, zw_sd_hc: 4, zn_mid: 95000, zn_func: 640000, zn_mid_hc: 11, zn_func_hc: 32 },
    "05": { zg_am: 2730000, zg_sd: 950000, zg_am_hc: 276, zg_sd_hc: 34, kj_am: 680000, kj_sd: 230000, kj_am_hc: 117, kj_sd_hc: 11, zw_am: 520000, zw_sd: 92000, zw_am_hc: 67, zw_sd_hc: 4, zn_mid: 92000, zn_func: 657000, zn_mid_hc: 11, zn_func_hc: 36 },
  },
  budgetDetail: {
    "04": { zg_am: 2712446, zg_sd: 869365, kj_am: 708171, kj_sd: 215153, zw_am: 517200, zw_sd: 90811, zn_mid: 95269, zn_func: 638519 },
    "05": { zg_am: 2836127, zg_sd: 1066438, kj_am: 771514, kj_sd: 257421, zw_am: 511665, zw_sd: 94037, zn_mid: 109425, zn_func: 689058 },
  },
  budgetHC: {
    "04": { zg_am: 230, zg_sd: 32, kj_am: 110, kj_sd: 11, zw_am: 64, zw_sd: 4, zn_mid: 11, zn_func: 34 },
    "05": { zg_am: 223, zg_sd: 32, kj_am: 107, kj_sd: 12, zw_am: 64, zw_sd: 4, zn_mid: 11, zn_func: 36 },
  },
  denom: {
    "04": { net_income: 21000000, std_perf: 14500000, kj_rent: 1400000 },
    "05": { net_income: 22000000, std_perf: 15200000, kj_rent: 1450000 },
  },
  avgCostBreakdown: {
    zg_am: { "04": { fixed: 7000, variable: 4700 }, "05": { fixed: 6900, variable: 3000 } },
    kj_am: { "04": { fixed: 4200, variable: 2200 }, "05": { fixed: 4000, variable: 1800 } },
  },
};
