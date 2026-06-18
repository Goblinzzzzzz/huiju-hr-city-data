// 资管薪酬绩效卡 — 结构占位面板（数据待接入）。模块骨架对齐 moma-xinchou。
import { sectionCard, emptyState, skeletonGrid } from "../components";

export function renderAmPanel(): string {
  return [
    `<nav class="mod-nav"><a href="#a-am">AM 个人卡</a><a href="#a-region">区经汇总卡</a><a href="#a-district">大区汇总卡</a></nav>`,
    sectionCard("AM 个人卡", emptyState("数据待接入", "收房板块（本月/累计/净增/在管/月·年标准人效）+ 出房板块（首招/二招成功率）+ 待处理房源 4 类（首招待租/二招待租/临期/中退）") + skeletonGrid(4), { id: "a-am", meta: "待接入" }),
    sectionCard("区经汇总卡", emptyState("数据待接入", "区域级汇总表：本月/运管/月差/年差/达标率 + 房源分类着色（首招/二招/临期/中退）") + skeletonGrid(3), { id: "a-region", meta: "待接入" }),
    sectionCard("大区汇总卡", emptyState("数据待接入", "大区级聚合表：各区域人数/本月收房/月达标(x/y人)/年达标/房源分类") + skeletonGrid(3), { id: "a-district", meta: "待接入" }),
  ].join("\n");
}
