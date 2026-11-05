import type { Locator, Page } from '@playwright/test';

export type DatePosted = 'Any time' | 'Past month' | 'Past week' | 'Past 24 hours';
export type DistanceMiles = 0 | 5 | 10 | 25 | 50 | 100;

/**
 * LinkedIn's public (signed-out) job search page.
 *
 * Standalone rather than extending BasePage: LinkedIn is a fixed third-party site,
 * not a path under BASE_URL, and doesn't share the Job AI navbar.
 */
export class LinkedInJobsPage {
  static readonly SEARCH_URL = 'https://www.linkedin.com/jobs/search';

  readonly keywordsInput: Locator;
  readonly locationInput: Locator;
  readonly distanceFilter: Locator;
  readonly datePostedFilter: Locator;
  readonly doneButton: Locator;
  readonly results: Locator;

  constructor(readonly page: Page) {
    this.keywordsInput = page.getByRole('combobox', { name: 'Search job titles or companies' });
    this.locationInput = page.getByRole('combobox', { name: 'Location' });
    this.distanceFilter = page.getByRole('button', { name: /^Distance filter/ });
    this.datePostedFilter = page.getByRole('button', { name: /^Date posted filter/ });
    // Each filter dropdown has its own "Done"; only the open one is visible, and
    // getByRole ignores hidden elements, so this resolves to the right one.
    this.doneButton = page.getByRole('button', { name: 'Done' });
    this.results = page.locator('.jobs-search__results-list > li');

    // LinkedIn shows a "sign in" modal to signed-out visitors at random moments.
    // Close it whenever it appears, so no step has to know about it.
    // The page pre-renders several hidden sign-in modals (each with its own "Dismiss"),
    // so target only the one LinkedIn has actually opened: its overlay gets
    // `modal__overlay--visible`. Matching every "Dismiss" button instead hangs forever
    // waiting for the hidden ones to disappear.
    const openModal = page.locator('.modal__overlay--visible').first();
    void page.addLocatorHandler(openModal, async (overlay) => {
      await overlay.getByRole('button', { name: 'Dismiss' }).click();
    });
  }

  /** Open search results directly by URL (more reliable than typing into the search bar). */
  async search({ keywords, location }: { keywords: string; location?: string }): Promise<void> {
    const url = new URL(LinkedInJobsPage.SEARCH_URL);
    url.searchParams.set('keywords', keywords);
    if (location) url.searchParams.set('location', location);
    await this.page.goto(url.toString());
  }

  /** Change the location in the search bar and re-run the search. */
  async setLocation(location: string): Promise<void> {
    await this.locationInput.fill(location);
    await this.locationInput.press('Enter');
  }

  async setDistance(miles: DistanceMiles): Promise<void> {
    await this.distanceFilter.click();
    // \b stops "5 miles" from also matching "25 miles".
    await this.page.getByRole('radio', { name: new RegExp(`\\b${miles} miles`) }).check();
    await this.doneButton.click();
  }

  async setDatePosted(range: DatePosted): Promise<void> {
    await this.datePostedFilter.click();
    await this.page.getByRole('radio', { name: range }).check();
    await this.doneButton.click();
  }

  /** Open a job's details by its position in the results list (0 = first). */
  async openResult(index = 0): Promise<void> {
    await this.results.nth(index).getByRole('link').first().click();
  }
}
