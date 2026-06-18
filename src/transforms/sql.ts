// 本地 SQL 口径引擎：对已下载的三张表(命名为 detail/roster/baseline)跑 SQL，结果喂给 computeTier。
// 关键约束：computeTier 按「列号」读 detail/roster（CSV/ROSTER 常量），故 SQL 输出必须保持原表的列集与列序——
//   这里统一「按原表头重投影」回 aoa，无论 SELECT 写法如何，列序都还原成下载时的顺序。
//   ⇒ SQL 适合「行筛选 / JOIN 过滤」，需 SELECT *（或 detail.*）保留全部列；不要做改变列形状的聚合/改名。
import alasql from "alasql";

export interface SqlConfig {
  enabled: boolean;
  detail: string;   // 资管明细
  roster: string;   // 花名册
  baseline: string; // 5月基准
}

export const DEFAULT_SQL: SqlConfig = {
  enabled: false,
  detail: "SELECT * FROM detail",
  roster: "SELECT * FROM roster",
  baseline: "SELECT * FROM baseline",
};

const TABLES = ["detail", "roster", "baseline"] as const;
type TableName = typeof TABLES[number];

/** aoa(含表头) → {表头, 对象数组(键=表头名)} */
function aoaToObjects(rows: any[][]): { header: string[]; objs: any[] } {
  const header = (rows[0] || []).map((h) => String(h ?? ""));
  const objs = rows.slice(1).map((r) => {
    const o: any = {};
    header.forEach((h, i) => { o[h] = r[i]; });
    return o;
  });
  return { header, objs };
}

/** 对象数组 → aoa，按「原表头」顺序重投影（保证 compute 按列号读取不破坏）。缺列填 ""。 */
function objectsToAoa(header: string[], objs: any[]): any[][] {
  return [header, ...objs.map((o) => header.map((h) => (o[h] ?? "")))];
}

export interface SqlResult {
  rows: Record<TableName, any[][]>;
  log: string[];
}

/** 对三张已加载表跑 SQL；返回按原表头重投影的 aoa。任一查询出错则抛出（调用方决定回退）。 */
export function runSql(tables: Record<TableName, any[][]>, cfg: SqlConfig): SqlResult {
  const log: string[] = [];
  const db: any = new alasql.Database();
  const headers: Record<string, string[]> = {};
  for (const name of TABLES) {
    const { header, objs } = aoaToObjects(tables[name] || []);
    headers[name] = header;
    db.exec(`CREATE TABLE ${name}`);
    db.tables[name].data = objs;
  }
  const out = {} as Record<TableName, any[][]>;
  for (const name of TABLES) {
    const q = (cfg[name] || "").trim() || `SELECT * FROM ${name}`;
    let res: any[];
    try {
      res = db.exec(q);
    } catch (e: any) {
      throw new Error(`SQL(${name}) 执行失败: ${e?.message || e}`);
    }
    if (!Array.isArray(res)) throw new Error(`SQL(${name}) 未返回行集（请用 SELECT 查询）`);
    out[name] = objectsToAoa(headers[name], res);
    log.push(`SQL ${name}: ${Math.max(0, (tables[name]?.length || 0) - 1)} → ${res.length} 行`);
  }
  return { rows: out, log };
}

/** 仅校验语法（不依赖真实数据）。返回错误信息字符串，合法则 null。 */
export function validateSql(cfg: SqlConfig): string | null {
  for (const name of TABLES) {
    const q = (cfg[name] || "").trim();
    if (!q) continue;
    try { alasql.parse(q); }
    catch (e: any) { return `SQL(${name}) 语法错误: ${e?.message || e}`; }
  }
  return null;
}
