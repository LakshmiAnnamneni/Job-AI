import { test, expect } from '../../src/fixtures';

// Runs against a saved recording of LinkedIn (test-data/har/linkedin-jobs.har.zip),
// not the live site. Re-record with: LINKEDIN_RECORD=1 npx playwright test LinkedIn
//
// @external: still excluded in CI by playwright.config.ts.
test.describe('LinkedIn job search', { tag: '@external' }, () => {
  // Ends at the distance filter: when this was recorded, LinkedIn rate-limited the next
  // step (Date posted → Past month) with a 429 and a sign-in wall, so the recording has
  // no real results for it. setDatePosted() remains on the page object for a future
  // recording.
  test('IT project management jobs within 50 miles of Tampa', async ({ linkedInJobsPage: linkedIn }) => {
    await linkedIn.search({
      keywords: 'IT Project & Program Management',
      location: 'United States',
    });
    await expect(linkedIn.results.first()).toBeVisible();

    await linkedIn.setLocation('Tampa');
    await expect(linkedIn.locationInput).toHaveValue(/Tampa/);

    await linkedIn.setDistance(50);
    await expect(linkedIn.page).toHaveURL(/[?&]distance=50\b/);
    await expect(linkedIn.results.first()).toBeVisible();
  });
});
