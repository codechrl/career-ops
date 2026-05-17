import { ensureDefaultUser } from '../models/user.mjs';

export async function initAuth() {
  ensureDefaultUser();
}
