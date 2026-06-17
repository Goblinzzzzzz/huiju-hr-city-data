// 验证奥丁接缝：把样例三表伪装成奥丁数据表，过 odinToTables → computeTier，
// 结果必须与「直接喂样例」完全一致，证明列映射重建 aoa 正确。
import { computeTier } from "../src/reports/tier/compute";
import { odinToTables, type OdinTable } from "../src/reports/tier/odinSource";
import { SAMPLE_EXCEL, SAMPLE_CSV, SAMPLE_ROSTER, SAMPLE_CONFIG } from "../src/reports/tier/sample";

const tbl = (aoa: any[][]): OdinTable => ({ columns: aoa[0].map(String), rows: aoa.slice(1) });
const tables: Record<string, OdinTable> = {
  "资管明细": tbl(SAMPLE_CSV),
  "5月基准": tbl(SAMPLE_EXCEL),
  "花名册": tbl(SAMPLE_ROSTER),
};
const map = {
  detail: { chart: "资管明细", cols: { city: "城市", dabu: "大部", area: "大区", id: "工号", name: "姓名", join: "成为资管日期", target: "目标", cumulative: "累计", pass: "达标", diff: "差", weighted: "加权", onjob: "在岗" } },
  baseline: { chart: "5月基准", cols: { city: "城市", id: "工号", name: "姓名", district: "大区", area: "区域", mayCumulative: "5月累计", mayRate: "达成率" } },
  roster: { chart: "花名册", cols: { id: "工号", status: "状态", leave: "离职日期" } },
};

const built = odinToTables(tables, map, SAMPLE_CONFIG.excelColumns);
if (!built.csvRows || !built.excelRows || !built.rosterRows) throw new Error("三表未齐备");

const now = 1718600000000, monthPrefix = "2026-06";
const viaOdin = computeTier({ csvRows: built.csvRows, excelRows: built.excelRows, rosterRows: built.rosterRows, config: SAMPLE_CONFIG, monthPrefix, now });
const viaFile = computeTier({ csvRows: SAMPLE_CSV, excelRows: SAMPLE_EXCEL, rosterRows: SAMPLE_ROSTER, config: SAMPLE_CONFIG, monthPrefix, now });

const a = JSON.stringify(viaOdin), b = JSON.stringify(viaFile);
if (a !== b) {
  console.error("奥丁路径 counts:", viaOdin.counts, "\n样例路径 counts:", viaFile.counts);
  throw new Error("❌ 奥丁接缝结果与样例不一致");
}
if (viaOdin.qa.blocked) throw new Error("❌ QA 未通过（勾稽不平衡）");
console.log("✓ 奥丁接缝等价于样例路径：", JSON.stringify(viaOdin.counts), "勾稽平衡 ✓");
