export function renderCV(root) {
  root.innerHTML = `<h1>CV & Profile</h1>
    <form id="cv-upload" enctype="multipart/form-data">
      <input type="file" name="cv" accept=".pdf,.docx,.md,.txt" required>
      <button type="submit">Upload CV</button>
    </form>
    <pre id="cv-result"></pre>`;
  root.querySelector('#cv-upload').onsubmit = async e => {
    e.preventDefault();
    const file = root.querySelector('input[name=cv]').files[0];
    if (!file) return;
    const form = new FormData();
    form.append('cv', file);
    const res = await fetch('/api/cv', { method: 'POST', body: form });
    const data = await res.json();
    root.querySelector('#cv-result').textContent = JSON.stringify(data, null, 2);
  };
}
