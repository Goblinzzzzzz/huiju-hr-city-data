// 人工成本 — 结构占位面板（数据待接入）。模块骨架对齐 dashboard_v2。
import { sectionCard, emptyState, skeletonGrid } from "../components";

export function renderCostPanel(): string {
  const ph = (title: string, desc: string, n: number) => sectionCard(title, emptyState("数据待接入", desc) + skeletonGrid(n), { flush: false, meta: "待接入" });
  return [
    `<nav class="mod-nav"><a href="#c-cost">人工成本分析</a><a href="#c-salary">薪酬水平</a><a href="#c-perf">绩效激励</a></nav>`,
    sectionCard("人工成本分析", emptyState("数据待接入", "6 比率 KPI：省心租/资管/客经/租务/职能 占净收入比，实际 vs 预算偏差") + skeletonGrid(6), { id: "c-cost", meta: "待接入" }),
    sectionCard("薪酬水平", emptyState("数据待接入", "总监层 / S层 / AM层 分层薪资，支持下钻到个人") + skeletonGrid(3), { id: "c-salary", meta: "待接入" }),
    sectionCard("绩效激励", emptyState("数据待接入", "K1 利润系数（C1税前利润·C2单房UE·C3利润贡献）+ K2 重点工作系数（规模效率/安全/服务）+ 13城对标") + skeletonGrid(4), { id: "c-perf", meta: "待接入" }),
  ].join("\n");
}
