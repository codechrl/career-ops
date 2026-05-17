import { api } from '../api.js';

export function renderListings(root) {
  root.innerHTML = `<h1>My Listings</h1><div id="listings-table">Loading...</div>`;
  api('GET', '/api/listings').then(data => {
    root.querySelector('#listings-table').innerHTML = `
      <table><thead><tr><th>#</th><th>Date</th><th>Company</th><th>Role</th><th>Score</th><th>Status</th></tr></thead><tbody>
      ${data.map(l => `<tr><td>${l.id}</td><td>${l.date}</td><td>${l.company}</td><td>${l.role}</td><td>${l.score}</td><td>${l.status}</td></tr>`).join('')}
      </tbody></table>
    `;
  }).catch(err => {
    root.querySelector('#listings-table').textContent = 'Failed to load: ' + err.message;
  });
}
