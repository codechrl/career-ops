import { api } from '../api.js';

// ── Column definitions ────────────────────────────────────────────────────────
const COLS = [
  { key: 'date',     label: 'Date',      default: true },
  { key: 'company',  label: 'Company',   default: true },
  { key: 'role',     label: 'Role',      default: true },
  { key: 'portal',   label: 'Portal',    default: true },
  { key: 'targets',  label: 'Targets',   default: true },
  { key: 'overall',  label: 'Score',     default: true },
  { key: 'stage',    label: 'Stage',     default: true },
  { key: 'run',      label: 'Run #',     default: true },
  { key: 'role_s',   label: 'Role Fit',  default: false },
  { key: 'ind_s',    label: 'Industry',  default: false },
  { key: 'loc_s',    label: 'Location',  default: false },
  { key: 'pref_s',   label: 'Prefs',     default: false },
];
const COL_KEY = 'dash_vis_cols';

function getVisCols() {
  try {
    const stored = JSON.parse(localStorage.getItem(COL_KEY));
    if (Array.isArray(stored)) return stored;
  } catch {}
  return COLS.filter(c => c.default).map(c => c.key);
}
function setVisCols(arr) { localStorage.setItem(COL_KEY, JSON.stringify(arr)); }

// ── Main render ───────────────────────────────────────────────────────────────
export function renderDashboard(root) {
  root.innerHTML = `
    <div class="page-header" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">
      <div><h1>Dashboard</h1><span class="page-sub">Job search overview &amp; rankings</span></div>
    </div>
    <div id="dash-metrics" class="metrics-row">
      <div class="loading-row"><span class="spinner"></span> Loading…</div>
    </div>

    <!-- Filter bar -->
    <div class="filter-bar" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:12px">
      <label style="font-size:12px">Target</label>
      <select id="dash-target-filter" style="font-size:12px">
        <option value="">All targets</option>
      </select>
      <label style="font-size:12px">Stage</label>
      <select id="dash-stage-filter" style="font-size:12px">
        <option value="">All stages</option>
        <option>To Apply</option><option>Applied</option><option>Interview</option>
        <option>Offer</option><option>Rejected</option>
      </select>
      <label style="font-size:12px">Score&nbsp;≥</label>
      <input type="number" id="dash-score-filter" value="0" min="0" max="100"
        style="width:56px;font-size:12px;padding:3px 6px;border-radius:4px;border:1px solid var(--border);background:var(--surface);color:var(--fg)">
      <button class="btn btn-secondary btn-sm" id="dash-clear-filter">Clear</button>
      <div style="margin-left:auto;position:relative">
        <button class="btn btn-secondary btn-sm" id="dash-col-btn">⚙ Columns</button>
        <div id="dash-col-picker" style="display:none;position:absolute;right:0;top:32px;background:var(--surface);border:1px solid var(--border);border-radius:6px;padding:10px;z-index:100;min-width:160px;box-shadow:0 4px 16px rgba(0,0,0,.25)">
          ${COLS.map(c => `
            <label style="display:flex;align-items:center;gap:6px;padding:3px 0;font-size:13px;cursor:pointer;white-space:nowrap">
              <input type="checkbox" class="col-vis-cb" data-key="${c.key}"> ${c.label}
            </label>`).join('')}
        </div>
      </div>
    </div>

    <!-- Bulk action bar -->
    <div id="dash-bulk" style="display:none;align-items:center;gap:8px;padding:6px 0;margin-bottom:4px;flex-wrap:wrap">
      <span id="dash-sel-count" style="font-size:13px;color:var(--muted)">0 selected</span>
      <select id="dash-bulk-stage" style="font-size:13px;padding:4px 8px;border-radius:4px;border:1px solid var(--border);background:var(--surface);color:var(--fg)">
        <option value="">Set stage…</option>
        <option>To Apply</option><option>Applied</option><option>Interview</option>
        <option>Offer</option><option>Rejected</option>
      </select>
      <button class="btn btn-secondary btn-sm" id="dash-bulk-stage-btn">Apply</button>
      <button class="btn btn-danger btn-sm" id="dash-bulk-delete-btn">Delete</button>
      <button class="btn btn-secondary btn-sm" id="dash-deselect-btn">Clear</button>
    </div>

    <!-- Table -->
    <div class="table-wrap">
      <table class="data-table" id="dash-table">
        <thead><tr id="dash-thead-row"></tr></thead>
        <tbody id="dash-tbody">
          <tr><td colspan="20" style="padding:20px 12px"><div class="loading-row"><span class="spinner"></span> Loading…</div></td></tr>
        </tbody>
      </table>
    </div>
    <div id="dash-pagination" style="display:none;align-items:center;justify-content:space-between;padding:10px 2px;font-size:13px">
      <span id="dash-page-info" style="color:var(--muted)"></span>
      <div style="display:flex;align-items:center;gap:6px">
        <button class="btn btn-secondary btn-sm" id="dash-prev">← Prev</button>
        <span id="dash-page-num" style="min-width:80px;text-align:center"></span>
        <button class="btn btn-secondary btn-sm" id="dash-next">Next →</button>
      </div>
    </div>

    <!-- Detail slide-over -->
    <div id="dash-overlay" style="position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:999;display:none" id="dash-overlay"></div>
    <div id="dash-detail" style="position:fixed;top:0;right:0;bottom:0;width:min(520px,100vw);background:var(--surface);border-left:1px solid var(--border);z-index:1000;display:none;flex-direction:column;overflow:hidden">
      <div style="display:flex;align-items:center;justify-content:space-between;padding:16px 18px;border-bottom:1px solid var(--border);flex-shrink:0">
        <div>
          <div id="detail-title" style="font-size:16px;font-weight:700;color:var(--fg)"></div>
          <div id="detail-company" style="font-size:13px;color:var(--muted);margin-top:2px"></div>
        </div>
        <button id="detail-close" class="btn btn-secondary btn-sm">✕</button>
      </div>
      <div id="detail-body" style="flex:1;overflow-y:auto;padding:18px"></div>
    </div>
  `;

  let allEvals    = [];
  let allListings = [];

  // ── Load data ──────────────────────────────────────────────────────────────
  Promise.all([
    api('GET', '/api/listings'),
    api('GET', '/api/cv-summary/rankings').catch(() => ({ evaluations: [] })),
    api('GET', '/api/cv-summary/targets').catch(() => ({ targets: [] })),
  ]).then(([listings, rankData, targetsData]) => {
    allListings = listings;
    allEvals    = rankData.evaluations || [];
    const targets = (targetsData.targets || []).filter(Boolean);

    // Metrics
    const byStatus = {};
    allListings.forEach(l => { byStatus[l.status] = (byStatus[l.status] || 0) + 1; });
    const total = allListings.length;
    // Best match: unique listings with max overall_score >= 90
    const bestByListing = new Map();
    allEvals.forEach(e => { if ((e.overall_score||0) > (bestByListing.get(e.listing_id)||0)) bestByListing.set(e.listing_id, e.overall_score); });
    const bestMatchCount = [...bestByListing.values()].filter(s => s >= 90).length;

    root.querySelector('#dash-metrics').innerHTML = `
      <div class="metric-card"><div class="metric-label">Total</div><div class="metric-value accent">${total}</div></div>
      <div class="metric-card"><div class="metric-label">Applied</div><div class="metric-value">${byStatus['Applied'] || 0}</div></div>
      <div class="metric-card"><div class="metric-label">Interview</div><div class="metric-value warn">${byStatus['Interview'] || 0}</div></div>
      <div class="metric-card"><div class="metric-label">Offer</div><div class="metric-value success">${byStatus['Offer'] || 0}</div></div>
      <div class="metric-card"><div class="metric-label">Best Match \u226590</div><div class="metric-value success">${bestMatchCount}</div></div>
      <div class="metric-card"><div class="metric-label">Targets</div><div class="metric-value">${targets.length}</div></div>
    `;

    const tf = root.querySelector('#dash-target-filter');
    targets.forEach(t => {
      const o = document.createElement('option'); o.value = t; o.textContent = t;
      tf.appendChild(o);
    });

    applyColPicker();
    renderTable();

    tf.onchange = () => { currentPage = 1; renderTable(); };
    root.querySelector('#dash-stage-filter').onchange  = () => { currentPage = 1; renderTable(); };
    root.querySelector('#dash-score-filter').oninput   = () => { currentPage = 1; renderTable(); };
    root.querySelector('#dash-clear-filter').onclick   = () => {
      tf.value = '';
      root.querySelector('#dash-stage-filter').value = '';
      root.querySelector('#dash-score-filter').value = '0';
      currentPage = 1;
      renderTable();
    };

    // Bulk actions
    root.querySelector('#dash-select-all').onchange = (e) => {
      root.querySelectorAll('.dash-row-cb').forEach(cb => { cb.checked = e.target.checked; });
      updateBulkBar();
    };
    root.querySelector('#dash-bulk-stage-btn').onclick = async () => {
      const stage = root.querySelector('#dash-bulk-stage').value;
      if (!stage) return;
      const ids = getSelectedListingIds();
      if (!ids.length) return;
      await Promise.all(ids.map(id => api('PUT', `/api/listings/${id}`, { status: stage }).catch(() => {})));
      await reload();
    };
    root.querySelector('#dash-bulk-delete-btn').onclick = async () => {
      const ids = getSelectedListingIds();
      if (!ids.length || !confirm(`Delete ${ids.length} listing(s)?`)) return;
      await Promise.all(ids.map(id => api('DELETE', `/api/listings/${id}`).catch(() => {})));
      await reload();
    };
    root.querySelector('#dash-deselect-btn').onclick = () => {
      root.querySelectorAll('.dash-row-cb').forEach(cb => { cb.checked = false; });
      root.querySelector('#dash-select-all').checked = false;
      updateBulkBar();
    };
  }).catch(err => {
    root.querySelector('#dash-metrics').innerHTML =
      `<div class="alert alert-error">Failed to load: ${escHtml(err.message)}</div>`;
  });

  // ── Column picker ──────────────────────────────────────────────────────────
  const colBtn    = root.querySelector('#dash-col-btn');
  const colPicker = root.querySelector('#dash-col-picker');
  colBtn.onclick  = (e) => { e.stopPropagation(); colPicker.style.display = colPicker.style.display === 'none' ? '' : 'none'; };
  document.addEventListener('click', () => { colPicker.style.display = 'none'; }, { once: false });
  colPicker.addEventListener('click', e => e.stopPropagation());

  function applyColPicker() {
    const vis = getVisCols();
    root.querySelectorAll('.col-vis-cb').forEach(cb => {
      cb.checked = vis.includes(cb.dataset.key);
      cb.onchange = () => {
        const newVis = [...root.querySelectorAll('.col-vis-cb')]
          .filter(c => c.checked).map(c => c.dataset.key);
        setVisCols(newVis);
        renderTable();
      };
    });
  }

  // ── Pagination state ───────────────────────────────────────────────────────
  const PAGE_SIZE = 20;
  let currentPage = 1;

  // ── Group evaluations by listing_id ────────────────────────────────────────
  function groupByListing(evals) {
    const map = new Map();
    evals.forEach(e => {
      if (!map.has(e.listing_id)) {
        map.set(e.listing_id, {
          listing_id:     e.listing_id,
          company:        e.company,
          listing_role:   e.listing_role,
          listing_status: e.listing_status,
          created_at:     e.created_at,
          overall_score:  e.overall_score,
          role_score:     e.role_score,
          industry_score: e.industry_score,
          location_score: e.location_score,
          preference_score: e.preference_score,
          targets: [{ target_role: e.target_role, overall_score: e.overall_score,
            role_score: e.role_score, industry_score: e.industry_score,
            location_score: e.location_score, preference_score: e.preference_score }],
        });
      } else {
        const g = map.get(e.listing_id);
        // Dedup: only keep one entry per target_role, using best score
        const existingTarget = g.targets.find(t => t.target_role === e.target_role);
        if (!existingTarget) {
          g.targets.push({ target_role: e.target_role, overall_score: e.overall_score,
            role_score: e.role_score, industry_score: e.industry_score,
            location_score: e.location_score, preference_score: e.preference_score });
        } else if (e.overall_score > existingTarget.overall_score) {
          Object.assign(existingTarget, { overall_score: e.overall_score,
            role_score: e.role_score, industry_score: e.industry_score,
            location_score: e.location_score, preference_score: e.preference_score });
        }
        // Keep best overall score and its sub-scores
        if (e.overall_score > g.overall_score) {
          g.overall_score  = e.overall_score;
          g.role_score     = e.role_score;
          g.industry_score = e.industry_score;
          g.location_score = e.location_score;
          g.preference_score = e.preference_score;
        }
      }
    });
    return [...map.values()];
  }

  // ── Render table ───────────────────────────────────────────────────────────
  function renderTable() {
    const targetFilter = root.querySelector('#dash-target-filter').value;
    const stageFilter  = root.querySelector('#dash-stage-filter').value;
    const minScore     = parseInt(root.querySelector('#dash-score-filter').value, 10) || 0;
    const vis          = getVisCols();

    // Filter evaluations first
    let evals = allEvals;
    if (targetFilter) evals = evals.filter(e => e.target_role === targetFilter);

    // Group
    let rows = groupByListing(evals);

    // Apply filters on grouped rows
    if (stageFilter) rows = rows.filter(g => g.listing_status === stageFilter);
    rows = rows.filter(g => g.overall_score >= minScore);
    rows = [...rows].sort((a, b) => b.overall_score - a.overall_score);

    // Pagination
    const totalRows  = rows.length;
    const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE));
    if (currentPage > totalPages) currentPage = totalPages;
    const pageRows = rows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

    // Build header
    const thead = root.querySelector('#dash-thead-row');
    thead.innerHTML = `<th style="width:32px"><input type="checkbox" id="dash-select-all" title="Select all"></th>` +
      vis.map(k => `<th>${COLS.find(c => c.key === k)?.label || k}</th>`).join('') +
      `<th style="width:32px"></th>`;

    const tbody = root.querySelector('#dash-tbody');
    const pager = root.querySelector('#dash-pagination');
    if (!rows.length) {
      tbody.innerHTML = `<tr><td colspan="${vis.length + 3}" style="padding:24px 12px;color:var(--muted);text-align:center">
        ${allEvals.length ? 'No listings match filters.' : 'No rankings yet.'}
      </td></tr>`;
      pager.style.display = 'none';
      return;
    }

    // Update pagination controls
    const start = (currentPage - 1) * PAGE_SIZE + 1;
    const end   = Math.min(currentPage * PAGE_SIZE, totalRows);
    root.querySelector('#dash-page-info').textContent = `${start}–${end} of ${totalRows} listings`;
    root.querySelector('#dash-page-num').textContent  = `Page ${currentPage} / ${totalPages}`;
    root.querySelector('#dash-prev').disabled = currentPage <= 1;
    root.querySelector('#dash-next').disabled = currentPage >= totalPages;
    pager.style.display = 'flex';

    root.querySelector('#dash-prev').onclick = () => { currentPage--; renderTable(); };
    root.querySelector('#dash-next').onclick = () => { currentPage++; renderTable(); };

    tbody.innerHTML = pageRows.map(g => {
      const listing = allListings.find(l => l.id === g.listing_id) || {};
      const targetBadges = g.targets.map(t =>
        `<span class="badge badge-new" style="font-size:10px;margin:1px">${escHtml(t.target_role)}</span>`).join('');
      const stages = ['To Apply','Applied','Interview','Offer','Rejected'];

      const cells = vis.map(k => {
        switch (k) {
          case 'date':    return `<td style="font-size:11px;color:var(--muted);white-space:nowrap">${fmtDate(listing.created_at || g.created_at)}</td>`;
          case 'company': return `<td><strong>${escHtml(g.company)}</strong></td>`;
          case 'role':    return `<td>${escHtml(g.listing_role)}</td>`;
          case 'portal':  return `<td>${listing.source_portal ? `<span class="badge badge-new" style="font-size:10px">${escHtml(listing.source_portal)}</span>` : '<span style="color:var(--muted);font-size:11px">—</span>'}</td>`;
          case 'targets': return `<td style="max-width:180px">${targetBadges}</td>`;
          case 'overall': return `<td><span class="score score-overall ${scoreClass(g.overall_score)}">${g.overall_score}</span></td>`;
          case 'stage':   return `<td><select class="stage-select" data-lid="${g.listing_id}" style="font-size:11px;padding:2px 4px;border-radius:3px;border:1px solid var(--border);background:var(--surface);color:var(--fg)">${stages.map(s => `<option${s === g.listing_status ? ' selected' : ''}>${escHtml(s)}</option>`).join('')}</select></td>`;
          case 'run':     return `<td style="font-size:11px;color:var(--muted)">${listing.scan_run_id ? `#${listing.scan_run_id}` : '—'}</td>`;
          case 'role_s':  return `<td>${scoreBadge(g.role_score)}</td>`;
          case 'ind_s':   return `<td>${scoreBadge(g.industry_score)}</td>`;
          case 'loc_s':   return `<td>${scoreBadge(g.location_score)}</td>`;
          case 'pref_s':  return `<td>${scoreBadge(g.preference_score)}</td>`;
          default: return '<td>—</td>';
        }
      }).join('');

      return `<tr class="dash-row" data-lid="${g.listing_id}" style="cursor:pointer">
        <td><input type="checkbox" class="dash-row-cb" data-lid="${g.listing_id}" onclick="event.stopPropagation()"></td>
        ${cells}
        <td><button class="btn btn-secondary btn-sm dash-detail-btn" data-lid="${g.listing_id}" onclick="event.stopPropagation()" style="font-size:11px;padding:2px 8px">↗</button></td>
      </tr>`;
    }).join('');

    // Wire events
    tbody.querySelectorAll('.stage-select').forEach(sel => {
      sel.onclick = e => e.stopPropagation();
      sel.onchange = async () => {
        await api('PUT', `/api/listings/${sel.dataset.lid}`, { status: sel.value }).catch(() => {});
        const g = pageRows.find(r => r.listing_id === +sel.dataset.lid);
        if (g) g.listing_status = sel.value;
        const l = allListings.find(l => l.id === +sel.dataset.lid);
        if (l) l.status = sel.value;
      };
    });
    tbody.querySelectorAll('.dash-row-cb').forEach(cb => { cb.onchange = updateBulkBar; });
    tbody.querySelectorAll('.dash-row').forEach(tr => {
      tr.onclick = () => openDetail(+tr.dataset.lid);
    });
    tbody.querySelectorAll('.dash-detail-btn').forEach(btn => {
      btn.onclick = () => openDetail(+btn.dataset.lid);
    });

    root.querySelector('#dash-select-all').onchange = (e) => {
      root.querySelectorAll('.dash-row-cb').forEach(cb => { cb.checked = e.target.checked; });
      updateBulkBar();
    };
  }

  // ── Detail slide-over ──────────────────────────────────────────────────────
  const detailPanel   = root.querySelector('#dash-detail');
  const overlay       = root.querySelector('#dash-overlay');
  const detailClose   = root.querySelector('#detail-close');
  const detailBody    = root.querySelector('#detail-body');

  function closeDetail() {
    detailPanel.style.display = 'none';
    overlay.style.display = 'none';
  }
  detailClose.onclick = closeDetail;
  overlay.onclick     = closeDetail;

  function openDetail(listingId) {
    const listing = allListings.find(l => l.id === listingId) || {};
    const evals   = allEvals.filter(e => e.listing_id === listingId);
    const company = evals[0]?.company || listing.company || '—';
    const role    = evals[0]?.listing_role || listing.role || '—';

    root.querySelector('#detail-title').textContent  = role;
    root.querySelector('#detail-company').textContent = company;

    const stages = ['To Apply','Applied','Interview','Offer','Rejected'];
    const status = listing.status || evals[0]?.listing_status || 'To Apply';

    detailBody.innerHTML = `
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:14px;flex-wrap:wrap">
        ${listing.source_portal ? `<span class="badge badge-new">${escHtml(listing.source_portal)}</span>` : ''}
        ${listing.scan_run_id ? `<span style="font-size:11px;color:var(--muted)">Run #${listing.scan_run_id}</span>` : ''}
        <span style="font-size:11px;color:var(--muted)">${fmtDate(listing.created_at)}</span>
      </div>

      ${listing.source_url ? `
        <a href="${escHtml(listing.source_url)}" target="_blank" rel="noopener noreferrer"
           class="btn btn-primary btn-sm" style="margin-bottom:16px;display:inline-flex;align-items:center;gap:6px">
          ↗ Open Original Posting
        </a>` : '<p style="color:var(--muted);font-size:12px;margin-bottom:16px">No source URL available.</p>'}

      <div class="form-group" style="margin-bottom:16px">
        <label style="font-size:12px">Stage</label>
        <select id="detail-stage" style="font-size:13px;padding:5px 8px;border-radius:4px;border:1px solid var(--border);background:var(--surface);color:var(--fg);width:180px">
          ${stages.map(s => `<option${s === status ? ' selected' : ''}>${escHtml(s)}</option>`).join('')}
        </select>
      </div>

      <div style="font-weight:600;font-size:13px;margin-bottom:10px;color:var(--muted)">Target Matches</div>
      ${evals.length ? evals.sort((a,b) => b.overall_score - a.overall_score).map(e => {
        const ps = parsePrefScores(e.preference_scores);
        const recColor = { 'Strong Apply': '#22c55e', 'Apply': '#22c55e', 'Research more': '#f59e0b', 'Skip': '#ef4444' };
        const recIcon  = { 'Strong Apply': '✅', 'Apply': '👍', 'Research more': '🔍', 'Skip': '⛔' };
        const actColor = { 'Apply online': '#3b82f6', 'Email': '#8b5cf6', 'LinkedIn DM': '#0ea5e9', 'Company website': '#3b82f6', 'Reach out': '#f59e0b' };
        const actIcon  = { 'Apply online': '🌐', 'Email': '✉️', 'LinkedIn DM': '💼', 'Company website': '🏢', 'Reach out': '📬' };
        const rec = e.recommendation || '';
        const act = e.next_action || '';
        const rColor = recColor[rec] || 'var(--muted)';
        const aColor = actColor[act] || 'var(--muted)';
        const hasInd  = !!(e.industries);
        const hasLoc  = !!(e.target_location);
        const hasPref = !!(ps && Object.keys(ps).length);
        return `
        <div style="border:1px solid var(--border);border-radius:6px;padding:12px;margin-bottom:10px">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
            <span class="badge badge-new" style="font-size:11px">${escHtml(e.target_role)}</span>
            <span class="score score-overall ${scoreClass(e.overall_score)}" style="font-size:14px">${e.overall_score}</span>
          </div>

          ${rec ? `<div style="display:flex;align-items:flex-start;gap:10px;background:var(--bg);border-left:3px solid ${rColor};border-radius:0 5px 5px 0;padding:8px 12px;margin-bottom:8px">
            <span style="font-size:15px;line-height:1.2">${recIcon[rec] || '→'}</span>
            <div><div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px">Recommendation</div>
              <div style="font-size:13px;font-weight:700;color:${rColor}">${escHtml(rec)}</div>
              ${e.recommendation_reason ? `<div style="font-size:11px;color:var(--muted);margin-top:1px">${escHtml(e.recommendation_reason)}</div>` : ''}
            </div>
          </div>` : ''}

          ${act ? `<div style="display:flex;align-items:flex-start;gap:10px;background:var(--bg);border:1px solid var(--border);border-radius:5px;padding:8px 12px;margin-bottom:10px">
            <span style="font-size:15px;line-height:1.2">${actIcon[act] || '📋'}</span>
            <div style="flex:1;min-width:0">
              <div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px">Next Step</div>
              <div style="font-size:13px;font-weight:700;color:${aColor}">${escHtml(act)}</div>
              ${e.next_action_reason ? `<div style="font-size:11px;color:var(--muted);margin-top:1px;word-break:break-all">${e.next_action_reason.startsWith('http') ? `<a href="${escHtml(e.next_action_reason)}" target="_blank" rel="noopener" style="color:${aColor}">${escHtml(e.next_action_reason)}</a>` : escHtml(e.next_action_reason)}</div>` : ''}
            </div>
            <button disabled class="btn btn-secondary btn-sm" title="Coming soon" style="opacity:.45;flex-shrink:0;font-size:11px">✍ Draft</button>
          </div>` : ''}

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:5px;margin-bottom:10px;font-size:11px">
            ${e.target_location ? `<div style="color:var(--muted)">📍 Loc: <span style="color:var(--fg)">${escHtml(e.target_location)}</span></div>` : ''}
            ${e.industries ? `<div style="color:var(--muted)">🏭 Ind: <span style="color:var(--fg)">${escHtml(e.industries)}</span></div>` : ''}
          </div>

          <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:4px;text-align:center;margin-bottom:${hasPref ? '10px' : '0'}">
            <div style="background:var(--bg);border-radius:4px;padding:6px 4px">
              <div style="font-size:10px;color:var(--muted);margin-bottom:2px">Role fit</div>
              <div>${scoreBadge(e.role_score)}</div>
            </div>
            <div style="background:var(--bg);border-radius:4px;padding:6px 4px">
              <div style="font-size:10px;color:var(--muted);margin-bottom:2px">Industry</div>
              <div>${hasInd ? scoreBadge(e.industry_score) : '<span style="color:var(--muted);font-size:11px">—</span>'}</div>
            </div>
            <div style="background:var(--bg);border-radius:4px;padding:6px 4px">
              <div style="font-size:10px;color:var(--muted);margin-bottom:2px">Location</div>
              <div>${hasLoc ? scoreBadge(e.location_score) : '<span style="color:var(--muted);font-size:11px">—</span>'}</div>
            </div>
            <div style="background:var(--bg);border-radius:4px;padding:6px 4px">
              <div style="font-size:10px;color:var(--muted);margin-bottom:2px">Prefs</div>
              <div>${hasPref ? scoreBadge(e.preference_score) : '<span style="color:var(--muted);font-size:11px">—</span>'}</div>
            </div>
          </div>

          ${hasPref ? `<div style="border-top:1px solid var(--border);padding-top:8px">
            <div style="font-size:10px;color:var(--muted);margin-bottom:6px">Preference breakdown</div>
            <table style="width:100%;border-collapse:collapse;font-size:12px">
              <thead><tr style="border-bottom:1px solid var(--border)">
                <th style="text-align:left;padding:3px 6px;font-size:10px;color:var(--muted);font-weight:500">Preference</th>
                <th style="text-align:center;padding:3px 6px;font-size:10px;color:var(--muted);font-weight:500;width:56px">Score</th>
                <th style="text-align:left;padding:3px 6px;font-size:10px;color:var(--muted);font-weight:500;width:64px">Match</th>
              </tr></thead>
              <tbody>
                ${Object.entries(ps).map(([pref, score]) =>
                  `<tr style="border-bottom:1px solid var(--border)20">
                    <td style="padding:4px 6px;color:var(--fg)">${escHtml(pref)}</td>
                    <td style="padding:4px 6px;text-align:center">${scoreBadge(score)}</td>
                    <td style="padding:4px 6px;font-size:10px;color:${score>=75?'#22c55e':score>=50?'#f59e0b':'#ef4444'}">${score>=75?'Good':score>=50?'Partial':'Poor'}</td>
                  </tr>`).join('')}
              </tbody>
            </table>
          </div>` : ''}
        </div>`;
      }).join('')
      : '<p style="color:var(--muted);font-size:12px">No evaluations yet.</p>'}

      <button class="btn btn-danger btn-sm" id="detail-delete">Delete Listing</button>
    `;

    // Stage inline change from detail panel
    detailBody.querySelector('#detail-stage').onchange = async (e) => {
      await api('PUT', `/api/listings/${listingId}`, { status: e.target.value }).catch(() => {});
      const l = allListings.find(l => l.id === listingId);
      if (l) l.status = e.target.value;
      // Update any open stage-select in the table
      const sel = root.querySelector(`.stage-select[data-lid="${listingId}"]`);
      if (sel) sel.value = e.target.value;
    };

    detailBody.querySelector('#detail-delete').onclick = async () => {
      if (!confirm('Delete this listing?')) return;
      await api('DELETE', `/api/listings/${listingId}`).catch(() => {});
      closeDetail();
      await reload();
    };

    overlay.style.display = '';
    detailPanel.style.display = 'flex';
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  function getSelectedListingIds() {
    return [...root.querySelectorAll('.dash-row-cb:checked')].map(cb => +cb.dataset.lid);
  }
  function updateBulkBar() {
    const n = root.querySelectorAll('.dash-row-cb:checked').length;
    root.querySelector('#dash-bulk').style.display = n > 0 ? 'flex' : 'none';
    root.querySelector('#dash-sel-count').textContent = `${n} selected`;
  }
  async function reload() {
    const [listings, rankData] = await Promise.all([
      api('GET', '/api/listings'),
      api('GET', '/api/cv-summary/rankings').catch(() => ({ evaluations: [] })),
    ]);
    allListings = listings;
    allEvals    = rankData.evaluations || [];
    renderTable();
  }
}

// ── Pure helpers ──────────────────────────────────────────────────────────────
function scoreClass(s) { return s >= 75 ? 'score-high' : s >= 50 ? 'score-mid' : 'score-low'; }
function parsePrefScores(raw) {
  if (!raw) return null;
  if (typeof raw === 'object') return raw;
  try { return JSON.parse(raw); } catch { return null; }
}
function scoreBadge(s) { return `<span class="score ${scoreClass(s)}">${s}</span>`; }
function fmtDate(iso) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleDateString(undefined, { dateStyle: 'short' }); } catch { return iso; }
}
function escHtml(s) {
  const d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML;
}
