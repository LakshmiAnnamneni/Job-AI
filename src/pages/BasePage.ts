import type { Page } from '@playwright/test';
import { Navbar } from '../components/Navbar';

/** Shared behaviour for every page. Subclasses set `path`. */
export abstract class BasePage {
  protected abstract readonly path: string;
  readonly navbar: Navbar;

  constructor(readonly page: Page) {
    this.navbar = new Navbar(page);
  }

  /** Navigate to this page. Relative paths resolve against baseURL. */
  async open(): Promise<this> {
    await this.page.goto(this.path);
    return this;
  }
}
