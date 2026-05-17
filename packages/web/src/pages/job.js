import { api, apiForm } from '../api.js';

let cvState = { cvText: '', summary: '', keywords: '' };

export function renderJob(root) {
  root.innerHTML = `
    <div class="page-header">
      <h1>Job Targeting</h1>
      <span class="page-sub">CV profile, target setup, portals &amp; listings</span>
    </div>
    <div class="tabs" id="job-tabs">
      <button class="tab-btn active" data-tab="cv">CV Profile</button>
      <button class="tab-btn" data-tab="targets">Target Setup</button>
      <button class="tab-btn" data-tab="portals">Portals &amp; Scan</button>
      <button class="tab-btn" data-tab="listings">Listings</button>
    </div>

    <!-- CV Profile -->
    <div class="tab-panel active" id="tab-cv">
      <div id="cv-current" class="mb-0"></div>
      <div id="cv-upload-section" class="mt-16">
        <div class="section-header"><h2>Upload / Paste CV</h2></div>
        <div class="card" style="margin-bottom:12px">
          <div class="card-title">Upload file</div>
          <form id="cv-upload-form" enctype="multipart/form-data" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
            <input type="file" name="cv" accept=".pdf,.docx,.md,.txt" style="flex:1;min-width:200px">
            <button type="submit" class="btn btn-primary">Upload &amp; Analyze</button>
          </form>
        </div>
        <div class="card">
          <div class="card-title">Paste CV text</div>
          <textarea id="cv-paste" rows="8" placeholder="Paste your full CV here…"></textarea>
          <div style="margin-top:8px">
            <button class="btn btn-primary" id="cv-analyze-btn">Analyze Pasted CV</button>
          </div>
        </div>
        <div id="cv-spinner" style="display:none" class="loading-row mt-16"><span class="spinner"></span> Analyzing CV with AI…</div>
      </div>
      <div id="cv-result" style="display:none" class="mt-16">
        <div class="section-header">
          <h2>CV Summary</h2>
          <button class="btn btn-secondary btn-sm" id="cv-reupload-btn">Re-upload</button>
        </div>
        <div class="card" style="margin-bottom:10px">
          <div class="card-title">Summary</div>
          <div id="cv-summary-display" class="text-muted" style="font-size:13px;line-height:1.6"></div>
        </div>
        <div class="card">
          <div class="card-title">Keywords</div>
          <div id="cv-keywords-display" style="font-size:12px;font-family:var(--mono);color:var(--accent);line-height:1.8"></div>
        </div>
      </div>
      <div id="cv-error" class="alert alert-error" style="display:none;margin-top:12px"></div>
    </div>

    <!-- Target Setup -->
    <div class="tab-panel" id="tab-targets">
      <div id="target-form-wrap">
        <div class="section-header">
          <h2 id="target-form-title">New Job Target</h2>
          <button class="btn btn-secondary btn-sm" id="target-form-cancel" style="display:none">Cancel Edit</button>
        </div>
        <div class="card">
          <form id="target-form">
            <input type="hidden" id="t-id">
            <div class="form-group">
              <label>Target Role *</label>
              <input type="text" id="t-role" placeholder="e.g. Senior Backend Engineer">
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
              <div class="form-group mb-0">
                <label>Industries</label>
                <input type="text" id="t-industries" placeholder="e.g. Fintech, SaaS, AI">
              </div>
              <div class="form-group mb-0">
                <label>Location</label>
                <input type="text" id="t-location" placeholder="e.g. Remote, Jakarta">
              </div>
            </div>
            <div class="form-group mt-16">
              <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
                <label style="margin:0">Scoring Criteria</label>
                <button type="button" class="btn btn-secondary btn-sm" id="add-metric-btn">+ Add</button>
              </div>
              <div id="metrics-list" style="display:flex;flex-direction:column;gap:6px">
                <div class="metric-row" style="display:flex;gap:6px">
                  <input type="text" class="metric-input" placeholder="e.g. Remote-friendly" style="flex:1">
                  <button type="button" class="btn btn-danger btn-sm metric-remove" style="display:none">✕</button>
                </div>
              </div>
              <p class="text-muted" style="font-size:11px;margin-top:6px">Each criterion is scored independently (salary range, tech stack, culture, company size…)</p>
            </div>
            <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
              <button type="submit" class="btn btn-primary" id="target-submit-btn">Save Target</button>
              <label style="display:flex;align-items:center;gap:6px;font-size:13px;margin:0;cursor:pointer">
                <input type="checkbox" id="t-set-active"> Set as active target
              </label>
            </div>
          </form>
          <div id="target-error" class="alert alert-error" style="display:none;margin-top:12px"></div>
          <div id="target-success" class="alert alert-success" style="display:none;margin-top:12px"></div>
        </div>

        <div class="section-header" style="margin-top:24px">
          <h2>Saved Targets</h2>
        </div>
        <div id="targets-table-wrap">
          <div class="loading-row"><span class="spinner"></span> Loading…</div>
        </div>

        <div id="target-results" style="display:none;margin-top:24px">
          <div class="section-header">
            <h2>Evaluation: <span id="target-results-role" class="text-accent"></span></h2>
            <button class="btn btn-secondary btn-sm" id="target-go-dashboard">View Dashboard</button>
          </div>
          <div id="target-spinner" style="display:none" class="loading-row mt-16"><span class="spinner"></span> Evaluating listings against criteria…</div>
          <div id="target-rank-error" class="alert alert-error" style="display:none;margin-top:8px"></div>
          <div class="table-wrap" style="margin-top:12px">
            <table class="data-table"><thead><tr><th>#</th><th>Company</th><th>Role</th><th>Role fit</th><th>Industry</th><th>Location</th><th>Prefs</th><th>Overall</th></tr></thead>
            <tbody id="target-results-tbody"></tbody></table>
          </div>
        </div>
      </div>
    </div>

    <!-- Portals & Scan -->
    <div class="tab-panel" id="tab-portals">
      <div class="section-header">
        <h2>Portals</h2>
        <button class="btn btn-primary btn-sm" id="add-portal-btn">+ Add Portal</button>
      </div>

      <!-- Add / Edit form -->
      <div id="portal-form-wrap" class="card" style="display:none;margin-bottom:16px">
        <div class="card-title" id="portal-form-title">Add Portal</div>
        <form id="portal-form" style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px">
          <div class="form-group mb-0"><label>Name *</label><input type="text" id="pf-name" placeholder="LinkedIn"></div>
          <div class="form-group mb-0"><label>Provider slug</label><input type="text" id="pf-provider" placeholder="linkedin"></div>
          <div class="form-group mb-0" style="grid-column:1/-1"><label>URL</label><input type="text" id="pf-url" placeholder="https://linkedin.com/jobs"></div>
          <div class="form-group mb-0">
            <label>Auth / Session</label>
            <select id="pf-auth">
              <option value="none">None (public)</option>
              <option value="session">Session (cookies)</option>
              <option value="token">API Token</option>
            </select>
          </div>
          <div class="form-group mb-0">
            <label>Status</label>
            <select id="pf-enabled">
              <option value="1">Enabled</option>
              <option value="0">Disabled</option>
            </select>
          </div>
          <input type="hidden" id="pf-id">
          <div style="grid-column:1/-1;display:flex;gap:8px">
            <button type="submit" class="btn btn-primary btn-sm">Save</button>
            <button type="button" class="btn btn-secondary btn-sm" id="portal-form-cancel">Cancel</button>
          </div>
        </form>
      </div>

      <!-- Portals table -->
      <div class="table-wrap">
        <table class="data-table" id="portals-table">
          <thead><tr><th>Name</th><th>Provider</th><th>URL</th><th>Auth</th><th>Status</th><th></th></tr></thead>
          <tbody id="portals-tbody">
            <tr><td colspan="6"><div class="loading-row"><span class="spinner"></span> Loading…</div></td></tr>
          </tbody>
        </table>
      </div>

      <!-- Scan section -->
      <div class="section-header" style="margin-top:24px">
        <h2>Run Scan</h2>
        <span class="text-muted" style="font-size:12px">Scans enabled portals</span>
      </div>
      <div class="card" style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
        <button class="btn btn-primary" id="start-scan-btn">Start Scan</button>
        <button class="btn btn-secondary" id="linkedin-login">LinkedIn Login</button>
        <button class="btn btn-secondary" id="linkedin-save">Save Session</button>
      </div>
      <div class="terminal mt-16" id="scan-output" style="display:none"></div>
    </div>

    <!-- Listings -->
    <div class="tab-panel" id="tab-listings">
      <div class="section-header">
        <h2>My Listings</h2>
        <button class="btn btn-primary btn-sm" id="add-listing-btn">+ Add Listing</button>
      </div>
      <div id="add-listing-form" style="display:none;margin-bottom:16px" class="card">
        <div class="card-title">Add Listing Manually</div>
        <form id="listing-add-form" style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <div class="form-group mb-0"><label>Company *</label><input type="text" id="l-company" placeholder="Acme Corp"></div>
          <div class="form-group mb-0"><label>Role *</label><input type="text" id="l-role" placeholder="Software Engineer"></div>
          <div class="form-group mb-0"><label>Status</label>
            <select id="l-status">
              <option>To Apply</option><option>Applied</option><option>Interview</option><option>Offer</option><option>Rejected</option>
            </select>
          </div>
          <div class="form-group mb-0"><label>&nbsp;</label>
            <div style="display:flex;gap:8px;padding-top:4px">
              <button type="submit" class="btn btn-primary btn-sm">Save</button>
              <button type="button" class="btn btn-secondary btn-sm" id="cancel-listing-btn">Cancel</button>
            </div>
          </div>
        </form>
      </div>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>#</th><th>Date</th><th>Company</th><th>Role</th><th>Stage</th><th></th></tr></thead>
          <tbody id="listings-tbody">
            <tr><td colspan="6" style="padding:20px 12px"><div class="loading-row"><span class="spinner"></span> Loading…</div></td></tr>
          </tbody>
        </table>
      </div>
    </div>
  `;

  setupTabs(root);
  setupCVTab(root);
  setupTargetTab(root);
  setupPortalsTab(root);
  setupListingsTab(root);
  loadCurrentCV(root);
}

