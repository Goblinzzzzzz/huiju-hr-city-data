// 用真实下载的 资管明细 + 花名册 跑通 plugin 的 parseTable→computeTier，验证管线。
// 5月基准用真实工号合成（模拟成长 70%），以激活升降级并检验勾稽恒等式。
import * as fs from "fs";
import { parseTable } from "../src/connectors/ExcelConnector";
import { computeTier } from "../src/reports/tier/compute";
import { SAMPLE_CONFIG } from "../src/reports/tier/sample";

const dir = "/Users/goblin/Downloads/";
const csv = parseTable(new Uint8Array(fs.readFileSync(dir + "资管年标准人效达标率_资管明细_202606178471496661048021687.csv")));
const roster = parseTable(new Uint8Array(fs.readFileSync(dir + "资管经理花名册_资管花名册_202606172057785220403082815.csv")));
console.log("资管明细解析:", csv.rowCount, "行 ×", (csv.rows[0] || []).length, "列");
console.log("花名册解析:", roster.rowCount, "行 ×", (roster.rows[0] || []).length, "列");

const EX = SAMPLE_CONFIG.excelColumns;
const excel: any[][] = [["城市", "大区", "区域", "工号", "姓名", "", "", "", "", "", "", "5月累计", "达成率"]];
for (const r of csv.rows.slice(1)) {
  const target = parseFloat(r[7]) || 0, cum = parseFloat(r[8]) || 0;
  const may = cum * 0.7;
  const row: any[] = new Array(13).fill("");
  row[0] = "武汉"; row[EX.district] = r[1]; row[EX.area] = r[2]; row[EX.id] = r[3]; row[EX.name] = r[4];
  row[EX.mayCumulative] = may; row[EX.mayRate] = target > 0 ? may / target : 0;
  excel.push(row);
}

const d = computeTier({ excelRows: excel, csvRows: csv.rows, rosterRows: roster.rows, config: SAMPLE_CONFIG, monthPrefix: "2026-06", now: 1718600000000 });
console.log("\ncounts:", JSON.stringify(d.counts));
console.log("KPI 达标率:", d.kpi.rate, "% | 大区:", JSON.stringify(d.kpi.dabuRates));
console.log("升/降/持平:", d.summary.up, d.summary.down, d.summary.hold);
console.log("QA blocked:", d.qa.blocked);
d.qa.checks.forEach((c) => console.log("  ", c.status, c.name, "-", c.detail));
if (d.counts.onjob === 0) { console.error("❌ 在岗为 0，分类异常"); process.exit(1); }
console.log("\n✓ 真实数据端到端跑通");
