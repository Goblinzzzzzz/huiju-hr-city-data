// 奥丁数据表 → tier 计算输入（ComputeInput 的三张定位 aoa）的转换接缝。
// computeTier 按固定列索引读取（见 compute.ts 的 CSV / ROSTER / config.excelColumns），
// 这里把「奥丁列名」映射回这些索引位，从而无需改 compute 即可用奥丁数据出看板。
//
// ⚠️ 关键未决项：cols（tier字段→奥丁列名）需在拿到真实奥丁列名后填写。
//   先用「立即抓取」把每张数据表落盘到 inbox/<city>/odin/*.json（含真实 columns），
//   再照着真实列名在「设置→奥丁列映射」填 JSON。未配置时控制台仍走手动上传/样例。
import { CSV, ROSTER } from "./compute";

export interface OdinTable { columns: string[]; rows: any[][]; }
/** 一张源表的映射：用哪个图表(chart_name) + tier字段 → 奥丁列名 */
export interface OdinFieldMap { chart: string; cols: Record<string, string>; }
/** tier 三张源表的奥丁映射；缺某张则该表整体回退手动上传 */
export interface OdinTierMap { detail?: OdinFieldMap; baseline?: OdinFieldMap; roster?: OdinFieldMap; }

/** 解析设置里的列映射 JSON；空串/非法/无任一表 → null（视为未配置）。 */
export function parseOdinTierMap(json: string): OdinTierMap | null {
  const s = (json || "").trim();
  if (!s) return null;
  try {
    const m = JSON.parse(s);
    if (m && (m.detail || m.baseline || m.roster)) return m as OdinTierMap;
  } catch (e) { /* 非法 JSON 视为未配置 */ }
  return null;
}

/** 按 field→列索引 + field→奥丁列名，把一张奥丁表转成 compute 期望的定位 aoa（首行为占位表头）。 */
function toAoa(table: OdinTable, fieldIndex: Record<string, number>, cols: Record<string, string>): any[][] {
  const width = Math.max(0, ...Object.values(fieldIndex)) + 1;
  const colOf: Record<string, number> = {};
  for (const [field, odinCol] of Object.entries(cols)) {
    const i = table.columns.indexOf(odinCol);
    if (i >= 0 && fieldIndex[field] != null) colOf[field] = i;
  }
  const header = new Array(width).fill("");
  for (const [field, idx] of Object.entries(fieldIndex)) header[idx] = field;
  const out: any[][] = [header];
  for (const r of table.rows) {
    const row = new Array(width).fill("");
    for (const [field, ci] of Object.entries(colOf)) row[fieldIndex[field]] = r[ci];
    out.push(row);
  }
  return out;
}

/** 把抓取到的奥丁表(按 chart_name 索引)按映射转成 compute 的三张 aoa；未映射/表缺失则该表为 null。 */
export function odinToTables(
  tables: Record<string, OdinTable>,
  map: OdinTierMap,
  excelColumns: { id: number; name: number; district: number; area: number; mayCumulative: number; mayRate: number },
): { csvRows: any[][] | null; excelRows: any[][] | null; rosterRows: any[][] | null } {
  const pick = (fm: OdinFieldMap | undefined, fieldIndex: Record<string, number>) => {
    if (!fm) return null;
    const t = tables[fm.chart];
    return t ? toAoa(t, fieldIndex, fm.cols) : null;
  };
  const EX = excelColumns;
  return {
    csvRows: pick(map.detail, CSV),
    // 基准表额外把城市放第 0 列：compute 用 row[0] 兜底做 cityFilter 判断
    excelRows: pick(map.baseline, { city: 0, id: EX.id, name: EX.name, district: EX.district, area: EX.area, mayCumulative: EX.mayCumulative, mayRate: EX.mayRate }),
    rosterRows: pick(map.roster, ROSTER),
  };
}
