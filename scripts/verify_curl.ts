// 验证 parseCurl / swapDateParam：覆盖普通 '...' 与 ANSI-C $'...'（含单引号、转义引号）。
import { parseCurl, swapDateParam } from "../src/connectors/curl";

let fail = 0;
const ok = (cond: boolean, msg: string) => { if (!cond) { console.error("❌", msg); fail++; } else console.log("✓", msg); };

// 1) 普通 '...'：body 含 JSON 转义引号 \"
const curlPlain =
  `curl 'https://odin.ke.com/kegate/proxy/odin/download/common/json/api/odin_data_download' ` +
  `-H 'report_id: 113536' -H 'portal_id: 4665' ` +
  `--data-raw '{"report_id":113536,"chart_name":"资管花名册","chart_data":"{\\"dynamic_params\\":[{\\"param_id\\":1659,\\"param_value\\":\\"2026-06-16\\"}],\\"limit\\":{\\"page_no\\":1,\\"page_size\\":1000}}"}'`;
const a = parseCurl(curlPlain);
ok(!!a, "plain: 解析成功");
ok(a?.reportId === "113536", "plain: reportId=113536");
ok(a?.portalId === "4665", "plain: portalId=4665");
ok(a?.url.endsWith("odin_data_download"), "plain: url 正确");
const ap = a ? JSON.parse(a.body) : {};
ok(ap.chart_name === "资管花名册", "plain: body 可解析、chart_name 正确");

// 日期替换
const swapped = swapDateParam(a!.body, "2026-06-17");
const cd = JSON.parse(JSON.parse(swapped).chart_data);
ok(cd.dynamic_params[0].param_value === "2026-06-17", "plain: 日期参数已替换为今天");

// 2) ANSI-C $'...'：body 含单引号(SQL)和转义引号
const curlAnsi =
  `curl 'https://odin.ke.com/x' -H 'report_id: 176116' --data-raw $'` +
  String.raw`{"report_id":176116,"chart_name":"资管明细","f":"case when x=1 then \'是\'","q":"a\\"b"}` +
  `'`;
const b = parseCurl(curlAnsi);
ok(!!b, "ansi: 解析成功");
ok(b?.reportId === "176116", "ansi: reportId=176116");
const bp = b ? JSON.parse(b.body) : {};
ok(bp.f === "case when x=1 then '是'", "ansi: 单引号正确还原 → " + JSON.stringify(bp.f));
ok(bp.q === 'a"b', "ansi: 转义引号正确还原 → " + JSON.stringify(bp.q));

// 3) cookie 不应出现在模板里（安全）
const curlWithCookie = `curl 'https://x/y' -b 'odin_token=SECRET; a=b' -H 'report_id: 1' --data-raw '{"report_id":1}'`;
const c = parseCurl(curlWithCookie);
ok(!!c && !JSON.stringify(c).includes("SECRET"), "安全: cookie 未进入模板");

if (fail) { console.error(`\n${fail} 项失败`); process.exit(1); }
console.log("\n全部通过 ✓");
