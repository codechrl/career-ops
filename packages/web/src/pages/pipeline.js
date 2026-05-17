import { api } from '../api.js';

export function renderPipeline(root) {
  root.innerHTML = `
    <div class="page-header">
      <h1>Pipeline</h1>
      <span class="page-sub">Track job URLs before applying</span>
    </div>
    <div class="card" style="margin-bottom:20px">
      <div class="card-title">Add to Pipeline</div>
      <form id="pipeline-add" style="display:grid;grid-template-columns:2fr 1fr 1fr auto;gap:8px;align-items:end">
        <div class="form-group mb-0"><label>Job URL *</label><input type="url" name="url" placeholder="https://company.com/jobs/…" required></div>
        <div class="form-group mb-0"><label>Company</label><input type="text" name="company" placeholder="Acme Corp"></div>
        <div class="form-group mb-0"><label>Role</label><input type="text" name="title" placeholder="Engineer"></div>
        <div class="form-group mb-0"><label>&nbsp;</label><button type="submit" class="btn btn-primary">Add</button></div>
      </form>
    </div>
    <div class="tabs" id="pipeline-tabs">
      <button class="tab-btn active" data-tab="pending">Pending</button>
      <button class="tab-btn" data-tab="processed">Processed</button>
    </div>
    <div class="tab-panel active" id="tab-pending">
      <div id="pipeline-pending"><div class="loading-row"><span class="spinner"></span> Loading…</div></div>
    </div>
    <div class="tab-panel" id="tab-processed">
      <div id="pipeline-processed"><div class="loading-row"><span class="spinner"></span> Loading…</div></div>
    </div>
  `;

  // tabs
  root.querySelectorAll('#pipeline-tabs .tab-btn').forEach(btn => {
    btn.onclick = () => {
      root.querySelectorAll('#pipeline-tabs .tab-btn').forEach(b => b.classList.remove('active'));
      root.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      root.querySelector(`#tab-${btn.dataset.tab}`).classList.add('active');
    };
  });

  const form = root.querySelector('#pipeline-add');
  form.onsubmit = async e => {
    e.preventDefault();
    const url = form.url.value.trim();
    const company = form.company.value.trim();
    const title = form.title.value.trim();
    if (!url) return;
    try {
      await api('POST', '/api/pipeline', { url, company, title });
      form.reset();
      loadPipeline();
    } catch (err) { alert('Error: ' + err.message); }
  };

  function renderList(el, items, emptyMsg) {
    if (!items.length) {
      el.innerHTML = `<p style="color:var(--muted);padding:16px 0;font-size:13px">${emptyMsg}</p>`;
      return;
    }
    el.innerHTML = `<div class="table-wrap"><table class="data-table"><thead><tr><th>URL</th><th>Company</th><th>Role</th></tr></thead><tbody>
      ${items.map(l => {
        const parts = l.replace(/^- \[.\] /, '').split(' | ');
        const [url, company, title] = parts;
        return `<tr><td><a href="${escHtml(url)}" target="_blank" class="text-accent" style="font-size:12px;font-family:var(--mono)">${escHtml(url)}</a></td><td>${escHtml(company || '')}</td><td>${escHtml(title || '')}</td></tr>`;
      }).join('')}
    </tbody></table></div>`;
  }

  async function loadPipeline() {
    try {
      const data = await api('GET', '/api/pipeline');
      renderList(root.querySelector('#pipeline-pending'), data.pending, 'No pending items.');
      renderList(root.querySelector('#pipeline-processed'), data.processed, 'No processed items.');
    } catch (err) {
      root.querySelector('#pipeline-pending').innerHTML = `<div class="alert alert-error">Error: ${escHtml(err.message)}</div>`;
    }
  }

  loadPipeline();
}

function escHtml(s) {
  const d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML;
}
