import fs from 'node:fs';
import { test as base, expect, type Page } from '@playwright/test';
import { JobSearchPage } from '../pages/JobSearchPage';
import { LoginPage } from '../pages/LoginPage';
import { AUTH_FILE } from '../utils/env';

type Fixtures = {
  /** Runs automatically: skips (rather than fails) tests when BASE_URL isn't set. */
  requireBaseUrl: void;
  jobSearchPage: JobSearchPage;
  loginPage: LoginPage;
  /** A page that is already signed in, using the session saved by auth.setup.ts. */
  loggedInPage: Page;
};

export const test = base.extend<Fixtures>({
  requireBaseUrl: [
    async ({ baseURL }, use, testInfo) => {
      testInfo.skip(!baseURL, 'BASE_URL not set (see .env.example)');
      await use();
    },
    { auto: true },
  ],

  jobSearchPage: async ({ page }, use) => {
    await use(new JobSearchPage(page));
  },

  loginPage: async ({ page }, use) => {
    await use(new LoginPage(page));
  },

  loggedInPage: async ({ browser, baseURL }, use, testInfo) => {
    testInfo.skip(!fs.existsSync(AUTH_FILE), 'No saved login: set TEST_USERNAME / TEST_PASSWORD');
    const context = await browser.newContext({ baseURL, storageState: AUTH_FILE });
    const page = await context.newPage();
    await use(page);
    await context.close();
  },
});

export { expect };
