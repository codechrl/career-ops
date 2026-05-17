import { api } from '../api.js';

const PROVIDERS = [
  { id: 'deepseek',   label: 'DeepSeek',        url: 'https://platform.deepseek.com/api_keys' },
  { id: 'openrouter', label: 'OpenRouter',       url: 'https://openrouter.ai/keys' },
  { id: 'gemini',     label: 'Google Gemini',    url: 'https://aistudio.google.com/apikey' },
  { id: 'openai',     label: 'OpenAI',           url: 'https://platform.openai.com/api-keys' },
  { id: 'anthropic',  label: 'Anthropic Claude', url: 'https://console.anthropic.com/settings/keys' },
];
const PROVIDER_LABELS = Object.fromEntries(PROVIDERS.map(p => [p.id, p.label]));
const PROVIDER_URLS   = Object.fromEntries(PROVIDERS.map(p => [p.id, p.url]));

const PROCESS_DEFS = [
  { key: 'cv',               label: 'CV Processing',        desc: 'CV upload, analysis, and job ranking' },
  { key: 'scan',             label: 'Scan Agents',          desc: 'Portal scanning, job evaluation, and search' },
  { key: 'portal-discovery', label: 'Portal Discovery',     desc: 'LLM-based auto-detection of portal search methods (catalog refresh)' },
];

function providerSelect(idSuffix, selectedId = 'deepseek') {
  return `<select id="provider-${idSuffix}">
    ${PROVIDERS.map(p => `<option value="${p.id}"${p.id === selectedId ? ' selected' : ''}>${p.label}</option>`).join('')}
  </select>`;
}

export function renderSettings(root) {
  root.innerHTML = `
    <div class="page-header">
      <h1>Settings</h1>
      <span class="page-sub">LLM configuration &amp; API keys</span>
    </div>

    <div class="tabs" style="margin-bottom:24px">
      <button class="tab-btn active" data-tab="provider-model">Provider &amp; Model</button>
      <button class="tab-btn" data-tab="api-keys">API Keys</button>
    </div>

    <div class="tab-pane" id="tab-provider-model">
      <p class="text-muted" style="font-size:13px;margin-bottom:20px">
        Configure which provider and model to use per process. The API key for the selected provider must be saved in the API Keys tab.
      </p>
      ${PROCESS_DEFS.map(proc => `
        <div class="card mb-24" id="card-${proc.key}">
          <div class="card-title">${proc.label}</div>
          <p class="text-muted" style="font-size:12px;margin-bottom:14px">${proc.desc}</p>
          <form id="form-${proc.key}" style="display:grid;grid-template-columns:1fr 2fr auto;gap:10px;align-items:end">
            <div class="form-group mb-0">
              <label>Provider</label>
              ${providerSelect(proc.key)}
            </div>
            <div class="form-group mb-0">
              <label>Model <span class="text-muted" style="font-size:11px">(type or select)</span></label>
              <input type="text" id="model-${proc.key}" list="models-${proc.key}" placeholder="Loading…" autocomplete="off">
              <datalist id="models-${proc.key}"></datalist>
            </div>
            <div class="form-group mb-0">
              <label>&nbsp;</label>
              <button type="submit" class="btn btn-primary">Save</button>
            </div>
          </form>
          <div id="msg-${proc.key}" class="alert" style="display:none;margin-top:12px"></div>
        </div>
      `).join('')}
    </div>

    <div class="tab-pane" id="tab-api-keys" style="display:none">
      <div id="settings-keys-list">
        <div class="loading-row"><span class="spinner"></span> Loading keys…</div>
      </div>
      <div class="card mt-24">
        <div class="card-title">Add / Update Key</div>
        <form id="settings-key-form">
          <div style="display:grid;grid-template-columns:1fr 2fr auto;gap:10px;align-items:end">
            <div class="form-group mb-0">
              <label>Provider</label>
              <select id="settings-provider">
                ${PROVIDERS.map(p => `<option value="${p.id}">${p.label}</option>`).join('')}
              </select>
            </div>
            <div class="form-group mb-0">
              <label>API Key</label>
              <input type="password" id="settings-api-key" placeholder="sk-… or paste key here" autocomplete="off">
            </div>
            <div class="form-group mb-0">
              <label>&nbsp;</label>
              <div style="display:flex;gap:8px">
                <button type="submit" class="btn btn-primary">Save</button>
                <button type="button" class="btn btn-secondary" id="settings-cancel-edit" style="display:none">Cancel</button>
              </div>
            </div>
          </div>
          <div id="settings-provider-hint" style="margin-top:8px;font-size:12px;color:var(--muted)"></div>
        </form>
      </div>
      <div id="settings-message" class="alert" style="display:none;margin-top:12px"></div>
    </div>
  `;

  bindTabs(root);
  initProviderModelTab(root);
  loadKeys(root);
  bindKeyForm(root);
}