// ── Tabs ─────────────────────────────────────────────────────────────────────
function setupTabs(root) {
  root.querySelectorAll('.tab-btn').forEach(btn => {
    btn.onclick = () => {
      root.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      root.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      root.querySelector(`#tab-${btn.dataset.tab}`).classList.add('active');
    };
  });
}

// ── CV Tab ────────────────────────────────────────────────────────────────────
async function loadCurrentCV(root) {
  try {
    // First check if CV file exists on server
    const data = await api('GET', '/api/cv/current');
    if (!data.exists) return;

    // Try to load saved analysis from DB
    const analysis = await api('GET', '/api/cv-summary/current-analysis');
    if (analysis && analysis.summary) {
      cvState.summary = analysis.summary;
      cvState.keywords = analysis.keywords;
      localStorage.setItem('cv-summary', analysis.summary);
      localStorage.setItem('cv-keywords', analysis.keywords || '');
      showCVResult(root, analysis.summary, analysis.keywords);
      return;
    }

    // Fall back to localStorage
    const savedSummary = localStorage.getItem('cv-summary');
    if (savedSummary) {
      cvState.summary = savedSummary;
      cvState.keywords = localStorage.getItem('cv-keywords') || '';
      showCVResult(root, cvState.summary, cvState.keywords);
    } else {
      showCVResult(root, null, null);
      root.querySelector('#cv-summary-display').innerHTML = `<span class="text-muted">CV on file — re-upload to regenerate summary.</span>`;
      root.querySelector('#cv-keywords-display').innerHTML = `<span class="text-muted">—</span>`;
    }
  } catch { /* ignore */ }
}

