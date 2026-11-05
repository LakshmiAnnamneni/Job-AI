# CLAUDE.md

Shared instructions for Claude Code in this repo. Personal preferences belong in your
own `~/.claude/CLAUDE.md` or `.claude/settings.local.json`, not here.

## What this is

1. **Playwright + TypeScript test suite** (Page Object Model): `src/pages`,
   `src/components`, `src/fixtures`, `tests/`.
2. **Job tracker**: applications tracked in `data/jobs.csv`; schema and helpers in
   `src/tracker/`. Gmail is imported with `npm run tracker:gmail -- --since YYYY-MM-DD`
   (read-only Gmail API, per-person OAuth client in `.env`; see `docs/SETUP.md`).

## Commands

- `npm run typecheck`: TypeScript check. Run before every commit.
- `npm test`: whole suite. `npm run test:smoke` for `@smoke` only.
- `npx playwright test <name> --headed`: watch a specific test.
- `npm run test:py`: Python tests (`tests/python/`, stdlib `unittest`, run via uv).
- `npm run resume:text`: extract text from PDFs in `resume/` with pypdf.
- `npm run resume:skills`: skills list from a resume → `resume/<name>.skills.txt`
  (skills section + terms from `scripts/skills_vocabulary.txt`).

Python is managed by **uv** (`pyproject.toml`, `uv.lock`); add Python deps with `uv add`,
never `pip install`. Python tests build made-up PDFs; never use a real resume as a fixture.
Don't print a resume's extracted text into chat or logs unless the user asks.

## Rules

- **Never commit personal data.** `data/` (except `data/jobs.example.csv`), `resume/`
  (except `resume/README.md`), `.env`, `.auth/` are gitignored. Don't force-add them, and don't paste inbox content or
  real applications into code, tests, fixtures, or commit messages.
- **Page objects own selectors.** Specs call page-object methods; no raw locators in
  `tests/`. Prefer `getByRole` / `getByLabel` / `getByTestId`.
- **Specs import `test` and `expect` from `src/fixtures`**, except pure-logic unit tests in
  `tests/unit/`, which import from `@playwright/test` directly.
- **Third-party sites:** tag tests `@external`; they're excluded from CI by
  `playwright.config.ts`. The LinkedIn test replays `test-data/har/linkedin-jobs.har.zip`.
  Don't run `LINKEDIN_RECORD=1` (live LinkedIn) unless the user explicitly asks;
  LinkedIn rate-limits and blocks automation.

## Job tracker workflow

- Columns and `Job Status` values: `src/tracker/schema.ts`. Don't invent new columns or
  statuses without updating the schema and `data/jobs.example.csv`.
- `Skills` is a `; `-separated list (skills can contain commas). Fill it only from a
  job's own description; the Gmail importer leaves it blank.
- Update rows by `Id` with `upsertJobs()` from `src/tracker/csv.ts` so other columns
  aren't wiped. Keep the file UTF-8 with BOM and CRLF (what `writeJobs()` produces).
- Gmail access is **read-only** (`gmail.readonly` scope). Never send, draft, label,
  archive, or delete email, and never widen the scope.
- When inferring a status from email, use the latest message per application:
  confirmation → `Applied`, interview/assessment invite → `Interviewing`,
  offer → `Offer`, rejection → `Rejected`. Say which email each status came from
  (`data/gmail-import-report.json` has the evidence).
- Status rules live in `src/tracker/classify.ts`. When fixing a misclassification, add a
  case with a **made-up** email to `tests/unit/tracker-classify.spec.ts` first.
- The sign-in token is `data/.gmail-token.json`. Never print, copy or commit it.
