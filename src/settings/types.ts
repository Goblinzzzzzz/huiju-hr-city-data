import type { TenantCompute } from "../model/canonical";
import type { SqlConfig } from "../transforms/sql";

export interface HjSettings {
  /** 默认进入的城市(租户) id */
  defaultTenant: string;
  /** 各租户口径配置（cityFilter/districts/excelColumns/incentiveTargets）。空={}→该租户回退内置默认(SAMPLE_CONFIG) */
  calibers: Record<string, TenantCompute>;
  /** 各租户 SQL 口径（对已下载表跑 SQL）。空={}→该租户回退 DEFAULT_SQL(enabled=false，纯透传) */
  sqlCalibers: Record<string, SqlConfig>;
  /** 在线升级清单 URL（update.json） */
  updateUrl: string;
  /** 线下数据投递目录（建议放 vault 外/排除同步，避免 HR 数据随 iCloud 流转） */
  inboxPath: string;
  /** 全局企微 webhook（密文存 data.json，注意同步风险；可被租户覆盖） */
  webhookUrl: string;
  /** 奥丁报表 URL（登录窗目标 / 自动抓取入口） */
  odinUrl: string;
  /** 奥丁报表 report_id */
  odinReportId: string;
  /** 报表创建者 uc_id（chart_list 必填） */
  odinCreatorUcId: string;
  /** 奥丁 cookie 串（贝壳 SSO 登录后从浏览器复制；⚠️ 明文存 data.json） */
  odinCookie: string;
  /** 奥丁数据表 → tier 三表的列映射（JSON）。空=走手动上传；见 reports/tier/odinSource.ts */
  odinColumnMap: string;
  /** 资管明细「下载按钮」回放模板（parseCurl 解析后的 JSON，不含 cookie） */
  odinDetailTemplate: string;
  /** 花名册「下载按钮」回放模板（parseCurl 解析后的 JSON，不含 cookie） */
  odinRosterTemplate: string;
}

export const DEFAULT_SETTINGS: HjSettings = {
  defaultTenant: "wuhan",
  calibers: {}, // 空：各租户回退 SAMPLE_CONFIG；用户在「口径配置」保存后落 data.json
  sqlCalibers: {}, // 空：各租户回退 DEFAULT_SQL（关闭，纯透传）
  updateUrl: "https://raw.githubusercontent.com/Goblinzzzzzz/huiju-hr-city-data/main", // 在线升级源（GitHub raw 主分支）
  inboxPath: "",
  webhookUrl: "",
  // 真实数据源：年标准人效达标率场景（tier）
  odinUrl: "https://odin.ke.com/portal/2974/39522/46908/89428", // 年标准人效达标率看板
  odinReportId: "176116", // 大区拆解（真实 report_id）
  odinCreatorUcId: "", // 留空则用 cookie 中的 ucid
  odinCookie: "",
  odinColumnMap: "", // 空：走手动上传；抓取后照 odin/*.json 真实列名填写
  odinDetailTemplate: "", // 粘贴资管明细下载 cURL 后由 parseCurl 生成
  odinRosterTemplate: "", // 粘贴花名册下载 cURL 后由 parseCurl 生成
};
