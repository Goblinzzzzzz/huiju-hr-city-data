import { Plugin } from "obsidian";
import { WorkbenchView, VIEW_TYPE } from "./views/WorkbenchView";
import { HjSettingTab } from "./settings/SettingsTab";
import { DEFAULT_SETTINGS, HjSettings } from "./settings/types";
import { checkUpdate } from "./update";

export default class HuijuPlugin extends Plugin {
  settings: HjSettings = DEFAULT_SETTINGS;

  async onload() {
    await this.loadSettings();

    this.registerView(VIEW_TYPE, (leaf) => new WorkbenchView(leaf, this));

    this.addRibbonIcon("layout-dashboard", "惠居数据看板", () => this.activateView());

    this.addCommand({
      id: "open-workbench",
      name: "打开配置控制台",
      callback: () => this.activateView(),
    });

    this.addCommand({
      id: "check-update",
      name: "检查更新（在线升级）",
      callback: () => checkUpdate(this, true),
    });

    this.addSettingTab(new HjSettingTab(this.app, this));

    // 启动后静默自动检查升级（延迟，避免拖慢启动）
    setTimeout(() => { checkUpdate(this, false).catch(() => {}); }, 4000);
  }

  async activateView() {
    const { workspace } = this.app;
    let leaf = workspace.getLeavesOfType(VIEW_TYPE)[0];
    if (!leaf) {
      leaf = workspace.getLeaf("tab");
      await leaf.setViewState({ type: VIEW_TYPE, active: true });
    }
    workspace.revealLeaf(leaf);
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}
