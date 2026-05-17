let cvState = { cvText: '', summary: '', keywords: '' };

export function renderCV(root) {
  root.innerHTML = `
    <h1>CV & Job Targeting</h1>
    <div id="cv-step-1">
      <h2>Step 1: Upload or paste your CV</h2>
      <form id="cv-upload-form" enctype="multipart/form-data">
        <input type="file" name="cv" accept=".pdf,.docx,.md,.txt" required>
        <button type="submit">Upload & Analyze</button>
      </form>
      <p style="margin:8px 0"><strong>Or paste your CV text:</strong></p>
      <textarea id="cv-paste" rows="10" style="width:100%;box-sizing:border-box" placeholder="Paste your CV text here..."></textarea>
      <button id="cv-analyze-btn" style="margin-top:8px">Analyze Pasted CV</button>
      <div id="cv-spinner" style="display:none;margin-top:12px">Analyzing CV...</div>
    </div>

    <div id="cv-step-2" style="display:none">
      <h2>Step 2: CV Summary & Keywords</h2>
      <div id="cv-summary-display"></div>
      <div id="cv-keywords-display" style="margin-top:8px"></div>
      <button id="cv-to-evaluate" style="margin-top:16px">Continue to Job Targeting</button>
    </div>

    <div id="cv-step-3" style="display:none">
      <h2>Step 3: What are you looking for?</h2>
      <form id="cv-preferences-form">
        <div style="margin-bottom:8px">
          <label><strong>Target Role *</strong><br>
            <input type="text" id="cv-target-role" style="width:100%;box-sizing:border-box" placeholder="e.g. Senior Software Engineer">
          </label>
        </div>
        <div style="margin-bottom:8px">
          <label><strong>Industries</strong><br>
            <input type="text" id="cv-industries" style="width:100%;box-sizing:border-box" placeholder="e.g. Fintech, SaaS, AI (optional)">
          </label>
        </div>
        <div style="margin-bottom:8px">
          <label><strong>Target Location</strong><br>
            <input type="text" id="cv-location" style="width:100%;box-sizing:border-box" placeholder="e.g. Remote, Jakarta, New York (optional)">
          </label>
        </div>
        <div style="margin-bottom:8px">
          <label><strong>Additional Preferences</strong><br>
            <textarea id="cv-preferences" rows="3" style="width:100%;box-sizing:border-box" placeholder="e.g. Salary range, company size, culture, tech stack (optional)"></textarea>
          </label>
        </div>
        <button type="submit">Rank My Listings</button>
      </form>
      <div id="cv-eval-spinner" style="display:none;margin-top:12px">Ranking listings against your criteria...</div>
    </div>

    <div id="cv-step-4" style="display:none">
      <h2>Step 4: Matched Listings</h2>
      <p>Target: <strong id="cv-results-target-role"></strong></p>
      <div id="cv-results-table" style="margin-top:16px"></div>
      <div style="margin-top:16px">
        <button id="cv-to-dashboard">View on Dashboard</button>
        <button id="cv-reset-btn" style="margin-left:8px">Start Over</button>
      </div>
    </div>

    <div id="cv-error" style="color:red;display:none;margin-top:12px"></div>
  `;

  bindEvents(root);
}

function bindEvents(root) {
  root.querySelector('#cv-upload-form').onsubmit = async e => {
    e.preventDefault();
    const file = root.querySelector('input[name=cv]').files[0];
    if (!file) return;
    const form = new FormData();
    form.append('cv', file);
    root.querySelector('#cv-spinner').style.display = 'block';
    try {
      const res = await fetch('/api/cv', { method: 'POST', body: form });
      const data = await res.json();
      if (data.parsed && data.parsedPath) {
        const textRes = await fetch(data.parsedPath);
        cvState.cvText = await textRes.text();
      } else {
        showError(root, 'Could not parse CV file. Try pasting text instead.');
        root.querySelector('#cv-spinner').style.display = 'none';
        return;
      }
      await analyzeCV(root);
    } catch (err) {
      showError(root, 'Upload failed: ' + err.message);
      root.querySelector('#cv-spinner').style.display = 'none';
    }
  };

  root.querySelector('#cv-analyze-btn').onclick = async () => {
    const text = root.querySelector('#cv-paste').value.trim();
    if (!text) { showError(root, 'Please paste your CV text first.'); return; }
    cvState.cvText = text;
    root.querySelector('#cv-spinner').style.display = 'block';
    await analyzeCV(root);
  };

  root.querySelector('#cv-to-evaluate').onclick = () => {
    showStep(root, 3);
  };

  root.querySelector('#cv-preferences-form').onsubmit = async e => {
    e.preventDefault();
    const targetRole = root.querySelector('#cv-target-role').value.trim();
    if (!targetRole) { showError(root, 'Target role is required.'); return; }
    root.querySelector('#cv-eval-spinner').style.display = 'block';
    await rankListings(root, targetRole);
  };

  root.querySelector('#cv-to-dashboard').onclick = () => {
    const link = document.querySelector('a[data-id="dashboard"]');
    if (link) link.click();
  };

  root.querySelector('#cv-reset-btn').onclick = () => {
    cvState = { cvText: '', summary: '', keywords: '' };
    showStep(root, 1);
  };
}

