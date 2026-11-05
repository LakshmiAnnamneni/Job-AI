/**
 * Import job applications from Gmail into data/jobs.csv (read-only Gmail access).
 *
 *   npm run tracker:gmail -- --since 2026-07-01            # update data/jobs.csv
 *   npm run tracker:gmail -- --since 2026-07-01 --dry-run  # just print what it found
 *
 * Every status comes from the LATEST matching email per application. The report at
 * data/gmail-import-report.json lists which email each status came from.
 */
import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { gmail as gmailApi, type gmail_v1 } from '@googleapis/gmail';
import { classifyStage, extractCompanyAndTitle, extractLinkedInJobId, normalizeKey, type Stage } from './classify';
import { readJobs, upsertJobs, writeJobs } from './csv';
import { getGmailAuth } from './gmail-auth';
import { mergeUntitledIntoTitled, type Application } from './group';
import { JOBS_CSV, type JobRecord, type JobStatus } from './schema';

/** Tracker columns for a pipeline stage. "Started" = begun but never submitted. */
const toTracker = (stage: Stage): { status: JobStatus; applied: 'Y' | 'N' } =>
  stage === 'Started' ? { status: 'Open', applied: 'N' } : { status: stage, applied: 'Y' };

const REPORT_FILE = path.join(path.dirname(JOBS_CSV), 'gmail-import-report.json');

const SEARCH_PHRASES = [
  // confirmations
  '"thank you for applying"', '"thanks for applying"', '"thank you for your application"',
  '"application received"', '"received your application"', '"application was sent"',
  '"application submitted"', '"your application to"', '"your application for"',
  // interviews / assessments
  '"interview"', '"phone screen"', '"assessment"',
  // outcomes
  '"not moving forward"', '"other candidates"', '"position has been filled"', '"unfortunately"',
  '"offer letter"', '"pleased to offer"', '"offer of employment"',
];
// Job-alert and recommendation emails mention "apply" constantly but aren't applications.
const EXCLUDE = [
  '-in:sent', '-in:chats',
  '-from:jobalerts-noreply@linkedin.com', '-from:jobs-listings@linkedin.com',
  '-from:jobs-noreply@linkedin.com', '-subject:"job alert"', '-subject:"jobs for you"',
];

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const gmail = gmailApi({ version: 'v1', auth: await getGmailAuth() });

  const query = `after:${args.since.replace(/-/g, '/')} (${SEARCH_PHRASES.join(' OR ')}) ${EXCLUDE.join(' ')}`;
  console.log(`Searching Gmail since ${args.since}…`);
  const threadIds = await listThreadIds(gmail, query, args.max);
  console.log(`Found ${threadIds.length} candidate threads. Reading…`);

  const threads = await mapLimit(threadIds, 5, async (id) =>
    (await withRetry(() => gmail.users.threads.get({ userId: 'me', id, format: 'full' }))).data,
  );

  const apps = new Map<string, Application>();
  for (const thread of threads) collectFromThread(thread, apps);

  const results = mergeUntitledIntoTitled([...apps.values()])
    .map((a) => ({ ...a, evidence: a.evidence.sort((x, y) => x.date.localeCompare(y.date)) }))
    .map((a) => ({ ...a, ...toTracker(a.evidence.at(-1)!.stage) }))
    .sort((a, b) => b.evidence.at(-1)!.date.localeCompare(a.evidence.at(-1)!.date));

  console.table(
    results.map((r) => ({
      Company: r.company || '(unknown)',
      'Job Title': (r.title || (r.jobRef ? `(ref ${r.jobRef})` : '(unknown)')).slice(0, 70),
      Status: r.status,
      Applied: r.applied,
      'Latest email': r.evidence.at(-1)!.date.slice(0, 10),
      Emails: r.evidence.length,
    })),
  );

  const needsReview = results.filter((r) => !r.company || !r.title).length;
  if (args.dryRun) {
    console.log(`Dry run: ${results.length} applications found (${needsReview} need review). Nothing written.`);
    return;
  }

  // Match to existing rows: LinkedIn id first, then company + title.
  const existing = readJobs(JOBS_CSV);
  const byKey = new Map(existing.map((r) => [normalizeKey(r['Company Name'], r['Job Title']), r.Id]));
  const incoming: Partial<JobRecord>[] = results.map((r) => ({
    Id:
      (r.linkedInId && existing.some((e) => e.Id === r.linkedInId) && r.linkedInId) ||
      (r.company && r.title && byKey.get(normalizeKey(r.company, r.title))) ||
      r.linkedInId ||
      `gm-${crypto.createHash('sha1').update(r.key).digest('hex').slice(0, 10)}`,
    'Company Name': r.company,
    'Job Title': r.title,
    'Applied (Y/N)': r.applied,
    'Job Status': r.status,
  }));

  if (fs.existsSync(JOBS_CSV)) fs.copyFileSync(JOBS_CSV, `${JOBS_CSV}.bak`);
  writeJobs(JOBS_CSV, upsertJobs(existing, incoming));
  fs.writeFileSync(
    REPORT_FILE,
    JSON.stringify(
      { since: args.since, generatedAt: new Date().toISOString(), applications: results.map((r, i) => ({ id: incoming[i].Id, ...r, needsReview: !r.company || !r.title })) },
      null,
      2,
    ),
  );
  console.log(
    `Updated ${path.relative(process.cwd(), JOBS_CSV)} with ${results.length} applications ` +
      `(${needsReview} need review; previous version saved as jobs.csv.bak).\n` +
      `Evidence per status: ${path.relative(process.cwd(), REPORT_FILE)}`,
  );
}

