// 奥丁后台静默取数（cookie 认证，直连 HTTP 数据接口，无浏览器/无 MCP token）。
// 方案：用户在设置里粘贴贝壳 SSO cookie → 用 Obsidian requestUrl 发请求。
// 用 requestUrl 而非 Node https：requestUrl 走 Electron 网络栈，自动遵循系统代理（公司内网常需代理）+ 自动解 gzip + 绕 CORS。
// 配方见 memory/odin-headless-fetch-recipe（已用真实 cookie 实测拿到行数据）。
import { requestUrl } from "obsidian";
import { swapDateParam, clearCityFilter, setRowLimit, type CurlTemplate } from "./curl";

const API = "https://odin.ke.com/kegate/proxy/odin/ubag/common/json/api";

export interface OdinSession { cookieHeader: string; ucid: string; }
export interface OdinRows { columns: string[]; rows: any[][]; total: number; }

/** 从设置里粘贴的 cookie 串解析会话；无 odin_token 视为无效。 */
export function sessionFromCookie(cookieStr: string): OdinSession | null {
  const ck = (cookieStr || "").trim();
  if (!ck || !/(^|;\s*)odin_token=[^;]/.test(ck)) return null;
  const m = ck.match(/(?:^|;\s*)(?:login_ucid|_ucid_)=([^;]+)/);
  return { cookieHeader: ck, ucid: m ? m[1] : "" };
}

async function post(name: string, body: any, s: OdinSession, reportId: string | number): Promise<any> {
  const resp = await requestUrl({
    url: `${API}/${name}`,
    method: "POST",
    contentType: "application/json",
    headers: {
      "Accept": "application/json, text/plain, */*",
      "Cookie": s.cookieHeader,
      "Origin": "https://odin.ke.com",
      "Referer": `https://odin.ke.com/report/detail?report_id=${reportId}`,
      "env": "production",
      "proxy_sign": "0",
      "report_id": String(reportId),
      "request_id": String(Date.now()),
      "ucid": s.ucid,
      "x-gateway-ucid": s.ucid,
    },
    body: JSON.stringify(body),
    throw: false,
  });
  const text = resp.text || "";
  if (/login\.ke\.com\/login/.test(text) || /^\s*<!DOCTYPE/.test(text)) {
    throw new Error("cookie 已失效，请在设置更新奥丁 Cookie");
  }
  try { return resp.json; }
  catch (e) { throw new Error("响应非 JSON：" + text.slice(0, 120)); }
}

/**
 * 全量下载一张表：回放页面「下载按钮」的 odin_data_download 载荷（来自 parseCurl 的模板）。
 * 这是奥丁的导出接口，返回整张表的 CSV（非分页，避开 data_query 的 GROUP BY 坑）。
 * 用 requestUrl（Electron 网络栈，浏览器式指纹 + 系统代理），低频调用不触发反爬限流。
 * 返回 CSV 字节；交给 ExcelConnector.parseTable 解析。
 */