function setupCVTab(root) {
  root.querySelector('#cv-upload-form').onsubmit = async e => {
    e.preventDefault();
    const file = root.querySelector('input[name=cv]').files[0];
    if (!file) return;
    const form = new FormData();
    form.append('cv', file);
    root.querySelector('#cv-spinner').style.display = 'flex';
    try {
      const res = await fetch('/api/cv', {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
        body: form,
      });
      const data = await res.json();
      if (data.parsed && data.text) {
        cvState.cvText = data.text;
      } else {
        showCVError(root, 'Could not parse file. Try pasting text instead.');
        return;
      }
      await analyzeCV(root);
    } catch (err) {
      showCVError(root, 'Upload failed: ' + err.message);
    } finally {
      root.querySelector('#cv-spinner').style.display = 'none';
    }
  };

  root.querySelector('#cv-analyze-btn').onclick = async () => {
    const text = root.querySelector('#cv-paste').value.trim();
    if (!text) { showCVError(root, 'Paste your CV text first.'); return; }
    cvState.cvText = text;
    root.querySelector('#cv-spinner').style.display = 'flex';
    await analyzeCV(root);
  };

  root.querySelector('#cv-reupload-btn').onclick = () => {
    cvState = { cvText: '', summary: '', keywords: '' };
    root.querySelector('#cv-result').style.display = 'none';
    root.querySelector('#cv-upload-section').style.display = 'block';
  };
}

