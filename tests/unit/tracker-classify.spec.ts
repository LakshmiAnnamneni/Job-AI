// All emails here are MADE UP (fake companies, paraphrased wording). They mirror the
// *shapes* of real hiring-system emails. Never paste real inbox content into tests
// (see CLAUDE.md).
import { test, expect } from '@playwright/test';
import {
  classifyStage,
  companyFromSender,
  extractCompanyAndTitle,
  extractLinkedInJobId,
  normalizeKey,
} from '../../src/tracker/classify';

test.describe('classifyStage', () => {
  const cases: [string, ReturnType<typeof classifyStage>][] = [
    // Applied
    ['Thank you for applying to Example Corp! We will review your application.', 'Applied'],
    ['Your application was sent to Example Corp', 'Applied'],
    ['We have received your application for Program Manager.', 'Applied'],
    ["Hi Pat, you've applied to Widget Lead. Track progress in your profile.", 'Applied'],
    ['Pat, we’ve received your resume!', 'Applied'],
    ['Thank you for applying! If selected for an interview, we will contact you.', 'Applied'],
    // Started (not submitted)
    ['Thanks for starting your application for job: Widget Manager.', 'Started'],
    ["You've started your job application!", 'Started'],
    ['Thank you for starting your application. We noticed you have not completed your application.', 'Started'],
    // Rejected, including gentle wording
    ['Thank you for applying. Unfortunately, we will not be moving forward.', 'Rejected'],
    ['After careful review we decided to move forward with other candidates.', 'Rejected'],
    ['We received many qualified applicants and ultimately moved in another direction.', 'Rejected'],
    ['Many strong candidates applied, and we are going in a direction that better fits our needs.', 'Rejected'],
    ["We appreciate your interest, but we've recently filled this position.", 'Rejected'],
    ['After careful consideration, our team has chosen other applicants.', 'Rejected'],
    ['We have reviewed your skills and experience; however, we will pursue others.', 'Rejected'],
    // Interviewing beats a polite rejection-sounding opener
    ["After careful consideration, we'd like to invite you to an interview.", 'Interviewing'],
    ['We would like to schedule a phone screen with you next week.', 'Interviewing'],
    ['Please complete the online assessment within 5 days.', 'Interviewing'],
    // Offer
    ['We are pleased to extend an offer for the role of Senior PM.', 'Offer'],
    // Not about an application
    ['Your weekly newsletter: 10 tips for remote work', null],
  ];
  for (const [text, expected] of cases) {
    test(`${expected ?? 'null'} ← "${text.slice(0, 55)}"`, () => {
      expect(classifyStage(text)).toBe(expected);
    });
  }
});

