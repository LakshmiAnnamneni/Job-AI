import { test, expect } from '../../src/fixtures';
import { JobSearchPage } from '../../src/pages/JobSearchPage';
import searchTerms from '../../test-data/search-terms.json';

test.describe('Job search', () => {
  test('page loads', { tag: '@smoke' }, async ({ jobSearchPage }) => {
    await jobSearchPage.open();
    await expect(jobSearchPage.searchBox).toBeVisible();
  });

  for (const query of searchTerms) {
    test(`"${query}" returns results`, async ({ jobSearchPage }) => {
      await jobSearchPage.open();
      await jobSearchPage.search(query);
      await expect(jobSearchPage.results.first()).toBeVisible();
    });
  }

  test('nonsense query shows the empty state', async ({ jobSearchPage }) => {
    await jobSearchPage.open();
    await jobSearchPage.search('zzqx-no-such-job-zzqx');
    await expect(jobSearchPage.noResults).toBeVisible();
  });

  test('signed-in user sees the account menu', async ({ loggedInPage }) => {
    const jobs = await new JobSearchPage(loggedInPage).open();
    await expect(jobs.navbar.accountMenu).toBeVisible();
  });
});
