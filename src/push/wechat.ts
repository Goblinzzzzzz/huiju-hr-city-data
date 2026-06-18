// 企微机器人推送：用 Obsidian requestUrl（绕过 CORS），key 由用户在设置填入。
import { requestUrl } from "obsidian";
import type { TierViewData } from "../model/canonical";
import type { TrendEntry } from "../reports/tier/exportHtml";

/** 企微周报 markdown（对齐原项目格式：达标率+环比+全国排名 / 三大区 / 档位流动 / 差距分布 / 激励）。 */
export function buildKpiMarkdown(d: TierViewData, city: string, trend?: TrendEntry[]): string {
  const now = new Date();
  const dateLabel = `${now.getMonth() + 1}月${now.getDate()}日`;

  // 环比（vs 趋势上一条）
  let ppStr = "";
  if (trend && trend.length >= 2) {
    const v = Math.round((trend[trend.length - 1].rate - trend[trend.length - 2].rate) * 10) / 10;
    ppStr = v > 0 ? ` <font color="info">⬆️+${v}pp</font>` : v < 0 ? ` <font color="warning">⬇️${v}pp</font>` : " —";
  }
  // 全国排名（cityRanking 已按达标率降序）
  const whIdx = d.cityRanking.findIndex((c) => c.city.includes("武汉"));
  const rankStr = whIdx >= 0 ? `全国第 ${whIdx + 1} 名 / ${d.cityRanking.length}城` : "全国排名待更新";
  // 三大区（汉阳/武昌/汉口；<25% 标橙预警）
  const order = ["汉阳", "武昌", "汉口"];
  const dabu = order.filter((k) => d.kpi.dabuRates[k] != null)
    .map((k) => { const v = d.kpi.dabuRates[k]; return v < 25 ? `${k} <font color="warning">${v}%</font>` : `${k} ${v}%`; }).join(" ｜ ");
  // 差距分布（在岗未达标）
  let le3 = 0, mid = 0, hi = 0;
  for (const p of d.persons) if (p.roster === "在职" && !p.pass) { const x = p.diff; if (x <= 3) le3++; else if (x <= 8) mid++; else hi++; }
  const notReached = le3 + mid + hi;
  // 激励合计
  const tg = d.incentives.reduce((s, i) => s + i.growth, 0);
  const ta = d.incentives.reduce((s, i) => s + i.actual, 0);
  const tt = d.incentives.reduce((s, i) => s + i.target, 0);
  const tamt = d.incentives.reduce((s, i) => s + i.amount, 0);

  return [
    `## 📊 年标准人效达标率周报（${dateLabel}）`,
    `> 武汉达标率 <font color="warning">**${d.kpi.rate}%**</font>${ppStr} ｜ ${rankStr}`,
    ``,
    `**三大区达标率**`,
    `> ${dabu || "—"}`,
    ``,
    `**档位流动**`,
    `> ↑升档 ${d.summary.up}人 ｜ ↓降档 ${d.summary.down}人 ｜ →离职 ${d.counts.lost}人 ｜ 🆕新人 ${d.counts.newcomer}人`,
    ``,
    `**差距分布（未达标 ${notReached} 人）**`,
    `> 差≤3套 ${le3}人（可冲刺）｜ 差3-8套 ${mid}人 ｜ 差&gt;8套 ${hi}人`,
    ``,
    `**6月激励跟进**`,
    `> 圈定 ${tg}人 ｜ 已达标 ${ta}/${tt}人 ｜ 预计激励 <font color="info">${tamt}元</font>/6000元`,
  ].join("\n");
}

export async function pushWeChat(webhook: string, markdown: string): Promise<{ ok: boolean; msg: string }> {
  try {
    const resp = await requestUrl({
      url: webhook,
      method: "POST",
      contentType: "application/json",
      body: JSON.stringify({ msgtype: "markdown", markdown: { content: markdown } }),
    });
    const j = resp.json || {};
    return { ok: j.errcode === 0, msg: j.errmsg || `errcode=${j.errcode}` };
  } catch (e: any) {
    return { ok: false, msg: e?.message || "请求失败" };
  }
}
