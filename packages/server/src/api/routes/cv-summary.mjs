import express from 'express';
import fs from 'fs';
import path from 'path';
import { getLLM, getLLMByName } from '../../llm/index.mjs';
import { dbGet, dbRun } from '../../loaders/database.mjs';
import { upsertEvaluation, listEvaluations, clearEvaluationsByTargetRole, listTargetRoles } from '../../models/evaluation.mjs';
import { fileURLToPath } from 'url';

async function getProcessLLMAndModel(processKey) {
  const row = await dbGet('SELECT value FROM settings WHERE key = ?', [`llm_config_${processKey}`]);
  if (!row) return { llm: getLLM(), model: undefined };
  try {
    const cfg = JSON.parse(row.value);
    const llm = cfg.provider ? (getLLMByName(cfg.provider) || getLLM()) : getLLM();
    return { llm, model: cfg.model || undefined };
  } catch {
    return { llm: getLLM(), model: undefined };
  }
}

const router = express.Router();
const ROOT = path.resolve(fileURLToPath(import.meta.url), '..', '..', '..', '..', '..', '..');
const PATHS = {
  shared: path.join(ROOT, 'modes', '_shared.md'),
  profile: path.join(ROOT, 'config', 'profile.yml'),
  profileMode: path.join(ROOT, 'modes', '_profile.md'),
};

function readFileSafe(filePath, fallback = '') {
  try { return fs.readFileSync(filePath, 'utf-8'); } catch { return fallback; }
}

async function saveCVAnalysis(summary, keywords) {
  const now = new Date().toISOString();
  const value = JSON.stringify({ summary, keywords, updatedAt: now });
  const exists = await dbGet('SELECT key FROM settings WHERE key = ?', ['cv_analysis']);
  if (exists) {
    await dbRun('UPDATE settings SET value = ?, updated_at = ? WHERE key = ?', [value, now, 'cv_analysis']);
  } else {
    await dbRun('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)', ['cv_analysis', value, now]);
  }
}

router.get('/current-analysis', async (req, res) => {
  const row = await dbGet('SELECT value FROM settings WHERE key = ?', ['cv_analysis']);
  if (!row) return res.json(null);
  try { res.json(JSON.parse(row.value)); } catch { res.json(null); }
});

router.post('/upload', async (req, res) => {
  try {
    const { cvText } = req.body;
    if (!cvText) {
      return res.status(400).json({ error: 'CV text is required' });
    }

    const shared = readFileSafe(PATHS.shared, '');
    const profile = readFileSafe(PATHS.profile, '');
    const profileMode = readFileSafe(PATHS.profileMode, '');

    const { llm, model: llmModel } = await getProcessLLMAndModel('cv');
    const messages = [
      {
        role: 'system',
        content: `You are career-ops, an AI job search assistant. Analyze the user's CV and produce structured output.

${shared ? `System context:\n${shared}\n` : ''}
${profile ? `Profile:\n${profile}\n` : ''}
${profileMode ? `Profile mode:\n${profileMode}\n` : ''}

You must respond in this exact format:

---SUMMARY---
2-4 sentence professional summary highlighting key skills, experience, and value proposition.
---END_SUMMARY---
---KEYWORDS---
Comma-separated list of top technical skills, domain expertise, roles, and industry keywords.
---END_KEYWORDS---`
      },
      {
        role: 'user',
        content: `Analyze this CV and produce a professional summary and keyword extraction:\n\n${cvText}`
      }
    ];

    const result = await llm.chat(messages, { temperature: 0.3, maxTokens: 2048, ...(llmModel ? { model: llmModel } : {}) });

    const summaryMatch = result.match(/---SUMMARY---\n?([\s\S]*?)\n?---END_SUMMARY---/);
    const keywordsMatch = result.match(/---KEYWORDS---\n?([\s\S]*?)\n?---END_KEYWORDS---/);
    const summary = summaryMatch ? summaryMatch[1].trim() : 'Summary generation failed.';
    const keywords = keywordsMatch ? keywordsMatch[1].trim() : 'Keyword extraction failed.';

    const cvPath = path.resolve(ROOT, 'data', 'cv.md');
    const cvContent = `# CV Summary\n\n## Personal Summary\n${summary}\n\n## Key Skills & Keywords\n${keywords}\n\n## Full CV\n${cvText}\n`;
    fs.writeFileSync(cvPath, cvContent, 'utf-8');
    saveCVAnalysis(summary, keywords);

    res.json({ success: true, summary, keywords, cvPath });
  } catch (error) {
    console.error('CV processing error:', error);
    res.status(500).json({ error: 'Failed to process CV' });
  }
});

