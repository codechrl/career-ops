import { api } from '../api.js';
import { paged, pagerHtml, bindPager } from '../paginate.js';

function escHtml(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function scoreColor(s) {
  const n = Number(s) || 0;
  if (n >= 70) return 'var(--success,#0c6)';
  if (n >= 40) return '#f5a623';
  return 'var(--muted)';
}

export function renderListings(root) {
  let _all = [];
  let _page = 1;

  root.innerHTML = `
    <div class="page-header" style="display:flex;align-items:center;justify-content:space-between">
      <div>
        <h1>Listings</h1>
        <span class="page-sub" id="listings-sub">Loading…</span>
      </div>
      <button class="btn btn-danger" id="delete-all-btn" style="display:none">Delete All</button>
    </div>
    <div class="card" id="listings-wrap">
      <div id="listings-table" style="padding:16px;color:var(--muted)">Loading…</div>
    </div>`;

  function render() {
    const { slice, page, pages, total } = paged(_all, _page);
    _page = page;
    const sub = root.querySelector('#listings-sub');
    if (sub) sub.textContent = `${total} listing${total !== 1 ? 's' : ''}`;

    const delBtn = root.querySelector('#delete-all-btn');
    if (delBtn) delBtn.style.display = total > 0 ? '' : 'none';

    const el = root.querySelector('#listings-table');
    if (!total) {
      el.innerHTML = `<span style="color:var(--muted)">No listings yet.</span>`;
      return;
    }
    el.innerHTML = `
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr>
            <th>#</th><th>Date</th><th>Company</th><th>Role</th>
            <th style="text-align:center">Score</th><th>Status</th><th>Portal</th>
          </tr></thead>
          <tbody>${slice.map(l => `<tr>
            <td style="font-size:11px;color:var(--muted)">${l.id}</td>
            <td style="font-size:12px">${fmtDate(l.created_at)}</td>
            <td>${escHtml(l.company)}</td>
            <td>${escHtml(l.role)}</td>
            <td style="text-align:center;font-weight:600;color:${scoreColor(l.score)}">${l.score ?? '—'}</td>
            <td><span class="badge">${escHtml(l.status)}</span></td>
            <td style="font-size:12px;color:var(--muted)">${escHtml(l.source_portal ?? '')}</td>
          </tr>`).join('')}
          </tbody>
        </table>
      </div>
      ${pagerHtml(page, pages, total)}`;
    bindPager(el, () => { _page--; render(); }, () => { _page++; render(); });
  }

  function load() {
    root.querySelector('#listings-table').innerHTML = '<span style="color:var(--muted)">Loading…</span>';
    api('GET', '/api/listings').then(data => {
      _all = data;
      _page = 1;
      render();
    }).catch(err => {
      root.querySelector('#listings-table').textContent = 'Failed to load: ' + err.message;
    });
  }

  root.querySelector('#delete-all-btn').addEventListener('click', () => {
    if (!confirm(`Delete ALL ${_all.length} listings? This cannot be undone.`)) return;
    api('DELETE', '/api/listings/all').then(() => {
      _all = [];
      _page = 1;
      render();
    }).catch(err => alert('Delete failed: ' + err.message));
  });

  load();
}
