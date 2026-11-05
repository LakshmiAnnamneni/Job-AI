/**
 * Pure helpers that turn a job-application email into structured facts.
 * No Gmail calls here, so everything is unit-testable with made-up emails.
 */

/** "Started" = an application begun but not submitted (tracker: Open, Applied N). */
export type Stage = 'Applied' | 'Started' | 'Interviewing' | 'Offer' | 'Rejected';

// Checked in order; first match wins.
// - Interview invites before rejections: "after careful consideration, we'd like to
//   invite you to interview" is an invite.
// - Rejections before confirmations: "thank you for applying … unfortunately" is a no.
const STAGE_RULES: [Stage, RegExp][] = [
  ['Offer', /\b(pleased to (extend|offer)|offer letter|offer of employment|extend (you )?an offer|job offer)\b/i],
  [
    'Interviewing',
    /\b(invite you to (an? )?(interview|call|assessment)|would like to (schedule|set up|invite you)|schedule (a|an|your) (interview|call|phone screen|conversation)|interview (invitation|request|confirmation|scheduled)|phone screen|complete (the|an|this|our|your) (online |technical )?assessment|share your availability)\b/i,
  ],
  [
    'Rejected',
    /\b(unfortunately|not (be )?moving forward|move forward with other candidates|(pursue|proceed) with other candidates|position has been filled|(recently |already )?filled (this|the) (position|role)|no longer (under consideration|being considered)|(not been|were not|was not) selected|decided not to (proceed|move forward)|(moved|move|moving|going|go) in (another|a different|a) direction|after careful consideration|reviewed your [^.]{0,80}\bhowever\b)/i,
  ],
  [
    'Started',
    /\b(thanks? (you )?for starting your (job )?application|you'?ve started your (job )?application|have not (yet )?(completed|submitted|finished) your application)\b/i,
  ],
  [
    'Applied',
    /\b(thank(s| you) for (applying|your application|submitting)|application (was |has been )?(successfully )?(received|submitted|sent)|received your (application|resume)|your application (to|for|with|was sent)|submitting an application|you'?ve applied to|successfully submitted)\b/i,
  ],
];

/** The pipeline stage an email represents, or null if it isn't about an application. */
export function classifyStage(text: string): Stage | null {
  for (const [stage, pattern] of STAGE_RULES) if (pattern.test(text)) return stage;
  return null;
}

// ---------------------------------------------------------------------------
// Company and title extraction
// ---------------------------------------------------------------------------

// A company name: capitalized words (case-sensitive even inside /i patterns, via the
// (?-i:…) modifier), so "our team" or "us" can never be taken as a company.
const WORD = String.raw`[A-Z0-9&][\w&'’-]*`;
const CO = String.raw`(?<company>(?-i:${WORD}(?: (?:${WORD}|of|and|de|du|la))*))`;

const COMPANY_PATTERNS: RegExp[] = [
  new RegExp(String.raw`your application was sent to ${CO}`, 'i'),
  new RegExp(String.raw`\b(?:applying|apply) (?:to|at|with) ${CO}`, 'i'),
  new RegExp(String.raw`\b(?:position|role|opening|job) (?:at|with) ${CO}`, 'i'),
  new RegExp(String.raw`\bapplication for [^\n]{2,120}? (?:at|with) ${CO}`, 'i'),
  new RegExp(
    String.raw`\b(?:considering|career (?:at|with)|working (?:at|with)|interest in|role with|joining) (?:a role with |a career (?:at|with) )?${CO}`,
    'i',
  ),
  new RegExp(String.raw`\byour ${CO} (?:job )?application`, 'i'),
  // "applying to the role of X - 12345 with Candidate ID - 111 at Company"
  new RegExp(String.raw`\bapplying to the role of [^\n]{2,200}? at ${CO}`, 'i'),
];

// A title: anything up to a terminator such as " position", " role", " (",
// " has been", " with Acme", ", 123456", or the end of the sentence.
const TT = String.raw`(?<title>[^\n!?]{2,140}?)`;
// Also stops at a capitalized sentence opener when an email omits the full stop
// ("…for job: Widget Manager If you lose track…").
const END = String.raw`(?=\s(?:position|role|opening)\b|\s\(|\shas been|\sis under review|\s(?:with|at)\s(?-i:[A-Z])|,\s*\d{5,}|\.(?:\s|$)|\s\.|!|\s(?-i:(?:If|We|You|Your|Our|Please|Thank|Thanks|This))\b|$)`;
const TITLE_PATTERNS: RegExp[] = [
  // "application for (the position of) X", "applying for our X position", "for job: X"
  new RegExp(String.raw`\b(?:application|applying|apply) for (?:the )?(?:role of |position of )?(?:our )?(?:job:\s*)?${TT}${END}`, 'im'),
  // "applying to the role of X with …"
  new RegExp(String.raw`\bapplying to the role of ${TT}${END}`, 'im'),
  // "applying to the/our X (ref) position|role"
  new RegExp(String.raw`\bapplying to (?:the|our) ${TT}(?=\s(?:\([^)]*\)\s)?(?:position|role)\b)`, 'im'),
  // "interest in the (role of) X position", "interest in our open position ( X )"
  new RegExp(
    String.raw`\binterest in (?:the |our open position \(\s*)(?:role of )?${TT}(?=\s(?:position|role)\b|\s*\)|\s\(|-\d{6,})`,
    'im',
  ),
  // "You've applied to X ."
  new RegExp(String.raw`\byou'?ve applied to ${TT}(?=\s\.|\.(?:\s|$)|$)`, 'im'),
  // Subjects: "… Applying to Acme - 12345 - X", "… job application - 12345 - X"
  new RegExp(String.raw`^[^\n]*?\s-\s\d{3,}\s-\s${TT}$`, 'im'),
  // Subjects: "Application Update: X", "Thank You for Your Application! - X"
  new RegExp(String.raw`^(?:application update|thank you for your application!?)\s*[-:]\s*${TT}$`, 'im'),
  // "Job title: X" on its own line
  /^\s*(?:job title|position|role)\s*:\s*(?<title>[^\n]{2,100})$/im,
];

const JOB_REF_PATTERNS: RegExp[] = [
  /\b(?:job (?:number|id)|requisition(?: id)?|req(?:uisition)?\.? ?(?:id|#|number)?)\s*[:#]?\s*([A-Z]{0,3}\d{5,})/i,
  /\b(JR\d{5,})\b/,
  /^[^\n]*?\s-\s(\d{3,})\s-\s/m,
];

/** Hiring systems that send mail for employers: their names are not company names. */
const ATS_NAMES =
  /^(workday|greenhouse|lever|icims|smartrecruiters|taleo|jobvite|linkedin|indeed|ziprecruiter|glassdoor|ashby|bamboohr|paycom|successfactors|oracle|adp|jazzhr)$/i;
const ATS_DOMAINS =
  /(^|\.)(myworkday|greenhouse-mail|greenhouse|lever|icims|ashbyhq|smartrecruiters|paycomonline|applytojob|oracle|successfactors|taleo|jobvite|linkedin|indeed|bamboohr)\.[a-z.]+$/i;
const GENERIC_LOCAL_PARTS =
  /(no-?reply|do-?not-?reply)|^(systemmessage|notifications?|talent|careers?|jobs|recruiting|hr|updates?)$/i;
const NOT_A_COMPANY = /^(application|applications|job|update|important|thank|thanks|your|our|the|we|dear|hi|hello|confirming|you|candidate)\b/i;
// Sentence fragments that mean the "title" is really prose. Pronouns are matched only in
// lowercase so real titles like "Application Development Manager" or "Remote in US" survive.
const NOT_A_TITLE_PHRASES =
  /\b(listed below|career|interest|thank|consideration|your application|the application|application (?:for|to|was|has)|applying)\b/i;
const NOT_A_TITLE_PRONOUNS = /\b(we|you|your|us|our)\b/;

export interface Extracted {
  company: string;
  title: string;
  /** Employer's job/requisition number, when the email states one. */
  jobRef: string;
}

/**
 * Best-effort company, title and job reference from an email.
 * `from` is the full From header ("Name <address>"); used when the text names no company.
 */
export function extractCompanyAndTitle(text: string, from = ''): Extracted {
  let company = '';
  for (const p of COMPANY_PATTERNS) {
    company = cleanCompany(p.exec(text)?.groups?.company);
    if (company) break;
  }
  let title = '';
  for (const p of TITLE_PATTERNS) {
    title = cleanTitle(p.exec(text)?.groups?.title);
    if (title) break;
  }
  let jobRef = '';
  for (const p of JOB_REF_PATTERNS) {
    jobRef = p.exec(text)?.[1] ?? '';
    if (jobRef) break;
  }
  return { company: company || companyFromSender(from), title, jobRef };
}

/**
 * Company from a From header: the display name minus recruiting words
 * ("Acme Talent Acquisition" → "Acme"); else the address: an ATS tenant
 * ("acme@myworkday.com" → "Acme") or the company's own domain ("no-reply@acme.com").
 */
export function companyFromSender(from: string): string {
  const m = /^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/.exec(from);
  const rawName = m ? m[1] : from.includes('@') ? '' : from;
  const email = (m ? m[2] : from.includes('@') ? from : '').trim().toLowerCase();

  const name = rawName
    .replace(/\bvia\s+\S+.*$/i, '')
    .replace(
      /\b(talent acquisition|hiring team|recruiting team|human resources|recruitment|recruiting|recruiters?|careers?|jobs|hr|workday|no-?reply|donotreply|notifications?|updates?|team|people)\b/gi,
      ' ',
    )
    .replace(/[-_]+/g, ' ')
    .replace(/^\s*(at|@|from)\s+|\s+(at|@)\s*$/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (name && !name.includes('@') && !ATS_NAMES.test(name)) return titleCaseIfLower(cleanCompany(name) || name);

  const [local = '', domain = ''] = email.split('@');
  if (!domain) return '';
  if (ATS_DOMAINS.test(domain)) {
    const tenant = local.split('+')[0].replace(/wd$/i, ''); // "acmewd@myworkday.com" → "acme"
    if (!tenant || GENERIC_LOCAL_PARTS.test(tenant) || tenant.includes('.')) return '';
    return tenant.length <= 3 ? tenant.toUpperCase() : capitalize(tenant); // "pwc" → "PWC", "acme" → "Acme"
  }
  const sld = domain.split('.').slice(-2)[0];
  return /^(gmail|googlemail|outlook|hotmail|yahoo|icloud|mail)$/.test(sld) ? '' : capitalize(sld);
}

/** LinkedIn job id from links like linkedin.com/jobs/view/4480314300. */
export function extractLinkedInJobId(text: string): string {
  return /linkedin\.com\/(?:comm\/)?jobs\/view\/(\d{6,})/i.exec(text)?.[1] ?? '';
}

/** Comparison key: case, punctuation and company suffixes don't matter. */
export function normalizeKey(...parts: string[]): string {
  return parts
    .map((p) =>
      p
        .toLowerCase()
        .replace(/&/g, ' and ')
        .replace(/[^a-z0-9 ]+/g, ' ')
        .replace(/\b(inc|llc|ltd|corp|corporation|co|company|plc)\b/g, ' ')
        .replace(/\s+/g, ' ')
        .trim(),
    )
    .join('|');
}

function cleanCompany(value: string | undefined): string {
  const v = collapse(value)
    .replace(/\s+(of|and|de|du|la)$/i, '')
    .replace(/[\s.,'’-]+$/, '');
  if (v.length < 2 || v.length > 60 || NOT_A_COMPANY.test(v) || ATS_NAMES.test(v)) return '';
  return v;
}

function cleanTitle(value: string | undefined): string {
  let v = collapse(value);
  for (const [re, rep] of [
    [/^(?:the|our|a|an)\s+/i, ''],
    [/^(?:role|position) of\s+/i, ''],
    [/^job:\s*/i, ''],
    [/^(?:[A-Z]{1,3})?\d{5,}\s+/, ''], // leading requisition id: "JR1234567 Title", "01234567 Title"
    [/\s*\((?:job (?:number|id)|req)[^)]*\)\s*$/i, ''],
    [/\s*\(\s*[\d-]{5,}\s*\)\s*$/, ''],
    [/\s*-\s*\d{4,}$/, ''],
    [/-\d{6,}$/, ''],
    [/,\s*\d{5,}$/, ''],
    [/\s+(?:position|role)$/i, ''],
  ] as [RegExp, string][]) {
    v = v.replace(re, rep).trim();
  }
  v = v.replace(/^[\s"'“”-]+|[\s"'“”!.,:;-]+$/g, '');
  if (v.length < 2 || v.length > 140 || /^[a-z]/.test(v) || NOT_A_TITLE_PHRASES.test(v) || NOT_A_TITLE_PRONOUNS.test(v))
    return '';
  return v;
}

const collapse = (v: string | undefined) => (v ?? '').replace(/\s+/g, ' ').trim();
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const titleCaseIfLower = (s: string) => (s === s.toLowerCase() ? s.replace(/\b\w/g, (c) => c.toUpperCase()) : s);
