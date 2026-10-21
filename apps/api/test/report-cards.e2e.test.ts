/**
 * Report cards (Master Prompt §33, milestone M4): a whole section in one click, rendered in the
 * worker, versioned, merged for printing; parents download their own child's card once published.
 */
import { existsSync } from 'node:fs';
import { PDFDocument } from 'pdf-lib';
import { pino } from 'pino';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ChromiumPdfRenderer } from '../src/core/pdf/pdf-renderer.js';
import { QueueService } from '../src/core/queue/queue.service.js';
import { reportCardHtml, type ReportCardData } from '../src/modules/exams/report-card.template.js';
import { createTenant, createTestApp, testEnv, type Tenant, type TestApp } from './helpers.js';

let t: TestApp;
let A: Tenant;
const tok: Record<'admin' | 'teacher' | 'parent', string> = {} as never;

beforeAll(async () => {
  t = await createTestApp({ RUN_WORKERS: 'true' });
  await t.app.get(QueueService).startWorkers();
  A = await createTenant(t, 'rc');
  for (const role of ['admin', 'teacher', 'parent'] as const) tok[role] = (await t.login(A.users[role], A.slug)).token;
  const enter = (sectionId: string, entries: object[]) => t.as(tok.admin, A.slug).put('/v1/exams/marks', { examSubjectId: A.examSubjectId, sectionId, entries });
  await enter(A.sectionA, [{ studentId: A.students.s1, marks: 41 }, { studentId: A.students.s2, marks: 30 }]);
  await enter(A.sectionB, [{ studentId: A.students.s3, marks: 20 }]);
  await t.as(tok.admin, A.slug).post(`/v1/exams/${A.examId}/results/compute`, {});
});

afterAll(async () => {
  await t?.close();
});

const waitFor = async <T>(fn: () => Promise<T | null | undefined | false>, ms = 20_000): Promise<T> => {
  const until = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > until) throw new Error('timed out');
    await new Promise((r) => setTimeout(r, 150));
  }
};