test.describe('extractCompanyAndTitle', () => {
  const cases: { name: string; text: string; from?: string; company: string; title: string; jobRef?: string }[] = [
    {
      name: 'subject: application for X with Company',
      text: 'Your Application for Senior Widget Manager, QA with Acme Labs',
      company: 'Acme Labs',
      title: 'Senior Widget Manager, QA',
    },
    {
      name: 'applying for the X position at Company',
      text: 'Thank you for applying for the IT Program Manager position at Sample Industries!',
      company: 'Sample Industries',
      title: 'IT Program Manager',
    },
    {
      name: 'thanks for applying to Company. Received your application for the X role',
      text: 'Thanks for applying to Northwind. We have received your application for the Director, Widget Ops - Remote role.',
      company: 'Northwind',
      title: 'Director, Widget Ops - Remote',
    },
    {
      name: 'job number in parentheses after the title',
      text: 'Thank you for submitting your application for Widget Strategist (Job number: 123456789). We are glad you are interested in a career at Contoso.',
      company: 'Contoso',
      title: 'Widget Strategist',
      jobRef: '123456789',
    },
    {
      name: '"role of X - 12345 with Candidate ID at Company" does not make the candidate ID a company',
      text: 'thank you for applying to the role of Director, Widgets - Cloud - 765432 with Candidate ID - 111222 at Fabrikam.',
      company: 'Fabrikam',
      title: 'Director, Widgets - Cloud',
    },
    {
      name: '"applying to our X (2026-12345) position": company from sender, not "our …"',
      text: 'I would like to thank you for applying to our Widget Manager, Programs (2026-123456) position.',
      from: 'Tailspin <tailspin+autoreply@talent.icims.com>',
      company: 'Tailspin',
      title: 'Widget Manager, Programs',
    },
    {
      name: '"for job: X"',
      text: 'Thanks for starting your application for job: Widget Manager, Programs If you lose track',
      from: 'Tailspin <tailspin+autoreply@talent.icims.com>',
      company: 'Tailspin',
      title: 'Widget Manager, Programs',
    },
    {
      name: '"application for the X position" never yields "your application for this role" as company',
      text: 'Application Update: Principal Widgeteer\nThank you for your recent application for the Principal Widgeteer position. After careful consideration, we will not be moving forward with your application for this role at the present time.',
      from: 'acmewd@myworkday.com',
      company: 'Acme',
      title: 'Principal Widgeteer',
    },
    {
      name: 'subject "Company - 12345 - Title"',
      text: 'Thank You for Applying to WWI - 55555 - Director, Widget Development Manager',
      company: 'WWI',
      title: 'Director, Widget Development Manager',
      jobRef: '55555',
    },
    {
      name: 'subject "Thank You for Your Application! - Title"',
      text: 'Thank You for Your Application! - Widget Engineering Manager',
      from: 'Lucerne Talent Acquisition <talent@lucerne.example>',
      company: 'Lucerne',
      title: 'Widget Engineering Manager',
    },
    {
      name: 'interest in the role of X-12345678 (trailing req number)',
      text: 'Thank you for considering Adatum! Thank you for your interest in the role of Widget Group Manager - Senior Vice President-12345678.',
      company: 'Adatum',
      title: 'Widget Group Manager - Senior Vice President',
    },
    {
      name: 'interest in our open position ( 01234567 X (Remote) )',
      text: 'Thank you for your interest in our open position ( 01234567 Director, Widget Integrations - F1 Program (Remote) ).',
      from: 'RTW Workday Notifications <globalhr@myworkday.com>',
      company: 'RTW',
      title: 'Director, Widget Integrations - F1 Program',
    },
    {
      name: 'leading JR requisition id in the title',
      text: 'We want to confirm that your application for the JR1234567 Senior Widget Program Manager role has been received.',
      from: 'Proseware HR <proseware@myworkday.com>',
      company: 'Proseware',
      title: 'Senior Widget Program Manager',
      jobRef: 'JR1234567',
    },
    {
      name: 'position of X, 123456 (trailing number after comma)',
      text: 'Thank you for submitting an application for the position of Widget Consultant, Program Management, 123456. You can view the status',
      from: 'Recruiting at Woodgrove <donotreply@woodgrove.example>',
      company: 'Woodgrove',
      title: 'Widget Consultant, Program Management',
    },
    {
      name: '"Thank you for applying to us. You\'ve applied to X ." uses the ATS tenant, not "us"',
      text: "Thank you for applying to us. You've applied to Widget Excellence - Solution Architect Senior Manager . External applicants",
      from: 'pwx@myworkday.com',
      company: 'PWX',
      title: 'Widget Excellence - Solution Architect Senior Manager',
    },
    {
      name: '"your Company application is under review"',
      text: 'Your Litware application is under review\nYour application for VP, Widget Platforms - Modernization - 1234567 is under review.',
      from: 'workday-noreply litware <litware@myworkday.com>',
      company: 'Litware',
      title: 'VP, Widget Platforms - Modernization',
    },
    {
      name: '"position with the Credit Union": company from the sender domain',
      text: 'Thank you for your interest in the AVP, Widget Platforms position with the Credit Union.',
      from: 'Recruiters@examplefcu.example',
      company: 'Examplefcu',
      title: 'AVP, Widget Platforms',
    },
    {
      name: 'titles may contain "Application" and "US" (capitalized) without being rejected',
      text: 'We have received your application for the Director, Application Widgets - Remote in US role.',
      from: 'Updates <updates@careers.northwind.example>',
      company: 'Northwind',
      title: 'Director, Application Widgets - Remote in US',
    },
    {
      name: 'title from a "Job title:" line; company from LinkedIn subject',
      text: 'Your application was sent to Example Corp\nJob title: Technical Program Manager',
      company: 'Example Corp',
      title: 'Technical Program Manager',
    },
    {
      name: '"position listed below" is not a title',
      text: 'We received your job application (Job Number: 210000001)\nYour application for the position listed below was successfully submitted and we appreciate your interest.',
      from: '"Contoso & Co. Human Resources" <sender@workflow.mail.cloud.oracle.com>',
      company: 'Contoso & Co',
      title: '',
      jobRef: '210000001',
    },
  ];
  for (const c of cases) {
    test(c.name, () => {
      const got = extractCompanyAndTitle(c.text, c.from);
      expect({ company: got.company, title: got.title }).toEqual({ company: c.company, title: c.title });
      if (c.jobRef !== undefined) expect(got.jobRef).toBe(c.jobRef);
    });
  }
});

test('companyFromSender: display name, ATS tenant, own domain', () => {
  expect(companyFromSender('Talent Acquisition at Example Corp <jobs@example.com>')).toBe('Example Corp');
  expect(companyFromSender('Example Corp via Workday <x@myworkday.com>')).toBe('Example Corp');
  expect(companyFromSender('acme@myworkday.com')).toBe('Acme');
  expect(companyFromSender('no-reply@us.greenhouse-mail.io')).toBe('');
  expect(companyFromSender('no-reply@contoso.example')).toBe('Contoso');
  expect(companyFromSender('Workday <noreply@myworkday.com>')).toBe('');
  expect(companyFromSender('LinkedIn <jobs-noreply@linkedin.com>')).toBe('');
});

test('extractLinkedInJobId finds ids in job links', () => {
  expect(extractLinkedInJobId('View job: https://www.linkedin.com/comm/jobs/view/1234567890/?trk=x')).toBe('1234567890');
  expect(extractLinkedInJobId('no link here')).toBe('');
});

test('normalizeKey ignores case, punctuation and company suffixes', () => {
  expect(normalizeKey('Example Corp, Inc.', 'Sr. PM')).toBe(normalizeKey('example', 'SR PM'));
  expect(normalizeKey('A&B Co', 'X')).toBe(normalizeKey('A and B', 'x'));
});
