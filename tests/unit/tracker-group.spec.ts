// Made-up applications only (see CLAUDE.md).
import { test, expect } from '@playwright/test';
import type { Stage } from '../../src/tracker/classify';
import { mergeUntitledIntoTitled, type Application } from '../../src/tracker/group';

const app = (company: string, title: string, emails: [string, Stage][], extra: Partial<Application> = {}): Application => ({
  key: `${company}|${title}|${emails[0][0]}`,
  linkedInId: '',
  jobRef: '',
  company,
  title,
  evidence: emails.map(([date, stage]) => ({ date, stage, subject: 's', from: 'f', link: 'l' })),
  ...extra,
});

test('older untitled confirmation folds into the only titled application', () => {
  const result = mergeUntitledIntoTitled([
    app('Acme', '', [['2026-09-18', 'Applied']]),
    app('Acme', 'Widget PM', [['2026-10-17', 'Rejected']]),
  ]);
  expect(result).toHaveLength(1);
  expect(result[0].title).toBe('Widget PM');
  expect(result[0].evidence.map((e) => e.stage).sort()).toEqual(['Applied', 'Rejected']);
});

test('a NEWER untitled email stays separate (likely a second application)', () => {
  const result = mergeUntitledIntoTitled([
    app('Acme', 'Head of Widgets', [['2026-09-02', 'Rejected']]),
    app('Acme', '', [['2026-09-18', 'Applied']]),
  ]);
  expect(result).toHaveLength(2);
});

test('no merge when the company has several titled applications (ambiguous)', () => {
  const result = mergeUntitledIntoTitled([
    app('Acme', 'Widget PM', [['2026-10-01', 'Applied']]),
    app('Acme', 'Widget Lead', [['2026-10-02', 'Applied']]),
    app('Acme', '', [['2026-09-01', 'Applied']]),
  ]);
  expect(result).toHaveLength(3);
});

test('untitled rows with their own job number are distinct applications, not merged', () => {
  const result = mergeUntitledIntoTitled([
    app('Acme', 'Widget PM', [['2026-10-01', 'Applied']]),
    app('Acme', '', [['2026-09-01', 'Applied']], { jobRef: '210000001' }),
  ]);
  expect(result).toHaveLength(2);
});

test('different companies never merge', () => {
  const result = mergeUntitledIntoTitled([
    app('Acme', 'Widget PM', [['2026-10-01', 'Rejected']]),
    app('Contoso', '', [['2026-09-01', 'Applied']]),
  ]);
  expect(result).toHaveLength(2);
});
