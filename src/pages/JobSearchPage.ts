import type { Locator, Page } from '@playwright/test';
import { BasePage } from './BasePage';

export class JobSearchPage extends BasePage {
  // TODO: update the path and locators to match the real site.
  protected readonly path = '/jobs';

  readonly searchBox: Locator;
  readonly results: Locator;
  readonly noResults: Locator;

  constructor(page: Page) {
    super(page);
    this.searchBox = page.getByPlaceholder('Search jobs');
    this.results = page.getByTestId('job-card');
    this.noResults = page.getByText('No jobs found');
  }

  async search(query: string): Promise<void> {
    await this.searchBox.fill(query);
    await this.searchBox.press('Enter');
  }

  async resultTitles(): Promise<string[]> {
    return this.results.getByRole('heading').allInnerTexts();
  }
}