export async function downloadTable(s: OdinSession, tpl: CurlTemplate, dateValue?: string, log?: (m: string) => void, national?: boolean): Promise<Uint8Array> {
  const lg = log || (() => {});
  let body = tpl.body;
  if (national) { body = setRowLimit(clearCityFilter(body), 100000); lg("已清除城市筛选 + 行数上限 10万 → 全国全量"); }
  if (dateValue) body = swapDateParam(body, dateValue);
  const origin = (tpl.url.match(/^https?:\/\/[^/]+/) || ["https://odin.ke.com"])[0];

  // 请求体自检：解析出 chart_name / 列数 / 过滤器数（不打印 30KB 原文）
  try {
    const ob = JSON.parse(body);
    const cd = typeof ob.chart_data === "string" ? JSON.parse(ob.chart_data) : ob.chart_data;
    const cols = (cd?.columns || []).filter((c: any) => c.column_owner !== "filter").length;
    lg(`请求体: ${body.length}B | chart_name=${ob.chart_name} report_id=${ob.report_id} | 数据列=${cols} 过滤器=${(cd?.filters || []).length} | dynamic_params=${JSON.stringify(cd?.dynamic_params || [])}`);
  } catch (e) { lg(`⚠️ 请求体不是合法 JSON（parseCurl 解析可能有误）: ${body.slice(0, 120)}`); }

  // ① 触发导出 → 拿 download_id（同步导出 is_async:0，文件即时就绪）
  const resp = await requestUrl({
    url: tpl.url,
    method: "POST",
    contentType: "application/json",
    headers: {
      "Accept": "application/json, text/plain, */*",
      "Cookie": s.cookieHeader,
      "Origin": origin,
      "Referer": `${origin}/portal/${tpl.portalId || ""}`,
      "env": "production",
      "proxy_sign": "0",
      "portal_id": tpl.portalId || "",
      "report_id": tpl.reportId,
      "request_id": String(Date.now()),
      "ucid": s.ucid,
      "x-gateway-ucid": s.ucid,
    },
    body,
    throw: false,
  });
  const txt = resp.text || "";
  lg(`① POST odin_data_download → HTTP ${resp.status}`);
  lg("响应(全文):\n```json\n" + txt.slice(0, 2000) + (txt.length > 2000 ? "\n…(截断)" : "") + "\n```");
  if (/login\.ke\.com\/login/.test(txt) || /^\s*<!DOCTYPE/i.test(txt)) {
    throw new Error("cookie 已失效，请在设置更新奥丁 Cookie");
  }
  let j: any = null;
  try { j = resp.json; } catch { /* 非 JSON */ }
  const did = j?.data?.download_id ?? j?.download_id;
  const isAsync = j?.data?.is_async === 1;
  if (!did) {
    const empty = /"columnType"\s*:\s*\{\s*\}/.test(txt);
    throw new Error(empty ? "导出结果为空（多半是日期分区当天未就绪/筛选无数据，请用 T-1 日期）" : "未拿到 download_id（见上方响应全文）");
  }
  lg(`download_id=${did} is_async=${j?.data?.is_async}`);

  // ② 用 download_id 取文件（GET）。CSV 首行应含中文列名；异步导出需轮询等就绪。
  const fileUrl = `${origin}/kegate/proxy/odin/download/common/output/any/odin_file_download?download_id=${did}`;
  const looksCsv = (b: Uint8Array) => /城市|资管|工号|大部|姓名/.test(new TextDecoder("utf-8").decode(b.slice(0, 300)));
  const getFile = async () => {
    const f = await requestUrl({
      url: fileUrl, method: "GET", throw: false,
      headers: { "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8", "Cookie": s.cookieHeader, "Referer": origin + "/" },
    });
    return { status: f.status, bytes: new Uint8Array(f.arrayBuffer || new ArrayBuffer(0)) };
  };

  let { status, bytes } = await getFile();
  if (isAsync && !looksCsv(bytes)) {
    lg(`异步导出，轮询等待文件就绪（首取 ${bytes.length}B 未就绪）…`);
    for (let i = 0; i < 40 && !looksCsv(bytes); i++) {
      await new Promise((r) => setTimeout(r, 2500));
      ({ status, bytes } = await getFile());
      if (i % 4 === 3) lg(`  轮询 ${(i + 1) * 2.5}s… 当前 ${bytes.length}B`);
    }
    if (!looksCsv(bytes)) throw new Error(`异步导出超时(~100s 文件未就绪) download_id=${did}`);
    lg(`异步就绪: ${bytes.length}B`);
  }
  const head = new TextDecoder("utf-8").decode(bytes.slice(0, 200));
  const firstLine = head.replace(/^﻿/, "").split(/\r?\n/)[0];
  lg(`② GET odin_file_download → HTTP ${status}, bytes=${bytes.length}, 首行="${firstLine}"`);
  if (/login\.ke\.com\/login/.test(head) || /^\s*<!DOCTYPE/i.test(head)) {
    throw new Error("取文件时 cookie 失效，请更新奥丁 Cookie");
  }
  if (bytes.length === 0 || !looksCsv(bytes)) throw new Error("取文件未返回 CSV（download_id=" + did + "，首段:" + head.slice(0, 80) + "）");
  return bytes;
}

/** 取报表图表清单（每个含完整描述符，可作为 data_query 模板）。 */
export async function fetchChartList(s: OdinSession, reportId: string | number, creatorUcId: string | number): Promise<any[]> {
  const cuc = (creatorUcId === "" || creatorUcId == null) ? s.ucid : creatorUcId; // 留空回退到当前账号 ucid
  const j = await post("odin_report_chart_list", { report_id: Number(reportId), creator_uc_id: Number(cuc) }, s, reportId);
  if (j?.data?.resultId === -1 && j?.data?.viewMsg) throw new Error("chart_list: " + j.data.viewMsg);
  return j?.data?.report_chart_list || [];
}

/** 回放一个图表的 data_query 模板取数：替换分页 + 日期动态参数。 */
export async function queryChart(
  s: OdinSession,
  template: any,
  opts: { dateValue?: string; pageNo?: number; pageSize?: number; projectId?: number } = {}
): Promise<OdinRows> {
  const body = JSON.parse(JSON.stringify(template));
  if (opts.projectId != null && body.project_id == null) body.project_id = opts.projectId;
  if (body.type == null) body.type = "view";
  const cd = typeof body.chart_data === "string" ? JSON.parse(body.chart_data) : (body.chart_data || {});
  cd.limit = { page_no: opts.pageNo || 1, page_size: opts.pageSize || 1000 };
  if (cd.filters == null) cd.filters = [];
  if (cd.compute_xox == null) cd.compute_xox = false;
  if (opts.dateValue && Array.isArray(cd.dynamic_params)) {
    cd.dynamic_params = cd.dynamic_params.map((p: any) => ({ ...p, param_value: opts.dateValue }));
  }
  body.chart_data = JSON.stringify(cd);

  const j = await post("odin_data_query", body, s, body.report_id);
  const res = j?.data?.result;
  if (!res || res.code !== 0) throw new Error(j?.data?.message || j?.data?.viewMsg || "data_query 失败");
  const list: any[] = res.data?.list || [];
  const mapping = j.data.mapping || {};
  const colKeys = list.length ? Object.keys(list[0]) : Object.keys(res.data?.columnType || {});
  const columns = colKeys.map((k) => {
    const mv = mapping[k];
    return typeof mv === "string" ? mv : (mv && mv.name) ? mv.name : k;
  });
  const rows = list.map((o) => colKeys.map((k) => o[k]));
  return { columns, rows, total: res.data?.pageDto?.totalCount ?? rows.length };
}
