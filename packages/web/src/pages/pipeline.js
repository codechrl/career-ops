import { api } from '../api.js';

export function renderPipeline(root) {
  root.innerHTML = `
    <div class="page-header" style="display:flex;align-items:center;justify-content:space-between">
      <div>
        <h1>Pipeline</h1>
        <span class="page-sub">Automated job scan &amp; monitoring</span>
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-secondary" id="catalog-refresh-toggle">&#9654; Refresh Portals</button>
        <button class="btn btn-primary" id="scan-toggle">&#9654; Start Scan</button>
      </div>
    </div>

    <!-- Scan config panel -->
    <div class="card mb-24" id="scan-panel" style="display:none">
      <div class="card-title">Scan Configuration</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:14px">
        <div class="form-group mb-0">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
            <label style="margin:0">Job Targets <span class="text-muted">(unchecked = all active)</span></label>
            <span style="display:flex;gap:4px">
              <button type="button" class="btn btn-secondary btn-sm" id="targets-all">All</button>
              <button type="button" class="btn btn-secondary btn-sm" id="targets-none">None</button>
            </span>
          </div>
          <div id="scan-targets" style="border:1px solid var(--border);border-radius:6px;padding:8px;min-height:72px;max-height:140px;overflow-y:auto;font-size:13px">
            <span class="text-muted" style="font-size:12px">Loading…</span>
          </div>
        </div>
        <div class="form-group mb-0">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
            <label style="margin:0">Portals <span class="text-muted">(unchecked = all enabled)</span></label>
            <span style="display:flex;gap:4px">
              <button type="button" class="btn btn-secondary btn-sm" id="portals-all">All</button>
              <button type="button" class="btn btn-secondary btn-sm" id="portals-none">None</button>
            </span>
          </div>
          <div id="scan-portals" style="border:1px solid var(--border);border-radius:6px;padding:8px;min-height:72px;max-height:140px;overflow-y:auto;font-size:13px">
            <span class="text-muted" style="font-size:12px">Loading…</span>
          </div>
        </div>
      </div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <button class="btn btn-primary" id="scan-run-btn">&#9654; Run Scan</button>
        <button class="btn btn-danger btn-sm" id="scan-cancel-btn" style="display:none">&#9632; Cancel</button>
        <span id="scan-status" class="text-muted" style="font-size:13px"></span>
      </div>
    </div>

    <!-- Inline schedule bar -->
    <div class="card mb-24" id="schedule-bar">
      <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
        <span style="font-size:13px;font-weight:600;color:var(--muted)">Auto-schedule:</span>
        <label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer">
          <input type="checkbox" id="sched-enabled"> Enable
        </label>
        <select id="sched-mode" style="font-size:13px;padding:4px 8px;border-radius:4px;border:1px solid var(--border);background:var(--surface);color:var(--fg)">
          <option value="interval">Every</option>
          <option value="cron">Cron</option>
        </select>
        <input type="text" id="sched-value" placeholder="60m" style="width:120px;font-size:13px;padding:4px 8px;border-radius:4px;border:1px solid var(--border);background:var(--surface);color:var(--fg)">
        <button class="btn btn-secondary btn-sm" id="sched-save">Save</button>
        <span id="sched-msg" style="font-size:12px;color:var(--muted)"></span>
      </div>
    </div>

    <!-- Tabs -->
    <div class="tabs" style="margin-bottom:16px">
      <button class="tab-btn active" data-ptab="scan-runs">Scan Runs</button>
      <button class="tab-btn" data-ptab="catalog-runs">Portal Runs</button>
    </div>

    <!-- Scan Runs -->
    <div id="panel-scan-runs">
      <div id="scan-runs-list"><div class="loading-row"><span class="spinner"></span> Loading…</div></div>
    </div>

    <!-- Catalog Refresh Runs -->
    <div id="panel-catalog-runs" style="display:none">
      <div id="catalog-runs-list"><div class="loading-row"><span class="spinner"></span> Loading…</div></div>
    </div>
  `;

  // ── Tab switching ─────────────────────────────────────────────────────────
  root.querySelectorAll('[data-ptab]').forEach(btn => {
    btn.onclick = () => {
      root.querySelectorAll('[data-ptab]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      root.querySelector('#panel-scan-runs').style.display = btn.dataset.ptab === 'scan-runs' ? '' : 'none';
      root.querySelector('#panel-catalog-runs').style.display = btn.dataset.ptab === 'catalog-runs' ? '' : 'none';
      if (btn.dataset.ptab === 'catalog-runs') loadCatalogRuns();
      if (btn.dataset.ptab === 'scan-runs') loadScanRuns();
    };
  });

  // ── Scan panel ────────────────────────────────────────────────────────────
  root.querySelector('#scan-toggle').onclick = () => {
    const panel = root.querySelector('#scan-panel');
    const open = panel.style.display !== 'none';
    panel.style.display = open ? 'none' : '';
    if (!open) loadScanOptions();
  };

  // ── Catalog refresh trigger ───────────────────────────────────────────────
  root.querySelector('#catalog-refresh-toggle').onclick = async () => {
    const btn = root.querySelector('#catalog-refresh-toggle');
    btn.disabled = true;
    btn.textContent = 'Refreshing…';
    try {
      const r = await api('POST', '/api/portals/catalog/refresh', {});
      // Switch to Portal Runs tab and reload
      root.querySelectorAll('[data-ptab]').forEach(b => b.classList.remove('active'));
      root.querySelector('[data-ptab="catalog-runs"]').classList.add('active');
      root.querySelector('#panel-scan-runs').style.display = 'none';
      root.querySelector('#panel-catalog-runs').style.display = '';
      loadCatalogRuns();
      setTimeout(loadCatalogRuns, 3000);
    } catch (err) {
      alert('Refresh failed: ' + err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = '▶ Refresh Portals';
    }
  };

  async function loadScanOptions() {
    const [targets, portals] = await Promise.all([
      api('GET', '/api/job-target').catch(() => []),
      api('GET', '/api/portals').catch(() => []),
    ]);
    const activeTargets = Array.isArray(targets) ? targets.filter(t => t.is_active) : [];
    // Show ALL enabled portals — workflow handles unsupported ones gracefully
    const enabledPortals = Array.isArray(portals) ? portals.filter(p => p.enabled) : [];

    root.querySelector('#scan-targets').innerHTML = activeTargets.length
      ? activeTargets.map(t => `
          <label style="display:flex;gap:6px;align-items:center;padding:3px 0;cursor:pointer">
            <input type="checkbox" class="scan-target-cb" value="${t.id}" checked>
            <span>${escHtml(t.target_role)}</span>
          </label>`).join('')
      : '<span class="text-muted" style="font-size:12px">No active targets — activate one in Job Targeting.</span>';

    root.querySelector('#scan-portals').innerHTML = enabledPortals.length
      ? enabledPortals.map(p => `
          <label style="display:flex;gap:6px;align-items:center;padding:3px 0;cursor:pointer">
            <input type="checkbox" class="scan-portal-cb" value="${p.id}" checked>
            <span>${escHtml(p.name)}</span>
          </label>`).join('')
      : '<span class="text-muted" style="font-size:12px">No portals found.</span>';

    root.querySelector('#targets-all').onclick  = () => root.querySelectorAll('.scan-target-cb').forEach(c => c.checked = true);
    root.querySelector('#targets-none').onclick = () => root.querySelectorAll('.scan-target-cb').forEach(c => c.checked = false);
    root.querySelector('#portals-all').onclick  = () => root.querySelectorAll('.scan-portal-cb').forEach(c => c.checked = true);
    root.querySelector('#portals-none').onclick = () => root.querySelectorAll('.scan-portal-cb').forEach(c => c.checked = false);
  }

  // ── Run scan ──────────────────────────────────────────────────────────────
  let sseAbort = null;
  const runBtn    = root.querySelector('#scan-run-btn');
  const cancelBtn = root.querySelector('#scan-cancel-btn');
  const statusEl  = root.querySelector('#scan-status');

  runBtn.onclick = () => {
    const targetIds = [...root.querySelectorAll('.scan-target-cb:checked')].map(el => +el.value);
    const portalIds = [...root.querySelectorAll('.scan-portal-cb:checked')].map(el => +el.value);
    const useBrowser = false;
    runBtn.disabled = true;
    cancelBtn.style.display = 'inline-flex';
    statusEl.textContent = 'Starting…';

    (async () => {
      let runId;
      try {
        // 1. Start scan in background — returns immediately with runId
        const start = await fetch('/api/scan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json',
                     'Authorization': `Bearer ${localStorage.getItem('token')}` },
          body: JSON.stringify({ targetIds, portalIds, useBrowser }),
        });
        if (!start.ok) {
          appendLog({ type: 'error', agent: 'scan', message: `HTTP ${start.status}: ${await start.text()}` });
          return;
        }
        const { runId: id } = await start.json();
        runId = id;
        statusEl.textContent = `Scan #${runId} running in background…`;
        statusEl.textContent = `Scan #${runId} running…`;

        // Store cancel reference
        cancelBtn.dataset.runId = runId;

        // 2. Subscribe to per-run SSE stream
        sseAbort = new AbortController();
        const resp = await fetch(`/api/scan/runs/${runId}/stream`, {
          headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` },
          signal: sseAbort.signal,
        });
        const reader = resp.body.getReader();
        const dec = new TextDecoder();
        let buf = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          const lines = buf.split('\n');
          buf = lines.pop();
          for (const line of lines) {
            if (line.startsWith('event: end')) { /* stream done */ break; }
            if (!line.startsWith('data:')) continue;
            try {
              const ev = JSON.parse(line.slice(5).trim());
              if (ev.type === 'progress') statusEl.textContent = ev.message || '';
              if (ev.type === 'done')      statusEl.textContent = `Done — ${ev.message}`;
              if (ev.type === 'error')     statusEl.textContent = `Error: ${ev.message}`;
              if (ev.type === 'cancelled') statusEl.textContent = 'Cancelled.';
            } catch {}
          }
        }
      } catch (err) {
        if (err.name !== 'AbortError') statusEl.textContent = `Error: ${err.message}`;
      } finally {
        runBtn.disabled = false;
        cancelBtn.style.display = 'none';
        sseAbort = null;
        loadScanRuns();
      }
    })();
  };

  cancelBtn.onclick = async () => {
    const runId = cancelBtn.dataset.runId;
    if (runId) {
      await fetch(`/api/scan/runs/${runId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` },
      }).catch(() => {});
    }
    if (sseAbort) sseAbort.abort();
  };



  // ── Schedule bar ──────────────────────────────────────────────────────────
  (async () => {
    try {
      const cfg = await api('GET', '/api/scan-schedule');
      root.querySelector('#sched-enabled').checked = !!cfg.enabled;
      root.querySelector('#sched-mode').value  = cfg.mode  || 'interval';
      root.querySelector('#sched-value').value = cfg.value || '60m';
    } catch {}
  })();

  root.querySelector('#sched-save').onclick = async () => {
    const cfg = {
      enabled: root.querySelector('#sched-enabled').checked,
      mode:    root.querySelector('#sched-mode').value,
      value:   root.querySelector('#sched-value').value.trim() || '60m',
    };
    const msgEl = root.querySelector('#sched-msg');
    try {
      await api('PUT', '/api/scan-schedule', cfg);
      msgEl.textContent = cfg.enabled ? `Saved — runs every ${cfg.value}` : 'Disabled.';
      msgEl.style.color = 'var(--success,#00c896)';
      setTimeout(() => { msgEl.textContent = ''; }, 3000);
    } catch (err) {
      msgEl.textContent = err.message;
      msgEl.style.color = 'var(--danger,#ff4f6d)';
    }
  };

  // ── Scan runs table ───────────────────────────────────────────────────────
  async function loadScanRuns() {
    const el = root.querySelector('#scan-runs-list');
    try {
      const runs = await api('GET', '/api/scan/runs');
      if (!runs.length) {
        el.innerHTML = `<p style="color:var(--muted);padding:16px 0;font-size:13px">No scan runs yet. Start a scan to see results here.</p>`;
        return;
      }
      el.innerHTML = `
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr>
              <th>#</th><th>Started</th><th>Trigger</th><th>New</th><th>Skip</th><th>Err</th><th>Status</th><th></th>
            </tr></thead>
            <tbody>${runs.map(r => `
              <tr>
                <td style="font-size:11px;color:var(--muted)">#${r.id}</td>
                <td style="font-size:12px">${fmtDate(r.started_at)}</td>
                <td><span class="badge badge-new">${escHtml(r.trigger)}</span></td>
                <td style="color:var(--success,#0c6);font-weight:600">${r.new_count}</td>
                <td style="color:var(--muted)">${r.skipped_count}</td>
                <td style="color:${r.error_count ? '#ff4f6d' : 'var(--muted)'}">${r.error_count}</td>
                <td>${statusBadge(r.status)}</td>
                <td>${r.log ? `<button class="btn btn-secondary btn-sm run-log-btn" data-id="${r.id}">Log</button>` : ''}${r.status === 'running' ? ` <button class="btn btn-danger btn-sm run-cancel-btn" data-id="${r.id}">Stop</button>` : ''}</td>
              </tr>
              <tr class="run-log-row" id="runlog-${r.id}" style="display:none">
                <td colspan="8">
                  <pre style="background:var(--surface2,#111);padding:10px;border-radius:4px;font-size:11px;white-space:pre-wrap;max-height:200px;overflow-y:auto">${escHtml(r.log || '')}</pre>
                </td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>`;

      el.querySelectorAll('.run-log-btn').forEach(btn => {
        btn.onclick = () => {
          const row = root.querySelector(`#runlog-${btn.dataset.id}`);
          row.style.display = row.style.display === 'none' ? '' : 'none';
        };
      });
      el.querySelectorAll('.run-cancel-btn').forEach(btn => {
        btn.onclick = async () => {
          btn.disabled = true;
          await fetch(`/api/scan/runs/${btn.dataset.id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` },
          }).catch(() => {});
          setTimeout(loadScanRuns, 800);
        };
      });
    } catch (err) {
      el.innerHTML = `<div class="alert alert-error">Error: ${escHtml(err.message)}</div>`;
    }
  }

  loadScanRuns();

  // ── Catalog Refresh Runs ─────────────────────────────────────────────────
  async function loadCatalogRuns() {
    const el = root.querySelector('#catalog-runs-list');
    try {
      const runs = await api('GET', '/api/portals/catalog/runs');
      if (!runs.length) {
        el.innerHTML = `<p style="color:var(--muted);padding:16px 0;font-size:13px">No catalog refresh runs yet.</p>`;
        return;
      }
      el.innerHTML = `
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr>
              <th>#</th><th>Started</th><th>Trigger</th><th>OK</th><th>Failing</th><th>Total</th><th>Status</th><th></th>
            </tr></thead>
            <tbody>${runs.map(r => `
              <tr>
                <td style="font-size:11px;color:var(--muted)">#${r.id}</td>
                <td style="font-size:12px">${fmtDate(r.started_at)}</td>
                <td><span class="badge badge-new">${escHtml(r.trigger)}</span></td>
                <td style="color:var(--success,#0c6);font-weight:600">${r.ok_count}</td>
                <td style="color:${r.failing_count ? '#ff4f6d' : 'var(--muted)'}">${r.failing_count}</td>
                <td style="color:var(--muted)">${r.total_count}</td>
                <td>${statusBadge(r.status)}</td>
                <td>${r.log ? `<button class="btn btn-secondary btn-sm crun-log-btn" data-id="${r.id}">Log</button>` : ''}${r.status === 'running' ? ` <button class="btn btn-danger btn-sm crun-cancel-btn" data-id="${r.id}">&#9632; Cancel</button>` : ''}</td>
              </tr>
              <tr class="run-log-row" id="crunlog-${r.id}" style="display:none">
                <td colspan="8">
                  <pre style="background:var(--surface2,#111);padding:10px;border-radius:4px;font-size:11px;white-space:pre-wrap;max-height:200px;overflow-y:auto">${escHtml(r.log || '')}</pre>
                </td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>`;

      el.querySelectorAll('.crun-log-btn').forEach(btn => {
        btn.onclick = () => {
          const row = root.querySelector(`#crunlog-${btn.dataset.id}`);
          row.style.display = row.style.display === 'none' ? '' : 'none';
        };
      });

      el.querySelectorAll('.crun-cancel-btn').forEach(btn => {
        btn.onclick = async () => {
          btn.disabled = true;
          btn.textContent = 'Cancelling…';
          try {
            await api('POST', `/api/portals/catalog/runs/${btn.dataset.id}/cancel`);
            setTimeout(loadCatalogRuns, 1500);
          } catch (err) {
            btn.disabled = false;
            btn.textContent = '■ Cancel';
            alert('Cancel failed: ' + err.message);
          }
        };
      });
    } catch (err) {
      el.innerHTML = `<div class="alert alert-error">Error: ${escHtml(err.message)}</div>`;
    }
  }
}

function statusBadge(s) {
  const cls = { done: 'badge-applied', running: 'badge-inter', failed: 'badge-reject',
    cancelled: 'badge-reject', queued: 'badge-new' }[s] || 'badge-new';
  return `<span class="badge ${cls}">${escHtml(s)}</span>`;
}
function fmtDate(iso) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' }); } catch { return iso; }
}
function escHtml(s) {
  const d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML;
}
