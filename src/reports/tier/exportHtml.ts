// 看板导出入口（薄壳）：组装多项目外壳。沉稳企业蓝设计系统见 ../design.ts，组件见 ../components.ts。
// 兼容：TrendEntry 仍从本路径导出（wechat.ts / WorkbenchView.ts 依赖）；exportTierHtml 保留为包装。
import type { TierViewData } from "../../model/canonical";
import { renderShell } from "../shell";
import { renderTierPanel, type TrendEntry } from "./render";
import { renderCostPanel } from "../cost/render";
import { computeCost } from "../cost/compute";
import type { CostData } from "../cost/model";
import { renderAmPanel } from "../am/render";

export type { TrendEntry };

export interface DashboardInput {
  city: string;
  month: string;
  generatedAt?: number;
  tier?: { data: TierViewData; trend?: TrendEntry[] };
  cost?: CostData;
}

const TABS = [
  { id: "proj-tier", panelId: "panel-tier", label: "年标准人效达标率" },
  { id: "proj-cost", panelId: "panel-cost", label: "人工成本" },
  { id: "proj-am", panelId: "panel-am", label: "资管薪酬绩效卡" },
];

/** 组装 3 项目看板（tier 满数据，cost/am 占位）。 */
export function exportDashboard(input: DashboardInput): string {
  const now = input.generatedAt ?? Date.now();
  const tierPanel = input.tier
    ? renderTierPanel(input.tier.data, { trend: input.tier.trend })
    : `<div style="padding:24px">尚无数据</div>`;
  const costPanel = input.cost ? renderCostPanel(computeCost(input.cost), input.cost) : renderCostPanel();
  return renderShell({
    brand: "惠居数据看板",
    city: input.city,
    month: input.month,
    generatedAt: now,
    fresh: { ok: true, text: "已更新" },
    tabs: TABS,
    panels: [tierPanel, costPanel, renderAmPanel()],
  });
}

/** 兼容旧调用（WorkbenchView / verify）。 */
export function exportTierHtml(d: TierViewData, opts: { city: string; month: string; trend?: TrendEntry[] }): string {
  return exportDashboard({ city: opts.city, month: opts.month, tier: { data: d, trend: opts.trend } });
}