function bindTabs(root) {
  root.querySelectorAll('.tab-btn').forEach(btn => {
    btn.onclick = () => {
      root.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      root.querySelectorAll('.tab-pane').forEach(p => { p.style.display = 'none'; });
      btn.classList.add('active');
      root.querySelector(`#tab-${btn.dataset.tab}`).style.display = '';
    };
  });
}

const modelCache = {};

async function fetchModels(provider, datalistEl, inputEl) {
  if (modelCache[provider]) {
    populateDatalist(datalistEl, modelCache[provider]);
    return;
  }
  inputEl.placeholder = 'Fetching models…';
  try {
    const { models } = await api('GET', `/api/llm-config/models/${provider}`);
    modelCache[provider] = models || [];
    populateDatalist(datalistEl, modelCache[provider]);
  } catch {
    modelCache[provider] = [];
  }
  inputEl.placeholder = 'Type or select model…';
}

function populateDatalist(datalistEl, models) {
  datalistEl.innerHTML = models.map(m => `<option value="${m}">`).join('');
}

async function initProviderModelTab(root) {
  let configs = { cv: { provider: 'deepseek', model: '' }, scan: { provider: 'deepseek', model: '' }, 'portal-discovery': { provider: 'deepseek', model: '' } };
  try {
    configs = await api('GET', '/api/llm-config');
  } catch {}

  for (const proc of PROCESS_DEFS) {
    const cfg = configs[proc.key] || { provider: 'deepseek', model: '' };
    const providerEl = root.querySelector(`#provider-${proc.key}`);
    const modelEl    = root.querySelector(`#model-${proc.key}`);
    const listEl     = root.querySelector(`#models-${proc.key}`);
    const formEl     = root.querySelector(`#form-${proc.key}`);
    const msgEl      = root.querySelector(`#msg-${proc.key}`);

    providerEl.value = cfg.provider || 'deepseek';
    modelEl.value    = cfg.model || '';

    // Fetch models for current provider
    fetchModels(providerEl.value, listEl, modelEl);

    // Re-fetch when provider changes
    providerEl.onchange = () => {
      modelEl.value = '';
      fetchModels(providerEl.value, listEl, modelEl);
    };

    formEl.onsubmit = async e => {
      e.preventDefault();
      const provider = providerEl.value;
      const model    = modelEl.value.trim();
      try {
        await api('PUT', `/api/llm-config/${proc.key}`, { provider, model });
        msgEl.className = 'alert alert-success';
        msgEl.textContent = `Saved: ${PROVIDER_LABELS[provider] || provider}${model ? ` — ${model}` : ''}`;
        msgEl.style.display = 'block';
        setTimeout(() => { msgEl.style.display = 'none'; }, 4000);
      } catch (err) {
        msgEl.className = 'alert alert-error';
        msgEl.textContent = err.message;
        msgEl.style.display = 'block';
      }
    };
  }
}

