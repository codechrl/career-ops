const BASE = '';

export async function api(method, path, body) {
  const token = localStorage.getItem('token');
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) {
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    window.location.reload();
    throw new Error('unauthorized');
  }
  return res.json();
}

export async function apiForm(method, path, formData) {
  const token = localStorage.getItem('token');
  const headers = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: formData,
  });
  if (res.status === 401) {
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    window.location.reload();
    throw new Error('unauthorized');
  }
  return res.json();
}
