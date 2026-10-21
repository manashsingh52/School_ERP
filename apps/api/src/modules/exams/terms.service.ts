import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import type { Logger } from 'pino';
import type { z } from 'zod';
import { gradeFor, type DownloadLink, type ExamTermItem, type ResultRow, type StudentTermResultItem, type TermResultRow, type TermSubjectResult, type examTermSchema } from '@schoolos/contracts';
import { AuditService } from '../../core/audit/audit.service.js';
import { RequestContextStore } from '../../core/context/request-context.js';
import { AppError } from '../../core/errors/app-error.js';
import { LOGGER } from '../../core/logger/logger.js';
import { ScopeService } from '../../core/permissions/scope.service.js';
import { PdfRenderer } from '../../core/pdf/pdf-renderer.js';
import { PrismaService } from '../../core/prisma/prisma.service.js';
import { QUEUES, QueueService } from '../../core/queue/queue.service.js';
import { SchoolSettingsService } from '../../core/settings/school-settings.service.js';
import { fromDate } from '../../core/util/dates.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { FilesService } from '../files/files.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { CoScholasticService } from './co-scholastic.service.js';
import { ResultsService } from './results.service.js';
import { termReportCardHtml } from './term-report-card.template.js';

type In<T extends z.ZodType> = z.output<T>;
type Component = { examId: string; weight: number };
type TermRow = Prisma.ExamTermGetPayload<{ include: { gradingScale: { include: { bands: true } } } }>;
const round1 = (n: number) => Math.round(n * 10) / 10;
const fmtDate = (iso: string | null) => (iso ? new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`)) : null);

/**
 * Consolidated term results (roadmap follow-up to Phase 4): several published exams combined with
 * weights. Per subject: the weighted % of the exam percentages (absent = 0; exempt drops out and the
 * other weights scale up); pass if the weighted % reaches the weighted pass mark. Overall: weighted
 * % across subjects (by their maximum marks, like a single exam). Computed from published results
 * every time — nothing to keep in sync.
 */
@Injectable()
export class TermsService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: ScopeService,
    private readonly audit: AuditService,
    private readonly results: ResultsService,
    private readonly files: FilesService,
    private readonly pdf: PdfRenderer,
    private readonly settings: SchoolSettingsService,
    private readonly queues: QueueService,
    private readonly notifications: NotificationsService,
    private readonly coScholastic: CoScholasticService,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {}

  onModuleInit(): void {
    this.queues.handle(QUEUES.documents, 'term-report-cards', async (data) => {
      await this.generateAll(String(data.termId), String(data.memberId));
    });
  }

  // ---------------------------------------------------------------- setup

  private async yearId(): Promise<string> {
    const y = await this.scope.currentAcademicYearId();
    if (!y) throw new AppError('NO_ACADEMIC_YEAR', 422, 'Set the current academic year first.');
    return y;
  }

  private async term(id: string): Promise<TermRow> {
    const t = await this.prisma.db.examTerm.findFirst({ where: { id }, include: { gradingScale: { include: { bands: true } } } });
    if (!t) throw AppError.notFound('term');
    return t;
  }

  private comps(t: { components: unknown }): Component[] {
    return t.components as Component[];
  }

  private async toItems(rows: TermRow[]): Promise<ExamTermItem[]> {
    const ids = [...new Set(rows.flatMap((r) => this.comps(r).map((c) => c.examId)))];
    const exams = await this.prisma.db.exam.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, status: true } });
    return rows.map((r) => {
      const components = this.comps(r).map((c) => ({ exam: exams.find((e) => e.id === c.examId) ?? { id: c.examId, name: 'Deleted exam', status: 'ARCHIVED' as const }, weight: c.weight }));
      return {
        id: r.id,
        name: r.name,
        gradingScale: { id: r.gradingScale.id, name: r.gradingScale.name },
        components,
        ready: components.every((c) => c.exam.status === 'RESULTS_PUBLISHED'),
        publishedAt: r.publishedAt?.toISOString() ?? null,
      };
    });
  }

  async list(): Promise<ExamTermItem[]> {
    const rows = await this.prisma.db.examTerm.findMany({ where: { academicYearId: await this.yearId() }, include: { gradingScale: { include: { bands: true } } }, orderBy: { createdAt: 'asc' } });
    return this.toItems(rows);
  }

  private async validate(input: In<typeof examTermSchema>, yearId: string, exceptId?: string) {
    if (!(await this.prisma.db.gradingScale.count({ where: { id: input.gradingScaleId } }))) throw AppError.invalidReference('gradingScaleId', 'grading scale');
    const exams = await this.prisma.db.exam.count({ where: { id: { in: input.components.map((c) => c.examId) }, academicYearId: yearId } });
    if (exams !== input.components.length) throw AppError.invalidReference('components', 'exam this year');
    if (await this.prisma.db.examTerm.count({ where: { academicYearId: yearId, name: input.name, ...(exceptId ? { id: { not: exceptId } } : {}) } })) {
      throw new AppError('DUPLICATE', 409, 'A term with this name exists this year.', [{ field: 'name', message: 'Already used' }]);
    }
  }

  async create(input: In<typeof examTermSchema>): Promise<ExamTermItem> {
    const yearId = await this.yearId();
    await this.validate(input, yearId);
    const t = await this.prisma.tenantTx(async (tx) => {
      const row = await tx.examTerm.create({ data: { academicYearId: yearId, name: input.name, gradingScaleId: input.gradingScaleId, components: input.components } as unknown as Prisma.ExamTermUncheckedCreateInput, include: { gradingScale: { include: { bands: true } } } });
      await this.audit.record(tx, { action: 'exam_term.create', entityType: 'ExamTerm', entityId: row.id, after: input });
      return row;
    });
    return (await this.toItems([t]))[0]!;
  }

  async update(id: string, input: In<typeof examTermSchema>): Promise<ExamTermItem> {
    const before = await this.term(id);
    if (before.publishedAt) throw new AppError('TERM_PUBLISHED', 409, 'Unpublish the term before changing it.');
    await this.validate(input, before.academicYearId, id);
    const t = await this.prisma.tenantTx(async (tx) => {
      const row = await tx.examTerm.update({ where: { id }, data: { name: input.name, gradingScaleId: input.gradingScaleId, components: input.components }, include: { gradingScale: { include: { bands: true } } } });
      await tx.termReportCard.deleteMany({ where: { termId: id } }); // the weights changed: old cards are wrong
      await this.audit.record(tx, { action: 'exam_term.update', entityType: 'ExamTerm', entityId: id, before: { components: before.components, name: before.name }, after: input });
      return row;
    });
    return (await this.toItems([t]))[0]!;
  }

  async remove(id: string): Promise<void> {
    const t = await this.term(id);
    if (t.publishedAt) throw new AppError('TERM_PUBLISHED', 409, 'Unpublish the term before deleting it.');
    await this.prisma.tenantTx(async (tx) => {
      await tx.examTerm.delete({ where: { id } });
      await this.audit.record(tx, { action: 'exam_term.delete', entityType: 'ExamTerm', entityId: id, before: { name: t.name } });
    });
  }

  // ---------------------------------------------------------------- compute

  /** Term rows for some students (published exam results only). */
  private async compute(t: TermRow, where: Prisma.ExamResultWhereInput): Promise<TermResultRow[]> {
    const comps = this.comps(t);
    const bands = t.gradingScale.bands.map((b) => ({ label: b.label, minPercent: Number(b.minPercent) }));
    const perExam = new Map<string, Map<string, ResultRow>>();
    for (const c of comps) {
      const rows = await this.results.rows(c.examId, { ...where, examId: c.examId, publishedAt: { not: null }, resultStatus: { not: 'WITHHELD' } });
      perExam.set(c.examId, new Map(rows.map((r) => [r.studentId, r])));
    }
    const students = new Map<string, ResultRow>();
    for (const m of perExam.values()) for (const [id, r] of m) if (!students.has(id)) students.set(id, r);

    const out: TermResultRow[] = [];
    for (const [studentId, base] of students) {
      const subjects = new Map<string, { name: string; parts: { examId: string; weight: number; pct: number | null; passPct: number; max: number; absent: boolean; exempt: boolean }[] }>();
      for (const c of comps) {
        const r = perExam.get(c.examId)!.get(studentId);
        for (const s of r?.subjects ?? []) {
          const entry = subjects.get(s.subject.id) ?? { name: s.subject.name, parts: [] };
          entry.parts.push({ examId: c.examId, weight: c.weight, pct: s.absent ? 0 : s.marks === null ? null : (s.marks / s.maxMarks) * 100, passPct: (s.passMarks / s.maxMarks) * 100, max: s.maxMarks, absent: s.absent, exempt: s.exempt });
          subjects.set(s.subject.id, entry);
        }
      }
      let weightedSum = 0;
      let weightTotal = 0;
      let incomplete = comps.some((c) => !perExam.get(c.examId)!.has(studentId));
      let failed = false;
      const rows: TermSubjectResult[] = [...subjects.entries()]
        .sort((a, b) => a[1].name.localeCompare(b[1].name))
        .map(([id, sub]) => {
          // An exam that didn't have this subject simply isn't in `parts`; exempt ones drop out too.
          const counted = sub.parts.filter((p) => !p.exempt);
          const missing = counted.some((p) => p.pct === null);
          const w = counted.reduce((a, p) => a + p.weight, 0);
          const percent = !counted.length || missing ? null : round1(counted.reduce((a, p) => a + p.weight * p.pct!, 0) / w);
          const passAt = w ? counted.reduce((a, p) => a + p.weight * p.passPct, 0) / w : 0;
          const passed = percent === null ? null : percent + 1e-9 >= passAt;
          if (missing && counted.length) incomplete = true;
          if (passed === false) failed = true;
          if (percent !== null) {
            const maxWeight = counted.reduce((a, p) => a + (p.weight * p.max) / w, 0); // the subject's weight in the total, like its max marks
            weightedSum += percent * maxWeight;
            weightTotal += maxWeight;
          }
          return {
            subject: { id, name: sub.name },
            components: comps.map((c) => {
              const p = sub.parts.find((x) => x.examId === c.examId);
              return { examId: c.examId, percent: p?.pct === null || p?.pct === undefined || p.exempt ? null : round1(p.pct), absent: p?.absent ?? false, exempt: p?.exempt ?? false };
            }),
            percent,
            grade: percent === null ? null : gradeFor(percent, bands),
            passed,
          };
        });
      const percentage = weightTotal ? round1(weightedSum / weightTotal) : null;
      out.push({
        studentId,
        name: base.name,
        admissionNo: base.admissionNo,
        rollNo: base.rollNo,
        section: base.section,
        subjects: rows,
        percentage,
        grade: percentage === null ? null : gradeFor(percentage, bands),
        status: incomplete ? 'INCOMPLETE' : failed ? 'FAIL' : 'PASS',
        rankInSection: null,
      });
    }
    // Rank within each section by term %, ties share a rank (only complete results).
    for (const sectionId of new Set(out.map((r) => r.section.id))) {
      const ranked = out.filter((r) => r.section.id === sectionId && r.status !== 'INCOMPLETE' && r.percentage !== null).sort((a, b) => b.percentage! - a.percentage!);
      ranked.forEach((r, i) => (r.rankInSection = i > 0 && ranked[i - 1]!.percentage === r.percentage ? ranked[i - 1]!.rankInSection : i + 1));
    }
    return out.sort((a, b) => a.section.label.localeCompare(b.section.label) || (a.rollNo ?? 999) - (b.rollNo ?? 999) || a.name.localeCompare(b.name));
  }

  async resultsFor(id: string, sectionId?: string): Promise<{ term: ExamTermItem; rows: TermResultRow[] }> {
    const t = await this.term(id);
    const sections = await this.results.visibleSections();
    if (sectionId && sections && !sections.includes(sectionId)) throw AppError.notFound('section');
    const where: Prisma.ExamResultWhereInput = sectionId ? { sectionId } : sections ? { sectionId: { in: sections } } : {};
    return { term: (await this.toItems([t]))[0]!, rows: await this.compute(t, where) };
  }

  // ---------------------------------------------------------------- publish & parents

  async publish(id: string): Promise<ExamTermItem> {
    const ctx = RequestContextStore.tenant();
    const t = await this.term(id);
    const [item] = await this.toItems([t]);
    if (!item!.ready) throw new AppError('TERM_NOT_READY', 409, 'Publish the results of every exam in this term first.');
    const row = await this.prisma.tenantTx(async (tx) => {
      const r = await tx.examTerm.update({ where: { id }, data: { publishedAt: new Date() }, include: { gradingScale: { include: { bands: true } } } });
      await this.audit.record(tx, { action: 'exam_term.publish', entityType: 'ExamTerm', entityId: id });
      return r;
    });
    await this.queues.add(QUEUES.documents, 'term-report-cards', { schoolId: ctx.schoolId, termId: id, memberId: ctx.membershipId }, { jobId: `term-cards-${id}-${Date.now()}` });
    await this.notifyParents(row);
    return (await this.toItems([row]))[0]!;
  }

  async unpublish(id: string): Promise<ExamTermItem> {
    await this.term(id);
    const row = await this.prisma.tenantTx(async (tx) => {
      const r = await tx.examTerm.update({ where: { id }, data: { publishedAt: null }, include: { gradingScale: { include: { bands: true } } } });
      await this.audit.record(tx, { action: 'exam_term.unpublish', entityType: 'ExamTerm', entityId: id });
      return r;
    });
    return (await this.toItems([row]))[0]!;
  }

  private async notifyParents(t: TermRow): Promise<void> {
    const rows = await this.compute(t, {});
    const names = new Map(rows.map((r) => [r.studentId, r.name.split(' ')[0]!]));
    const guardians = await this.notifications.guardiansOf([...names.keys()]);
    await this.notifications.notify({
      event: 'exam.results_published',
      recipients: guardians.map((g) => ({ membershipId: g.membershipId, vars: { exam: t.name, student: names.get(g.studentId) }, data: { route: '/my/results', termId: t.id, studentId: g.studentId } })),
      dedupeKey: (_m, i) => `term:${t.id}:${guardians[i]!.studentId}`,
    });
  }

  /** Co-scholastic grades from the last exam in the term that has any for this student. */
  private async coFor(t: { components: unknown }, studentId: string) {
    for (const c of [...this.comps(t)].reverse()) {
      const list = (await this.coScholastic.forStudents(c.examId, [studentId])).get(studentId);
      if (list?.length) return list;
    }
    return [];
  }

  /** A child's published terms (parents; staff on a profile). */
  async forStudent(studentId: string): Promise<StudentTermResultItem[]> {
    const ok = (await this.scope.canAccessStudent('results.view', studentId)) && (await this.prisma.db.student.count({ where: { id: studentId } })) > 0;
    if (!ok) throw AppError.notFound('student');
    const terms = await this.prisma.db.examTerm.findMany({ where: { academicYearId: await this.yearId(), publishedAt: { not: null } }, include: { gradingScale: { include: { bands: true } } }, orderBy: { publishedAt: 'desc' } });
    const out: StudentTermResultItem[] = [];
    for (const t of terms) {
      const [row] = await this.compute(t, { studentId });
      if (!row) continue;
      const [item] = await this.toItems([t]);
      out.push({ term: { id: t.id, name: t.name, publishedAt: t.publishedAt!.toISOString(), components: item!.components.map((c) => ({ name: c.exam.name, weight: c.weight })) }, result: row, coScholastic: await this.coFor(t, studentId) });
    }
    return out;
  }

  // ---------------------------------------------------------------- report cards

  async reportCardLink(id: string, studentId: string): Promise<DownloadLink> {
    const t = await this.term(id);
    const perms = RequestContextStore.tenant().permissions;
    const staffAll = !!perms['results.publish'] || perms['results.view'] === 'ALL';
    if (!(await this.scope.canAccessStudent('results.view', studentId))) throw AppError.notFound('student');
    // Parents see a term only once it's published; teachers are limited to their sections by canAccessStudent.
    if (!t.publishedAt && !staffAll) throw AppError.notFound('report card');
    let card = await this.prisma.db.termReportCard.findUnique({ where: { termId_studentId: { termId: id, studentId } } });
    if (!card) {
      const fileId = await this.render(t, studentId, RequestContextStore.tenant().membershipId);
      if (!fileId) throw AppError.notFound('report card');
      card = await this.prisma.db.termReportCard.findUniqueOrThrow({ where: { termId_studentId: { termId: id, studentId } } });
    }
    return this.files.attachedLink(card.fileId);
  }

  /** Job: every student's card after publishing. */
  async generateAll(termId: string, memberId: string): Promise<number> {
    const t = await this.term(termId);
    let made = 0;
    for (const r of await this.compute(t, {})) {
      if (await this.render(t, r.studentId, memberId, r)) made++;
    }
    this.logger.info({ termId, made }, 'term report cards generated');
    return made;
  }

  private async render(t: TermRow, studentId: string, memberId: string, precomputed?: TermResultRow): Promise<string | null> {
    const row = precomputed ?? (await this.compute(t, { studentId }))[0];
    if (!row) return null;
    const [item] = await this.toItems([t]);
    const school = await this.prisma.db.school.findUniqueOrThrow({ where: { id: RequestContextStore.school().schoolId } });
    const [general, branding, examSettings] = await Promise.all([this.settings.get('general'), this.settings.get('branding'), this.settings.get('examinations')]);
    const student = await this.prisma.db.student.findFirst({ where: { id: studentId }, select: { dateOfBirth: true, guardians: { orderBy: { isPrimary: 'desc' }, take: 1, select: { guardian: { select: { name: true } } } } } });
    const year = await this.prisma.db.academicYear.findFirst({ where: { id: t.academicYearId }, select: { name: true } });
    const html = termReportCardHtml({
      school: {
        name: school.name,
        address: [school.addressLine1, school.city, school.state].filter(Boolean).join(', ') || null,
        contact: [school.phone, school.email].filter(Boolean).join(' · ') || null,
        accent: school.accentColor,
        logoDataUri: await this.files.imageDataUri(school.logoFileId),
        affiliation: general.affiliation,
      },
      principal: { name: general.principalName, signatureDataUri: await this.files.imageDataUri(branding.signatureFileId) },
      academicYear: year?.name ?? '',
      term: { name: t.name, components: item!.components.map((c) => ({ id: c.exam.id, name: c.exam.name, weight: c.weight })) },
      student: { dateOfBirth: fmtDate(fromDate(student?.dateOfBirth)), guardian: student?.guardians[0]?.guardian.name ?? null },
      result: row,
      coScholastic: await this.coFor(t, studentId),
      grades: t.gradingScale.bands.sort((a, b) => a.order - b.order).map((b) => ({ label: b.label, minPercent: Number(b.minPercent), maxPercent: Number(b.maxPercent) })),
      card: { layout: examSettings.reportCardLayout, title: examSettings.reportCardTitle, show: examSettings.reportCardShow },
    });
    const fileId = await this.files.storeGenerated({ purpose: 'report_card', fileName: `${row.name} - ${t.name}.pdf`, mimeType: 'application/pdf', data: await this.pdf.render(html), memberId });
    await this.prisma.tenantTx((tx) =>
      tx.termReportCard.upsert({
        where: { termId_studentId: { termId: t.id, studentId } },
        create: { termId: t.id, studentId, fileId } as Prisma.TermReportCardUncheckedCreateInput,
        update: { fileId, generatedAt: new Date() },
      }),
    );
    return fileId;
  }
}