async function analyzeCV(root) {
  try {
    const res = await fetch('/api/cv-summary/upload', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${localStorage.getItem('token')}`,
      },
      body: JSON.stringify({ cvText: cvState.cvText }),
    });
    const data = await res.json();
    if (!data.success) { showCVError(root, data.error || 'Analysis failed.'); return; }
    cvState.summary = data.summary;
    cvState.keywords = data.keywords;
    localStorage.setItem('cv-summary', data.summary);
    localStorage.setItem('cv-keywords', data.keywords);
    showCVResult(root, data.summary, data.keywords);
  } catch (err) {
    showCVError(root, 'Analysis failed: ' + err.message);
  } finally {
    root.querySelector('#cv-spinner').style.display = 'none';
  }
}

function showCVResult(root, summary, keywords) {
  root.querySelector('#cv-upload-section').style.display = 'none';
  root.querySelector('#cv-result').style.display = 'block';
  if (summary !== null) {
    root.querySelector('#cv-summary-display').textContent = summary;
    root.querySelector('#cv-keywords-display').textContent = keywords;
  }
}

function showCVError(root, msg) {
  const el = root.querySelector('#cv-error');
  el.textContent = msg; el.style.display = 'block';
  setTimeout(() => { el.style.display = 'none'; }, 6000);
}

// ── Target Tab ────────────────────────────────────────────────────────────────
function setupTargetTab(root) {
  loadTargets(root);

  root.querySelector('#add-metric-btn').onclick = () => {
    const list = root.querySelector('#metrics-list');
    const row = document.createElement('div');
    row.className = 'metric-row';
    row.style.cssText = 'display:flex;gap:6px';
    row.innerHTML = `<input type="text" class="metric-input" placeholder="e.g. Equity, startup stage…" style="flex:1"><button type="button" class="btn btn-danger btn-sm metric-remove">✕</button>`;
    row.querySelector('.metric-remove').onclick = () => { row.remove(); updateRemoveButtons(root); };
    list.appendChild(row);
    updateRemoveButtons(root);
    row.querySelector('.metric-input').focus();
  };
  root.querySelector('#metrics-list').addEventListener('click', e => {
    if (e.target.classList.contains('metric-remove')) {
      e.target.closest('.metric-row').remove();
      updateRemoveButtons(root);
    }
  });

  root.querySelector('#target-form-cancel').onclick = () => {
    resetTargetForm(root);
  };

  root.querySelector('#target-form').onsubmit = async e => {
    e.preventDefault();
    const targetRole = root.querySelector('#t-role').value.trim();
    if (!targetRole) { showTargetMsg(root, 'Target role is required.', 'error'); return; }

    const id = root.querySelector('#t-id').value;
    const metrics = Array.from(root.querySelectorAll('#metrics-list .metric-input')).map(i => i.value.trim()).filter(Boolean);
    const setActive = root.querySelector('#t-set-active').checked;
    const body = {
      targetRole,
      industries: root.querySelector('#t-industries').value.trim(),
      targetLocation: root.querySelector('#t-location').value.trim(),
      metrics,
      setActive,
    };

    root.querySelector('#target-submit-btn').disabled = true;
    try {
      if (id) {
        await api('PUT', `/api/job-target/${id}`, body);
      } else {
        await api('POST', '/api/job-target', body);
      }
      showTargetMsg(root, `Target "${targetRole}" saved.`, 'success');
      resetTargetForm(root);
      loadTargets(root);
    } catch (err) {
      showTargetMsg(root, err.message, 'error');
    } finally {
      root.querySelector('#target-submit-btn').disabled = false;
    }
  };

  root.querySelector('#target-go-dashboard').onclick = () => {
    document.querySelector('a[data-id="dashboard"]')?.click();
  };
}

function resetTargetForm(root) {
  root.querySelector('#t-id').value = '';
  root.querySelector('#t-role').value = '';
  root.querySelector('#t-industries').value = '';
  root.querySelector('#t-location').value = '';
  root.querySelector('#t-set-active').checked = false;
  root.querySelector('#target-form-title').textContent = 'New Job Target';
  root.querySelector('#target-form-cancel').style.display = 'none';
  const list = root.querySelector('#metrics-list');
  list.innerHTML = `<div class="metric-row" style="display:flex;gap:6px"><input type="text" class="metric-input" placeholder="e.g. Remote-friendly" style="flex:1"><button type="button" class="btn btn-danger btn-sm metric-remove" style="display:none">✕</button></div>`;
  updateRemoveButtons(root);
}

async function loadTargets(root) {
  const wrap = root.querySelector('#targets-table-wrap');
  try {
    const targets = await api('GET', '/api/job-target');
    if (!targets.length) {
      wrap.innerHTML = `<div class="alert alert-info">No job targets saved yet. Fill the form above to create one.</div>`;
      return;
    }
    wrap.innerHTML = `
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>Role</th><th>Industries</th><th>Location</th><th>Criteria</th><th>Status</th><th></th></tr></thead>
          <tbody>
            ${targets.map(t => `
              <tr>
                <td><strong>${escHtml(t.target_role)}</strong></td>
                <td class="text-muted" style="font-size:12px">${escHtml(t.industries || '—')}</td>
                <td class="text-muted" style="font-size:12px">${escHtml(t.target_location || '—')}</td>
                <td class="text-muted" style="font-size:12px">${(t.metrics || []).length} criteria</td>
                <td>${t.is_active ? '<span class="badge badge-success">Active</span>' : '<span class="badge badge-default">Inactive</span>'}</td>
                <td style="white-space:nowrap;text-align:right">
                  <button class="btn btn-secondary btn-sm target-activate-btn" data-id="${t.id}" style="margin-right:4px">${t.is_active ? 'Deactivate' : 'Activate'}</button>
                  <button class="btn btn-secondary btn-sm target-evaluate-btn" data-id="${t.id}" style="margin-right:4px">Evaluate</button>
                  <button class="btn btn-secondary btn-sm target-edit-btn" data-id="${t.id}" style="margin-right:4px">Edit</button>
                  <button class="btn btn-danger btn-sm target-delete-btn" data-id="${t.id}">Delete</button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;

    wrap.querySelectorAll('.target-activate-btn').forEach(btn => {
      btn.onclick = async () => {
        await api('PATCH', `/api/job-target/${btn.dataset.id}/activate`, {});
        loadTargets(root);
      };
    });

    wrap.querySelectorAll('.target-edit-btn').forEach(btn => {
      const t = targets.find(x => String(x.id) === btn.dataset.id);
      if (!t) return;
      btn.onclick = () => {
        root.querySelector('#t-id').value = t.id;
        root.querySelector('#t-role').value = t.target_role;
        root.querySelector('#t-industries').value = t.industries || '';
        root.querySelector('#t-location').value = t.target_location || '';
        root.querySelector('#t-set-active').checked = !!t.is_active;
        root.querySelector('#target-form-title').textContent = `Edit: ${t.target_role}`;
        root.querySelector('#target-form-cancel').style.display = 'inline-flex';
        const list = root.querySelector('#metrics-list');
        list.innerHTML = '';
        const mets = t.metrics || [];
        if (!mets.length) mets.push('');
        mets.forEach(m => {
          const row = document.createElement('div');
          row.className = 'metric-row';
          row.style.cssText = 'display:flex;gap:6px';
          row.innerHTML = `<input type="text" class="metric-input" value="${escHtml(m)}" style="flex:1"><button type="button" class="btn btn-danger btn-sm metric-remove">✕</button>`;
          row.querySelector('.metric-remove').onclick = () => { row.remove(); updateRemoveButtons(root); };
          list.appendChild(row);
        });
        updateRemoveButtons(root);
        root.querySelector('#target-form-wrap').scrollIntoView({ behavior: 'smooth' });
      };
    });

    wrap.querySelectorAll('.target-delete-btn').forEach(btn => {
      btn.onclick = async () => {
        const t = targets.find(x => String(x.id) === btn.dataset.id);
        if (!confirm(`Delete target "${t?.target_role}"?`)) return;
        await api('DELETE', `/api/job-target/${btn.dataset.id}`);
        loadTargets(root);
      };
    });

    wrap.querySelectorAll('.target-evaluate-btn').forEach(btn => {
      const t = targets.find(x => String(x.id) === btn.dataset.id);
      if (!t) return;
      btn.onclick = () => runEvaluation(root, t);
    });
  } catch (err) {
    wrap.innerHTML = `<div class="alert alert-error">Failed to load: ${err.message}</div>`;
  }
}

async function runEvaluation(root, target) {
  const summary = cvState.summary || localStorage.getItem('cv-summary') || '';
  const keywords = cvState.keywords || localStorage.getItem('cv-keywords') || '';
  const spinner = root.querySelector('#target-spinner');
  const rankErr = root.querySelector('#target-rank-error');
  root.querySelector('#target-results').style.display = 'block';
  spinner.style.display = 'flex';
  rankErr.style.display = 'none';
  root.querySelector('#target-results').scrollIntoView({ behavior: 'smooth' });
  try {
    const res = await fetch('/api/cv-summary/rank', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
      body: JSON.stringify({
        cvSummary: summary,
        cvKeywords: keywords,
        targetRole: target.target_role,
        industries: target.industries,
        targetLocation: target.target_location,
        preferences: (target.metrics || []).join('; '),
      }),
    });
    const data = await res.json();
    if (!data.success) { showRankError(root, data.error || 'Evaluation failed.'); return; }
    showTargetResults(root, target.target_role, data.rankings || []);
  } catch (err) {
    showRankError(root, 'Evaluation failed: ' + err.message);
  } finally {
    spinner.style.display = 'none';
  }
}

function showTargetResults(root, role, rankings) {
  root.querySelector('#target-results-role').textContent = role;
  const tbody = root.querySelector('#target-results-tbody');
  if (!rankings.length) {
    tbody.innerHTML = `<tr><td colspan="8" style="padding:20px;color:var(--muted);text-align:center">No listings found. Add listings first.</td></tr>`;
  } else {
    tbody.innerHTML = rankings.map((r, i) => `
      <tr>
        <td class="text-muted">${i + 1}</td>
        <td><strong>${escHtml(r.company)}</strong></td>
        <td>${escHtml(r.listingRole)}</td>
        <td>${scoreBadge(r.scores.role_score)}</td>
        <td>${scoreBadge(r.scores.industry_score)}</td>
        <td>${scoreBadge(r.scores.location_score)}</td>
        <td>${scoreBadge(r.scores.preference_score)}</td>
        <td><span class="score score-overall ${scoreClass(r.scores.overall_score)}">${r.scores.overall_score}</span></td>
      </tr>
    `).join('');
  }
}

function updateRemoveButtons(root) {
  const rows = root.querySelectorAll('#metrics-list .metric-row');
  rows.forEach(row => {
    const btn = row.querySelector('.metric-remove');
    if (btn) btn.style.display = rows.length > 1 ? 'inline-flex' : 'none';
  });
}

function showTargetMsg(root, msg, type) {
  const errEl = root.querySelector('#target-error');
  const okEl  = root.querySelector('#target-success');
  if (type === 'error') {
    errEl.textContent = msg; errEl.style.display = 'block';
    setTimeout(() => { errEl.style.display = 'none'; }, 6000);
  } else {
    okEl.textContent = msg; okEl.style.display = 'block';
    setTimeout(() => { okEl.style.display = 'none'; }, 4000);
  }
}

function showRankError(root, msg) {
  const el = root.querySelector('#target-rank-error');
  el.textContent = msg; el.style.display = 'block';
}


// ── Portals Tab ───────────────────────────────────────────────────────────────
function setupPortalsTab(root) {
  const output = root.querySelector('#scan-output');
  loadPortals(root);

  // Add portal button
  root.querySelector('#add-portal-btn').onclick = () => {
    root.querySelector('#portal-form-wrap').style.display = 'block';
    root.querySelector('#portal-form-title').textContent = 'Add Portal';
    root.querySelector('#pf-id').value = '';
    root.querySelector('#portal-form').reset();
  };
  root.querySelector('#portal-form-cancel').onclick = () => {
    root.querySelector('#portal-form-wrap').style.display = 'none';
  };

  root.querySelector('#portal-form').onsubmit = async e => {
    e.preventDefault();
    const id = root.querySelector('#pf-id').value;
    const body = {
      name: root.querySelector('#pf-name').value.trim(),
      provider: root.querySelector('#pf-provider').value.trim(),
      careers_url: root.querySelector('#pf-url').value.trim(),
      auth_type: root.querySelector('#pf-auth').value,
      enabled: Number(root.querySelector('#pf-enabled').value),
    };
    if (!body.name) return;
    if (id) {
      await api('PUT', `/api/portals/${id}`, body);
    } else {
      await api('POST', '/api/portals', body);
    }
    root.querySelector('#portal-form-wrap').style.display = 'none';
    loadPortals(root);
  };

  root.querySelector('#linkedin-login').onclick = async () => {
    output.style.display = 'block';
    output.textContent = 'Opening LinkedIn login session…\n';
    try {
      const data = await api('POST', '/api/playwright/start', { portal: 'linkedin' });
      output.textContent += JSON.stringify(data, null, 2) + '\n';
    } catch (err) { output.textContent += 'Error: ' + err.message + '\n'; }
  };
  root.querySelector('#linkedin-save').onclick = async () => {
    output.style.display = 'block';
    output.textContent = 'Saving LinkedIn session…\n';
    try {
      const data = await api('POST', '/api/playwright/save', { portal: 'linkedin' });
      output.textContent += JSON.stringify(data, null, 2) + '\n';
    } catch (err) { output.textContent += 'Error: ' + err.message + '\n'; }
  };

  root.querySelector('#start-scan-btn').onclick = () => {
    output.style.display = 'block';
    output.textContent = 'Starting scan…\n';
    const es = new EventSource('/api/scan');
    es.onmessage = ev => { output.textContent += ev.data + '\n'; output.scrollTop = output.scrollHeight; };
    es.addEventListener('end', ev => { output.textContent += '\n' + ev.data + '\n'; es.close(); });
    es.onerror = () => { output.textContent += '\n[scan stream closed]\n'; es.close(); };
  };
}

async function loadPortals(root) {
  const tbody = root.querySelector('#portals-tbody');
  try {
    const portals = await api('GET', '/api/portals');
    if (!portals.length) {
      tbody.innerHTML = `<tr><td colspan="6" style="padding:20px;text-align:center;color:var(--muted)">No portals. Add one above.</td></tr>`;
      return;
    }
    tbody.innerHTML = portals.map(p => `
      <tr>
        <td><strong>${escHtml(p.name)}</strong></td>
        <td class="text-muted">${escHtml(p.provider || '—')}</td>
        <td>${p.careers_url ? `<a href="${escHtml(p.careers_url)}" target="_blank" rel="noopener" style="color:var(--accent);font-size:12px">${escHtml(p.careers_url)}</a>` : '<span class="text-muted">—</span>'}</td>
        <td><span class="badge ${p.auth_type === 'none' ? 'badge-default' : 'badge-info'}">${escHtml(p.auth_type || 'none')}</span></td>
        <td><span class="badge ${p.enabled ? 'badge-success' : 'badge-default'}">${p.enabled ? 'enabled' : 'disabled'}</span></td>
        <td style="white-space:nowrap">
          <button class="btn btn-secondary btn-sm portal-edit-btn" data-id="${p.id}">Edit</button>
          <button class="btn btn-danger btn-sm portal-delete-btn" data-id="${p.id}" style="margin-left:4px">✕</button>
        </td>
      </tr>
    `).join('');

    // Bind edit
    tbody.querySelectorAll('.portal-edit-btn').forEach(btn => {
      btn.onclick = () => {
        const portal = portals.find(p => p.id == btn.dataset.id);
        if (!portal) return;
        root.querySelector('#portal-form-wrap').style.display = 'block';
        root.querySelector('#portal-form-title').textContent = 'Edit Portal';
        root.querySelector('#pf-id').value = portal.id;
        root.querySelector('#pf-name').value = portal.name;
        root.querySelector('#pf-provider').value = portal.provider || '';
        root.querySelector('#pf-url').value = portal.careers_url || '';
        root.querySelector('#pf-auth').value = portal.auth_type || 'none';
        root.querySelector('#pf-enabled').value = String(portal.enabled ?? 1);
      };
    });
    // Bind delete
    tbody.querySelectorAll('.portal-delete-btn').forEach(btn => {
      btn.onclick = async () => {
        if (!confirm('Delete this portal?')) return;
        await api('DELETE', `/api/portals/${btn.dataset.id}`);
        loadPortals(root);
      };
    });
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" style="color:var(--danger);padding:12px">Failed to load portals: ${err.message}</td></tr>`;
  }
}

// ── Listings Tab ──────────────────────────────────────────────────────────────
function setupListingsTab(root) {
  loadListings(root);

  root.querySelector('#add-listing-btn').onclick = () => {
    root.querySelector('#add-listing-form').style.display = 'block';
  };
  root.querySelector('#cancel-listing-btn').onclick = () => {
    root.querySelector('#add-listing-form').style.display = 'none';
  };

  root.querySelector('#listing-add-form').onsubmit = async e => {
    e.preventDefault();
    const company = root.querySelector('#l-company').value.trim();
    const role    = root.querySelector('#l-role').value.trim();
    const status  = root.querySelector('#l-status').value;
    if (!company || !role) return;
    try {
      await api('POST', '/api/listings', { company, role, status });
      root.querySelector('#add-listing-form').style.display = 'none';
      root.querySelector('#listing-add-form').reset();
      loadListings(root);
    } catch (err) { alert('Failed: ' + err.message); }
  };
}

async function loadListings(root) {
  const tbody = root.querySelector('#listings-tbody');
  try {
    const listings = await api('GET', '/api/listings');
    if (!listings.length) {
      tbody.innerHTML = `<tr><td colspan="6" style="padding:20px;color:var(--muted);text-align:center">No listings yet.</td></tr>`;
      return;
    }
    tbody.innerHTML = listings.map(l => `
      <tr>
        <td class="text-muted text-mono">${escHtml(l.id)}</td>
        <td class="text-muted">${escHtml(l.date)}</td>
        <td><strong>${escHtml(l.company)}</strong></td>
        <td>${escHtml(l.role)}</td>
        <td>${stageBadge(l.status)}</td>
        <td>
          <button class="btn btn-danger btn-sm del-listing" data-id="${escHtml(l.id)}">Delete</button>
        </td>
      </tr>
    `).join('');
    tbody.querySelectorAll('.del-listing').forEach(btn => {
      btn.onclick = async () => {
        if (!confirm('Delete this listing?')) return;
        await api('DELETE', `/api/listings/${btn.dataset.id}`);
        loadListings(root);
      };
    });
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" class="alert alert-error">Failed: ${escHtml(err.message)}</td></tr>`;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const STATUS_CLASS = {
  'Applied':    'badge-applied', 'Interview':  'badge-inter',
  'Offer':      'badge-offer',   'Rejected':   'badge-reject',
  'To Apply':   'badge-new',     'To Email':   'badge-new',
  'Evaluada':   'badge-new',     'Descartada': 'badge-reject',
};
function scoreClass(s) { return s >= 75 ? 'score-high' : s >= 50 ? 'score-mid' : 'score-low'; }
function scoreBadge(s) { return `<span class="score ${scoreClass(s)}">${s}</span>`; }
function stageBadge(status) {
  const cls = STATUS_CLASS[status] || 'badge-default';
  return `<span class="badge ${cls}">${escHtml(status || '—')}</span>`;
}
function escHtml(s) {
  const d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML;
}

