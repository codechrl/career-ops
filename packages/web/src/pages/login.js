export function renderLogin(root, onLogin) {
  root.innerHTML = `
    <div class="login-wrap">
      <div class="login-box">
        <div class="login-brand">career<span>-ops</span></div>
        <form id="login-form">
          <div class="form-group">
            <label>Username</label>
            <input type="text" id="username" name="username" value="kurniawan" autocomplete="username">
          </div>
          <div class="form-group">
            <label>Password</label>
            <input type="password" id="password" name="password" autocomplete="current-password">
          </div>
          <button type="submit" class="btn btn-primary" style="width:100%;justify-content:center;margin-top:8px">Sign in</button>
        </form>
        <div id="login-error" class="alert alert-error" style="display:none;margin-top:12px"></div>
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
