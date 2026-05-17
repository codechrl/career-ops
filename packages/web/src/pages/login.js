export function renderLogin(root, onLogin) {
  root.innerHTML = `
    <div style="display:flex;justify-content:center;align-items:center;min-height:100vh;">
      <div style="background:#1e1e2e;padding:40px;border-radius:12px;width:360px;">
        <h1 style="margin:0 0 24px 0;text-align:center;">career-ops</h1>
        <form id="login-form">
          <label for="username">Username</label><br>
          <input type="text" id="username" name="username" value="kurniawan" style="width:100%;margin-bottom:16px;padding:8px;" />
          <label for="password">Password</label><br>
          <input type="password" id="password" name="password" style="width:100%;margin-bottom:24px;padding:8px;" />
          <button type="submit" style="width:100%;padding:10px;background:#89b4fa;border:none;font-weight:600;cursor:pointer;">Login</button>
        </form>
        <div id="login-error" style="color:#f38ba8;margin-top:12px;text-align:center;"></div>
      </div>
    </div>
  `;

  root.querySelector('#login-form').onsubmit = async e => {
    e.preventDefault();
    const username = root.querySelector('#username').value;
    const password = root.querySelector('#password').value;
    const error = root.querySelector('#login-error');
    error.textContent = '';

    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();
    if (data.token) {
      localStorage.setItem('token', data.token);
      localStorage.setItem('username', data.username);
      onLogin(data.token);
    } else {
      error.textContent = data.error || 'Login failed';
    }
  };
}
