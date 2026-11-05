# Job AI

End-to-end test suite for Job AI, built with **Playwright** and **TypeScript**, using the Page Object Model.

## Layout

```
playwright.config.ts   browsers, baseURL, retries, traces, reporters
src/
  pages/               page objects: one class per page (locators + actions)
  components/          UI pieces shared across pages (Navbar, ...)
  fixtures/index.ts    custom `test` with page-object and logged-in fixtures
  utils/env.ts         environment settings
tests/
  auth.setup.ts        logs in once, saves the session to .auth/user.json
  e2e/                 browser tests of full user flows
  api/                 HTTP-level tests (no browser, fast)
test-data/             JSON inputs for data-driven tests
```

## Setup

Requires Node 20+ (`.nvmrc` pins 24; run `nvm use`).

```bash
npm install
npx playwright install chromium
cp .env.example .env        # then fill in BASE_URL and test credentials
```

## Running tests

```bash
npm test                    # everything
npm run test:smoke          # tests tagged @smoke
npm run test:headed         # watch the browser
npm run test:ui             # Playwright's interactive UI mode
npm run report              # open the last HTML report
npm run typecheck           # TypeScript check without running tests
```

Tests tagged **`@external`** (e.g. `tests/e2e/LinkedIn.spec.ts`) target third-party sites and are
**excluded in CI** (`grepInvert` in `playwright.config.ts`), so they only run locally. Run just
those with `npx playwright test --grep @external`.

### LinkedIn recording (HAR)

The LinkedIn test does **not** hit linkedin.com. It replays a recording saved in
`test-data/har/linkedin-jobs.har.zip` (via `page.routeFromHAR` in `src/fixtures/index.ts`), and any
request missing from the recording is blocked rather than sent to the internet.

To re-record from the live site (rarely: LinkedIn rate-limits and blocks repeated automation):

```bash
LINKEDIN_RECORD=1 npx playwright test LinkedIn --retries=0 --timeout=60000
```

The current recording (Nov 2026) covers search → Tampa → 50-mile radius. LinkedIn returned
`429 Too Many Requests` on the following "Date posted" step, so the test stops at distance.

Tests are **skipped** (not failed) until `BASE_URL` is set. Tests that use `loggedInPage` are
skipped until `TEST_USERNAME` and `TEST_PASSWORD` are set.

## Debugging failures

Failed tests keep a trace and a screenshot in `test-results/`. Open a trace with:

```bash
npx playwright show-trace test-results/<test-folder>/trace.zip
```

CI uploads the HTML report and `test-results/` as a build artifact on every run.

## Adding a page

1. Create `src/pages/<Name>Page.ts` extending `BasePage`, set `path`, and define locators in
   the constructor (prefer `getByRole`, `getByLabel` and `getByTestId`).
2. Optionally expose it as a fixture in `src/fixtures/index.ts`.
3. Write specs in `tests/e2e/` that import `test` and `expect` from `src/fixtures` and call
   page-object methods, with no raw selectors in tests.
