// 端到端验证：合成样例数据 → 经 SheetJS 解析 → computeTier → 断言勾稽 → 导出 HTML。
// 运行：npx esbuild scripts/verify.ts --bundle --platform=node --format=cjs --outfile=.verify.cjs && node .verify.cjs
import * as XLSX from "xlsx";
import * as fs from "fs";
import * as path from "path";
import { parseTable } from "../src/connectors/ExcelConnector";
import { computeTier } from "../src/reports/tier/compute";
import { exportTierHtml } from "../src/reports/tier/exportHtml";
import type { TenantCompute } from "../src/model/canonical";

function bytes(aoa: any[][], type: "xlsx" | "csv"): Uint8Array {
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
  const buf = XLSX.write(wb, { type: "buffer", bookType: type }) as Buffer;
  return new Uint8Array(buf);
}

// ===== 合成样例（覆盖：升/降/平/本月离职/新人首考/旧离职排除/重名工号）=====
// Excel 5月基准: [城市,大区,区域,工号,姓名, , , , , , ,5月累计,达成率小数, , ]
const excel = [
  ["城市", "大区", "区域", "工号", "姓名", "", "", "", "", "", "", "5月累计", "达成率", "", ""],
  ["武汉", "省心租汉口大区", "汉口一区", 1001, "王强", "", "", "", "", "", "", 5, 0.85, "", ""],   // 成长80→标杆 ↑
  ["武汉", "省心租汉口大区", "汉口一区", 1002, "李娜", "", "", "", "", "", "", 6, 1.05, "", ""],   // 标杆→成长70 ↓
  ["武汉", "省心租汉口大区", "汉口二区", 1003, "赵雷", "", "", "", "", "", "", 6, 0.65, "", ""],   // 潜力60 —
  ["武汉", "省心租武昌大区", "武昌一区", 30832961, "张威", "", "", "", "", "", "", 11, 1.21, "", ""], // 标杆 —（重名）
  ["武汉", "省心租汉阳大区", "汉阳一区", 26744533, "张威", "", "", "", "", "", "", 4, 0.55, "", ""], // 潜力50→成长80 ↑（重名）
  ["武汉", "省心租武昌大区", "武昌二区", 1006, "孙萍", "", "", "", "", "", "", 7, 0.95, "", ""],   // 成长90→潜力<50 ↓
  ["武汉", "省心租汉阳大区", "汉阳一区", 1007, "周敏", "", "", "", "", "", "", 5, 0.72, "", ""],   // 成长70（本月离职）
  ["武汉", "省心租汉阳大区", "汉阳二区", 1010, "钱进", "", "", "", "", "", "", 7, 0.88, "", ""],   // 成长80→成长90 ↑
];
// CSV 明细: [城市,大部,大区,工号,姓名,成为资管日期, ,目标,累计,达标,差,加权,在岗,全年月数,全年目标]
const csv = [
  ["城市", "大部", "大区", "工号", "姓名", "成为资管日期", "", "目标", "累计", "达标", "差", "加权", "在岗", "全年月数", "全年目标"],
  ["武汉", "省心租汉口大区", "汉口一区", 1001, "王强", "2024-03-01", "", 10, 10, "是", 0, 1.0, "是", 12, 24],
  ["武汉", "省心租汉口大区", "汉口一区", 1002, "李娜", "2024-05-01", "", 10, 7, "否", 3, 1.0, "是", 12, 24],
  ["武汉", "省心租汉口大区", "汉口二区", 1003, "赵雷", "2023-09-01", "", 10, 6.5, "否", 3.5, 1.0, "是", 12, 24],
  ["武汉", "省心租武昌大区", "武昌一区", 30832961, "张威", "2022-01-01", "", 12, 12, "是", 0, 1.2, "是", 12, 28],
  ["武汉", "省心租汉阳大区", "汉阳一区", 26744533, "张威", "2024-06-01", "", 10, 8, "否", 2, 1.0, "是", 12, 24],
  ["武汉", "省心租武昌大区", "武昌二区", 1006, "孙萍", "2023-02-01", "", 10, 4, "否", 6, 1.0, "是", 12, 24],
  ["武汉", "省心租汉阳大区", "汉阳一区", 1007, "周敏", "2023-07-01", "", 10, 7, "否", 3, 1.0, "否", 12, 24], // 离职
  ["武汉", "省心租汉阳大区", "汉阳二区", 1010, "钱进", "2024-04-01", "", 10, 9, "否", 1, 1.0, "是", 12, 24],
  ["武汉", "省心租汉口大区", "汉口一区", 1008, "陈晨", "2026-05-20", "", 8, 9, "否", 0, 0.5, "是", 12, 16],   // 新人
  ["武汉", "省心租武昌大区", "武昌一区", 1009, "吴军", "2022-01-01", "", 10, 2, "否", 8, 0, "否", 12, 24],     // 旧离职排除
];
// 花名册: [工号, , , , , , , , ,状态, , ,离职日期]
const roster = [
  ["工号", "", "", "", "", "", "", "", "", "状态", "", "", "离职日期"],
  [1001, "", "", "", "", "", "", "", "", "在职在岗", "", "", ""],
  [1007, "", "", "", "", "", "", "", "", "离职", "", "", "2026-06-03"],
  [1008, "", "", "", "", "", "", "", "", "在职在岗", "", "", ""],
  [1009, "", "", "", "", "", "", "", "", "离职", "", "", "2026-05-01"],
];

