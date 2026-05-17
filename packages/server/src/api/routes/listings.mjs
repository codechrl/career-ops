import express from 'express';
import fs from 'fs';
import path from 'path';

const router = express.Router();
const TRACKER_PATH = path.resolve('data/applications.md');
const HEADER = '| # | Date | Company | Role | Score | Status | PDF | Report |';
const SEPARATOR = '|---|---|---|---|---|---|---|---|';

function ensureTrackerFile() {
  if (!fs.existsSync(TRACKER_PATH)) {
    fs.mkdirSync(path.dirname(TRACKER_PATH), { recursive: true });
    fs.writeFileSync(TRACKER_PATH, `${HEADER}\n${SEPARATOR}\n`, 'utf-8');
  }
}

function parseListings() {
  if (!fs.existsSync(TRACKER_PATH)) return [];
  const text = fs.readFileSync(TRACKER_PATH, 'utf-8');
  const lines = text.split('\n').filter(l => l.startsWith('|') && !l.startsWith('|---'));
  return lines.slice(1).map(l => {
    const cols = l.split('|').map(s => s.trim());
    return {
      id: cols[1],
      date: cols[2],
      company: cols[3],
      role: cols[4],
      score: cols[5],
      status: cols[6],
      pdf: cols[7],
      report: cols[8],
    };
  });
}

function formatRow(row) {
  return `| ${row.id} | ${row.date} | ${row.company} | ${row.role} | ${row.score} | ${row.status} | ${row.pdf} | ${row.report} |`;
}

function writeListings(rows) {
  const body = [HEADER, SEPARATOR, ...rows.map(formatRow)].join('\n') + '\n';
  fs.writeFileSync(TRACKER_PATH, body, 'utf-8');
}

function nextId(rows) {
  const ids = rows.map(r => parseInt(r.id, 10)).filter(n => !Number.isNaN(n));
  return String(ids.length === 0 ? 1 : Math.max(...ids) + 1);
}

router.get('/', (req, res) => {
  ensureTrackerFile();
  res.json(parseListings());
});

router.post('/', (req, res) => {
  const { company, role, score = '0', status = 'Evaluada', pdf = '❌', report = '' } = req.body;
  if (!company || !role) return res.status(400).json({ error: 'company and role are required' });
  ensureTrackerFile();
  const rows = parseListings();
  const id = nextId(rows);
  const date = new Date().toISOString().slice(0, 10);
  rows.push({ id, date, company, role, score, status, pdf, report });
  writeListings(rows);
  res.json({ added: true, id });
});

router.put('/:id', (req, res) => {
  ensureTrackerFile();
  const rows = parseListings();
  const idx = rows.findIndex(r => r.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Listing not found' });
  rows[idx] = { ...rows[idx], ...req.body };
  writeListings(rows);
  res.json({ updated: true, id: req.params.id });
});

router.delete('/:id', (req, res) => {
  ensureTrackerFile();
  const rows = parseListings();
  const idx = rows.findIndex(r => r.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Listing not found' });
  rows[idx].status = 'Descartada';
  writeListings(rows);
  res.json({ deleted: true, id: req.params.id });
});

export default router;
