const NAV = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'scan', label: 'Scan' },
  { id: 'search', label: 'Search Jobs' },
  { id: 'listings', label: 'My Listings' },
  { id: 'cv', label: 'CV & Profile' },
  { id: 'pipeline', label: 'Pipeline' }
];

export function renderSidebar(root, onNav) {
  root.innerHTML = `
    <nav>
      <ul>
        ${NAV.map(n => `<li><a href="#" data-id="${n.id}">${n.label}</a></li>`).join('')}
      </ul>
    </nav>
  `;
  root.querySelectorAll('a').forEach(a => {
    a.onclick = e => {
      e.preventDefault();
      onNav(a.dataset.id);
    };
  });
}
