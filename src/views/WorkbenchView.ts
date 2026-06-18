import { ItemView, WorkspaceLeaf, Notice, Modal, App, normalizePath } from "obsidian";
import type HuijuPlugin from "../main";
import { parseTable } from "../connectors/ExcelConnector";
import { sessionFromCookie, fetchChartList, queryChart, downloadTable } from "../connectors/OdinHttpConnector";
import { parseOdinTierMap, odinToTables, type OdinTable } from "../reports/tier/odinSource";
import type { CurlTemplate } from "../connectors/curl";
import { computeTier } from "../reports/tier/compute";
import { exportTierHtml, type TrendEntry } from "../reports/tier/exportHtml";
import { buildKpiMarkdown, pushWeChat } from "../push/wechat";
import { SAMPLE_EXCEL, SAMPLE_CSV, SAMPLE_ROSTER, SAMPLE_CONFIG } from "../reports/tier/sample";
import { runSql, validateSql, DEFAULT_SQL, type SqlConfig } from "../transforms/sql";
import type { TierViewData, TenantCompute as TierConfig } from "../model/canonical";

export const VIEW_TYPE = "huiju-workbench";

interface LoadResult {
  excelRows: any[][]; csvRows: any[][]; rosterRows: any[][];
  status: { excel: SrcStat; csv: SrcStat; roster: SrcStat; usedSample: boolean; usedOdin: boolean };
}
interface SrcStat { found: boolean; name: string; rows: number; }

export class WorkbenchView extends ItemView {
  plugin: HuijuPlugin;
  private computed: TierViewData | null = null;
  private lastStatus: LoadResult["status"] | null = null;
  private logBuf: string[] = [];
  private caliberDraft!: TierConfig; // 口径配置草稿（表单/JSON 共同编辑，保存后落 data.json）
  private sqlDraft!: SqlConfig; // SQL 口径草稿

  /** 当前租户已保存的 SQL 口径（深拷贝）；无则回退 DEFAULT_SQL。 */
  private sqlConfig(): SqlConfig {
    const stored = this.plugin.settings.sqlCalibers?.[this.tenant];
    return { ...DEFAULT_SQL, ...(stored || {}) };
  }

