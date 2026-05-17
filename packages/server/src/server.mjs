
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import healthRouter from './routes/health.mjs';
import cvRouter from './routes/cv.mjs';
import profileRouter from './routes/profile.mjs';
import sessionsRouter from './routes/sessions.mjs';
import portalsRouter from './routes/portals.mjs';
import searchRouter from './routes/search.mjs';
import evaluateRouter from './routes/evaluate.mjs';
import scanRouter from './routes/scan.mjs';
import playwrightRouter from './routes/playwright.mjs';
import listingsRouter from './routes/listings.mjs';
import pipelineRouter from './routes/pipeline.mjs';
import authRouter from './routes/auth.mjs';
import llmKeysRouter from './routes/llm-keys.mjs';
import jobTargetRouter from './routes/job-target.mjs';
dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api/health', healthRouter);
app.use('/api/cv', cvRouter);
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

app.get('/', (req, res) => {
  res.send('career-ops server running');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`career-ops server listening on port ${PORT}`);
});
