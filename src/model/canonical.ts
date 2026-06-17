// tier 报表的中间模型（与 Obsidian 无关，可单测）

export interface Person {
  gonghao: string;
  name: string;
  dabu: string;
  area: string;
  joinDate: string;
  mayTier: string;
  mayTierRank: number;
  mayRate: number;
  mayCumulative: number;
  currentTier: string;
  currentTierRank: number;
  tierChange: "↑升" | "↓降" | "—";
  rate: number;
  target: number;
  cumulative: number;
  monthlyNew: number;
  diff: number;
  pass: boolean;
  weighted: number;
  onJob: boolean;
  rosterStatus: string;
  leaveDate: string;
  statusLabel: string;
  roster: "在职" | "离职";
  annualMonths: number;
  annualTarget: number;
}

export interface Newcomer {
  gonghao: string;
  name: string;
  dabu: string;
  area: string;
  cumulative: number;
  joinDate: string;
}

export interface OverviewRow {
  tier: string;
  may: number; up: number; down: number; lost: number;
  upIn: number; downIn: number; june: number; change: number;
}

export interface DabuCard {
  name: string;
  rate: number;
  up: number; down: number; lost: number;
  rows: OverviewRow[];
}

export interface IncentiveCard {
  dabu: string;
  growth: number; c90: number; c80: number; c70: number;
  actual: number; target: number; amount: number;
}

export interface QaCheck { name: string; status: "ok" | "warn" | "bad"; detail: string; }

export interface TierViewData {
  generatedAt: number;
  counts: { onjob: number; lost: number; newcomer: number; excluded: number };
  summary: { up: number; down: number; hold: number };
  kpi: { rate: number; passWeighted: number; totalWeighted: number; notReached: number; dabuRates: Record<string, number> };
  overview: OverviewRow[];
  dabuCards: DabuCard[];
  incentives: IncentiveCard[];
  persons: Person[];
  newcomers: Newcomer[];
  cityRanking: CityRank[];
  mayBaseline: MayBaseline;
  qa: { checks: QaCheck[]; blocked: boolean };
}

/** 5月基准达标率（从 5月 xlsx 全量算，SKILL §11：达标加权/考核加权） */
export interface MayBaseline { rate: number; passWeighted: number; totalWeighted: number; notReached: number; dabuRates: Record<string, number>; }

export interface CityRank { city: string; rate: number; count: number; passWeighted: number; totalWeighted: number; }

export interface TenantCompute {
  cityFilter: string;
  districts: string[];
  incentiveTargets: Record<string, number>;
  excelColumns: { id: number; name: number; district: number; area: number; mayCumulative: number; mayRate: number };
}
