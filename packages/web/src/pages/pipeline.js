import { api } from '../api.js';

export function renderPipeline(root) {
  root.innerHTML = `
    <h1>Pipeline</h1>
    <form id="pipeline-add">
      <input type="url" name="url" placeholder="Job URL" required style="width: 100%; margin-bottom: 12px;" />
      <input type="text" name="company" placeholder="Company" style="width: 48%; margin-right: 4%;" />
      <input type="text" name="title" placeholder="Role title" style="width: 48%;" />
      <button type="submit" style="margin-top: 12px;">Add to Pipeline</button>
    </form>
    <div id="pipeline-view">Loading...</div>
  `;

  const view = root.querySelector('#pipeline-view');
  const form = root.querySelector('#pipeline-add');
  form.onsubmit = async e => {
    e.preventDefault();
    const url = form.url.value.trim();
    const company = form.company.value.trim();
    const title = form.title.value.trim();
    if (!url) return;
    try {
      const data = await api('POST', '/api/pipeline', { url, company, title });
      if (data.added) {
        form.reset();
        loadPipeline();
      } else {
        view.textContent = JSON.stringify(data, null, 2);
      }
    } catch (err) {
      view.textContent = 'Error: ' + err.message;
    }
  };

  async function loadPipeline() {
    view.textContent = 'Loading pipeline...';
    try {
      const data = await api('GET', '/api/pipeline');
      view.innerHTML = `
        <h2>Pending</h2>
        <ul>${data.pending.map(l => `<li>${l}</li>`).join('')}</ul>
        <h2>Processed</h2>
        <ul>${data.processed.map(l => `<li>${l}</li>`).join('')}</ul>
      `;
    } catch (err) {
      view.textContent = 'Error: ' + err.message;
    }
  }

  loadPipeline();
}