async function analyzeCV(root) {
  try {
    const res = await fetch('/api/cv-summary/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cvText: cvState.cvText }),
    });
    const data = await res.json();
    if (!data.success) { showError(root, data.error || 'Analysis failed.'); return; }
    cvState.summary = data.summary;
    cvState.keywords = data.keywords;
    root.querySelector('#cv-summary-display').innerHTML =
      `<strong>Summary:</strong><p>${data.summary}</p>`;
    root.querySelector('#cv-keywords-display').innerHTML =
      `<strong>Keywords:</strong> ${data.keywords}`;
    showStep(root, 2);
  } catch (err) {
    showError(root, 'Analysis failed: ' + err.message);
  } finally {
    root.querySelector('#cv-spinner').style.display = 'none';
  }
}

async function rankListings(root, targetRole) {
  try {
    const res = await fetch('/api/cv-summary/rank', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cvSummary: cvState.summary,
        cvKeywords: cvState.keywords,
        targetRole,
        industries: root.querySelector('#cv-industries').value.trim(),
        targetLocation: root.querySelector('#cv-location').value.trim(),
        preferences: root.querySelector('#cv-preferences').value.trim(),
      }),
    });
    const data = await res.json();
    if (!data.success) { showError(root, data.error || 'Ranking failed.'); return; }

    root.querySelector('#cv-results-target-role').textContent = targetRole;

    const tableEl = root.querySelector('#cv-results-table');
    if (!data.rankings || data.rankings.length === 0) {
      tableEl.innerHTML = '<p>No listings found to rank. Add some job listings first via Scan or Search.</p>';
    } else {
      tableEl.innerHTML = `
        <table style="width:100%;border-collapse:collapse">
          <thead>
            <tr style="text-align:left;border-bottom:2px solid #333">
              <th style="padding:8px">#</th>
              <th style="padding:8px">Company</th>
              <th style="padding:8px">Role</th>
              <th style="padding:8px">Role Match</th>
              <th style="padding:8px">Industry</th>
              <th style="padding:8px">Location</th>
              <th style="padding:8px">Preferences</th>
              <th style="padding:8px;border-left:2px solid #333">Overall</th>
            </tr>
          </thead>
          <tbody>
            ${data.rankings.map((r, i) => `
              <tr style="border-bottom:1px solid #eee">
                <td style="padding:8px">${i + 1}</td>
                <td style="padding:8px"><strong>${r.company}</strong></td>
                <td style="padding:8px">${r.listingRole}</td>
                <td style="padding:8px">${scoreBadge(r.scores.role_score)}</td>
                <td style="padding:8px">${scoreBadge(r.scores.industry_score)}</td>
                <td style="padding:8px">${scoreBadge(r.scores.location_score)}</td>
                <td style="padding:8px">${scoreBadge(r.scores.preference_score)}</td>
                <td style="padding:8px;border-left:2px solid #333;font-weight:bold;font-size:1.1em">${r.scores.overall_score}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    }
    showStep(root, 4);
  } catch (err) {
    showError(root, 'Ranking failed: ' + err.message);
  } finally {
    root.querySelector('#cv-eval-spinner').style.display = 'none';
  }
}

function scoreBadge(score) {
  const color = score >= 80 ? '#2e7d32' : score >= 60 ? '#f57f17' : '#c62828';
  return `<span style="color:${color};font-weight:bold">${score}</span>`;
}

function showStep(root, step) {
  for (let i = 1; i <= 4; i++) {
    const el = root.querySelector('#cv-step-' + i);
    if (el) el.style.display = i === step ? 'block' : 'none';
  }
  root.querySelector('#cv-error').style.display = 'none';
}

function showError(root, msg) {
  const errEl = root.querySelector('#cv-error');
  if (errEl) { errEl.textContent = msg; errEl.style.display = 'block'; }
}
