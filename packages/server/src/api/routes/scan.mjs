import express from 'express';
import { spawn } from 'child_process';

const router = express.Router();

// POST /api/scan { portals: ["greenhouse", "ashby", ...], options: {...} }
router.post('/', (req, res) => {
  // For now, just run scan.mjs as a child process
  const scan = spawn('node', ['scripts/scan.mjs'], { cwd: process.cwd() });
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  scan.stdout.on('data', data => {
    res.write(`data: ${data.toString()}\n\n`);
  });
  scan.stderr.on('data', data => {
    res.write(`data: ERROR: ${data.toString()}\n\n`);
  });
  scan.on('close', code => {
    res.write(`event: end\ndata: Scan finished with code ${code}\n\n`);
    res.end();
  });
});

export default router;