const config: TenantCompute = {
  cityFilter: "武汉",
  districts: ["汉口", "武昌", "汉阳"],
  incentiveTargets: { 汉口: 12, 武昌: 17, 汉阳: 11 },
  excelColumns: { id: 3, name: 4, district: 1, area: 2, mayCumulative: 11, mayRate: 12 },
};

const data = computeTier({
  excelRows: parseTable(bytes(excel, "xlsx")).rows,
  csvRows: parseTable(bytes(csv, "csv")).rows,
  rosterRows: parseTable(bytes(roster, "csv")).rows,
  config,
  monthPrefix: "2026-06",
  now: new Date("2026-06-17T09:20:00").getTime(),
});

// ===== 断言 =====
let fail = 0;
function eq(name: string, got: any, want: any) {
  const ok = got === want;
  console.log(`${ok ? "✓" : "✗"} ${name}: ${got}${ok ? "" : " (期望 " + want + ")"}`);
  if (!ok) fail++;
}
console.log("=== 分类 ===");
eq("在岗", data.counts.onjob, 7);
eq("本月离职", data.counts.lost, 1);
eq("新人首考", data.counts.newcomer, 1);
eq("排除", data.counts.excluded, 1);
console.log("=== 流动 ===");
eq("升档", data.summary.up, 3);
eq("降档", data.summary.down, 2);
eq("持平", data.summary.hold, 2);
console.log("=== 勾稽恒等式（核心）===");
const idOk = data.overview.every((r) => r.may === r.june + r.up + r.down + r.lost - r.upIn - r.downIn);
eq("每行 5月=6月+升+降+离-升入-降入", idOk, true);
eq("QA blocked", data.qa.blocked, false);

const outDir = path.join(process.cwd(), ".verify-out");
fs.mkdirSync(outDir, { recursive: true });
const html = exportTierHtml(data, { city: "惠居武汉", month: "2026年6月" });
fs.writeFileSync(path.join(outDir, "tier-dashboard.html"), html);
console.log(`\nHTML 已生成: ${path.join(outDir, "tier-dashboard.html")} (${html.length} 字符)`);
console.log(fail === 0 ? "\n✅ 端到端验证通过" : `\n❌ ${fail} 项断言失败`);
process.exit(fail === 0 ? 0 : 1);
