import type { Locator, Page } from '@playwright/test';
import { BasePage } from './BasePage';

export class LoginPage extends BasePage {
  // TODO: update the path and locators to match the real site.
  protected readonly path = '/login';

  readonly email: Locator;
  readonly password: Locator;
  readonly submit: Locator;
  readonly error: Locator;

  constructor(page: Page) {
    super(page);
    this.email = page.getByLabel('Email');
    this.password = page.getByLabel('Password');
    this.submit = page.getByRole('button', { name: 'Sign in' });
    this.error = page.getByRole('alert');
  }

  async login(username: string, password: string): Promise<void> {
    await this.email.fill(username);
    await this.password.fill(password);
    await this.submit.click();
    // Wait until we've left the login page, so the saved session is complete.
    await this.page.waitForURL((url) => !url.pathname.startsWith(this.path));
  }
}