router.post('/evaluate', async (req, res) => {
  try {
    const { cvSummary, cvKeywords, targetRole, industries, targetLocation, preferences } = req.body;
    if (!cvSummary || !targetRole) {
      return res.status(400).json({ error: 'CV summary and target role are required' });
    }

    const shared = readFileSafe(PATHS.shared, '');
    const evaluateMode = readFileSafe(path.join(ROOT, 'modes', 'deep.md'), '');

    const { llm: llm2, model: llmModel2 } = await getProcessLLMAndModel('cv');
    const messages = [
      {
        role: 'system',
        content: `You are career-ops, an AI career advisor. Evaluate the fit between a candidate's profile and their target job preferences.

${shared ? `System context:\n${shared}\n` : ''}
${evaluateMode ? `Evaluation context:\n${evaluateMode}\n` : ''}

Respond in this exact format:

---SCORE---
A number from 0-100 representing overall fit
---END_SCORE---
---ANALYSIS---
2-4 sentence analysis of strengths and gaps
---END_ANALYSIS---
---SUGGESTIONS---
Bullet-point suggestions for improving fit or positioning
---END_SUGGESTIONS---`
      },
      {
        role: 'user',
        content: `Evaluate this candidate profile against their target job:

Candidate Summary: ${cvSummary}
Candidate Keywords: ${cvKeywords || 'Not specified'}
Target Role: ${targetRole}
Industries: ${industries || 'Not specified'}
Target Location: ${targetLocation || 'Not specified'}
Additional Preferences: ${preferences || 'None'}

Provide a fit score, analysis, and suggestions.`
      }
    ];

    const result = await llm2.chat(messages, { temperature: 0.3, maxTokens: 2048, ...(llmModel2 ? { model: llmModel2 } : {}) });

    const scoreMatch = result.match(/---SCORE---\n?([\s\S]*?)\n?---END_SCORE---/);
    const analysisMatch = result.match(/---ANALYSIS---\n?([\s\S]*?)\n?---END_ANALYSIS---/);
    const suggestionsMatch = result.match(/---SUGGESTIONS---\n?([\s\S]*?)\n?---END_SUGGESTIONS---/);

    res.json({
      success: true,
      score: scoreMatch ? scoreMatch[1].trim() : 'N/A',
      analysis: analysisMatch ? analysisMatch[1].trim() : 'Analysis failed.',
      suggestions: suggestionsMatch ? suggestionsMatch[1].trim() : 'No suggestions.',
    });
  } catch (error) {
    console.error('CV evaluation error:', error);
    res.status(500).json({ error: 'Failed to evaluate CV' });
  }
});

