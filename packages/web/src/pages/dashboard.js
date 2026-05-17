import { api } from '../api.js';

export function renderDashboard(root) {
  root.innerHTML = `<h1>Dashboard</h1><div id="dashboard-metrics">Loading...</div>`;
  api('GET', '/api/listings').then(data => {
    const total = data.length;
    const byStatus = {};
    data.forEach(l => { byStatus[l.status] = (byStatus[l.status] || 0) + 1; });
    root.querySelector('#dashboard-metrics').innerHTML = `
      <div>Total Applications: <b>${total}</b></div>
      <div>By Status: ${Object.entries(byStatus).map(([k, v]) => `${k}: ${v}`).join(', ')}</div>
    `;
  }).catch(err => {
    root.querySelector('#dashboard-metrics').textContent = 'Failed to load: ' + err.message;
  });
}
