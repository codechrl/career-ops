export const PAGE_SIZE = 20;

export function paged(items, page, size = PAGE_SIZE) {
  const total = items.length;
  const pages = Math.max(1, Math.ceil(total / size));
  const p = Math.min(Math.max(1, page), pages);
  return { slice: items.slice((p - 1) * size, p * size), page: p, pages, total };
}

export function pagerHtml(page, pages, total, size = PAGE_SIZE) {
  if (total <= size) return '';
  const s = (page - 1) * size + 1;
  const e = Math.min(page * size, total);
  return `<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 2px;font-size:13px">
    <span style="color:var(--muted)">${s}–${e} of ${total}</span>
    <div style="display:flex;align-items:center;gap:6px">
      <button class="btn btn-secondary btn-sm pager-prev"${page <= 1 ? ' disabled' : ''}>← Prev</button>
      <span style="min-width:80px;text-align:center">Page ${page} / ${pages}</span>
      <button class="btn btn-secondary btn-sm pager-next"${page >= pages ? ' disabled' : ''}>Next →</button>
    </div>
  </div>`;
}

export function bindPager(container, onPrev, onNext) {
  const prev = container.querySelector('.pager-prev');
  const next = container.querySelector('.pager-next');
  if (prev) prev.onclick = onPrev;
  if (next) next.onclick = onNext;
}
