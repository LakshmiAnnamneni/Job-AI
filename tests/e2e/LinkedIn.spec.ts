import { test, expect } from '@playwright/test';

// @external: hits a third-party site (LinkedIn). Excluded in CI by playwright.config.ts,
// so it only runs locally and doesn't get CI's traffic blocked.
test('test', { tag: '@external' }, async ({ page }) => {
  await page.goto('https://www.linkedin.com/');
  await page.getByRole('navigation').getByRole('link', { name: 'Jobs' }).click();
  await page.getByRole('button', { name: 'Clear text' }).first().click();
  await page.getByRole('combobox', { name: 'Search job titles or companies' }).click();
  await page.getByRole('combobox', { name: 'Search job titles or companies' }).fill('program man');
  await page.goto('https://www.linkedin.com/jobs/search?keywords=IT%20Project%20%26%20Program%20Management&location=United%20States&geoId=103644278&trk=public_jobs_jobs-search-bar_search-submit&position=1&pageNum=0');
  await page.getByRole('link', { name: 'Sr. IT Project Manager (' }).click();
  await page.getByRole('button', { name: 'Clear text' }).nth(1).click();
  await page.getByRole('combobox', { name: 'Location' }).fill('Tampa');
  await page.getByRole('button', { name: 'Distance filter. 25 miles (40' }).click();
  await page.getByText('miles (80 km)').click();
  await page.getByRole('radio', { name: 'miles (80 km)' }).check();
  await page.getByRole('button', { name: 'Done' }).click();
  await page.getByRole('button', { name: 'Date posted filter. Clicking' }).click();
  await page.getByText('Past month').click();
  await page.getByRole('radio', { name: 'Past month' }).check();
  await page.getByRole('button', { name: 'Done' }).click();
  await page.getByRole('button', { name: 'Dismiss' }).click();
});
