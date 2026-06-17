// Excel/CSV 解析（SheetJS）。纯函数：字节 → 二维数组，便于单测与 node 验证。
import * as XLSX from "xlsx";

export interface ParsedTable {
  /** 含表头的全部行（aoa）。tier 口径按列号索引，故保留原始结构。 */
  rows: any[][];
  rowCount: number; // 数据行数（不含表头）
}

/** xlsx 与 csv 通用：SheetJS 自动嗅探格式。 */
export function parseTable(bytes: Uint8Array): ParsedTable {
  const wb = XLSX.read(bytes, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null }) as any[][];
  return { rows: aoa, rowCount: Math.max(0, aoa.length - 1) };
}
