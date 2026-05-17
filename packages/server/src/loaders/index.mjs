import { initDatabase } from './database.mjs';
import { initAuth } from './auth.mjs';
import { initExpress } from './express.mjs';

export async function initLoaders() {
  await initDatabase();
  await initExpress();
  await initAuth();
}
