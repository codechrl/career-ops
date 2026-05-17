import express from 'express';
import jwt from 'jsonwebtoken';
import { getUserByUsername, updateUserPassword, hashPassword } from '../../models/user.mjs';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'career-ops-dev-secret';

router.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'username and password required' });
  const user = getUserByUsername(username);
  if (!user) return res.status(401).json({ error: 'invalid credentials' });
  if (user.password_hash !== hashPassword(password)) return res.status(401).json({ error: 'invalid credentials' });
  const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, username: user.username });
});

router.get('/verify', (req, res) => {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'no token' });
  try {
    const decoded = jwt.verify(auth.slice(7), JWT_SECRET);
    res.json({ valid: true, username: decoded.username });
  } catch {
    res.status(401).json({ error: 'invalid token' });
  }
});

router.post('/change-password', (req, res) => {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'no token' });
  try {
    jwt.verify(auth.slice(7), JWT_SECRET);
  } catch {
    return res.status(401).json({ error: 'invalid token' });
  }
  const { username, currentPassword, newPassword } = req.body;
  if (!username || !currentPassword || !newPassword) return res.status(400).json({ error: 'username, currentPassword, newPassword required' });
  const user = getUserByUsername(username);
  if (!user || user.password_hash !== hashPassword(currentPassword)) return res.status(401).json({ error: 'invalid credentials' });
  updateUserPassword(username, hashPassword(newPassword));
  res.json({ changed: true });
});

export default router;
