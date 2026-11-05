import { normalizeKey, type Stage } from './classify';

/** One email that contributed to an application's status. */
export interface Evidence {
  date: string; // ISO timestamp
  stage: Stage;
  subject: string;
  from: string;
  link: string;
}

/** Emails grouped into one job application. */
export interface Application {
  key: string;
  linkedInId: string;
  jobRef: string;
  company: string;
  title: string;
  evidence: Evidence[];
}

const latest = (a: Application): string => a.evidence.reduce((max, e) => (e.date > max ? e.date : max), '');

/**
 * Many confirmation emails say "thanks for applying to Acme" without naming the job,
 * while the later rejection does name it. When a company has exactly ONE titled
 * application, fold its untitled emails into it, but only if they're no newer than
 * that application's last email. A newer untitled email is more likely a second
 * application, so it stays separate (and gets flagged for review).
 */
export function mergeUntitledIntoTitled(apps: Application[]): Application[] {
  const byCompany = new Map<string, Application[]>();
  for (const a of apps) {
    if (!a.company) continue;
    const k = normalizeKey(a.company);
    byCompany.set(k, [...(byCompany.get(k) ?? []), a]);
  }

  const absorbed = new Set<Application>();
  for (const group of byCompany.values()) {
    const titled = group.filter((a) => a.title);
    if (titled.length !== 1) continue;
    const [target] = titled;
    for (const u of group) {
      const untitled = !u.title && !u.jobRef && !u.linkedInId;
      if (untitled && latest(u) <= latest(target)) {
        target.evidence.push(...u.evidence);
        absorbed.add(u);
      }
    }
  }
  return apps.filter((a) => !absorbed.has(a));
}
