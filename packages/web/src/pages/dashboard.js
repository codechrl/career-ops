import { api } from '../api.js';

const STATUS_CLASS = {
  'Applied':    'badge-applied',
  'Interview':  'badge-inter',
  'Offer':      'badge-offer',
  'Rejected':   'badge-reject',
  'To Apply':   'badge-new',
  'To Email':   'badge-new',
  'Evaluada':   'badge-new',
  'Descartada': 'badge-reject',
};

export function renderDashboard(root) {
  root.innerHTML = `
    <div class="page-header">
      <h1>Dashboard</h1>
      <span class="page-sub">Job search overview &amp; rankings</span>
    </div>
    <div id="dash-metrics" class="metrics-row">
      <div class="loading-row"><span class="spinner"></span> Loading metrics…</div>
    </div>
    <div class="filter-bar">
      <label>Target Role</label>
      <select id="dash-target-filter">
        <option value="">All targets</option>
      </select>
      <label style="margin-left:8px">Stage</label>
      <select id="dash-stage-filter">
        <option value="">All stages</option>
        <option>To Apply</option><option>Applied</option><option>Interview</option>
        <option>Offer</option><option>Rejected</option>
      </select>
      <button class="btn btn-secondary btn-sm" id="dash-clear-filter">Clear</button>
    </div>
    <div class="table-wrap">
      <table class="data-table" id="dash-table">
        <thead>
          <tr>
            <th>Company</th><th>Role</th><th>Target</th>
            <th>Role</th><th>Industry</th><th>Location</th><th>Prefs</th>
            <th>Overall</th><th>Stage</th>
          </tr>
        </thead>
        <tbody id="dash-tbody">
          <tr><td colspan="9" style="padding:20px 12px"><div class="loading-row"><span class="spinner"></span> Loading…</div></td></tr>
        </tbody>
      </table>
    </div>
  `;

  let allEvals = [];
  let allListings = [];

  Promise.all([
    api('GET', '/api/listings'),
    api('GET', '/api/cv-summary/rankings').catch(() => ({ evaluations: [] })),
    api('GET', '/api/cv-summary/targets').catch(() => ({ targets: [] })),
  ]).then(([listings, rankData, targetsData]) => {
    allListings = listings;
    allEvals = rankData.evaluations || [];
    const targets = (targetsData.targets || []).filter(Boolean);

    const byStatus = {};
    allListings.forEach(l => { byStatus[l.status] = (byStatus[l.status] || 0) + 1; });
    const total = allListings.length;
    const interviewed = byStatus['Interview'] || 0;
    const offers = byStatus['Offer'] || 0;
    const applied = byStatus['Applied'] || 0;
    const avgScore = allEvals.length
      ? Math.round(allEvals.reduce((s, e) => s + (e.overall_score || 0), 0) / allEvals.length)
      : '—';

    root.querySelector('#dash-metrics').innerHTML = `
      <div class="metric-card"><div class="metric-label">Total</div><div class="metric-value accent">${total}</div></div>
      <div class="metric-card"><div class="metric-label">Applied</div><div class="metric-value">${applied}</div></div>
      <div class="metric-card"><div class="metric-label">Interview</div><div class="metric-value warn">${interviewed}</div></div>
      <div class="metric-card"><div class="metric-label">Offer</div><div class="metric-value success">${offers}</div></div>
      <div class="metric-card"><div class="metric-label">Avg Score</div><div class="metric-value">${avgScore}</div></div>
      <div class="metric-card"><div class="metric-label">Targets</div><div class="metric-value">${targets.length}</div></div>
    `;

    const tf = root.querySelector('#dash-target-filter');
    targets.forEach(t => {
      const o = document.createElement('option');
      o.value = t; o.textContent = t;
      tf.appendChild(o);
    });

    renderTable();
    tf.onchange = renderTable;
    root.querySelector('#dash-stage-filter').onchange = renderTable;
    root.querySelector('#dash-clear-filter').onclick = () => {
      tf.value = '';
      root.querySelector('#dash-stage-filter').value = '';
      renderTable();
    };
  }).catch(err => {
    root.querySelector('#dash-metrics').innerHTML = `<div class="alert alert-error">Failed to load: ${escHtml(err.message)}</div>`;
  });

  function renderTable() {
    const targetFilter = root.querySelector('#dash-target-filter').value;
    const stageFilter  = root.querySelector('#dash-stage-filter').value;
    let rows = allEvals;
    if (targetFilter) rows = rows.filter(e => e.target_role === targetFilter);
    if (stageFilter)  rows = rows.filter(e => e.listing_status === stageFilter);
    rows = [...rows].sort((a, b) => b.overall_score - a.overall_score);

    const tbody = root.querySelector('#dash-tbody');
    if (!rows.length) {
      tbody.innerHTML = `<tr><td colspan="9" style="padding:24px 12px;color:var(--muted);text-align:center">
        ${allEvals.length ? 'No listings match filters.' : 'No rankings yet — go to <strong>Job Targeting</strong> to rank listings.'}
      </td></tr>`;
      return;
    }
    tbody.innerHTML = rows.map(e => `
      <tr>
        <td><strong>${escHtml(e.company)}</strong></td>
        <td>${escHtml(e.listing_role)}</td>
        <td><span class="badge badge-new">${escHtml(e.target_role)}</span></td>
        <td>${scoreBadge(e.role_score)}</td>
        <td>${scoreBadge(e.industry_score)}</td>
        <td>${scoreBadge(e.location_score)}</td>
        <td>${scoreBadge(e.preference_score)}</td>
        <td><span class="score score-overall ${scoreClass(e.overall_score)}">${e.overall_score}</span></td>
        <td>${stageBadge(e.listing_status)}</td>
      </tr>
    `).join('');
  }
}

function scoreClass(s) { return s >= 75 ? 'score-high' : s >= 50 ? 'score-mid' : 'score-low'; }
function scoreBadge(s) { return `<span class="score ${scoreClass(s)}">${s}</span>`; }
function stageBadge(status) {
  const cls = STATUS_CLASS[status] || 'badge-default';
  return `<span class="badge ${cls}">${escHtml(status || '—')}</span>`;
}
function escHtml(s) {
  const d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML;
}
