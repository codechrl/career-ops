import { dbAll, dbGet, dbRun } from '../loaders/database.mjs';

export async function listTargetRoles() {
  const rows = await dbAll('SELECT DISTINCT target_role FROM cv_evaluations ORDER BY target_role');
  return rows.map(r => r.target_role);
}

export async function listEvaluations() {
  return dbAll(`
    SELECT e.*, l.company, l.role as listing_role, l.status as listing_status
    FROM cv_evaluations e
    JOIN listings l ON l.id = e.listing_id
    ORDER BY e.overall_score DESC, e.updated_at DESC
  `);
}

export async function getEvaluation(id) {
  return dbGet(`
    SELECT e.*, l.company, l.role as listing_role, l.status as listing_status
    FROM cv_evaluations e
    JOIN listings l ON l.id = e.listing_id
    WHERE e.id = ?
  `, [id]);
}

export async function getEvaluationsByTargetRole(targetRole) {
  return dbAll(`
    SELECT e.*, l.company, l.role as listing_role, l.status as listing_status
    FROM cv_evaluations e
    JOIN listings l ON l.id = e.listing_id
    WHERE e.target_role = ?
    ORDER BY e.overall_score DESC
  `, [targetRole]);
}

export async function upsertEvaluation({ listing_id, target_role, role_score, industry_score, location_score, preference_score, overall_score, industries, target_location, preferences }) {
  const existing = await dbGet('SELECT id FROM cv_evaluations WHERE listing_id = ? AND target_role = ?', [listing_id, target_role]);
  const now = new Date().toISOString();
  if (existing) {
    await dbRun(`
      UPDATE cv_evaluations SET role_score = ?, industry_score = ?, location_score = ?, preference_score = ?, overall_score = ?, industries = ?, target_location = ?, preferences = ?, updated_at = ?
      WHERE id = ?
    `, [role_score, industry_score, location_score, preference_score, overall_score, industries, target_location, preferences, now, existing.id]);
    return existing.id;
  }
  await dbRun(`
    INSERT INTO cv_evaluations (listing_id, target_role, role_score, industry_score, location_score, preference_score, overall_score, industries, target_location, preferences, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [listing_id, target_role, role_score, industry_score, location_score, preference_score, overall_score, industries, target_location, preferences, now, now]);
}

export async function deleteEvaluation(id) {
  return dbRun('DELETE FROM cv_evaluations WHERE id = ?', [id]);
}

export async function clearEvaluationsByTargetRole(targetRole) {
  return dbRun('DELETE FROM cv_evaluations WHERE target_role = ?', [targetRole]);
}
