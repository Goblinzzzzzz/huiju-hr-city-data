import { App, PluginSettingTab, Setting, Notice } from "obsidian";
import type HuijuPlugin from "../main";
import { parseCurl } from "../connectors/curl";
import { checkUpdate } from "../update";

export class HjSettingTab extends PluginSettingTab {
  plugin: HuijuPlugin;
  constructor(app: App, plugin: HuijuPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h3", { text: "惠居数据看板 · 全局设置" });
    containerEl.createEl("p", {
      text: "城市参数与口径在「配置控制台」里维护；此处仅全局轻量项。",
      cls: "setting-item-description",
    });

    new Setting(containerEl)
      .setName("默认城市")
      .setDesc("打开控制台时默认进入的租户 id（如 wuhan）")
      .addText((t) =>
        t.setValue(this.plugin.settings.defaultTenant).onChange(async (v) => {
          this.plugin.settings.defaultTenant = v.trim();
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("线下数据目录 (inbox)")
      .setDesc("⚠️ 建议放 vault 外或排除同步，避免 HR 数据随 iCloud 流转")
      .addText((t) =>
        t
          .setPlaceholder("/path/to/inbox 或 vault 内相对路径")
          .setValue(this.plugin.settings.inboxPath)
          .onChange(async (v) => {
            this.plugin.settings.inboxPath = v.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("奥丁报表 URL")
      .setDesc("登录窗目标页面 / 抓取入口")
      .addText((t) =>
        t.setValue(this.plugin.settings.odinUrl).onChange(async (v) => {
          this.plugin.settings.odinUrl = v.trim();
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("奥丁 report_id")
      .addText((t) =>
        t.setValue(this.plugin.settings.odinReportId).onChange(async (v) => {
          this.plugin.settings.odinReportId = v.trim();
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("报表创建者 uc_id")
      .setDesc("chart_list 必填（从报表元信息获取）")
      .addText((t) =>
        t.setValue(this.plugin.settings.odinCreatorUcId).onChange(async (v) => {
          this.plugin.settings.odinCreatorUcId = v.trim();
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("奥丁 Cookie")
      .setDesc("⚠️ 登录 odin.ke.com 后 F12→Network→任意请求→复制整段 Cookie 粘贴此处。明文存 data.json，注意同步风险；失效后重新粘贴。")
      .addTextArea((t) => {
        t.setPlaceholder("lianjia_uuid=...; odin_token=...; lianjia_ssid=...")
          .setValue(this.plugin.settings.odinCookie)
          .onChange(async (v) => {
            this.plugin.settings.odinCookie = v.trim();
            await this.plugin.saveSettings();
          });
        t.inputEl.rows = 4;
        t.inputEl.style.width = "100%";
      });

    new Setting(containerEl)
      .setName("奥丁列映射（tier）")
      .setDesc("把奥丁数据表的列对到 tier 计算字段。空=走手动上传。先点控制台『立即抓取』，照 inbox/<城市>/odin/*.json 里的真实列名填写。详见 odinSource.ts。")
      .addTextArea((t) => {
        t.setPlaceholder(
          '{\n  "detail":   {"chart":"资管明细", "cols":{"city":"城市","dabu":"大区","area":"区域","id":"工号","name":"姓名","join":"成为资管日期","target":"目标","cumulative":"累计","pass":"达标","diff":"差","weighted":"加权","onjob":"在岗"}},\n  "baseline": {"chart":"5月基准", "cols":{"city":"城市","id":"工号","name":"姓名","district":"大区","area":"区域","mayCumulative":"5月累计","mayRate":"达成率"}},\n  "roster":   {"chart":"花名册",  "cols":{"id":"工号","status":"状态","leave":"离职日期"}}\n}',
        )
          .setValue(this.plugin.settings.odinColumnMap)
          .onChange(async (v) => {
            this.plugin.settings.odinColumnMap = v.trim();
            await this.plugin.saveSettings();
          });
        t.inputEl.rows = 8;
        t.inputEl.style.width = "100%";
        t.inputEl.style.fontFamily = "var(--font-monospace)";
      });

    // ===== 奥丁全量下载（推荐）：粘贴「下载按钮」的 cURL，回放导出整张表 =====
    containerEl.createEl("h4", { text: "奥丁全量下载（资管明细 / 花名册）" });
    containerEl.createEl("p", {
      text: "在奥丁页面点表格右上角「下载」按钮，F12→Network 把那条 odin_data_download 的请求 Copy as cURL，粘到下面解析。插件只保留请求体+report_id，丢弃 cookie（cookie 走上面的设置）。以后刷新会回放它全量导出。",
      cls: "setting-item-description",
    });

    const curlSetting = (label: string, key: "odinDetailTemplate" | "odinRosterTemplate") => {
      const cur = this.plugin.settings[key];
      let parsedInfo = "未配置";
      if (cur) { try { const t = JSON.parse(cur); parsedInfo = `已配置 ✓ report_id=${t.reportId}`; } catch { parsedInfo = "已配置(无法解析?)"; } }
      let input = "";
      new Setting(containerEl)
        .setName(label)
        .setDesc(`状态：${parsedInfo}`)
        .addTextArea((t) => {
          t.setPlaceholder("粘贴该表「下载」的 cURL（含 odin_data_download）…");
          t.onChange((v) => { input = v; });
          t.inputEl.rows = 4;
          t.inputEl.style.width = "100%";
        })
        .addButton((b) =>
          b.setButtonText("解析并保存").setCta().onClick(async () => {
            const tpl = parseCurl(input);
            if (!tpl) { new Notice("解析失败：请粘贴完整的 odin_data_download cURL（含 --data-raw 与 report_id）"); return; }
            this.plugin.settings[key] = JSON.stringify(tpl);
            await this.plugin.saveSettings();
            new Notice(`✓ 已保存模板 report_id=${tpl.reportId}（已丢弃 cookie）`);
            this.display();
          })
        )
        .addExtraButton((b) =>
          b.setIcon("trash").setTooltip("清除模板").onClick(async () => {
            this.plugin.settings[key] = "";
            await this.plugin.saveSettings();
            this.display();
          })
        );
    };
    curlSetting("资管明细 下载 cURL（已含武汉筛选）", "odinDetailTemplate");
    curlSetting("花名册 下载 cURL（日期参数自动换今天）", "odinRosterTemplate");

    new Setting(containerEl)
      .setName("企微 Webhook（全局）")
      .setDesc("⚠️ 明文存 data.json，注意同步风险；可被城市配置覆盖")
      .addText((t) => {
        t.inputEl.type = "password";
        t.setValue(this.plugin.settings.webhookUrl).onChange(async (v) => {
          this.plugin.settings.webhookUrl = v.trim();
          await this.plugin.saveSettings();
        });
      });

    containerEl.createEl("h4", { text: "在线升级" });
    new Setting(containerEl)
      .setName(`当前版本 v${this.plugin.manifest.version}`)
      .setDesc("从 GitHub 仓库自动获取新版本。启动时静默检查；也可手动检查。升级后需禁用→启用插件生效。")
      .addButton((b) =>
        b.setButtonText("检查更新").setCta().onClick(async () => {
          await checkUpdate(this.plugin, true);
        })
      );
    new Setting(containerEl)
      .setName("升级源地址")
      .setDesc("GitHub raw 主分支基址（含 manifest.json/main.js/styles.css）")
      .addText((t) =>
        t.setValue(this.plugin.settings.updateUrl).onChange(async (v) => {
          this.plugin.settings.updateUrl = v.trim();
          await this.plugin.saveSettings();
        })
      );
  }
}
