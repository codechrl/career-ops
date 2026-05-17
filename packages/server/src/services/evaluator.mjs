import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';
import { getLLM } from '../llm/index.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const CWD = path.resolve(ROOT, '..', '..', '..', '..');
const PATHS = {
  shared: path.join(CWD, 'modes', '_shared.md'),
  oferta: path.join(CWD, 'modes', 'oferta.md'),
  cv: path.join(CWD, 'cv.md'),
  profile: path.join(CWD, 'config', 'profile.yml'),
  profileMode: path.join(CWD, 'modes', '_profile.md'),
  reports: path.join(CWD, 'reports'),
};

function readFileSafe(filePath, fallback = '') {
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    return fallback;
  }
}

function nextReportNumber() {
  if (!fs.existsSync(PATHS.reports)) return '001';
  const files = fs.readdirSync(PATHS.reports)
    .filter(f => /^\d{3}-/.test(f))
    .map(f => parseInt(f.slice(0, 3))).filter(n => !Number.isNaN(n));
  return String(files.length === 0 ? 1 : Math.max(...files) + 1).padStart(3, '0');
}

function slugify(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'unknown';
}

function parseSummary(text) {
  const match = text.match(/---SCORE_SUMMARY---([\s\S]*?)---END_SUMMARY---/);
  if (!match) return null;
  const block = match[1];
  const value = (key) => {
    const regex = new RegExp(`${key}:\\s*(.*)`, 'i');
    const m = block.match(regex);
    return m ? m[1].trim() : 'unknown';
  };
  return {
    company: value('COMPANY'),
    role: value('ROLE'),
    score: value('SCORE'),
    archetype: value('ARCHETYPE'),
    legitimacy: value('LEGITIMACY'),
  };
}

export async function evaluateJob({ jdText, url, company = 'Unknown', role = 'Unknown' }) {
  const shared = readFileSafe(PATHS.shared, '');
  const oferta = readFileSafe(PATHS.oferta, '');
  const cv = readFileSafe(PATHS.cv, '');
  const profile = readFileSafe(PATHS.profile, '');
  const profileMode = readFileSafe(PATHS.profileMode, '');

  const systemPrompt = `You are career-ops, an AI-powered job search assistant. You evaluate job offers against the user's CV using a structured A-G scoring system.\n\nSYSTEM CONTEXT:\n${shared}\n\nEVALUATION MODE:\n${oferta}\n\nCANDIDATE CV:\n${cv}\n\nCANDIDATE PROFILE YAML:\n${profile}\n\nCANDIDATE PROFILE MODE:\n${profileMode}\n\nRules:\n1. Read the full JD text from the user.\n2. Produce Blocks A-G.\n3. End with the exact summary block:\n---SCORE_SUMMARY---\nCOMPANY: <company>\nROLE: <role>\nSCORE: <score>\nARCHETYPE: <archetype>\nLEGITIMACY: <High Confidence | Proceed with Caution | Suspicious>\n---END_SUMMARY---\n`;

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: `Evaluate this job posting as a candidate evaluation. URL: ${url || 'N/A'}\nCompany: ${company}\nRole: ${role}\n\nJob Description:\n${jdText}` }
  ];

  const llm = getLLM();
  const evaluation = await llm.chat(messages, { temperature: 0.3, maxTokens: 8192 });
  const summary = parseSummary(evaluation) || { company, role, score: 'unknown', archetype: 'unknown', legitimacy: 'unknown' };

  const now = new Date().toISOString().slice(0, 10);
  const slug = slugify(summary.company || company);
  const filename = `${nextReportNumber()}-${slug}-${now}.md`;
  const reportPath = path.join(PATHS.reports, filename);

  const reportContent = `# Evaluation: ${summary.company} — ${summary.role}\n\n**Date:** ${now}\n**Archetype:** ${summary.archetype}\n**Score:** ${summary.score}/5\n**Legitimacy:** ${summary.legitimacy}\n**URL:** ${url || 'N/A'}\n**Tool:** ${process.env.LLM_PROVIDER || 'deepseek'}\n\n---\n\n${evaluation.trim()}\n`;

  fs.mkdirSync(PATHS.reports, { recursive: true });
  fs.writeFileSync(reportPath, reportContent, 'utf-8');

  return {
    reportPath: `reports/${filename}`,
    summary,
    evaluation,
  };
}
