// 多项目外壳：页眉 + 项目 Tab(radio) + 面板 + 页脚 + 内联 CSS/JS。自包含单文件。
import { DASHBOARD_CSS } from "./design";
import { esc } from "./components";

export interface ShellTab { id: string; panelId: string; label: string; }
export interface ShellInput {
  brand: string; city: string; month: string; generatedAt: number;
  fresh: { ok: boolean; text: string };
  tabs: ShellTab[];     // 顺序与 panels 对应；id 形如 proj-tier，panelId 形如 panel-tier
  panels: string[];
}

const SHELL_JS = `(function(){
  var b=document.body; b.classList.add('js-on');
  document.querySelectorAll('table.dt-sortable').forEach(function(t){
    var dir={};
    [].slice.call(t.tHead.rows[0].cells).forEach(function(th,i){
      th.addEventListener('click',function(){
        var tb=t.tBodies[0];
        var rows=[].slice.call(tb.rows).filter(function(r){return !r.classList.contains('total')});
        var tot=[].slice.call(tb.rows).filter(function(r){return r.classList.contains('total')});
        var d=dir[i]=!dir[i];
        rows.sort(function(a,b){
          var x=((a.cells[i]||{}).innerText||'').replace(/[%,人元↑↓→—pp]/g,'').trim();
          var y=((b.cells[i]||{}).innerText||'').replace(/[%,人元↑↓→—pp]/g,'').trim();
          var nx=parseFloat(x),ny=parseFloat(y);
          var r=(!isNaN(nx)&&!isNaN(ny))?nx-ny:String(x).localeCompare(String(y),'zh');
          return d?r:-r;
        });
        rows.forEach(function(r){tb.appendChild(r)});tot.forEach(function(r){tb.appendChild(r)});
      });
    });
  });
  var ft=document.getElementById('fTier'),fc=document.getElementById('fChange'),fr=document.getElementById('fRoster');
  function applyF(){var t=ft?ft.value:'',c=fc?fc.value:'',r=fr?fr.value:'';
    document.querySelectorAll('#ptable tbody tr').forEach(function(row){
      var ok=(!t||row.dataset.tier===t)&&(!c||row.dataset.change===c)&&(!r||row.dataset.roster===r);
      row.style.display=ok?'':'none';});}
  [ft,fc,fr].forEach(function(s){if(s)s.addEventListener('change',applyF)});
  var radios=[].slice.call(document.querySelectorAll('.proj-radio'));
  document.addEventListener('keydown',function(e){
    if(e.key!=='ArrowLeft'&&e.key!=='ArrowRight')return;
    var i=radios.map(function(r){return r.checked}).indexOf(true); if(i<0)return;
    var n=e.key==='ArrowRight'?Math.min(radios.length-1,i+1):Math.max(0,i-1);
    radios[n].checked=true;
  });
})();`;

export function renderShell(o: ShellInput): string {
  const radios = o.tabs.map((t, i) => `<input type="radio" name="proj" id="${t.id}" class="proj-radio"${i === 0 ? " checked" : ""}>`).join("");
  const tabs = o.tabs.map((t) => `<label class="proj-tab" for="${t.id}">${esc(t.label)}</label>`).join("");
  const panels = o.panels.map((p, i) => `<section class="proj-panel" id="${o.tabs[i].panelId}">${p}</section>`).join("");
  return `<!DOCTYPE html><html lang="zh"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(o.brand)} · ${esc(o.month)}</title><style>${DASHBOARD_CSS}</style></head>
<body>
<header class="hj-header"><div class="hj-brand"><span class="mark"></span>${esc(o.brand)}</div>
<div class="hj-ctx"><span class="hj-chip">${esc(o.city)}</span><span class="hj-chip">${esc(o.month)}</span></div>
<span class="hj-spacer"></span>
<div class="hj-fresh" data-fresh="${o.fresh.ok ? "ok" : "stale"}"><span class="dot"></span>${esc(o.fresh.text)}</div></header>
${radios}
<nav class="proj-tabs">${tabs}</nav>
<main class="proj-body">${panels}</main>
<footer class="hj-footer">惠居数据看板 · 数据来源奥丁全量下载 + 线下基准 · 口径同「年标准人效达标率」原项目 · 生成于 ${esc(new Date(o.generatedAt).toLocaleString())}</footer>
<script>${SHELL_JS}</script>
</body></html>`;
}
