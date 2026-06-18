// 通用 HTML 组件函数（返回字符串）。配合 design.ts 的类名。
export const esc = (s: any) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
export const f1 = (n: number) => (Number.isFinite(n) ? Math.round(n * 10) / 10 : 0);

/** 区块卡：左色条标题 + 可选 meta + body。id 供锚点导航。 */
export function sectionCard(title: string, bodyHtml: string, opts: { id?: string; meta?: string; flush?: boolean } = {}): string {
  const id = opts.id ? ` id="${opts.id}"` : "";
  const meta = opts.meta ? `<span class="card-meta">${opts.meta}</span>` : "";
  return `<section class="card"${id}><div class="card-head"><span class="bar"></span><span class="card-title">${esc(title)}</span>${meta}</div><div class="card-body${opts.flush ? " flush" : ""}">${bodyHtml}</div></section>`;
}

/** 概览统计卡。delta 形如 {text, kind}。 */
export function statCard(label: string, value: string | number, opts: { unit?: string; delta?: { text: string; kind: "pos" | "neg" | "dim" } } = {}): string {
  const unit = opts.unit ? `<span class="unit">${opts.unit}</span>` : "";
  const delta = opts.delta ? `<div class="stat-delta ${opts.delta.kind}">${esc(opts.delta.text)}</div>` : "";
  return `<div class="stat"><div class="stat-label">${esc(label)}</div><div class="stat-value">${value}${unit}</div>${delta}</div>`;
}

/** 数据表。headHtml/bodyHtml 为已构建的 <tr>… 内容。 */
export function dataTable(headHtml: string, bodyHtml: string, opts: { id?: string; sortable?: boolean; scroll?: boolean } = {}): string {
  const cls = `dt${opts.sortable ? " dt-sortable" : ""}`;
  const id = opts.id ? ` id="${opts.id}"` : "";
  const tbl = `<table class="${cls}"${id}><thead>${headHtml}</thead><tbody>${bodyHtml}</tbody></table>`;
  return opts.scroll ? `<div class="dt-scroll">${tbl}</div>` : tbl;
}

export function statusTag(kind: "ok" | "no" | "up" | "down" | "hold" | "lost" | "warn", text: string): string {
  return `<span class="tag ${kind}">${esc(text)}</span>`;
}

export function progressBar(pct: number, done = false): string {
  const w = Math.max(0, Math.min(100, pct));
  return `<div class="prog${done ? " done" : ""}"><i style="width:${w}%"></i></div>`;
}

export function tierChip(tier: string, color: string): string {
  return `<span class="tchip"><span class="sq" style="background:${color}"></span>${esc(tier)}</span>`;
}

export function emptyState(title: string, desc: string): string {
  return `<div class="empty"><div class="ei"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.6 3.6 3 8 3s8-1.4 8-3V5"/><path d="M4 12c0 1.6 3.6 3 8 3s8-1.4 8-3"/></svg></div><div class="et">${esc(title)}</div><div class="ed">${esc(desc)}</div></div>`;
}

export function skeletonGrid(n: number): string {
  return `<div class="skel-grid">${Array.from({ length: n }, () => `<div class="skel"></div>`).join("")}</div>`;
}
