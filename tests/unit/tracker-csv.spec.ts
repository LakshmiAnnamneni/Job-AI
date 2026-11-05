// Plain logic tests: imported from @playwright/test directly, so no browser and no
// BASE_URL are needed, and they run in CI.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test, expect } from '@playwright/test';
import { parseCsv, readJobs, toCsv, upsertJobs } from '../../src/tracker/csv';
import { COLUMNS, JOB_STATUSES, JOBS_EXAMPLE_CSV, type JobRecord } from '../../src/tracker/schema';

const blank = (): JobRecord => Object.fromEntries(COLUMNS.map((c) => [c, ''])) as JobRecord;
const job = (overrides: Partial<JobRecord>): JobRecord => ({ ...blank(), ...overrides });

test('round-trips commas, quotes, newlines and non-ASCII', () => {
  const tricky = job({
    Id: '1',
    'Company Name': 'Acme, Inc.',
    'Job Title': 'Senior "Rockstar" PM',
    'Required Qualifications': '• PMP\n• 5–7 years’ experience',
  });
  const [header, row] = parseCsv(toCsv([tricky]));
  expect(header).toEqual([...COLUMNS]);
  expect(Object.fromEntries(COLUMNS.map((c, i) => [c, row[i]]))).toEqual(tricky);
});

test('upsert updates matching Id without wiping other columns, appends new Ids', () => {
  const existing = [job({ Id: '1', 'Job Title': 'PM', 'Job Status': 'Applied' })];
  const result = upsertJobs(existing, [
    { Id: '1', 'Job Status': 'Interviewing' },
    { Id: '2', 'Job Title': 'Sr PM' },
  ]);
  expect(result).toHaveLength(2);
  expect(result[0]['Job Title']).toBe('PM');
  expect(result[0]['Job Status']).toBe('Interviewing');
  expect(result[1]['Job Title']).toBe('Sr PM');
  expect(existing[0]['Job Status']).toBe('Applied'); // input not mutated
});

test('an older file missing a newer column still loads, with that column blank', () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'jobs-')), 'old.csv');
  const oldColumns = COLUMNS.filter((c) => c !== 'Skills');
  fs.writeFileSync(file, `${oldColumns.join(',')}\n1,Acme,PM${',x'.repeat(oldColumns.length - 3)}\n`);
  const [row] = readJobs(file);
  expect(row['Company Name']).toBe('Acme');
  expect(row.Skills).toBe('');
  expect(row['Job Status']).toBe('x');
});

test('a file without an Id column is rejected', () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'jobs-')), 'bad.csv');
  fs.writeFileSync(file, 'Name,Email\nPat,pat@example.com\n');
  expect(() => readJobs(file)).toThrow(/no "Id" column/);
});

test('the committed example CSV matches the schema', () => {
  const rows = readJobs(JOBS_EXAMPLE_CSV);
  expect(rows.length).toBeGreaterThan(0);
  for (const r of rows) {
    expect(JOB_STATUSES).toContain(r['Job Status']);
    expect(['Y', 'N']).toContain(r['Applied (Y/N)']);
  }
});
