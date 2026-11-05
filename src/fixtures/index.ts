import fs from 'node:fs';
import path from 'node:path';
import { test as base, expect, type Page } from '@playwright/test';
import { JobSearchPage } from '../pages/JobSearchPage';
import { LinkedInJobsPage } from '../pages/LinkedInJobsPage';
import { LoginPage } from '../pages/LoginPage';
import { AUTH_FILE } from '../utils/env';

/** Saved copy of LinkedIn's responses, so tests don't hit the live site. */
export const LINKEDIN_HAR = path.join(__dirname, '..', '..', 'test-data', 'har', 'linkedin-jobs.har.zip');

type Fixtures = {
  /** Runs automatically: skips (rather than fails) tests when BASE_URL isn't set. */
  requireBaseUrl: void;
  jobSearchPage: JobSearchPage;
  loginPage: LoginPage;
  /** A page that is already signed in, using the session saved by auth.setup.ts. */
  loggedInPage: Page;
  /**
   * LinkedIn jobs page served from LINKEDIN_HAR (replay). Requests missing from the
   * HAR are aborted, never sent to LinkedIn. Set LINKEDIN_RECORD=1 to re-record
   * from the live site instead (do this rarely: LinkedIn blocks repeated automation).
   */
  linkedInJobsPage: LinkedInJobsPage;
};

export const test = base.extend<Fixtures>({
  requireBaseUrl: [
    async ({ baseURL }, use, testInfo) => {
      // @external tests target a fixed third-party URL, so they don't need BASE_URL.
      const external = testInfo.tags.includes('@external');
      testInfo.skip(!baseURL && !external, 'BASE_URL not set (see .env.example)');
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

  linkedInJobsPage: async ({ page }, use, testInfo) => {
    const record = process.env.LINKEDIN_RECORD === '1';
    if (!record) {
      testInfo.skip(
        !fs.existsSync(LINKEDIN_HAR),
        `No LinkedIn recording at ${LINKEDIN_HAR}; run once with LINKEDIN_RECORD=1`,
      );
    }
    // Record: real network, written to the HAR when the page's context closes.
    // Replay: answered from the HAR; anything not in it is aborted.
    await page.routeFromHAR(LINKEDIN_HAR, {
      update: record,
      updateMode: 'minimal',
      notFound: 'abort',
    });
    await use(new LinkedInJobsPage(page));
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
