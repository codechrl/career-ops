import { api } from '../api.js';

export function renderScan(root) {
  root.innerHTML = `<h1>Scan</h1>
    <div style="margin-bottom:24px;">
      <button id="linkedin-login">Start LinkedIn Login</button>
      <button id="linkedin-save">Save LinkedIn Session</button>
    </div>
    <form id="scan-form">
      <label><input type="checkbox" name="portal" value="greenhouse" checked> Greenhouse</label>
      <label><input type="checkbox" name="portal" value="ashby" checked> Ashby</label>
      <label><input type="checkbox" name="portal" value="lever" checked> Lever</label>
      <label><input type="checkbox" name="portal" value="linkedin"> LinkedIn</label>
      <button type="submit">Start Scan</button>
    </form>
    <pre id="scan-progress"></pre>`;

  const progress = root.querySelector('#scan-progress');
  const scanForm = root.querySelector('#scan-form');
  const loginButton = root.querySelector('#linkedin-login');
  const saveButton = root.querySelector('#linkedin-save');

  loginButton.onclick = async () => {
    progress.textContent = 'Opening LinkedIn login session...\n';
    try {
      const data = await api('POST', '/api/playwright/start', { portal: 'linkedin' });
      progress.textContent += JSON.stringify(data, null, 2) + '\n';
    } catch (err) {
      progress.textContent += 'Error: ' + err.message + '\n';
    }
  };

  saveButton.onclick = async () => {
    progress.textContent = 'Saving LinkedIn session...\n';
    try {
      const data = await api('POST', '/api/playwright/save', { portal: 'linkedin' });
      progress.textContent += JSON.stringify(data, null, 2) + '\n';
    } catch (err) {
      progress.textContent += 'Error: ' + err.message + '\n';
    }
  };

  scanForm.onsubmit = e => {
    e.preventDefault();
    progress.textContent = 'Starting scan...\n';
    const es = new EventSource('/api/scan');
    es.onmessage = ev => progress.textContent += ev.data + '\n';
    es.addEventListener('end', ev => {
      progress.textContent += '\n' + ev.data + '\n';
      es.close();
    });
  };
}
