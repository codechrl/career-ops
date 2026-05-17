import express from 'express';
import fs from 'fs';
import path from 'path';

const router = express.Router();
const PIPELINE_PATH = path.resolve('data/pipeline.md');

function ensurePipelineFile() {
  if (!fs.existsSync(PIPELINE_PATH)) {
    fs.mkdirSync(path.dirname(PIPELINE_PATH), { recursive: true });
    fs.writeFileSync(PIPELINE_PATH, '## Pending\n\n## Processed\n', 'utf-8');
  }
}

function parsePipeline() {
  ensurePipelineFile();
  const text = fs.readFileSync(PIPELINE_PATH, 'utf-8');
  const pending = [];
  const processed = [];
  let section = null;
  for (const line of text.split('\n')) {
    if (line.match(/^##\s*Pending/i)) section = 'pending';
    else if (line.match(/^##\s*Processed/i)) section = 'processed';
    else if (line.startsWith('- [ ]') && section === 'pending') pending.push(line);
    else if (line.startsWith('- [x]') && section === 'processed') processed.push(line);
  }
  return { pending, processed };
}

function appendToPipeline(item) {
  ensurePipelineFile();
  const text = fs.readFileSync(PIPELINE_PATH, 'utf-8');
  const marker = '## Pending';
  const idx = text.indexOf(marker);
  const insertAt = idx === -1 ? text.length : text.indexOf('\n', idx + marker.length) + 1;
  const line = `- [ ] ${item.url} | ${item.company || ''} | ${item.title || ''}`;
  const nextText = text.slice(0, insertAt) + line + '\n' + text.slice(insertAt);
  fs.writeFileSync(PIPELINE_PATH, nextText, 'utf-8');
}

router.get('/', (req, res) => {
  res.json(parsePipeline());
});

router.post('/', (req, res) => {
  const { url, company, title } = req.body;
  if (!url) return res.status(400).json({ error: 'url is required' });
  appendToPipeline({ url, company, title });
  res.json({ added: true, url });
});

export default router;
