// 在线升级：从 GitHub 仓库 raw 拉 manifest.json 比版本，新则下载 main.js/manifest/styles 覆盖本地插件目录。
// 走 requestUrl（Electron，遵循系统代理）。用户后续 git push 新版本即可让所有人自动升级。
import { Plugin, requestUrl, Notice } from "obsidian";

export const DEFAULT_UPDATE_BASE = "https://raw.githubusercontent.com/Goblinzzzzzz/huiju-hr-city-data/main";

type P = Plugin & { settings: { updateUrl?: string } };

/** 语义版本比较：a>b 返回正。 */
function cmpVer(a: string, b: string): number {
  const pa = String(a).split(".").map((n) => parseInt(n, 10) || 0);
  const pb = String(b).split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
  }
  return 0;
}

/**
 * 检查并（若有新版）下载升级。manual=true 时无论结果都给 Notice。
 * 返回是否执行了升级。
 */
export async function checkUpdate(plugin: P, manual = false): Promise<boolean> {
  const base = (plugin.settings.updateUrl || DEFAULT_UPDATE_BASE).replace(/\/+$/, "");
  if (manual) new Notice("正在检查更新…");
  const cur = plugin.manifest.version;
  let rv = "";
  try {
    const r = await requestUrl({ url: `${base}/manifest.json?t=${Date.now()}`, throw: false });
    rv = r.json?.version || "";
  } catch (e) {
    if (manual) new Notice("检查更新失败：" + ((e as any)?.message || e));
    return false;
  }
  if (!rv) { if (manual) new Notice("检查更新失败：未取到远程版本"); return false; }
  if (cmpVer(rv, cur) <= 0) { if (manual) new Notice(`已是最新版 v${cur}`); return false; }

  // 有新版 → 下载覆盖
  const dir = `${plugin.app.vault.configDir}/plugins/${plugin.manifest.id}`;
  try {
    for (const f of ["main.js", "manifest.json", "styles.css"]) {
      const r = await requestUrl({ url: `${base}/${f}?t=${Date.now()}`, throw: false });
      if (r.status === 200 && typeof r.text === "string" && r.text.length > 0) {
        await plugin.app.vault.adapter.write(`${dir}/${f}`, r.text);
      } else if (f === "main.js") {
        throw new Error(`下载 main.js 失败 (HTTP ${r.status})`);
      }
    }
  } catch (e) {
    new Notice("升级下载失败：" + ((e as any)?.message || e));
    return false;
  }
  new Notice(`✓ 已升级 v${cur} → v${rv}。请在「设置 → 第三方插件」把本插件禁用→启用（或重启 Obsidian）生效。`, 12000);
  return true;
}
