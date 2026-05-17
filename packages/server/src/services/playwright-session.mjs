import fs from 'fs';
import path from 'path';
import { chromium } from 'playwright';
import { saveSession as dbSaveSession, getSession as dbGetSession, deleteSession as dbDeleteSession, listSessions as dbListSessions } from '../models/session.mjs';

const SESSION_DIR = path.resolve('data/sessions');
let browser = null;
let context = null;

function sessionFile(portal) {
  return path.join(SESSION_DIR, `${portal}.json`);
}

export async function ensureSessionDir() {
  fs.mkdirSync(SESSION_DIR, { recursive: true });
}

export async function startLoginSession(portal = 'linkedin') {
  await ensureSessionDir();
  if (!browser) {
    browser = await chromium.launch({ headless: false });
  }

  // Try loading from DB first, fallback to filesystem
  let storage;
  const dbEntry = dbGetSession(portal);
  if (dbEntry) {
    storage = JSON.parse(dbEntry.storage_state);
  } else if (fs.existsSync(sessionFile(portal))) {
    storage = JSON.parse(fs.readFileSync(sessionFile(portal), 'utf-8'));
  }

  context = await browser.newContext({ storageState: storage });
  const page = await context.newPage();
  const loginUrl = portal === 'linkedin' ? 'https://www.linkedin.com/login' : 'https://www.google.com';
  await page.goto(loginUrl);
  return { portal, loginUrl, status: 'opened' };
}

export async function saveSession(portal = 'linkedin') {
  if (!context) throw new Error('No active Playwright context');
  const storage = await context.storageState();

  // Save to DB
  dbSaveSession(portal, JSON.stringify(storage));

  // Also save to filesystem for backward compat
  await ensureSessionDir();
  fs.writeFileSync(sessionFile(portal), JSON.stringify(storage, null, 2), 'utf-8');

  return { portal, saved: true };
}

export function listSavedSessions() {
  return dbListSessions().map(s => ({
    portal: s.portal,
    path: null,
    updatedAt: s.updated_at,
  }));
}

export function clearSession(portal) {
  dbDeleteSession(portal);
  const file = sessionFile(portal);
  if (fs.existsSync(file)) fs.unlinkSync(file);
  return { portal, deleted: true };
}
