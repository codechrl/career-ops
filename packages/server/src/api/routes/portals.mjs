import express from 'express';
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';

const router = express.Router();
const PORTALS_PATH = path.resolve('portals.yml');

router.get('/', (req, res) => {
  try {
    const data = fs.readFileSync(PORTALS_PATH, 'utf-8');
    const portals = yaml.load(data);
    res.json(portals);
  } catch (e) {
    res.status(500).json({ error: 'Failed to read portals' });
  }
});

router.put('/', (req, res) => {
  try {
    const yamlStr = yaml.dump(req.body);
    fs.writeFileSync(PORTALS_PATH, yamlStr, 'utf-8');
    res.json({ saved: true });
  } catch (e) {
    res.status(500).json({ error: 'Failed to save portals' });
  }
});

export default router;
