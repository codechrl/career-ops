import express from 'express';
import cors from 'cors';
import healthRouter from '../api/routes/health.mjs';
import cvRouter from '../api/routes/cv.mjs';
import cvSummaryRouter from '../api/routes/cv-summary.mjs';
import profileRouter from '../api/routes/profile.mjs';
import portalsRouter from '../api/routes/portals.mjs';
import scanRouter from '../api/routes/scan.mjs';
import listingsRouter from '../api/routes/listings.mjs';
import pipelineRouter from '../api/routes/pipeline.mjs';
import authRouter from '../api/routes/auth.mjs';
import llmKeysRouter from '../api/routes/llm-keys.mjs';
import jobTargetRouter from '../api/routes/job-target.mjs';
import llmConfigRouter from '../api/routes/llm-config.mjs';
import scanScheduleRouter from '../api/routes/scan-schedule.mjs';

let app;

export async function initExpress() {
  app = express();
  app.use(cors());
  app.use(express.json());

  app.use('/api/health', healthRouter);
  app.use('/api/cv', cvRouter);
  app.use('/api/cv-summary', cvSummaryRouter);
  app.use('/api/profile', profileRouter);
  app.use('/api/portals', portalsRouter);
  app.use('/api/scan', scanRouter);
  app.use('/api/listings', listingsRouter);
  app.use('/api/pipeline', pipelineRouter);
  app.use('/api/auth', authRouter);
  app.use('/api/llm-keys', llmKeysRouter);
  app.use('/api/job-target', jobTargetRouter);
  app.use('/api/llm-config', llmConfigRouter);
  app.use('/api/scan-schedule', scanScheduleRouter);

  app.get('/', (req, res) => res.send('career-ops server running'));

  return app;
}

export function getApp() {
  if (!app) throw new Error('Express not initialized.');
  return app;
}
