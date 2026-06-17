// 解析从 Chrome DevTools「Copy as cURL」复制的命令，抽出回放奥丁下载所需的最小信息。
// ⚠️ 安全：只取 URL / 请求体 / 少量业务头（report_id、portal_id），**丢弃 Cookie**——
//   cookie 走插件设置里的 odinCookie，绝不随模板落盘。
// Chrome 在请求体含单引号时用 ANSI-C 引用 $'...'（如 SQL 的 'case when ... then ''）；
//   不含时用普通 '...'。两种都要支持。

export interface CurlTemplate {
  url: string;
  body: string;        // 原始请求体（JSON 字符串）
  reportId: string;    // -H 'report_id: ...'
  portalId: string;    // -H 'portal_id: ...'
}

/** 解 ANSI-C 引用 $'...' 的转义（仅常见序列；未知反斜杠原样保留）。 */
function decodeAnsiC(s: string): string {
  let out = "";
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "\\" && i + 1 < s.length) {
      const n = s[++i];
      if (n === "n") out += "\n";
      else if (n === "t") out += "\t";
      else if (n === "r") out += "\r";
      else if (n === "\\") out += "\\";
      else if (n === "'") out += "'";
      else if (n === '"') out += '"';
      else out += n; // 其它：去掉反斜杠保留字符
    } else {
      out += s[i];
    }
  }
  return out;
}

/** 提取 `--data-raw`/`--data`/`--data-binary` 后的引用串（支持 $'...' 与 '...'）。 */
function extractData(curl: string): string | null {
  const m = curl.match(/--data(?:-raw|-binary|-ascii)?\s+(\$?)'/);
  if (!m) return null;
  const ansi = m[1] === "$";
  let i = (m.index || 0) + m[0].length; // 指向开引号后第一个字符
  let raw = "";
  for (; i < curl.length; i++) {
    const ch = curl[i];
    if (ch === "\\" && ansi) { raw += ch + (curl[i + 1] ?? ""); i++; continue; }
    if (ch === "'") {
      // 普通 '...' 里 shell 的 '\'' 续接：'\'' = 结束+转义单引号+开始
      if (!ansi && curl.slice(i, i + 4) === "'\\''") { raw += "'"; i += 3; continue; }
      break; // 结束引用
    }
    raw += ch;
  }
  return ansi ? decodeAnsiC(raw) : raw;
}

function extractHeader(curl: string, name: string): string {
  const re = new RegExp("-H\\s+'" + name + ":\\s*([^']*)'", "i");
  const m = curl.match(re);
  return m ? m[1].trim() : "";
}

/** 从一条 cURL 解析出回放模板；失败返回 null。请求体必须是合法 JSON 且含 report_id。 */
export function parseCurl(curl: string): CurlTemplate | null {
  const s = (curl || "").trim();
  if (!s) return null;
  const urlM = s.match(/curl\s+(?:-[A-Za-z-]+\s+)*'([^']+)'/) || s.match(/curl\s+'([^']+)'/);
  const url = urlM ? urlM[1] : (s.match(/'(https?:\/\/[^']+)'/)?.[1] || "");
  const body = extractData(s);
  if (!url || !body) return null;
  let parsed: any;
  try { parsed = JSON.parse(body); } catch { return null; }
  const reportId = extractHeader(s, "report_id") || String(parsed.report_id ?? "");
  const portalId = extractHeader(s, "portal_id");
  if (!reportId) return null;
  return { url, body, reportId, portalId };
}

/** 清掉请求体里的「城市」筛选 → 全国下载（资管明细默认武汉，去掉即全国）。 */
export function clearCityFilter(body: string): string {
  try {
    const o = JSON.parse(body);
    const cd = typeof o.chart_data === "string" ? JSON.parse(o.chart_data) : o.chart_data;
    const clr = (arr: any[]) => (arr || []).forEach((c: any) => {
      const code = String(c?.column_info?.column_code || c?.column_info?.column_name || "");
      if (/城市/.test(code)) { // 仅匹配「统计城市」，不动大区/大部
        const reset = (f: any) => { if (f) { f.filter_mode = "all"; f.values = []; delete f.temp_values; delete f.temp_filter_mode; delete f.displayText; } };
        reset(c.column_filter); reset(c.column_info?.column_filter);
      }
    });
    clr(cd.filters); clr(cd.columns);
    o.chart_data = JSON.stringify(cd);
    return JSON.stringify(o);
  } catch { return body; }
}

/** 调高请求体的行数上限（全国下载需取全量，默认模板 limit=1000 会截断）。 */
export function setRowLimit(body: string, n: number): string {
  try {
    const o = JSON.parse(body);
    const cd = typeof o.chart_data === "string" ? JSON.parse(o.chart_data) : o.chart_data;
    if (cd.limit) cd.limit.page_size = n; else cd.limit = { page_no: 1, page_size: n };
    cd.limit_count = n;
    cd.sql_size = n;
    o.chart_data = JSON.stringify(cd);
    return JSON.stringify(o);
  } catch { return body; }
}

/** 把模板请求体里的日期动态参数替换成指定日期（花名册的 param_value）。无则原样返回。 */
export function swapDateParam(body: string, dateValue: string): string {
  try {
    const o = JSON.parse(body);
    const cd = typeof o.chart_data === "string" ? JSON.parse(o.chart_data) : o.chart_data;
    if (cd && Array.isArray(cd.dynamic_params) && cd.dynamic_params.length) {
      cd.dynamic_params = cd.dynamic_params.map((p: any) => ({ ...p, param_value: dateValue }));
      o.chart_data = JSON.stringify(cd);
      return JSON.stringify(o);
    }
  } catch { /* 解析失败则原样 */ }
  return body;
}
