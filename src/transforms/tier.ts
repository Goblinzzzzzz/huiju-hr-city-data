// 集团统一口径算子（可复用核心，移植自 generate_tier_dashboard.py）

export const TIERS = ["标杆", "成长90", "成长80", "成长70", "潜力60", "潜力50", "潜力<50"];
export const TIER_RANK: Record<string, number> = Object.fromEntries(TIERS.map((t, i) => [t, i]));
export const GROWTH_TIERS = ["成长90", "成长80", "成长70"];

export function getTier(rate: number): [string, number] {
  if (rate >= 100) return ["标杆", 0];
  if (rate >= 90) return ["成长90", 1];
  if (rate >= 80) return ["成长80", 2];
  if (rate >= 70) return ["成长70", 3];
  if (rate >= 60) return ["潜力60", 4];
  if (rate >= 50) return ["潜力50", 5];
  return ["潜力<50", 6];
}

/** 工号归一化（防重名：必须按工号匹配） */
export function normalizeWorkId(v: any): string {
  if (v === null || v === undefined || v === "") return "";
  const n = parseInt(String(v).trim(), 10);
  return isNaN(n) ? "" : String(n);
}

export function safeFloat(v: any, d = 0): number {
  if (v === null || v === undefined || v === "" || v === "#N/A" || v === "None") return d;
  const n = parseFloat(String(v));
  return isNaN(n) ? d : n;
}

/** 大区短名映射（配置驱动，取代硬编码字符串匹配） */
export function dabuShort(raw: string, districts: string[]): string {
  if (!raw) return "其他";
  for (const d of districts) if (raw.includes(d)) return d;
  return "其他";
}
