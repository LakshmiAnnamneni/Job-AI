# Setup

Everything you need to run Job AI on your own machine with your own accounts.
Nothing personal (credentials, inbox data, your job tracker) is ever committed.

## 1. Basics

Requires Node 20+ (`.nvmrc` pins 24; run `nvm use`).

```bash
git clone https://github.com/LakshmiAnnamneni/Job-AI.git
cd Job-AI
npm install
npx playwright install chromium
cp .env.example .env           # fill in BASE_URL and test-account credentials
npm run typecheck && npm test  # unit tests pass; site tests skip until BASE_URL is set
```

## 2. Job tracker data

Your tracker lives at `data/jobs.csv`. The whole `data/` folder is gitignored except
`data/jobs.example.csv`, which shows the columns with fake rows. To start fresh:

```bash
cp data/jobs.example.csv data/jobs.csv
```

Columns and allowed `Job Status` values are defined in `src/tracker/schema.ts`.
Read/write/merge helpers are in `src/tracker/csv.ts`.

## 3. Gmail access (optional, for importing applications)

`npm run tracker:gmail` reads your job-application emails with the standard Gmail API
(read-only), works out each application's latest status, and updates `data/jobs.csv`.
**Each person uses their own Google OAuth client**: free, about 10 minutes, once.

### 3a. Create a Google OAuth client

In the [Google Cloud Console](https://console.cloud.google.com):

1. **Create a project**, e.g. "Job AI Gmail", and select it.
2. **APIs & Services → Library**: enable **Gmail API**.
3. **OAuth consent screen** (a.k.a. *Google Auth Platform*):
   - User type **External**, app name `Job AI`, your email as support/developer contact.
   - **Audience → Test users**: add your own Gmail address.
   - **Data access**: add scope `https://www.googleapis.com/auth/gmail.readonly`.
4. **Credentials → Create credentials → OAuth client ID**, type **Desktop app**.
   Keep the **Client ID** and **Client secret** handy.

Google's console layout changes over time; the names above may differ slightly.

### 3b. Add the client to your `.env`

```bash
GOOGLE_CLIENT_ID=1234-abc.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-...
```

`.env` is gitignored, so your client never reaches the repo.

### 3c. Run the importer

```bash
npm run tracker:gmail -- --since 2026-07-01 --dry-run   # preview, writes nothing
npm run tracker:gmail -- --since 2026-07-01             # update data/jobs.csv
```

- **First run** opens Google sign-in in your browser. Google will say the app is
  unverified; that's expected for your own Testing-mode client, so choose **Continue**.
  The sign-in is cached in `data/.gmail-token.json` (gitignored, owner-only).
- **Personal Gmail accounts sign in again about every 7 days**: Google expires sign-ins
  for Testing-mode apps. The importer notices and reopens the browser.
- **Work/school (Google Workspace) accounts** may need an admin to allow the app, or can
  set the consent screen to *Internal*, which avoids the 7-day expiry.

What it does:

- Searches mail since `--since` (default: last 90 days) for confirmations, interview and
  assessment invites, rejections and offers, skipping job-alert emails.
- Groups emails per application (LinkedIn job id, else company + title) and takes the
  status from the **latest** email: `Applied`, `Interviewing`, `Offer` or `Rejected`.
- Merges into `data/jobs.csv` by `Id` without wiping columns you filled in, and keeps the
  previous file as `data/jobs.csv.bak`.
- Writes `data/gmail-import-report.json`: for every application, the emails (date,
  subject, sender, Gmail link) its status came from, and `needsReview: true` where the
  company or title couldn't be read from the email.

Company and title extraction is heuristic (`src/tracker/classify.ts`); review rows marked
`needsReview` and fix them in the CSV. Later runs keep your fixes.

### Alternative: Gmail MCP server for Claude Code (preview)

`npm run setup:gmail` adds Google's Gmail MCP server to Claude Code for this project
only. As of Nov 2026 Google only allows it for Cloud projects enrolled in the
[Workspace Developer Preview Program](https://developers.google.com/workspace/preview);
otherwise tool calls fail with "requires that your Google Cloud project … is enrolled".
The importer above has no such requirement.

## 4. Resume text extraction (optional)

Requires [uv](https://docs.astral.sh/uv/). It installs Python and `pypdf` into a
project-local `.venv/` on first run.

```bash
npm run resume:text                        # every PDF in resume/ → resume/<name>.txt
npm run resume:text -- resume/master.pdf   # specific files
npm run resume:text -- --stdout resume/master.pdf
npm run resume:text -- --layout            # keep columns/spacing (2-column resumes)
npm run resume:text -- --password '…' resume/locked.pdf
```

Output goes to `resume/` (gitignored). If a PDF is a scanned image with no text layer,
the script warns that it needs OCR, which pypdf can't do.

## 5. CI (repo maintainers)

GitHub Actions reads `BASE_URL` (repository **variable**) and `TEST_USERNAME` /
`TEST_PASSWORD` (repository **secrets**) under *Settings → Secrets and variables →
Actions*. Tests tagged `@external` never run in CI.
