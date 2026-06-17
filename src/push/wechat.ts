// 企微机器人推送：用 Obsidian requestUrl（绕过 CORS），key 由用户在设置填入。
import { requestUrl } from "obsidian";
import type { TierViewData } from "../model/canonical";

export function buildKpiMarkdown(d: TierViewData, city: string): string {
  const dabu = Object.entries(d.kpi.dabuRates).map(([k, v]) => `${k} ${v}%`).join(" ｜ ");
  const incTotal = d.incentives.reduce((s, i) => s + i.amount, 0);
  return [
    `## ${city} · 年标准人效达标率周报`,
    `> 达标率 <font color="warning">**${d.kpi.rate}%**</font> ｜ 在岗 ${d.counts.onjob} 人`,
    ``,
    `**三大区达标率**`,
    `> ${dabu || "—"}`,
    ``,
    `**档位流动**`,
    `> ↑升档 ${d.summary.up} ｜ ↓降档 ${d.summary.down} ｜ —持平 ${d.summary.hold} ｜ →离职 ${d.counts.lost} ｜ 🆕新人 ${d.counts.newcomer}`,
    ``,
    `**未达标 ${d.kpi.notReached} 人** ｜ 预计激励 <font color="info">${incTotal} 元</font>`,
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