describe('report cards', () => {
  it('generates a whole section in the background', async () => {
    const res = await t.as(tok.admin, A.slug).post(`/v1/exams/${A.examId}/report-cards`, { sectionId: A.sectionA });
    expect(res.status).toBe(202);
    expect(res.body.data).toEqual({ queued: 2 });
    const status = await waitFor(async () => {
      const s = (await t.as(tok.admin, A.slug).get(`/v1/exams/${A.examId}/report-cards?sectionId=${A.sectionA}`)).body.data as { version: number | null }[];
      return s.every((x) => x.version === 1) ? s : null;
    });
    expect(status).toHaveLength(2);
    expect((await t.as(tok.teacher, A.slug).post(`/v1/exams/${A.examId}/report-cards`, { sectionId: A.sectionA })).status).toBe(403);
  });

  it('regenerating makes a new version', async () => {
    await t.as(tok.admin, A.slug).post(`/v1/exams/${A.examId}/report-cards`, { sectionId: A.sectionA, studentIds: [A.students.s1] });
    await waitFor(async () => {
      const s = (await t.as(tok.admin, A.slug).get(`/v1/exams/${A.examId}/report-cards?sectionId=${A.sectionA}`)).body.data as { studentId: string; version: number | null }[];
      return s.find((x) => x.studentId === A.students.s1)?.version === 2;
    });
  });

  it('merges the section into one printable PDF', async () => {
    const res = await t.as(tok.admin, A.slug).get(`/v1/exams/${A.examId}/report-cards/bundle?sectionId=${A.sectionA}`).buffer(true).parse((r, cb) => {
      const chunks: Buffer[] = [];
      r.on('data', (c: Buffer) => chunks.push(c));
      r.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    const doc = await PDFDocument.load(res.body as Buffer);
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(2);
  });

  it('parents get their own child\'s card only after results are published', async () => {
    expect((await t.as(tok.parent, A.slug).get(`/v1/exams/${A.examId}/report-cards/${A.students.s1}`)).status).toBe(404);
    expect((await t.as(tok.admin, A.slug).post(`/v1/exams/${A.examId}/results/publish`)).status).toBe(200);
    const link = await t.as(tok.parent, A.slug).get(`/v1/exams/${A.examId}/report-cards/${A.students.s1}`);
    expect(link.status).toBe(200);
    const file = await t.http.get(link.body.data.url);
    expect(file.status).toBe(200);
    expect(Buffer.from(file.body as Buffer).subarray(0, 4).toString()).toBe('%PDF');
    expect((await t.as(tok.parent, A.slug).get(`/v1/exams/${A.examId}/report-cards/${A.students.s2}`)).status).toBe(404);
    const results = await t.as(tok.parent, A.slug).get(`/v1/students/${A.students.s1}/results`);
    expect(results.body.data[0].reportCard).toMatchObject({ version: 2 });
  });
});

describe('report card template', () => {
  const data: ReportCardData = {
    school: { name: 'St. Mary\'s <School>', address: '1 MG Road, Pune', contact: null, board: 'CBSE', accent: 'red;}</style><script>', logoDataUri: null },
    academicYear: '2026–27',
    exam: { name: 'Term 1', term: null, rankingEnabled: true },
    student: { dateOfBirth: '14 Mar 2013', guardian: 'Raj Kumar', photoDataUri: null },
    classTeacher: 'Priya Sharma',
    grades: [{ label: 'A1', minPercent: 91, maxPercent: 100, remark: null }],
    result: {
      studentId: 's',
      name: '<img src=x onerror=alert(1)>',
      admissionNo: '1501',
      rollNo: 1,
      section: { id: 'x', label: '8-A' },
      subjects: [{ examSubjectId: 'e', subject: { id: 'm', name: 'हिंदी' }, maxMarks: 50, passMarks: 17, marks: 45, absent: false, exempt: false, grade: 'A1', passed: true }],
      totalObtained: 45,
      totalMax: 50,
      percentage: 90,
      grade: 'A2',
      status: 'PASS',
      rankInSection: 1,
      rankInClass: 2,
      attendancePct: 95.5,
      teacherRemark: 'Good </div> work',
      principalRemark: null,
      publishedAt: null,
    },
  };

  it("follows the school's layout and what it chose to show", () => {
    const classic = reportCardHtml(data);
    expect(classic).toContain('<th class="num">Pass</th>');
    expect(classic).toContain('<div class="sign">Parent / guardian</div>');
    const compact = reportCardHtml({
      ...data,
      card: { layout: 'compact', title: 'Progress report', show: { photo: false, passMarks: false, rank: false, gradingKey: false, remarks: false, parentSignature: false } },
    });
    expect(compact).toContain('Progress report · ');
    expect(compact).toContain('margin: 10mm 10mm 12mm');
    expect(compact).not.toContain('<th class="num">Pass</th>');
    expect(compact).not.toContain('<div class="sign">Parent / guardian</div>');
    expect(compact).not.toContain("Class teacher's remarks");
    expect(compact).not.toContain('Grading:');
    expect(reportCardHtml({ ...data, card: { layout: 'modern', title: null, show: { photo: true, passMarks: true, rank: true, gradingKey: true, remarks: true, parentSignature: true } } })).toContain('border-radius: 10px');
  });

  it('escapes every user value and rejects unsafe colours', () => {
    const html = reportCardHtml(data);
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).toContain('St. Mary&#39;s &lt;School&gt;');
    expect(html).not.toContain('<script>');
    expect(html).toContain('#2F6FEB');
    expect(html).toContain('Rank in section');
  });

  const chrome = ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/chromium', '/usr/bin/google-chrome'].some((p) => existsSync(p));
  it.skipIf(!chrome)('renders a real A4 PDF with Chromium (Devanagari included)', async () => {
    const renderer = new ChromiumPdfRenderer(testEnv({ PDF_RENDERER: 'chromium' }), pino({ level: 'silent' }));
    try {
      const pdf = await renderer.render(reportCardHtml(data));
      const doc = await PDFDocument.load(pdf);
      expect(doc.getPageCount()).toBe(1);
      const { width, height } = doc.getPage(0).getSize();
      expect(Math.round(width)).toBe(595);
      expect(Math.round(height)).toBe(842);
    } finally {
      await renderer.onApplicationShutdown();
    }
  }, 60_000);
});
