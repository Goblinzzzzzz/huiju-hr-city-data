# 惠居数据看板 · Obsidian 插件（开发仓库）

多租户、配置驱动的数据流水线**控制台**插件。插件界面 = 配置/运行/校验/导出/推送；看板是**导出的产物**，不在插件内渲染。
详见上级目录 `惠居数据看板-Obsidian插件实施方案.md`。

## 当前状态：MVP 可端到端跑通 ✓

控制台 5 分区（数据源 / 口径配置 / 运行与校验 / 输出与推送 / 租户管理），样式映射 Obsidian 主题变量、容器查询自适应窄面板。**真实管线已打通**：

- **刷新数据**：从 `.huiju/inbox/<city>/` 读 CSV(明细)+XLSX(5月基准)+CSV(花名册)，SheetJS 解析；**缺文件自动回退内置样例**，开箱即演示。
- **运行/校验**：`computeTier` 做人员四分类（在岗/本月离职/新人首考/排除）、档位切档、升降级流动、激励、KPI；QA 跑**勾稽恒等式**（不平衡则阻止）。
- **生成看板**：`exportTierHtml` 产出自包含 HTML 写入 `.huiju/snapshots/<city>/tier-dashboard.html` 并外部打开（看板是产物，不在插件内渲染）。
- **奥丁后台静默取数**（`OdinHttpConnector`，cookie 认证，无浏览器/无 token）：
  - 在「设置」粘贴奥丁 Cookie（登录 odin.ke.com 后浏览器复制）+ report_id + creator_uc_id。
  - 「数据源」面板『立即抓取』→ `fetchChartList` → 存 `inbox/odin_chart_list.json`；`queryChart()` 回放 data_query 模板取行（替换分页/日期参数）。
  - 传输用 Obsidian `requestUrl`（遵循系统代理 + 解 gzip + 绕 CORS；公司内网常需代理，故不可用 Node 原生 https）。
  - 端点/契约见 memory `odin-headless-fetch-recipe`（已用真实 cookie 实测拿到行数据）。登录窗/osascript 方案已废弃。
- **企微推送**：真实 `requestUrl()` 推送（绕 CORS）；『推送』→ 预览企微 markdown → 确认后发到设置里的 webhook。key 不写死，由用户在设置填。

核心管线（connector/transform/compute/export）均为 Obsidian 无关纯函数，由 `scripts/verify.ts` 端到端验证（合成样例→解析→计算→断言勾稽→导出）。

```bash
npx esbuild scripts/verify.ts --bundle --platform=node --format=cjs --outfile=.verify.cjs && node .verify.cjs
```

## 已实现模块

- `connectors/ExcelConnector.ts` — SheetJS 解析 xlsx/csv → aoa
- `transforms/tier.ts` — 档位/工号归一化/大区映射（集团口径）
- `reports/tier/compute.ts` — 分类+流动+激励+KPI+QA（移植自 Python）
- `reports/tier/exportHtml.ts` — 看板产物（含筛选/排序 JS）
- `reports/tier/sample.ts` — 内置样例
- `views/WorkbenchView.ts` — 控制台 + 真实刷新/生成
- `tenant/types.ts`（`SourceKind` 含 'sql' 预留）/ `settings/`

## 真实数据源（年标准人效达标率 / tier）

测试用的 137301 已从默认配置移除。真实奥丁源（来自 tier-tracking-dashboard-skill）：

| 用途 | 地址 / report_id |
|------|------|
| 年标准人效达标率看板 | `https://odin.ke.com/portal/2974/39522/46908/89428`（portal，需开页抓 data_query 取真实 report_id/chart） |
| 大区拆解 | `report_id=176116`（已设为默认 `odinReportId`） |
| 资管花名册 | `https://odin.ke.com/portal/4665/59708/59715/83879/83883` |

### 给有权限测试者的步骤
1. 用**对上述报表有数据权限**的账号登录 `odin.ke.com`。
2. F12 → Network → 任意请求 → 复制整段 **Cookie**。
3. Obsidian「设置 → 惠居数据看板 → 奥丁 Cookie」粘贴；`report_id` 默认 176116，`creator_uc_id` 留空（自动用 cookie 的 ucid）。
4. 控制台「数据源」→ **立即抓取**：
   - 成功 → Notice 显示图表数，`.huiju/inbox/wuhan/odin_chart_list.json` 出现真实图表清单 → 机制对真实表跑通。
   - 401 / “cookie 已失效” → 换更完整/更新的 cookie。
   - “无权限 / creator_uc_id” → 账号对该报表无数据权限。
5. portal 看板（2974/...）非单一 report_id：登录态下打开它，F12 抓一条 `odin_data_query` 的 Copy as cURL，即可拿到其真实 report_id/chart_id 模板（再填进配置）。

## 开发

```bash
npm install
npm run dev      # 开发构建（含 sourcemap）
npm run build    # 类型检查 + 生产构建 → main.js
```

构建产物 `main.js` + `manifest.json` + `styles.css` 需放到 vault 的
`.obsidian/plugins/huiju-dashboard/` 下；改完重新 build 后在 Obsidian 里禁用→启用（或重载）即可。

本机 vault 安装路径：
`/Users/goblin/Library/Mobile Documents/iCloud~md~obsidian/Documents/.obsidian/plugins/huiju-dashboard/`

## 下一步（里程碑）

- **M1 连接器**：`ExcelConnector`(SheetJS) + `OdinConnector`(osascript 驱动 Chrome 抓取/下载)。
- **M2 模型+算子**：canonical model + tier 口径算子移植 + QA 勾稽校验（TDD）。
- **M3 导出+推送**：exportHtml 看板产物 + requestUrl 企微推送。
- **M4 多租户+对账**：TenantRegistry + 与现有 Python 输出双轨对账。
- 口径配置后续将增加 **SQL 取数方式**（类型已在 `src/tenant/types.ts` 的 `SourceKind` 预留）。
