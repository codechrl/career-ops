import express from 'express';
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';

const router = express.Router();
const PROFILE_PATH = path.resolve('config/profile.yml');

router.get('/', (req, res) => {
  try {
    const data = fs.readFileSync(PROFILE_PATH, 'utf-8');
    const profile = yaml.load(data);
    res.json(profile);
  } catch (e) {
    res.status(500).json({ error: 'Failed to read profile' });
  }
});

router.put('/', (req, res) => {
  try {
    const yamlStr = yaml.dump(req.body);
    fs.writeFileSync(PROFILE_PATH, yamlStr, 'utf-8');
    res.json({ saved: true });
  } catch (e) {
    res.status(500).json({ error: 'Failed to save profile' });
  }
});

export default router;
