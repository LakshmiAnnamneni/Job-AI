import fs from 'node:fs';
import path from 'node:path';
import { test as setup } from '../src/fixtures';
import { LoginPage } from '../src/pages/LoginPage';
import { AUTH_FILE, env, hasCredentials } from '../src/utils/env';

// Runs once before the browser tests (see `projects` in playwright.config.ts).
setup('authenticate', async ({ page }) => {
  setup.skip(!hasCredentials(), 'TEST_USERNAME / TEST_PASSWORD not set');

  const login = new LoginPage(page);
  await login.open();
  await login.login(env.username, env.password);

  fs.mkdirSync(path.dirname(AUTH_FILE), { recursive: true });
  await page.context().storageState({ path: AUTH_FILE });
});