router.post('/rank', async (req, res) => {
  try {
    const { targetRole, industries, targetLocation, preferences, cvSummary, cvKeywords } = req.body;
    if (!targetRole) {
      return res.status(400).json({ error: 'targetRole is required' });
    }

    const listings = await dbRun('SELECT id, company, role FROM listings ORDER BY created_at DESC').then(r => r.rows);
    if (!listings.length) {
      return res.json({ success: true, rankings: [], message: 'No listings to evaluate.' });
    }

    const shared = readFileSafe(PATHS.shared, '');
    const { llm: llm3, model: llmModel3 } = await getProcessLLMAndModel('cv');

    const listingsText = listings.map((l, i) =>
      `[${i + 1}] ID:${l.id} | Company: ${l.company} | Role: ${l.role}`
    ).join('\n');

    const systemContent = `You are career-ops, an AI job matcher. Score each job listing against the candidate's targeting criteria.

${shared ? `System context:\n${shared}\n` : ''}

Candidate Profile:
${cvSummary ? `Summary: ${cvSummary}` : ''}
${cvKeywords ? `Keywords: ${cvKeywords}` : ''}

Targeting Criteria:
- Target Role: ${targetRole}
- Target Industries: ${industries || 'Any'}
- Target Location: ${targetLocation || 'Any'}
- Additional Preferences: ${preferences || 'None'}

For each listing, score these 4 metrics from 0-100:
1. role_score — How well the listing's role matches the target role (title, seniority, responsibilities)
2. industry_score — How well the company's industry matches target industries
3. location_score — How well the location matches (remote vs on-site vs target area)
4. preference_score — How well the listing matches additional preferences

Also compute overall_score as a weighted average (role 35%, industry 25%, location 20%, preference 20%).

Respond in this exact format, one block per listing:

---LISTING ID:{listingId}---
role_score: {0-100}
industry_score: {0-100}
location_score: {0-100}
preference_score: {0-100}
overall_score: {0-100}
---END_LISTING---`;

    const messages = [
      { role: 'system', content: systemContent },
      { role: 'user', content: `Score these job listings against the targeting criteria:\n\n${listingsText}` }
    ];

    const result = await llm3.chat(messages, { temperature: 0.3, maxTokens: 4096, ...(llmModel3 ? { model: llmModel3 } : {}) });

    await clearEvaluationsByTargetRole(targetRole);

    const listingBlocks = result.split(/---LISTING ID:(\d+)---/).slice(1);
    const rankings = [];

    for (let i = 0; i < listingBlocks.length; i += 2) {
      const listingId = parseInt(listingBlocks[i], 10);
      const block = listingBlocks[i + 1];
      if (!block) continue;

      const roleScore = parseInt(block.match(/role_score:\s*(\d+)/)?.[1] || '0', 10);
      const industryScore = parseInt(block.match(/industry_score:\s*(\d+)/)?.[1] || '0', 10);
      const locationScore = parseInt(block.match(/location_score:\s*(\d+)/)?.[1] || '0', 10);
      const preferenceScore = parseInt(block.match(/preference_score:\s*(\d+)/)?.[1] || '0', 10);
      const overallScore = parseInt(block.match(/overall_score:\s*(\d+)/)?.[1] || '0', 10);

      await upsertEvaluation({
        listing_id: listingId,
        target_role: targetRole,
        role_score: roleScore,
        industry_score: industryScore,
        location_score: locationScore,
        preference_score: preferenceScore,
        overall_score: overallScore,
        industries: industries || '',
        target_location: targetLocation || '',
        preferences: preferences || '',
      });

      const listing = listings.find(l => l.id === listingId);
      rankings.push({
        listingId,
        company: listing?.company || 'Unknown',
        listingRole: listing?.role || 'Unknown',
        scores: { role_score: roleScore, industry_score: industryScore, location_score: locationScore, preference_score: preferenceScore, overall_score: overallScore },
      });
    }

    rankings.sort((a, b) => b.scores.overall_score - a.scores.overall_score);
    res.json({ success: true, targetRole, industries, targetLocation, preferences, rankings });
  } catch (error) {
    console.error('Ranking error:', error);
    res.status(500).json({ error: 'Failed to rank listings' });
  }
});

router.get('/rankings', async (req, res) => {
  try {
    const evaluations = await listEvaluations();
    res.json({ success: true, evaluations });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch rankings' });
  }
});

router.get('/targets', async (req, res) => {
  try {
    const targets = await listTargetRoles();
    res.json({ success: true, targets });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch target roles' });
  }
});

export default router;