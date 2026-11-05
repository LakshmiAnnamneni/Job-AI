import fs from 'node:fs';
import { COLUMNS, type JobRecord } from './schema';

const BOM = '﻿'; // lets Excel detect UTF-8 (’, –, • display correctly)

/** Parse RFC 4180 CSV: quoted fields may contain commas, quotes ("") and newlines. */
export function parseCsv(text: string): string[][] {
  const src = text.startsWith(BOM) ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (ch !== '\r') {
      field += ch;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

const escape = (value: string): string =>
  /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;

export function toCsv(records: JobRecord[]): string {
  const lines = [
    COLUMNS.join(','),
    ...records.map((r) => COLUMNS.map((c) => escape(r[c] ?? '')).join(',')),
  ];
  return BOM + lines.join('\r\n') + '\r\n';
}

/**
 * Read the tracker. Columns added to the schema after a file was written read as
 * blank, so older files keep working; the next writeJobs() adds them. Only Id is required.
 */
export function readJobs(file: string): JobRecord[] {
  if (!fs.existsSync(file)) return [];
  const [header, ...rows] = parseCsv(fs.readFileSync(file, 'utf-8'));
  if (!header?.includes('Id')) throw new Error(`${file} has no "Id" column; is it a job tracker CSV?`);
  return rows
    .filter((cells) => cells.some((c) => c.trim() !== ''))
    .map((cells) => {
      const at = (c: string) => header.indexOf(c);
      return Object.fromEntries(COLUMNS.map((c) => [c, at(c) >= 0 ? (cells[at(c)] ?? '') : ''])) as JobRecord;
    });
}

export function writeJobs(file: string, records: JobRecord[]): void {
  fs.writeFileSync(file, toCsv(records), 'utf-8');
}

/**
 * Merge incoming records into existing ones by Id. Non-empty incoming fields win,
 * so an update like { Id, 'Job Status': 'Interviewing' } doesn't wipe other columns.
 * New Ids are appended; existing order is kept.
 */
export function upsertJobs(existing: JobRecord[], incoming: Partial<JobRecord>[]): JobRecord[] {
  const merged = existing.map((r) => ({ ...r }));
  for (const rec of incoming) {
    if (!rec.Id) throw new Error('Every record needs an Id');
    const target = merged.find((r) => r.Id === rec.Id);
    if (target) {
      for (const c of COLUMNS) if (rec[c]) target[c] = rec[c]!;
    } else {
      merged.push(Object.fromEntries(COLUMNS.map((c) => [c, rec[c] ?? ''])) as JobRecord);
    }
  }
  return merged;
}
