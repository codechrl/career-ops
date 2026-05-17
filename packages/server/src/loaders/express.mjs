import express from 'express';
import cors from 'cors';
import healthRouter from '../api/routes/health.mjs';
import cvRouter from '../api/routes/cv.mjs';
import cvSummaryRouter from '../api/routes/cv-summary.mjs';
import profileRouter from '../api/routes/profile.mjs';
import sessionsRouter from '../api/routes/sessions.mjs';
import portalsRouter from '../api/routes/portals.mjs';
import searchRouter from '../api/routes/search.mjs';
import evaluateRouter from '../api/routes/evaluate.mjs';
import scanRouter from '../api/routes/scan.mjs';
import playwrightRouter from '../api/routes/playwright.mjs';
import listingsRouter from '../api/routes/listings.mjs';
import pipelineRouter from '../api/routes/pipeline.mjs';
import authRouter from '../api/routes/auth.mjs';
import llmKeysRouter from '../api/routes/llm-keys.mjs';
import jobTargetRouter from '../api/routes/job-target.mjs';
import llmConfigRouter from '../api/routes/llm-config.mjs';

let app;

export async function initExpress() {
  app = express();
  app.use(cors());
  app.use(express.json());

  app.use('/api/health', healthRouter);
  app.use('/api/cv', cvRouter);
  app.use('/api/cv-summary', cvSummaryRouter);
  app.use('/api/profile', profileRouter);
  app.use('/api/sessions', sessionsRouter);
  app.use('/api/portals', portalsRouter);
  app.use('/api/search', searchRouter);
  app.use('/api/evaluate', evaluateRouter);
  app.use('/api/scan', scanRouter);
  app.use('/api/playwright', playwrightRouter);
  app.use('/api/listings', listingsRouter);
  app.use('/api/pipeline', pipelineRouter);
  app.use('/api/auth', authRouter);
  app.use('/api/llm-keys', llmKeysRouter);
  app.use('/api/job-target', jobTargetRouter);
  app.use('/api/llm-config', llmConfigRouter);

  app.get('/', (req, res) => res.send('career-ops server running'));

  return app;
}

export function getApp() {
  if (!app) throw new Error('Express not initialized.');
  return app;
}
