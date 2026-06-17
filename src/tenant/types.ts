// 租户 / 配置类型定义
// 设计要点：数据源与口径以"种类(kind)"区分，便于未来扩展（如 SQL 取数方式）。

/** 数据源种类。'sql' 为未来扩展（用户提出后续口径配置可能增加 SQL 方式）。 */
export type SourceKind = "odin" | "excel" | "sql";

/** 取数模式：自动(可后台拉取) / 半自动(需人工触发/登录) / 手工(投递文件)。 */
export type SourceMode = "auto" | "semi" | "manual";

/** 单个数据源配置。不同 kind 用各自字段，统一可扩展。 */
export interface SourceConfig {
  id: string;
  name: string;
  kind: SourceKind;
  mode: SourceMode;
  // odin: 门户/报表 URL、抓取表索引、CSS 选择器
  url?: string;
  tableIndex?: number;
  selector?: string;
  // excel: vault 内文件夹 + 期望文件名
  folder?: string;
  filePattern?: string;
  // sql（未来）: 连接串 + 查询语句
  dsn?: string;
  query?: string;
}

/** 口径项：指标来源 + 映射 + 校验。映射方式随来源不同。 */
export interface MetricRule {
  metric: string;
  sourceId: string;
  /** excel 用列号/列名；sql 用 select 字段；odin 用返回 code */
  field?: string | number;
  caliber?: string;
  note?: string;
}

/** 一个城市(租户)的完整配置。集团统一规则不在此，走 core/group-rules 共享。 */
export interface TenantConfig {
  id: string;
  name: string;
  cityFilter: string;
  districts: string[];
  sources: SourceConfig[];
  excelColumns: Record<string, number>;
  incentiveTargets: Record<string, number>;
  metrics?: MetricRule[];
  webhookUrl?: string; // 密文存 data.json，注意同步风险
}
