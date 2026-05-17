import { loadConfig } from './config/index.mjs';
import { initLoaders } from './loaders/index.mjs';
import { getApp } from './loaders/express.mjs';

const config = loadConfig();

initLoaders()
  .then(() => {
    const app = getApp();
    const server = app.listen(config.port, () => {
      console.log(`career-ops server listening on port ${config.port}`);
    });

    process.on('SIGTERM', () => server.close(() => process.exit(0)));
    process.on('SIGINT', () => server.close(() => process.exit(0)));
  })
  .catch(err => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