  // ===== 口径配置（caliber）=====
  /** 当前租户已保存的口径（深拷贝）；无则回退内置默认 SAMPLE_CONFIG。 */
  private caliber(): TierConfig {
    const stored = this.plugin.settings.calibers?.[this.tenant];
    return this.cloneCaliber(stored || SAMPLE_CONFIG);
  }
  private cloneCaliber(c: TierConfig): TierConfig {
    return {
      cityFilter: c.cityFilter,
      districts: [...c.districts],
      incentiveTargets: { ...c.incentiveTargets },
      excelColumns: { ...c.excelColumns },
    };
  }
  private esc(s: any): string {
    return String(s ?? "").replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]!));
  }
  /** 校验口径对象；返回错误信息字符串，合法则 null。 */
  private validateCaliber(c: any): string | null {
    if (!c || typeof c !== "object") return "配置不是对象";
    if (!c.cityFilter || typeof c.cityFilter !== "string") return "cityFilter 必须是非空字符串";
    if (!Array.isArray(c.districts) || c.districts.length === 0) return "districts 必须是非空数组";
    if (c.districts.some((d: any) => typeof d !== "string" || !d.trim())) return "districts 含空项";
    const ex = c.excelColumns, keys = ["id", "name", "district", "area", "mayRate", "mayCumulative"];
    if (!ex || keys.some((k) => !Number.isInteger(ex[k]) || ex[k] < 0)) return `excelColumns 六字段须为 ≥0 整数（${keys.join("/")}）`;
    if (!c.incentiveTargets || typeof c.incentiveTargets !== "object") return "incentiveTargets 必须是对象";
    for (const k of Object.keys(c.incentiveTargets)) {
      const v = c.incentiveTargets[k];
      if (typeof v !== "number" || !isFinite(v) || v < 0) return `incentiveTargets.${k} 必须是 ≥0 的数`;
    }
    return null;
  }

  private dlog(msg: string) {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, "0");
    const t = `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`; // 本地(北京)时间
    this.logBuf.push(`- \`${t}\` ${msg}`);
  }
  private async writeLog() {
    try {
      const rel = "惠居-奥丁下载日志.md";
      const md = `# 惠居数据看板 · 运行日志\n\n更新于 ${new Date().toLocaleString()}\n\n` + this.logBuf.join("\n") + "\n";
      await this.app.vault.adapter.write(rel, md);
    } catch (e) { /* ignore */ }
  }

  /** 下载的原始表落盘到可见目录「下载/」，文件名带时间戳、不覆盖（保留全部历史）。⚠️ vault 在 iCloud 会同步。 */
  private async saveDownload(base: string, bytes: Uint8Array) {
    try {
      await this.ensureDir(this.dlDir);
      const name = `${base}-${this.ts()}.csv`;
      const out = new Uint8Array(bytes); // 拷贝，确保独立的 ArrayBuffer
      await this.app.vault.adapter.writeBinary(`${this.dlDir}/${name}`, out.buffer as ArrayBuffer);
      this.dlog(`已保存(不覆盖): ${this.dlDir}/${name} (${bytes.length}B)`);
    } catch (e: any) { this.dlog(`保存失败 ${base}: ${e?.message || e}`); }
  }

  constructor(leaf: WorkspaceLeaf, plugin: HuijuPlugin) {
    super(leaf);
    this.plugin = plugin;
  }
  getViewType() { return VIEW_TYPE; }
  getDisplayText() { return "惠居数据看板 · 控制台"; }
  getIcon() { return "layout-dashboard"; }

  async onOpen() {
    const root = this.contentEl;
    root.empty();
    root.addClass("hj-leaf");
    this.caliberDraft = this.caliber();
    this.sqlDraft = this.sqlConfig();
    root.innerHTML = this.markup();
    this.wire(root);
    this.renderSources();
  }
  async onClose() {}

  private get tenant() { return this.plugin.settings.defaultTenant || "wuhan"; }
  // 可见目录（非 . 开头，Obsidian 文件树可见）。5月基准 xlsx 放 dataDir 顶层，下载落 下载/，看板落 看板/
  private get dataDir() { return normalizePath(`惠居数据看板/${this.tenant}`); }
  private get inboxDir() { return this.dataDir; }
  private get dlDir() { return normalizePath(`惠居数据看板/${this.tenant}/下载`); }
  private get odinDir() { return normalizePath(`惠居数据看板/${this.tenant}/下载/odin`); }
  private get snapDir() { return normalizePath(`惠居数据看板/${this.tenant}/看板`); }

  /** 本地时间戳 YYYYMMDD-HHmmss（文件名用） */
  private ts(): string {
    const d = new Date(); const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
  }

  // ===== 数据加载（真实文件，缺失则回退样例）=====
  private async ensureDir(dir: string) {
    const a = this.app.vault.adapter;
    const parts = dir.split("/");
    let cur = "";
    for (const p of parts) {
      cur = cur ? `${cur}/${p}` : p;
      if (!(await a.exists(cur))) { try { await a.mkdir(cur); } catch (e) { /* ignore */ } }
    }
  }

  /** 读取「立即抓取」落盘的奥丁表（odin/*.json，按 chart_name 索引）。 */
  private async loadOdinTables(): Promise<Record<string, OdinTable>> {
    const a = this.app.vault.adapter;
    const out: Record<string, OdinTable> = {};
    if (!(await a.exists(this.odinDir))) return out;
    try {
      const listed = await a.list(this.odinDir);
      for (const full of listed.files) {
        if (!full.toLowerCase().endsWith(".json")) continue;
        try {
          const j = JSON.parse(await a.read(full));
          if (j && j.chart && Array.isArray(j.columns) && Array.isArray(j.rows)) out[j.chart] = { columns: j.columns, rows: j.rows };
        } catch (e) { /* 跳过坏文件 */ }
      }
    } catch (e) { /* 目录可能为空 */ }
    return out;
  }

  /** 奥丁直连：配置了列映射且抓取过 → 用奥丁数据构建三表；三表齐备才返回，否则 null 回退文件/样例。 */
  private async tryLoadFromOdin(): Promise<LoadResult | null> {
    const map = parseOdinTierMap(this.plugin.settings.odinColumnMap);
    if (!map) return null;
    const tables = await this.loadOdinTables();
    if (!Object.keys(tables).length) return null;
    const built = odinToTables(tables, map, SAMPLE_CONFIG.excelColumns);
    if (!built.csvRows || !built.excelRows || !built.rosterRows) return null;
    const stat = (rows: any[][], name: string): SrcStat => ({ found: true, name, rows: Math.max(0, rows.length - 1) });
    return {
      excelRows: built.excelRows, csvRows: built.csvRows, rosterRows: built.rosterRows,
      status: {
        excel: stat(built.excelRows, map.baseline?.chart || "奥丁基准"),
        csv: stat(built.csvRows, map.detail?.chart || "奥丁明细"),
        roster: stat(built.rosterRows, map.roster?.chart || "奥丁花名册"),
        usedSample: false, usedOdin: true,
      },
    };
  }

  /** 读第一个 .xlsx 作为 5月档位基准（手动月度上传）。优先外部目录(设置 inboxPath，避免 HR 进 iCloud)，回退 vault inbox。 */
  private async readBaselineExcel(): Promise<{ rows: any[][]; name: string }> {
    const ext = (this.plugin.settings.inboxPath || "").trim();
    if (ext) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const fs = require("fs"); const path = require("path");
        if (fs.existsSync(ext)) {
          const files: string[] = fs.readdirSync(ext).filter((f: string) => f.toLowerCase().endsWith(".xlsx"));
          if (files.length) {
            const r = parseTable(new Uint8Array(fs.readFileSync(path.join(ext, files[0]))));
            this.dlog(`5月基准(外部目录): ${files[0]} → ${r.rowCount} 行`);
            return { rows: r.rows, name: files[0] + "(外部)" };
          }
          this.dlog(`5月基准: 外部目录无 .xlsx → ${ext}`);
        } else { this.dlog(`5月基准: 外部目录不存在 → ${ext}`); }
      } catch (e: any) { this.dlog(`5月基准: 读外部目录失败 ${e?.message || e}`); }
    }
    const a = this.app.vault.adapter;
    try {
      const listed = await a.list(this.inboxDir);
      for (const full of listed.files) {
        if (full.toLowerCase().endsWith(".xlsx")) {
          const r = parseTable(new Uint8Array(await a.readBinary(full)));
          this.dlog(`5月基准(vault inbox): ${full.split("/").pop()} → ${r.rowCount} 行`);
          return { rows: r.rows, name: full.split("/").pop() || "" };
        }
      }
    } catch (e) { /* 目录可能为空 */ }
    this.dlog("5月基准: 未找到 xlsx（升降级无法计算）");
    return { rows: [], name: "" };
  }

  /** 奥丁全量下载（推荐）：回放「下载按钮」载荷导出资管明细+花名册；5月基准用 inbox 的 xlsx。 */
  private async tryLoadFromOdinDownload(): Promise<LoadResult | null> {
    const parse = (s: string): CurlTemplate | null => { try { const t = JSON.parse(s || ""); return t && t.url && t.body ? t : null; } catch { return null; } };
    const detail = parse(this.plugin.settings.odinDetailTemplate);
    const roster = parse(this.plugin.settings.odinRosterTemplate);
    if (!detail || !roster) return null;
    const s = sessionFromCookie(this.plugin.settings.odinCookie);
    if (!s) { new Notice("已配置奥丁下载模板，但未填 Cookie（设置里粘贴）"); return null; }

    new Notice("正在从奥丁全量下载 资管明细 + 花名册…");
    let csvRows: any[][], rosterRows: any[][];
    const lg = (m: string) => this.dlog(m);
    try {
      this.dlog("### 资管明细下载（全国）");
      const detailBytes = await downloadTable(s, detail, undefined, lg, true); // national=true 去武汉筛选
      await this.saveDownload("资管明细-全国", detailBytes);
      csvRows = parseTable(detailBytes).rows;
      this.dlog(`资管明细解析(全国): ${csvRows.length} 行`);
      const y = new Date(); y.setDate(y.getDate() - 1); // T-1：当天数仓分区常未就绪
      const pad = (n: number) => String(n).padStart(2, "0");
      const dParam = `${y.getFullYear()}-${pad(y.getMonth() + 1)}-${pad(y.getDate())}`;
      this.dlog(`### 花名册下载 (日期=${dParam}, T-1)`);
      const rosterBytes = await downloadTable(s, roster, dParam, lg);
      await this.saveDownload("花名册", rosterBytes);
      rosterRows = parseTable(rosterBytes).rows;
      this.dlog(`花名册解析: ${rosterRows.length} 行`);
    } catch (e: any) {
      this.dlog(`❌ 下载失败: ${e?.message || e}`);
      await this.writeLog();
      new Notice("奥丁下载失败（详见 vault 里『惠居-奥丁下载日志.md』）：" + (e?.message || e));
      return null;
    }
    const baseline = await this.readBaselineExcel();
    const stat = (rows: any[][], name: string): SrcStat => ({ found: rows.length > 1, name, rows: Math.max(0, rows.length - 1) });
    return {
      excelRows: baseline.rows, csvRows, rosterRows,
      status: {
        excel: stat(baseline.rows, baseline.name || "5月基准(缺，请上传 xlsx)"),
        csv: stat(csvRows, "奥丁·资管明细"),
        roster: stat(rosterRows, "奥丁·花名册"),
        usedSample: false, usedOdin: true,
      },
    };
  }

  private async loadData(): Promise<LoadResult> {
    const dl = await this.tryLoadFromOdinDownload();
    if (dl) return dl;
    const odin = await this.tryLoadFromOdin();
    if (odin) return odin;

    const a = this.app.vault.adapter;
    await this.ensureDir(this.inboxDir);
    const blank: SrcStat = { found: false, name: "", rows: 0 };
    const status = { excel: { ...blank }, csv: { ...blank }, roster: { ...blank }, usedSample: false, usedOdin: false };
    let excelRows: any[][] = [], csvRows: any[][] = [], rosterRows: any[][] = [];

    try {
      const listed = await a.list(this.inboxDir);
      for (const full of listed.files) {
        const name = full.split("/").pop() || "";
        const low = name.toLowerCase();
        const pick = async () => parseTable(new Uint8Array(await a.readBinary(full)));
        if (low.endsWith(".xlsx") && !status.excel.found) {
          const r = await pick(); excelRows = r.rows; status.excel = { found: true, name, rows: r.rowCount };
        } else if (low.endsWith(".csv") && (name.includes("花名册") || low.includes("roster"))) {
          const r = await pick(); rosterRows = r.rows; status.roster = { found: true, name, rows: r.rowCount };
        } else if (low.endsWith(".csv") && !status.csv.found) {
          const r = await pick(); csvRows = r.rows; status.csv = { found: true, name, rows: r.rowCount };
        }
      }
    } catch (e) { /* 目录可能为空 */ }

    if (!(status.excel.found && status.csv.found && status.roster.found)) {
      // 回退样例（让 MVP 立即可演示）
      excelRows = SAMPLE_EXCEL; csvRows = SAMPLE_CSV; rosterRows = SAMPLE_ROSTER;
      status.usedSample = true;
    }
    return { excelRows, csvRows, rosterRows, status };
  }

  private monthPrefix(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }

  private async refresh() {
    new Notice("正在加载数据…");
    this.logBuf = [];
    this.dlog(`刷新开始 · 租户=${this.tenant}`);
    const load = await this.loadData();
    this.dlog(`数据来源: ${load.status.usedOdin ? "奥丁直连" : load.status.usedSample ? "内置样例" : "线下文件"}`);
    const cfg = this.caliber(); // 读已保存口径（settings.calibers[tenant]），无则回退 SAMPLE_CONFIG
    this.dlog(`口径: 城市=${cfg.cityFilter} 大区=[${cfg.districts.join("/")}] 激励=${JSON.stringify(cfg.incentiveTargets)}${this.plugin.settings.calibers?.[this.tenant] ? "" : "（内置默认）"}`);

    // SQL 口径（可选）：对已下载表跑 SQL，结果按原表头重投影后喂给 compute；出错回退原表
    let { excelRows, csvRows, rosterRows } = load;
    const sql = this.sqlConfig();
    if (sql.enabled) {
      try {
        const r = runSql({ detail: load.csvRows, roster: load.rosterRows, baseline: load.excelRows }, sql);
        csvRows = r.rows.detail; rosterRows = r.rows.roster; excelRows = r.rows.baseline;
        this.dlog("### SQL 口径已应用"); r.log.forEach((m) => this.dlog(m));
      } catch (e: any) {
        this.dlog(`❌ SQL 口径执行失败，回退原始表: ${e?.message || e}`);
        new Notice("SQL 口径执行失败，已用原始表：" + (e?.message || e));
      }
    }

    this.computed = computeTier({
      excelRows, csvRows, rosterRows,
      config: cfg, monthPrefix: this.monthPrefix(), now: Date.now(),
    });
    this.lastStatus = load.status;
    this.renderSources();
    this.renderQa();
    this.updateFresh();
    const c = this.computed.counts;
    this.dlog(`计算完成: 在岗 ${c.onjob} · 离职 ${c.lost} · 新人 ${c.newcomer} · 排除 ${c.excluded} · QA阻断=${this.computed.qa.blocked}`);
    await this.writeLog();
    new Notice(`${load.status.usedSample ? "[样例] " : ""}在岗 ${c.onjob} · 离职 ${c.lost} · 新人 ${c.newcomer} · 排除 ${c.excluded}（日志: 惠居-奥丁下载日志.md）`);
  }

  /** 趋势历史：读 vault 的 trend-history.json，按日期去重追加今天 KPI，写回并返回。 */
  private async buildTrend(d: TierViewData): Promise<TrendEntry[]> {
    const rel = `${this.dataDir}/trend-history.json`;
    const a = this.app.vault.adapter;
    let arr: TrendEntry[] = [];
    try { if (await a.exists(rel)) arr = JSON.parse(await a.read(rel)); } catch { arr = []; }
    if (!Array.isArray(arr)) arr = [];
    // 5月基准行(5/31)：从 5月 xlsx 注入一次，作为趋势起点
    if (!arr.some((e) => e.date === "5/31") && d.mayBaseline.totalWeighted > 0) {
      const mb = d.mayBaseline;
      arr.unshift({ date: "5/31", rate: mb.rate, rank: null, passWeighted: mb.passWeighted, totalWeighted: mb.totalWeighted, notReached: mb.notReached, diffLe3: 0, diff35: 0, diff58: 0, diffGt8: 0, hanyang: mb.dabuRates["汉阳"] || 0, wuchang: mb.dabuRates["武昌"] || 0, hankou: mb.dabuRates["汉口"] || 0 });
    }
    const now = new Date();
    const date = `${now.getMonth() + 1}/${now.getDate()}`;
    let le3 = 0, d35 = 0, d58 = 0, gt8 = 0;
    for (const p of d.persons) {
      if (p.roster === "在职" && !p.pass) { const v = p.diff; if (v <= 3) le3++; else if (v <= 5) d35++; else if (v <= 8) d58++; else gt8++; }
    }
    const whIdx = d.cityRanking.findIndex((c) => c.city.includes("武汉"));
    const entry: TrendEntry = {
      date, rate: d.kpi.rate, rank: whIdx >= 0 ? whIdx + 1 : null,
      passWeighted: d.kpi.passWeighted, totalWeighted: d.kpi.totalWeighted, notReached: d.kpi.notReached,
      diffLe3: le3, diff35: d35, diff58: d58, diffGt8: gt8,
      hanyang: d.kpi.dabuRates["汉阳"] || 0, wuchang: d.kpi.dabuRates["武昌"] || 0, hankou: d.kpi.dabuRates["汉口"] || 0,
    };
    const i = arr.findIndex((e) => e.date === date);
    if (i >= 0) arr[i] = entry; else arr.push(entry);
    try { await this.app.vault.adapter.write(rel, JSON.stringify(arr, null, 2)); } catch { /* ignore */ }
    return arr;
  }

  private async generate() {
    if (!this.computed) await this.refresh();
    if (!this.computed) return;
    await this.ensureDir(this.snapDir);
    const trend = await this.buildTrend(this.computed);
    const html = exportTierHtml(this.computed, { city: "惠居" + this.tenant, month: this.monthPrefix(), trend });
    const rel = `${this.snapDir}/档位看板-${this.ts()}.html`; // 时间戳、不覆盖
    await this.app.vault.adapter.write(rel, html);
    new Notice(`看板已生成：${rel}`);
    this.openExternal(rel);
  }

  private openExternal(rel: string) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { shell } = require("electron");
      const path = require("path");
      const base = (this.app.vault.adapter as any).basePath;
      if (base) shell.openPath(path.join(base, rel));
    } catch (e) { /* 非桌面或无 electron，忽略 */ }
  }

  // ===== 奥丁后台静默取数（设置里粘贴 cookie，直连 HTTP）=====
  private odinCard(): string {
    const hasCookie = !!sessionFromCookie(this.plugin.settings.odinCookie);
    const hasDetail = !!this.plugin.settings.odinDetailTemplate;
    const hasRoster = !!this.plugin.settings.odinRosterTemplate;
    const ck = hasCookie ? `<span class="badge ok"><span class="hjdot"></span>已配置 cookie</span>` : `<span class="badge bad"><span class="hjdot bad"></span>未配置 cookie</span>`;
    const dlOk = hasDetail && hasRoster;
    const dl = dlOk ? `<span class="badge ok"><span class="hjdot"></span>下载模板已配</span>` : `<span class="badge warn"><span class="hjdot warn"></span>下载模板未配(${(hasDetail ? 1 : 0) + (hasRoster ? 1 : 0)}/2)</span>`;
    const note = dlOk
      ? "已配置全量下载模板：点右上角『刷新数据』即从奥丁全量下载资管明细+花名册并出看板。5月基准请放一份 xlsx 到 inbox。"
      : "在「设置→奥丁全量下载」把资管明细/花名册两条『下载』cURL 各粘一次解析；配好后点『刷新数据』即全量下载出看板。";
    return `<div class="card src"><div class="srcicon"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg></div>
      <div class="srcbody"><div class="srctop"><span class="srcname">奥丁 · 全量下载</span><span class="tag auto">自动</span>${ck}${dl}</div>
      <div class="note" style="margin-top:8px">${note}</div>
      <div class="srcact"><button class="btn sm primary" data-act="refresh">刷新数据</button><button class="btn sm" data-act="odin">探查图表清单</button></div></div></div>`;
  }

  private async scrapeOdin() {
    const s = sessionFromCookie(this.plugin.settings.odinCookie);
    if (!s) { new Notice("请先在「设置」粘贴奥丁 Cookie（含 odin_token）"); return; }
    new Notice("后台拉取奥丁图表清单…");
    try {
      const charts = await fetchChartList(s, this.plugin.settings.odinReportId, this.plugin.settings.odinCreatorUcId);
      await this.ensureDir(this.inboxDir);
      await this.app.vault.adapter.write(`${this.inboxDir}/odin_chart_list.json`, JSON.stringify(charts, null, 2));
      const dataCharts = charts.filter((c: any) => c.type_id === 5).slice(0, 20); // 数据表，限 20 张防跑飞
      new Notice(`✓ 抓到 ${charts.length} 个图表（数据表 ${dataCharts.length} 个），正在拉取表数据…`);

      // 回放每张数据表的 data_query，落盘真实行 → odin/<name>.json（surface 真实列名，供填列映射）
      await this.ensureDir(this.odinDir);
      let ok = 0, fail = 0;
      for (const c of dataCharts) {
        const name = String(c.chart_name || c.chart_id || "chart");
        const safe = name.replace(/[\\/:*?"<>|]/g, "_").slice(0, 80);
        try {
          const t = await queryChart(s, c, { pageSize: 2000 });
          await this.app.vault.adapter.write(`${this.odinDir}/${safe}.json`,
            JSON.stringify({ chart: name, columns: t.columns, rows: t.rows, total: t.total }, null, 2));
          ok++;
        } catch (e) { fail++; }
      }
      new Notice(`数据表已落盘：成功 ${ok} / 失败 ${fail}，目录 ${this.odinDir}/`);

      // 已配置列映射 → 直接按奥丁数据出看板；否则提示先填映射
      if (parseOdinTierMap(this.plugin.settings.odinColumnMap)) {
        await this.refresh();
      } else {
        new Notice("提示：打开 odin/*.json 查看真实列名，在「设置→奥丁列映射」填好后再刷新，即可直接出看板。");
      }
      this.renderSources();
    } catch (e: any) {
      new Notice("抓取失败：" + (e?.message || e));
    }
  }

  // ===== 动态渲染（刷新后填充真实数据）=====
  private renderSources() {
    const host = this.contentEl.querySelector<HTMLElement>("#hjSrc");
    if (!host) return;
    let html = this.odinCard();
    const s = this.lastStatus;
    if (!s) {
      html += `<div class="note">点右上角『刷新数据』载入线下文件（缺文件用样例）。投递目录 <code>${this.inboxDir}/</code></div>`;
    } else {
      const auto = s.usedOdin;
      const card = (title: string, st: SrcStat, miss: string) =>
        this.srcCard(title, auto ? "auto" : "manual", st.found ? "ok" : "bad", st.found ? `已载入 ${st.rows} 行` : "缺失",
          st.found ? st.name : miss, st.found ? (auto ? "奥丁直连" : `${this.inboxDir}/`) : "", st.found ? [auto ? "重新抓取" : "重新解析"] : ["选择文件夹"]);
      if (s.usedOdin) html += `<div class="note" style="margin:10px 0">当前看板数据来自<b>奥丁直连</b>（按列映射构建）。</div>`;
      else if (s.usedSample) html += `<div class="note" style="margin:10px 0">未找到完整三件套，已载入内置样例演示。放入真实文件后再次刷新即生效。</div>`;
      html += card(auto ? "奥丁 · 资管明细" : "线下 · 资管明细 CSV", s.csv, "请放入 *.csv");
      html += card(auto ? "奥丁 · 5月基准" : "线下 · 5月基准 XLSX", s.excel, "请放入 *.xlsx");
      html += card(auto ? "奥丁 · 花名册" : "线下 · 花名册 CSV", s.roster, "请放入 *花名册*.csv");
    }
    html += `<button class="dashed">＋ 添加数据源</button>`;
    host.innerHTML = html;
  }

  private renderQa() {
    const host = this.contentEl.querySelector<HTMLElement>("#hjQa");
    if (!host || !this.computed) return;
    const d = this.computed;
    const banner = d.qa.blocked
      ? `<div class="banner"><span>校验未通过，已<b>阻止生成与推送</b></span></div>` : "";
    const rows = d.qa.checks.map((c) =>
      `<div class="qa-row"><span class="qa-ic ${c.status}">${c.status === "ok" ? "✓" : c.status === "warn" ? "!" : "✕"}</span><div><div>${c.name}</div><div class="qa-d">${c.detail}</div></div></div>`).join("");
    host.innerHTML = `${banner}<div class="qa">${rows}</div>`;
  }

  private updateFresh() {
    const el = this.contentEl.querySelector<HTMLElement>("#hjFresh");
    if (!el || !this.computed) return;
    const sample = this.lastStatus?.usedSample;
    el.innerHTML = `<span class="hjdot ${sample ? "warn" : ""}"></span><span class="fxt">${sample ? "样例数据" : "已刷新"} · 在岗${this.computed.counts.onjob}</span>`;
  }

  private calChipsHtml(): string {
    return this.caliberDraft.districts
      .map((d, i) => `<span class="chip">${this.esc(d)} <button data-act="dist-del" data-i="${i}">×</button></span>`)
      .join("");
  }
  private calIncHtml(): string {
    const c = this.caliberDraft;
    return c.districts
      .map((d) => `<div class="kv"><span class="chip">${this.esc(d)}</span><input class="input" data-inc="${this.esc(d)}" type="number" value="${c.incentiveTargets[d] ?? 0}"></div>`)
      .join("");
  }
  /** 口径「可视化」表单 HTML（从 caliberDraft 渲染，可重建）。 */
  private calFormInner(): string {
    const c = this.caliberDraft, ex = c.excelColumns;
    const col = (key: string, label: string) => `<div class="maprow"><span>${label}</span><input class="input" data-col="${key}" type="number" value="${(ex as any)[key]}"></div>`;
    return `
        <div class="subhead">城市与组织</div>
        <div class="field"><label>城市筛选 <span class="desc">cityFilter</span></label><input class="input" data-cf="cityFilter" value="${this.esc(c.cityFilter)}"></div>
        <div class="field"><label>大区列表</label><div class="chips" id="calDist">${this.calChipsHtml()}</div>
          <div style="margin-top:6px;display:flex;gap:6px"><input class="input" id="calNewDist" placeholder="新增大区名" style="max-width:160px"><button class="btn sm" data-act="dist-add">＋ 添加</button></div></div>
        <div class="subhead">Excel 列映射 <span class="desc">列号从 0 起</span></div>
        ${col("id", "工号 id")}${col("name", "姓名 name")}${col("district", "大区 district")}${col("area", "区域 area")}${col("mayRate", "5月达成率 mayRate")}${col("mayCumulative", "5月累计 mayCumulative")}
        <div class="note">⚠️ 用达成率(mayRate=Col12)算档位，不要用 Col13/14 文字标签。</div>
        <div class="subhead">激励目标 <span class="desc">每大区目标人数</span></div>
        <div id="calInc">${this.calIncHtml()}</div>`;
  }

  /** 口径「SQL」面板 HTML（从 sqlDraft 渲染）。 */
  private calSqlInner(): string {
    const s = this.sqlDraft;
    const ta = (key: string, label: string, hint: string) => `
        <div class="field"><label>${label} <span class="desc">表名 ${key}</span></label>
          <textarea class="json" data-sql="${key}" spellcheck="false" style="width:100%;min-height:64px;resize:vertical">${this.esc(s[key as keyof SqlConfig] as string)}</textarea>
          <div class="note">${hint}</div></div>`;
    return `
        <label class="radio" style="margin-bottom:10px"><input type="checkbox" data-sql-enabled ${s.enabled ? "checked" : ""}> 启用 SQL 口径（对已下载表跑 SQL 后再计算）</label>
        <div class="note" style="margin-bottom:12px">可用表：<code>detail</code>(资管明细) · <code>roster</code>(花名册) · <code>baseline</code>(5月基准)。列名=各表表头中文名，用反引号包裹，如 <code>\`城市\`</code>。
          <b>务必保留全部列</b>（<code>SELECT *</code> 或 <code>detail.*</code>）——计算按列号读取，改列形状/聚合会破坏口径。⚠️ 对 <code>detail</code> 过滤会同时影响「全国城市排名」（该模块用全部行）。</div>
        ${ta("detail", "资管明细 SQL", "如：SELECT * FROM detail WHERE `城市` = '武汉'")}
        ${ta("roster", "花名册 SQL", "如：SELECT * FROM roster")}
        ${ta("baseline", "5月基准 SQL", "如：SELECT * FROM baseline")}`;
  }

  // ===== 静态骨架 =====
  private markup(): string {
    const tenant = this.tenant === "wuhan" ? "惠居武汉" : this.tenant;
    return `
<div class="tb">
  <div class="logo"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M3 10.5 12 4l9 6.5"/><path d="M5 9.5V20h14V9.5"/></svg></div>
  <span class="title">惠居数据看板</span>
  <button class="tenant" data-act="tenant"><span class="hjdot"></span><b>${tenant}</b><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m6 9 6 6 6-6"/></svg></button>
  <span class="tspacer"></span>
  <span class="fresh" id="hjFresh"><span class="hjdot warn"></span><span class="fxt">未刷新</span></span>
  <div class="actions">
    <button class="btn" data-act="refresh"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/></svg><span class="blabel">刷新数据</span></button>
    <button class="btn" data-act="generate"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 3v4a1 1 0 0 0 1 1h4"/><path d="M5 3h9l5 5v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/></svg><span class="blabel">生成看板</span></button>
    <button class="btn primary" data-act="push"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/></svg><span class="blabel">推送</span></button>
  </div>
</div>
<div class="ws">
  <nav class="nav">
    <button class="on" data-p="src"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 1.7 4 3 9 3s9-1.3 9-3V5"/><path d="M3 12c0 1.7 4 3 9 3s9-1.3 9-3"/></svg><span class="nlabel">数据源</span></button>
    <button data-p="cal"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/></svg><span class="nlabel">口径配置</span></button>
    <button data-p="run"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="m5 3 14 9-14 9z"/></svg><span class="nlabel">运行与校验</span></button>
    <button data-p="out"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg><span class="nlabel">输出与推送</span></button>
    <button data-p="ten"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9"/></svg><span class="nlabel">租户管理</span></button>
  </nav>
  <div class="content">
    <section class="panel on" data-p="src">
      <div class="shead"><h2>数据源接入</h2><p>点「刷新数据」载入（缺文件自动用样例演示）</p></div>
      <div id="hjSrc"><div class="note">点击右上角『刷新数据』开始。投递目录：<code>${this.inboxDir}/</code></div></div>
    </section>
    <section class="panel" data-p="cal">
      <div class="shead"><h2>口径配置</h2><p>可视化表单为主 · 高级可改 JSON</p></div>
      <div class="seg" data-seg="cal"><button class="on" data-c="form">可视化</button><button data-c="json">JSON</button><button data-c="sql">SQL</button></div>
      <div data-cal="form" style="margin-top:14px" id="calForm">${this.calFormInner()}</div>
      <div data-cal="json" style="display:none;margin-top:14px">
        <textarea class="json" id="calJson" spellcheck="false" style="width:100%;min-height:240px;resize:vertical">${this.esc(JSON.stringify(this.caliberDraft, null, 2))}</textarea>
        <div class="note">字段：cityFilter / districts[] / excelColumns{id,name,district,area,mayRate,mayCumulative} / incentiveTargets{}。编辑后点「保存口径」。</div>
      </div>
      <div data-cal="sql" style="display:none;margin-top:14px" id="calSql">${this.calSqlInner()}</div>
      <div style="margin-top:16px;display:flex;gap:8px">
        <button class="btn primary" data-act="cal-save">保存口径</button>
        <button class="btn" data-act="cal-reset">重置为默认</button>
        <span class="note" style="align-self:center">保存后点右上角「刷新数据」生效</span>
      </div>
    </section>
    <section class="panel" data-p="run">
      <div class="shead"><h2>运行与校验</h2><p>取数 → 建模 → 校验，不过不发</p></div>
      <button class="btn primary runbtn" data-act="run"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m5 3 14 9-14 9z"/></svg>运行流水线</button>
      <div id="hjQa"><div class="note">点「运行流水线」后显示勾稽/规模等校验结果。</div></div>
    </section>
    <section class="panel" data-p="out">
      <div class="shead"><h2>输出与推送</h2><p>看板是导出的产物，不在插件内渲染</p></div>
      <div class="subhead">生成看板</div>
      <div class="card">
        <label class="radio"><input type="radio" name="fmt" checked> 独立 HTML（完整交互）</label>
        <label class="radio"><input type="radio" name="fmt"> CSS-only 笔记</label>
        <div class="field" style="margin:10px 0 12px"><label>导出路径</label><input class="input mono" value="${this.snapDir}/"></div>
        <button class="btn primary" data-act="generate">生成看板</button>
      </div>
      <div class="subhead">企微推送</div>
      <div class="card"><div class="field"><label>Webhook 地址</label><input class="input" type="password" value="••••••••••••"><div class="note">⚠️ 明文存 data.json，注意同步风险</div></div><button class="btn" data-act="push">预览（dry-run）</button><button class="btn primary" data-act="push">推送周报</button></div>
    </section>
    <section class="panel" data-p="ten">
      <div class="shead"><h2>租户管理</h2><p>换一份配置即接入新城市</p></div>
      <div class="tgrid">
        <div class="tcard cur"><div class="tname"><span class="hjdot"></span>惠居武汉 <span class="tag auto">当前</span></div><div class="tmeta">上次运行见右上角</div><div class="tact"><button class="btn sm">编辑</button><button class="btn sm">复制为新城市</button></div></div>
        <div class="tcard"><div class="tname">惠居南京 <span class="tag manual">占位</span></div><div class="tmeta">待配置</div><div class="tact"><button class="btn sm primary">切换</button><button class="btn sm danger">删除</button></div></div>
      </div>
      <button class="dashed" style="margin-top:12px">＋ 新建城市</button>
    </section>
  </div>
</div>`;
  }

  private srcCard(name: string, kind: "auto" | "manual", st: "ok" | "warn" | "bad", stTxt: string, meta: string, code: string, acts: string[]): string {
    const dotcls = st === "ok" ? "" : st === "warn" ? "warn" : "bad";
    const codeHtml = code ? `<code>${code}</code>` : "";
    const actHtml = acts.map((a) => `<button class="btn sm">${a}</button>`).join("");
    return `<div class="card src"><div class="srcicon"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M14 3v4a1 1 0 0 0 1 1h4"/><path d="M5 3h9l5 5v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/></svg></div>
      <div class="srcbody"><div class="srctop"><span class="srcname">${name}</span><span class="tag ${kind}">${kind === "auto" ? "自动" : "手工"}</span><span class="badge ${st}"><span class="hjdot ${dotcls}"></span>${stTxt}</span></div>
      <div class="srcmeta">${codeHtml}<span>${meta}</span></div><div class="srcact">${actHtml}</div></div></div>`;
  }

  private wire(root: HTMLElement) {
    root.querySelectorAll<HTMLElement>(".nav button").forEach((b) =>
      b.addEventListener("click", () => {
        root.querySelectorAll(".nav button").forEach((x) => x.removeClass("on"));
        b.addClass("on");
        root.querySelectorAll<HTMLElement>(".panel").forEach((pa) => pa.toggleClass("on", pa.dataset.p === b.dataset.p));
      })
    );
    root.querySelectorAll<HTMLElement>('[data-seg="cal"] button:not([disabled])').forEach((b) =>
      b.addEventListener("click", () => {
        const to = b.dataset.c!;
        const cur = (root.querySelector('[data-seg="cal"] button.on') as HTMLElement)?.dataset.c;
        if (cur === to) return;
        const ta = root.querySelector("#calJson") as HTMLTextAreaElement | null;
        // ① 提交当前 tab 到草稿（form/sql 已由 input 监听实时同步；仅 JSON 需在此解析）
        if (cur === "json" && ta) {
          let parsed: any;
          try { parsed = JSON.parse(ta.value); } catch { new Notice("JSON 解析失败，请检查格式"); return; }
          const err = this.validateCaliber(parsed);
          if (err) { new Notice("口径无效：" + err); return; }
          this.caliberDraft = this.cloneCaliber(parsed);
        }
        // ② 加载目标 tab（从草稿重建）
        if (to === "json" && ta) ta.value = JSON.stringify(this.caliberDraft, null, 2);
        if (to === "form") { const fc = root.querySelector("#calForm"); if (fc) fc.innerHTML = this.calFormInner(); }
        // ③ 切换显隐
        root.querySelectorAll('[data-seg="cal"] button').forEach((x) => x.removeClass("on"));
        b.addClass("on");
        (root.querySelector('[data-cal="form"]') as HTMLElement).style.display = to === "form" ? "" : "none";
        (root.querySelector('[data-cal="json"]') as HTMLElement).style.display = to === "json" ? "" : "none";
        (root.querySelector('[data-cal="sql"]') as HTMLElement).style.display = to === "sql" ? "" : "none";
      })
    );
    // 口径表单/SQL 输入 → 实时更新草稿
    root.querySelector('[data-p="cal"]')?.addEventListener("input", (e) => {
      const t = e.target as HTMLInputElement, c = this.caliberDraft;
      if (t.dataset.cf === "cityFilter") c.cityFilter = t.value;
      else if (t.dataset.col) (c.excelColumns as any)[t.dataset.col] = parseInt(t.value, 10) || 0;
      else if (t.dataset.inc) c.incentiveTargets[t.dataset.inc] = parseFloat(t.value) || 0;
      else if (t.dataset.sql) (this.sqlDraft as any)[t.dataset.sql] = t.value;
      else if (t.hasAttribute("data-sql-enabled")) this.sqlDraft.enabled = t.checked;
    });
    // 事件委托：静态 + 动态渲染的 [data-act] 按钮都生效
    this.contentEl.addEventListener("click", (e) => {
      const b = (e.target as HTMLElement).closest("[data-act]") as HTMLElement | null;
      if (b) this.handleAct(b.dataset.act!, b);
    });
  }

  private handleAct(act: string, el?: HTMLElement) {
    switch (act) {
      case "refresh": case "run": this.refresh(); break;
      case "generate": this.generate(); break;
      case "odin": this.scrapeOdin(); break;
      case "push": this.previewPush(); break;
      case "tenant": new Notice("切换城市（M4 多租户接入）"); break;
      case "dist-add": this.calAddDist(); break;
      case "dist-del": this.calDelDist(parseInt(el?.dataset.i || "-1", 10)); break;
      case "cal-save": this.calSave(); break;
      case "cal-reset": this.calReset(); break;
    }
  }

  // ===== 口径配置交互 =====
  private rerenderCalDynamic() {
    const distEl = this.contentEl.querySelector("#calDist");
    const incEl = this.contentEl.querySelector("#calInc");
    if (distEl) distEl.innerHTML = this.calChipsHtml();
    if (incEl) incEl.innerHTML = this.calIncHtml();
  }
  private calAddDist() {
    const input = this.contentEl.querySelector("#calNewDist") as HTMLInputElement | null;
    const name = (input?.value || "").trim();
    if (!name) { new Notice("请输入大区名"); return; }
    if (this.caliberDraft.districts.includes(name)) { new Notice("该大区已存在"); return; }
    this.caliberDraft.districts.push(name);
    if (this.caliberDraft.incentiveTargets[name] == null) this.caliberDraft.incentiveTargets[name] = 0;
    if (input) input.value = "";
    this.rerenderCalDynamic();
  }
  private calDelDist(i: number) {
    const ds = this.caliberDraft.districts;
    if (i < 0 || i >= ds.length) return;
    const [removed] = ds.splice(i, 1);
    delete this.caliberDraft.incentiveTargets[removed];
    this.rerenderCalDynamic();
  }
  private async calSave() {
    const jsonVisible = (this.contentEl.querySelector('[data-cal="json"]') as HTMLElement)?.style.display !== "none";
    if (jsonVisible) {
      const ta = this.contentEl.querySelector("#calJson") as HTMLTextAreaElement | null;
      let parsed: any;
      try { parsed = JSON.parse(ta?.value || ""); } catch { new Notice("JSON 解析失败，请检查格式"); return; }
      const err = this.validateCaliber(parsed);
      if (err) { new Notice("口径无效：" + err); return; }
      this.caliberDraft = this.cloneCaliber(parsed);
    } else {
      const err = this.validateCaliber(this.caliberDraft);
      if (err) { new Notice("口径无效：" + err); return; }
    }
    const sqlErr = validateSql(this.sqlDraft);
    if (sqlErr) { new Notice("SQL 口径无效：" + sqlErr); return; }
    if (!this.plugin.settings.calibers) this.plugin.settings.calibers = {};
    if (!this.plugin.settings.sqlCalibers) this.plugin.settings.sqlCalibers = {};
    this.plugin.settings.calibers[this.tenant] = this.cloneCaliber(this.caliberDraft);
    this.plugin.settings.sqlCalibers[this.tenant] = { ...this.sqlDraft };
    await this.plugin.saveSettings();
    this.computed = null; // 失效旧计算，下次刷新用新口径
    new Notice(`口径已保存（${this.tenant}${this.sqlDraft.enabled ? " · SQL 已启用" : ""}）。点「刷新数据」生效。`);
  }
  private calReset() {
    this.caliberDraft = this.cloneCaliber(SAMPLE_CONFIG);
    this.sqlDraft = { ...DEFAULT_SQL };
    const fc = this.contentEl.querySelector("#calForm"); if (fc) fc.innerHTML = this.calFormInner();
    const sq = this.contentEl.querySelector("#calSql"); if (sq) sq.innerHTML = this.calSqlInner();
    const ta = this.contentEl.querySelector("#calJson") as HTMLTextAreaElement | null;
    if (ta) ta.value = JSON.stringify(this.caliberDraft, null, 2);
    new Notice("已重置为内置默认口径 + SQL 关闭（未保存，点「保存口径」落盘）");
  }

  private async previewPush() {
    if (!this.computed) { new Notice("请先刷新数据"); return; }
    const trend = await this.buildTrend(this.computed);
    const md = buildKpiMarkdown(this.computed, "惠居" + this.tenant, trend);
    new PushPreviewModal(this.app, md, async () => {
      const hook = this.plugin.settings.webhookUrl;
      if (!hook) { new Notice("请先在设置填写企微 Webhook"); return; }
      new Notice("推送中…");
      const r = await pushWeChat(hook, md);
      new Notice(r.ok ? "已推送至企微 ✓" : "推送失败：" + r.msg);
    }).open();
  }
}

class PushPreviewModal extends Modal {
  private md: string;
  private onConfirm: () => void;
  constructor(app: App, md: string, onConfirm: () => void) { super(app); this.md = md; this.onConfirm = onConfirm; }
  onOpen() {
    const { contentEl } = this;
    contentEl.createEl("h3", { text: "推送预览（企微 Markdown）" });
    const card = contentEl.createDiv({ cls: "hj-wxcard" });
    card.setText(this.md);
    card.style.whiteSpace = "pre-wrap";
    const foot = contentEl.createDiv({ cls: "hj-mfoot" });
    foot.createEl("button", { text: "取消", cls: "btn" }).onclick = () => this.close();
    foot.createEl("button", { text: "确认推送", cls: "btn primary" }).onclick = () => { this.onConfirm(); this.close(); };
  }
  onClose() { this.contentEl.empty(); }
}
