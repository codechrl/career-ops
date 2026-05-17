import { api } from '../api.js';

export function renderSearch(root) {
  root.innerHTML = `
    <h1>Search Jobs</h1>
    <form id="search-form">
      <label for="description">Describe the job you want:</label><br>
      <textarea id="description" name="description" rows="6" style="width:100%;"></textarea><br>
      <button type="submit">Generate Search Plan</button>
    </form>
    <pre id="search-output"></pre>
  `;

  root.querySelector('#search-form').onsubmit = async e => {
    e.preventDefault();
    const description = root.querySelector('#description').value.trim();
    if (!description) return;
    const output = root.querySelector('#search-output');
    output.textContent = 'Generating search plan...';
    try {
      const data = await api('POST', '/api/search', { description });
      output.textContent = JSON.stringify(data, null, 2);
    } catch (err) {
      output.textContent = 'Error: ' + err.message;
    }
  };
}
