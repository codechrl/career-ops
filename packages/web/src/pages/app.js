import { renderLogin } from './login.js';
import { renderSidebar } from './sidebar.js';
import { renderDashboard } from './dashboard.js';
import { renderJob } from './job.js';
import { renderPipeline } from './pipeline.js';
import { renderSettings } from './settings.js';
import { api } from '../api.js';

export function renderApp(root) {
  const token = localStorage.getItem('token');

  async function checkAuth(t) {
    if (!t) return false;
    try {
      const res = await api('GET', '/api/auth/verify');
      return res.valid === true;
    } catch {
      return false;
    }
  }

  checkAuth(token).then(valid => {
    if (valid) {
      renderMainApp(root);
    } else {
      localStorage.removeItem('token');
      localStorage.removeItem('username');
      renderLogin(root, () => renderMainApp(root));
    }
  });
}

function renderMainApp(root) {
  root.innerHTML = `
    <div class="layout">
      <aside id="sidebar"></aside>
      <main id="main"></main>
    </div>
  `;
  renderSidebar(document.getElementById('sidebar'), onNav);
  renderDashboard(document.getElementById('main'));

  function onNav(page) {
    if (page === 'dashboard') renderDashboard(document.getElementById('main'));
    else if (page === 'job') renderJob(document.getElementById('main'));
    else if (page === 'pipeline') renderPipeline(document.getElementById('main'));
    else if (page === 'settings') renderSettings(document.getElementById('main'));
  }
}
