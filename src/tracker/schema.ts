import path from 'node:path';

/** Column order of the job tracker CSV. Change here and everything follows. */
export const COLUMNS = [
  'Id',
  'Company Name',
  'Job Title',
  'Job Description',
  'Location',
  'Required Qualifications',
  'Preferred Qualifications',
  'Pay Range',
  'Travel Required?',
  'Applied (Y/N)',
  'Job Status',
] as const;

export type Column = (typeof COLUMNS)[number];
export type JobRecord = Record<Column, string>;

/** Allowed values for "Job Status", roughly in pipeline order. */
export const JOB_STATUSES = [
  'Open', // posting is live, not applied yet
  'Applied',
  'Interviewing',
  'Offer',
  'Rejected',
  'Withdrawn',
  'Closed', // posting taken down before applying
] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

const DATA_DIR = path.join(__dirname, '..', '..', 'data');

/** Your real tracker. Gitignored: never committed. */
export const JOBS_CSV = path.join(DATA_DIR, 'jobs.csv');

/** Fake rows showing the format. Committed, so collaborators can see the shape. */
export const JOBS_EXAMPLE_CSV = path.join(DATA_DIR, 'jobs.example.csv');
