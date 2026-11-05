import type { Locator, Page } from '@playwright/test';

/** Site-wide navigation, shared by every page object via BasePage. */
export class Navbar {
  readonly root: Locator;
  readonly jobsLink: Locator;
  readonly accountMenu: Locator;

  constructor(page: Page) {
    // TODO: update locators to match the real site.
    this.root = page.getByRole('navigation');
    this.jobsLink = this.root.getByRole('link', { name: 'Jobs' });
    this.accountMenu = this.root.getByRole('button', { name: 'Account' });
  }

  async goToJobs(): Promise<void> {
    await this.jobsLink.click();
  }
}