async function loadKeys(root) {
  const listEl = root.querySelector('#settings-keys-list');
  try {
    const keys = await api('GET', '/api/llm-keys');
    if (!keys.length) {
      listEl.innerHTML = `<div class="alert alert-info">No API keys configured yet. Add one in the form below to enable AI features.</div>`;
      return;
    }
    listEl.innerHTML = `
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>Provider</th><th>Key</th><th>Updated</th><th></th></tr></thead>
          <tbody>
            ${keys.map(k => `
              <tr>
                <td><strong>${PROVIDER_LABELS[k.provider] || k.provider}</strong></td>
                <td class="text-mono" style="font-size:12px;color:var(--muted)">${maskKey(k.api_key)}</td>
                <td class="text-muted" style="font-size:12px">${new Date(k.updated_at).toLocaleString()}</td>
                <td style="white-space:nowrap">
                  <button class="btn btn-secondary btn-sm settings-edit-btn" data-provider="${k.provider}" data-key="${k.api_key}" style="margin-right:4px">Edit</button>
                  <button class="btn btn-danger btn-sm settings-delete-btn" data-provider="${k.provider}">Delete</button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;

    listEl.querySelectorAll('.settings-edit-btn').forEach(btn => {
      btn.onclick = () => {
        root.querySelector('#settings-provider').value = btn.dataset.provider;
        root.querySelector('#settings-api-key').value = btn.dataset.key;
        root.querySelector('#settings-cancel-edit').style.display = 'inline-flex';
        updateProviderHint(root);
      };
    });
    listEl.querySelectorAll('.settings-delete-btn').forEach(btn => {
      btn.onclick = async () => {
        if (!confirm(`Delete key for ${PROVIDER_LABELS[btn.dataset.provider] || btn.dataset.provider}?`)) return;
        await api('DELETE', `/api/llm-keys/${btn.dataset.provider}`);
        showMsg(root, 'Key deleted.', 'success');
        loadKeys(root);
      };
    });
  } catch (err) {
    listEl.innerHTML = `<div class="alert alert-error">Failed to load: ${err.message}</div>`;
  }
}

function bindKeyForm(root) {
  root.querySelector('#settings-provider').onchange = () => updateProviderHint(root);
  updateProviderHint(root);

  root.querySelector('#settings-key-form').onsubmit = async e => {
    e.preventDefault();
    const provider = root.querySelector('#settings-provider').value;
    const apiKey   = root.querySelector('#settings-api-key').value.trim();
    if (!apiKey) { showMsg(root, 'API key is required.', 'error'); return; }
    await api('PUT', `/api/llm-keys/${provider}`, { api_key: apiKey });
    showMsg(root, `Key saved for ${PROVIDER_LABELS[provider] || provider}.`, 'success');
    root.querySelector('#settings-api-key').value = '';
    root.querySelector('#settings-cancel-edit').style.display = 'none';
    // Invalidate model cache for this provider so re-fetch happens
    delete modelCache[provider];
    loadKeys(root);
  };

  root.querySelector('#settings-cancel-edit').onclick = () => {
    root.querySelector('#settings-api-key').value = '';
    root.querySelector('#settings-cancel-edit').style.display = 'none';
  };
}

function updateProviderHint(root) {
  const p = root.querySelector('#settings-provider').value;
  const url = PROVIDER_URLS[p];
  root.querySelector('#settings-provider-hint').innerHTML = url
    ? `Get API key at <a href="${url}" target="_blank" rel="noopener">${url}</a>`
    : '';
}

function maskKey(key) {
  if (!key || key.length < 8) return '••••';
  return key.slice(0, 4) + '••••••••' + key.slice(-4);
}

function showMsg(root, msg, type) {
  const el = root.querySelector('#settings-message');
  el.className = `alert alert-${type === 'success' ? 'success' : 'error'}`;
  el.textContent = msg;
  el.style.display = 'block';
  setTimeout(() => { el.style.display = 'none'; }, 5000);
}