/** Classify each message; label the whole thread with the best company/title found in it. */
function collectFromThread(thread: gmail_v1.Schema$Thread, apps: Map<string, Application>): void {
  const messages = (thread.messages ?? []).map((m) => {
    const header = (name: string) =>
      m.payload?.headers?.find((h) => h.name?.toLowerCase() === name)?.value ?? '';
    const subject = header('subject');
    const from = header('from');
    const snippet = (m.snippet ?? '').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&');
    const text = `${subject}\n${snippet}\n${bodyText(m.payload).slice(0, 8000)}`;
    return {
      subject,
      from,
      text,
      date: new Date(Number(m.internalDate ?? 0)).toISOString(),
      stage: classifyStage(text),
    };
  });
  const relevant = messages.filter((m) => m.stage);
  if (!relevant.length) return;

  const linkedInId = messages.map((m) => extractLinkedInJobId(m.text)).find(Boolean) ?? '';
  const facts = relevant.map((m) => extractCompanyAndTitle(m.text, m.from));
  const company = facts.find((f) => f.company)?.company ?? '';
  const title = facts.find((f) => f.title)?.title ?? '';
  const jobRef = facts.find((f) => f.jobRef)?.jobRef ?? '';
  // Same company + title (or job number) across threads = one application.
  const key = linkedInId
    ? `li:${linkedInId}`
    : company
      ? normalizeKey(company, title || jobRef)
      : `thread:${thread.id}`;

  const app = apps.get(key) ?? { key, linkedInId, jobRef, company, title, evidence: [] };
  app.company ||= company;
  app.title ||= title;
  app.jobRef ||= jobRef;
  for (const m of relevant) {
    app.evidence.push({
      date: m.date,
      stage: m.stage!,
      subject: m.subject,
      from: m.from,
      link: `https://mail.google.com/mail/u/0/#all/${thread.id}`,
    });
  }
  apps.set(key, app);
}

async function listThreadIds(gmail: gmail_v1.Gmail, q: string, max: number): Promise<string[]> {
  const ids: string[] = [];
  let pageToken: string | undefined;
  do {
    const res = await withRetry(() => gmail.users.threads.list({ userId: 'me', q, maxResults: 100, pageToken }));
    ids.push(...(res.data.threads ?? []).map((t) => t.id!).filter(Boolean));
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken && ids.length < max);
  return ids.slice(0, max);
}

/** Prefer text/plain; fall back to HTML with tags stripped. */
function bodyText(part: gmail_v1.Schema$MessagePart | undefined): string {
  if (!part) return '';
  const plain: string[] = [];
  const html: string[] = [];
  const walk = (p: gmail_v1.Schema$MessagePart) => {
    const data = p.body?.data ? Buffer.from(p.body.data, 'base64url').toString('utf-8') : '';
    if (p.mimeType === 'text/plain' && data) plain.push(data);
    if (p.mimeType === 'text/html' && data) html.push(data);
    p.parts?.forEach(walk);
  };
  walk(part);
  if (plain.length) return plain.join('\n');
  return html
    .join('\n')
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>|<\/(p|div|li|tr|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/[ \t]+/g, ' ');
}

/**
 * Gmail enforces a per-user, per-minute quota. On a rate-limit (or transient 5xx)
 * error, wait with exponential backoff (2s, 4s … up to ~1 min total) and retry.
 */
async function withRetry<T>(fn: () => Promise<T>, attempts = 6): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const e = err as { code?: number | string; status?: number; message?: string };
      const status = Number(e.status ?? e.code);
      const retryable =
        status === 429 || status >= 500 || (status === 403 && /quota|rate/i.test(e.message ?? ''));
      if (!retryable || attempt >= attempts) throw err;
      const waitMs = 2_000 * 2 ** (attempt - 1) + Math.random() * 1_000;
      console.warn(`Gmail rate limit or server error; retrying in ${Math.round(waitMs / 1000)}s…`);
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return out;
}

function parseArgs(argv: string[]): { since: string; dryRun: boolean; max: number } {
  const get = (flag: string) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const ninetyDaysAgo = new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10);
  const since = get('--since') ?? ninetyDaysAgo;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(since)) throw new Error(`--since must be YYYY-MM-DD, got "${since}"`);
  const max = Number(get('--max') ?? 500);
  return { since, dryRun: argv.includes('--dry-run'), max };
}

main().catch((err: unknown) => {
  console.error(`\n${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
