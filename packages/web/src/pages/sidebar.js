const NAV = [
  { id: 'dashboard', label: 'Dashboard',    icon: '▦' },
  { id: 'job',       label: 'Job Targeting', icon: '⌖' },
  { id: 'pipeline',  label: 'Pipeline',      icon: '⬡' },
  { id: 'settings',  label: 'Settings',      icon: '⚙' },
];

export function renderSidebar(root, onNav) {
  const user = localStorage.getItem('username') || 'user';
  root.innerHTML = `
    <div class="sidebar-brand">career<span>-ops</span></div>
    <nav>
      <ul>
        ${NAV.map(n => `<li><a href="#" data-id="${n.id}"><span>${n.icon}</span>${n.label}</a></li>`).join('')}
      </ul>
    </nav>
    <div class="sidebar-footer">
      <div class="text-mono" style="font-size:11px">${user}</div>
      <a href="#" id="sidebar-logout" style="font-size:11px;color:var(--muted)">Sign out</a>
    </div>
  `;

  root.querySelectorAll('nav a').forEach(a => {
    a.onclick = e => {
      e.preventDefault();
      root.querySelectorAll('nav a').forEach(x => x.classList.remove('active'));
      a.classList.add('active');
      onNav(a.dataset.id);
    };
  });

  root.querySelector('#sidebar-logout').onclick = e => {
    e.preventDefault();
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    location.reload();
  };

  // set initial active
  root.querySelector('a[data-id="dashboard"]').classList.add('active');
}

export function setActiveSidebarItem(root, id) {
  root.querySelectorAll('nav a').forEach(a => {
    a.classList.toggle('active', a.dataset.id === id);
  });
}
