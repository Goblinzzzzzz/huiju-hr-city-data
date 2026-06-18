// 看板设计系统（沉稳企业蓝）：tokens + 组件样式，整段内联进导出 HTML。
// 风格:深蓝主色 + 白卡 + 细描边 + 克制留白 + tabular 数字。无外部资源、离线可用。
export const DASHBOARD_CSS = `
:root{
  --brand-900:#0B2545; --brand-800:#102E54; --brand-700:#163A66; --brand-600:#1D4E89;
  --brand-500:#2A6BB0; --brand-100:#E3ECF6; --brand-050:#F2F6FB;
  --ink-900:#14181F; --ink-700:#2C333D; --ink-500:#5B6573; --ink-400:#8A94A3; --ink-300:#C2C9D2;
  --line-200:#E4E8EE; --line-100:#EEF1F5; --surface:#FFFFFF; --canvas:#F4F6F9;
  --pos-700:#15803D; --pos-100:#E6F4EA; --neg-700:#B42318; --neg-100:#FBEAE8;
  --warn-700:#B45309; --warn-100:#FBF0E0; --lost-700:#6B4E8E; --lost-100:#EFE9F4; --hold-500:#5B6573;
  --tier-1:#0B2545; --tier-2:#163A66; --tier-3:#1D4E89; --tier-4:#2A6BB0; --tier-5:#5C8FC4; --tier-6:#9DBAD9; --tier-7:#CBD9E8;
  --r-sm:4px; --r-md:6px; --r-lg:8px;
  --sh-card:0 1px 2px rgba(16,46,84,.04),0 1px 3px rgba(16,46,84,.06);
  --font-sans:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Hiragino Sans GB","Microsoft YaHei","Source Han Sans SC","Noto Sans CJK SC",sans-serif;
  --font-num:"SF Mono","JetBrains Mono",ui-monospace,Menlo,Consolas,monospace;
}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:var(--font-sans);background:var(--canvas);color:var(--ink-700);font-size:13px;line-height:1.5;-webkit-font-smoothing:antialiased}
.num,.dt td,.dt th,.stat-value,.region-rate{font-variant-numeric:tabular-nums;font-feature-settings:"tnum" 1}
.wrap{max-width:1360px;margin:0 auto;padding:0 32px 48px}

/* 页眉 */
.hj-header{background:var(--brand-900);color:#fff;padding:16px 32px;display:flex;align-items:center;gap:16px}
.hj-brand{font-size:18px;font-weight:600;letter-spacing:.2px;display:flex;align-items:center;gap:9px}
.hj-brand .mark{width:18px;height:18px;border-radius:4px;background:linear-gradient(135deg,#3E7CC4,#9DBAD9);display:inline-block}
.hj-ctx{display:flex;gap:7px}
.hj-chip{font-size:12px;background:rgba(255,255,255,.12);padding:3px 10px;border-radius:20px;color:#DCE6F2}
.hj-spacer{flex:1}
.hj-fresh{font-size:12px;color:#AFC0D6;display:flex;align-items:center;gap:6px}
.hj-fresh .dot{width:7px;height:7px;border-radius:50%;background:#48C78E}
.hj-fresh[data-fresh=stale] .dot{background:#E9A23B}

/* 项目 Tab（radio + :checked 兄弟选择器；JS 关时全展示） */
.proj-radio{position:absolute;opacity:0;pointer-events:none}
.proj-tabs{background:var(--brand-800);padding:0 32px;display:flex;gap:2px;position:sticky;top:0;z-index:20;box-shadow:var(--sh-card)}
.proj-tab{padding:13px 20px;font-size:14px;font-weight:600;letter-spacing:.3px;color:#AFC0D6;cursor:pointer;border-bottom:3px solid transparent;user-select:none}
.proj-tab:hover{color:#fff}
.proj-body{max-width:1360px;margin:0 auto;padding:24px 32px 48px}
.proj-panel{padding-top:0}
/* 默认(无 JS / Obsidian)：全部展示 */
.proj-body .proj-panel{display:block}
/* JS 启用后才隐藏非激活面板，用 radio 控制 */
.js-on .proj-body .proj-panel{display:none}
.js-on #proj-tier:checked~.proj-body #panel-tier,
.js-on #proj-cost:checked~.proj-body #panel-cost,
.js-on #proj-am:checked~.proj-body #panel-am{display:block}
.js-on #proj-tier:checked~.proj-tabs label[for=proj-tier],
.js-on #proj-cost:checked~.proj-tabs label[for=proj-cost],
.js-on #proj-am:checked~.proj-tabs label[for=proj-am]{color:#fff;border-bottom-color:#3E7CC4}

/* 模块锚点导航 */
.mod-nav{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:20px}
.mod-nav a{font-size:12px;color:var(--ink-500);text-decoration:none;padding:5px 11px;border:1px solid var(--line-200);border-radius:20px;background:var(--surface)}
.mod-nav a:hover{color:var(--brand-600);border-color:var(--brand-100);background:var(--brand-050)}

/* 概览统计卡 */
.stat-row{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:14px;margin-bottom:24px}
.stat{background:var(--surface);border:1px solid var(--line-200);border-left:3px solid var(--brand-600);border-radius:var(--r-lg);padding:16px 18px}
.stat-label{font-size:12px;color:var(--ink-500);margin-bottom:7px}
.stat-value{font-size:28px;font-weight:600;color:var(--ink-900);line-height:1.05;letter-spacing:-.4px}
.stat-value .unit{font-size:14px;font-weight:500;color:var(--ink-400);margin-left:2px}
.stat-delta{font-size:12px;margin-top:6px}

/* 区块卡 */
.card{background:var(--surface);border:1px solid var(--line-200);border-radius:var(--r-lg);box-shadow:var(--sh-card);margin-bottom:24px;overflow:hidden}
.card-head{display:flex;align-items:center;gap:10px;padding:15px 20px;border-bottom:1px solid var(--line-100)}
.card-head .bar{width:3px;height:16px;background:var(--brand-600);border-radius:2px}
.card-title{font-size:15px;font-weight:600;color:var(--ink-900);letter-spacing:.2px}
.card-meta{margin-left:auto;font-size:12px;color:var(--ink-500)}
.card-body{padding:18px 20px}
.card-body.flush{padding:0}

/* 数据表 */
.dt{width:100%;border-collapse:collapse;font-size:12.5px}
.dt th,.dt td{padding:9px 10px;text-align:center;border-bottom:1px solid var(--line-100)}
.dt th{background:var(--brand-050);color:var(--ink-700);font-weight:600;font-size:12px;letter-spacing:.2px;position:sticky;top:43px;z-index:1;white-space:nowrap}
.dt td{white-space:nowrap}
.dt tbody tr:hover{background:var(--brand-050)}
.dt .num{text-align:right}
.dt tr.hl{background:var(--brand-100)}
.dt tr.hl:hover{background:var(--brand-100)}
.dt tr.hl td{font-weight:600}
.dt tr.muted td{color:var(--ink-400)}
.dt .total td{font-weight:700;background:var(--brand-050);border-top:2px solid var(--line-200)}
.dt .gh{font-family:var(--font-num);color:var(--ink-400);font-size:11.5px}
.dt-sortable th{cursor:pointer;user-select:none}
.dt-sortable th:hover{background:var(--brand-100)}
.dt-scroll{max-height:640px;overflow:auto}

/* 语义文字 */
.pos{color:var(--pos-700);font-weight:600}.neg{color:var(--neg-700);font-weight:600}
.warn{color:var(--warn-700);font-weight:600}.lost{color:var(--lost-700);font-weight:600}.dim{color:var(--ink-300)}

/* 状态标签 */
.tag{display:inline-flex;align-items:center;gap:3px;font-size:11px;font-weight:600;padding:2px 8px;border-radius:20px;line-height:1.4}
.tag.ok{background:var(--pos-100);color:var(--pos-700)}
.tag.no{background:var(--neg-100);color:var(--neg-700)}
.tag.up{background:var(--pos-100);color:var(--pos-700)}
.tag.down{background:var(--neg-100);color:var(--neg-700)}
.tag.hold{background:var(--line-100);color:var(--ink-500)}
.tag.lost{background:var(--lost-100);color:var(--lost-700)}
.tag.warn{background:var(--warn-100);color:var(--warn-700)}

/* 档位色块 */
.tchip{display:inline-flex;align-items:center;gap:6px}
.tchip .sq{width:9px;height:9px;border-radius:2px;display:inline-block}

/* 进度条 */
.prog{height:6px;background:var(--line-200);border-radius:var(--r-sm);overflow:hidden;margin:8px 0}
.prog>i{display:block;height:100%;background:var(--brand-500);border-radius:var(--r-sm)}
.prog.done>i{background:var(--pos-700)}

/* 趋势行内迷你色条 */
.spark{display:inline-block;height:7px;border-radius:2px;background:var(--brand-500);vertical-align:middle;min-width:2px}

/* 激励卡 */
.inc-cards{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}
.inc{border:1px solid var(--line-200);border-radius:var(--r-lg);padding:15px}
.inc-top{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:6px}
.inc-name{font-weight:600;font-size:15px;color:var(--ink-900)}
.inc-amt{font-weight:700;color:var(--brand-600)}
.inc-detail{font-size:12px;color:var(--ink-500);margin-bottom:4px}
.inc-foot{display:flex;justify-content:space-between;font-size:12.5px;color:var(--ink-700)}
.inc-summary{background:var(--brand-050);border:1px solid var(--line-200);padding:13px 16px;border-radius:var(--r-md);text-align:center;font-size:14px;margin-top:14px}

/* 大区卡 */
.region-cards{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}
.region{border:1px solid var(--line-200);border-radius:var(--r-lg);overflow:hidden}
.region-head{padding:13px 16px;background:linear-gradient(135deg,var(--brand-800),var(--brand-600));color:#fff}
.region-head.warn{background:linear-gradient(135deg,#7A4A12,var(--warn-700))}
.region-name{font-size:15px;font-weight:600}
.region-rate{font-size:26px;font-weight:700;line-height:1.1}
.region-rate small{font-size:12px;font-weight:400;opacity:.85;margin-left:6px}
.region-sub{font-size:12px;opacity:.92;margin-top:3px}
/* 升降级分析名单 */
.region-notes{padding:11px 14px;border-top:1px solid var(--line-100);display:flex;flex-direction:column;gap:6px;background:var(--brand-050)}
.region-notes .rn{font-size:11.5px;line-height:1.55}
.region-notes .ok{color:var(--pos-700)}
.region-notes .warn{color:var(--warn-700)}
.region-notes .crit{color:var(--brand-600)}
.region-notes .low{color:var(--neg-700)}
/* 可悬停看个人明细的单元格 + 浮层 */
.dt td.hint{cursor:help;text-decoration:underline dotted var(--ink-400);text-underline-offset:3px}
#hj-tip{position:fixed;z-index:9999;display:none;max-width:360px;pointer-events:none;background:var(--brand-900);color:#fff;padding:8px 11px;border-radius:6px;font-size:11.5px;line-height:1.6;white-space:pre-line;box-shadow:0 8px 28px rgba(11,37,69,.32)}

/* 空态 / 骨架（占位项目） */
.empty{text-align:center;padding:30px 20px;color:var(--ink-400)}
.empty .ei{width:42px;height:42px;border-radius:10px;background:var(--brand-050);border:1px solid var(--line-200);margin:0 auto 12px;display:flex;align-items:center;justify-content:center;color:var(--brand-500)}
.empty .et{font-size:14px;font-weight:600;color:var(--ink-500)}
.empty .ed{font-size:12px;margin-top:4px}
.skel-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;padding:0 20px 18px}
.skel{height:64px;border-radius:var(--r-md);background:linear-gradient(90deg,var(--line-100) 25%,#F6F8FB 50%,var(--line-100) 75%);background-size:400% 100%;animation:sh 1.6s ease infinite}
@keyframes sh{0%{background-position:100% 0}100%{background-position:-100% 0}}

/* 页脚 */
.hj-footer{max-width:1360px;margin:0 auto;padding:18px 32px;color:var(--ink-400);font-size:11.5px;border-top:1px solid var(--line-200);line-height:1.7}

/* 筛选条 */
.filter{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px}
.filter select{padding:7px 11px;border:1px solid var(--line-200);border-radius:var(--r-md);font-size:13px;color:var(--ink-700);background:var(--surface)}
`;
