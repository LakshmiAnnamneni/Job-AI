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

Claude Code reads Gmail through Google's Gmail MCP server. Google doesn't allow
automatic client registration, so **each person uses their own Google OAuth client**.
It's free and takes about 10 minutes.

### 3a. Create a Google OAuth client

In the [Google Cloud Console](https://console.cloud.google.com):

1. **Create a project**, e.g. "Job AI Gmail", and select it.
2. **APIs & Services → Library**: enable **Gmail API** (and a Gmail MCP entry if one is
   listed separately).
3. **OAuth consent screen** (a.k.a. *Google Auth Platform*):
   - User type **External**, app name `Job AI`, your email as support/developer contact.
   - **Audience → Test users**: add your own Gmail address.
   - **Data access**: add scope `https://www.googleapis.com/auth/gmail.readonly`.
4. **Credentials → Create credentials → OAuth client ID**, type **Desktop app**.
   Keep the **Client ID** and **Client secret** handy.

Google's console layout changes over time; the names above may differ slightly.

### 3b. Register it with Claude Code (this project only)

```bash
npm run setup:gmail
```

The script asks for the client ID, then prompts for the secret (stored in your OS
keychain, not in any file), and adds the server with `--scope local`, so it's
available only when Claude Code runs in this folder, and only for you.

### 3c. Sign in

Restart Claude Code in this folder → `/mcp` → **gmail-personal** → **Authenticate**.
Google will say the app is unverified; that's expected for your own Testing-mode
client, so choose **Continue**.

Then ask Claude, e.g. *"Find the jobs I've applied to in Gmail and update
data/jobs.csv with their status."*

## 4. CI (repo maintainers)

GitHub Actions reads `BASE_URL` (repository **variable**) and `TEST_USERNAME` /
`TEST_PASSWORD` (repository **secrets**) under *Settings → Secrets and variables →
Actions*. Tests tagged `@external` never run in CI.
