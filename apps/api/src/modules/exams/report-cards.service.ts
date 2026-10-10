import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import type { Logger } from 'pino';
import type { DownloadLink, ReportCardStatus } from '@schoolos/contracts';
import { AuditService } from '../../core/audit/audit.service.js';
import { RequestContextStore } from '../../core/context/request-context.js';
import { AppError } from '../../core/errors/app-error.js';
import { LOGGER } from '../../core/logger/logger.js';
import { PdfRenderer, mergePdfs } from '../../core/pdf/pdf-renderer.js';
import { ScopeService } from '../../core/permissions/scope.service.js';
import { PrismaService } from '../../core/prisma/prisma.service.js';
import { QUEUES, QueueService } from '../../core/queue/queue.service.js';
import { fromDate, fullName } from '../../core/util/dates.js';
import { FilesService } from '../files/files.service.js';
import { SchoolSettingsService } from '../../core/settings/school-settings.service.js';
import { CoScholasticService } from './co-scholastic.service.js';
import { ExamsService } from './exams.service.js';
import { ON_ROLL } from './marks.service.js';
import { reportCardHtml } from './report-card.template.js';
import { ResultsService } from './results.service.js';

const fmtDate = (iso: string | null) =>
  iso ? new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`)) : null;

/**
 * Report cards (Master Prompt §33): one PDF per student, rendered in the worker from an HTML
 * template, stored as a versioned file. A whole section is one click; parents can download
 * their child's card once results are published.
 */
@Injectable()
export class ReportCardsService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: ScopeService,
    private readonly audit: AuditService,
    private readonly queues: QueueService,
    private readonly files: FilesService,
    private readonly exams: ExamsService,
    private readonly results: ResultsService,
    private readonly pdf: PdfRenderer,
    private readonly settings: SchoolSettingsService,
    private readonly coScholastic: CoScholasticService,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {}

  onModuleInit(): void {
    this.queues.handle(QUEUES.documents, 'report-cards', async (data) => {
      await this.generateNow(String(data.examId), String(data.sectionId), data.studentIds ? String(data.studentIds).split(',') : undefined, String(data.memberId));
    });
  }

  /** Queue generation for a section (or some students in it). */
  async generate(examId: string, sectionId: string, studentIds?: string[]): Promise<{ queued: number }> {
    const exam = await this.exams.row(examId);
    const section = await this.prisma.db.section.findUnique({ where: { id: sectionId }, select: { classId: true, academicYearId: true } });
    if (!section || section.academicYearId !== exam.academicYearId || !exam.subjects.some((s) => s.classId === section.classId)) throw AppError.notFound('section');
    const results = await this.prisma.db.examResult.findMany({ where: { examId, sectionId, ...(studentIds ? { studentId: { in: studentIds } } : {}) }, select: { studentId: true } });
    if (!results.length) throw new AppError('NOT_COMPUTED', 422, 'Compute the results for this section first.');
    const { schoolId } = RequestContextStore.school();
    const { membershipId } = RequestContextStore.tenant();
    await this.queues.add(
      QUEUES.documents,
      'report-cards',
      { schoolId, examId, sectionId, studentIds: studentIds?.join(',') ?? null, memberId: membershipId },
      { jobId: `report-cards-${examId}-${sectionId}-${Date.now()}`, attempts: 2 },
    );
    await this.prisma.tenantTx((tx) => this.audit.record(tx, { action: 'report_cards.generate', entityType: 'Exam', entityId: examId, metadata: { sectionId, students: results.length } }));
    return { queued: results.length };
  }

  /** Worker: render and store each student's card. Also callable directly (tests). */
  async generateNow(examId: string, sectionId: string, studentIds: string[] | undefined, memberId: string): Promise<number> {
    const exam = await this.prisma.db.exam.findUniqueOrThrow({
      where: { id: examId },
      include: { academicYear: { select: { name: true } }, gradingScale: { include: { bands: { orderBy: { order: 'asc' } } } } },
    });
    const school = await this.prisma.db.school.findUniqueOrThrow({ where: { id: RequestContextStore.school().schoolId } });
    const section = await this.prisma.db.section.findUniqueOrThrow({ where: { id: sectionId }, include: { classTeacher: { select: { firstName: true, lastName: true } } } });
    const rows = await this.results.rows(examId, { examId, sectionId, ...(studentIds ? { studentId: { in: studentIds } } : {}) });
    const students = await this.prisma.db.student.findMany({
      where: { id: { in: rows.map((r) => r.studentId) } },
      select: { id: true, dateOfBirth: true, photoFileId: true, guardians: { orderBy: { isPrimary: 'desc' }, take: 1, select: { guardian: { select: { name: true } } } } },
    });
    const logo = await this.imageDataUri(school.logoFileId);
    const [general, examSettings, branding] = await Promise.all([this.settings.get('general'), this.settings.get('examinations'), this.settings.get('branding')]);
    const signature = await this.imageDataUri(branding.signatureFileId);
    const coGrades = await this.coScholastic.forStudents(examId, rows.map((r) => r.studentId));
    const address = [school.addressLine1, school.addressLine2, school.city, [school.state, school.postalCode].filter(Boolean).join(' ')].filter(Boolean).join(', ') || null;
    const contact = [school.phone, school.email].filter(Boolean).join(' · ') || null;
    const grades = exam.gradingScale.bands.map((b) => ({ label: b.label, minPercent: Number(b.minPercent), maxPercent: Number(b.maxPercent), remark: b.remark }));

    let made = 0;
    for (const result of rows) {
      const st = students.find((s) => s.id === result.studentId);
      const html = reportCardHtml({
        school: { name: school.name, address, contact, board: school.board, accent: school.accentColor, logoDataUri: logo, affiliation: general.affiliation },
        principal: { name: general.principalName, signatureDataUri: signature },
        note: examSettings.reportCardNote,
        showAttendance: examSettings.showAttendanceOnReportCard,
        coScholastic: coGrades.get(result.studentId) ?? [],
        academicYear: exam.academicYear.name,
        exam: { name: exam.name, term: exam.term, rankingEnabled: exam.rankingEnabled },
        student: { dateOfBirth: fmtDate(fromDate(st?.dateOfBirth)), guardian: st?.guardians[0]?.guardian.name ?? null, photoDataUri: await this.imageDataUri(st?.photoFileId ?? null) },
        classTeacher: section.classTeacher ? fullName(section.classTeacher.firstName, section.classTeacher.lastName) : null,
        result,
        grades,
      });
      const data = await this.pdf.render(html);
      const fileId = await this.files.storeGenerated({
        purpose: 'report_card',
        fileName: `${result.name} - ${exam.name}.pdf`.replace(/[\\/:*?"<>|]/g, ''),
        mimeType: 'application/pdf',
        data,
        memberId,
      });
      const latest = await this.prisma.db.reportCard.findFirst({ where: { examId, studentId: result.studentId }, orderBy: { version: 'desc' }, select: { version: true } });
      await this.prisma.tenantTx((tx) =>
        tx.reportCard.create({ data: { examId, studentId: result.studentId, fileId, version: (latest?.version ?? 0) + 1, generatedByMemberId: memberId } as never }),
      );
      made++;
    }
    this.logger.info({ examId, sectionId, made }, 'report cards generated');
    return made;
  }

  private imageDataUri(fileId: string | null): Promise<string | null> {
    return this.files.imageDataUri(fileId); // a missing image never blocks a report card
  }

  /** Who has a card in this section, and which version. */
  async status(examId: string, sectionId: string): Promise<ReportCardStatus[]> {
    await this.exams.row(examId);
    const roster = await this.prisma.db.studentEnrollment.findMany({
      where: { sectionId, ...ON_ROLL },
      include: { student: { select: { firstName: true, lastName: true } } },
      orderBy: [{ rollNo: { sort: 'asc', nulls: 'last' } }, { student: { firstName: 'asc' } }],
    });
    const cards = await this.prisma.db.reportCard.findMany({ where: { examId, studentId: { in: roster.map((r) => r.studentId) } }, orderBy: { version: 'desc' } });
    return roster.map((r) => {
      const c = cards.find((x) => x.studentId === r.studentId);
      return { studentId: r.studentId, name: fullName(r.student.firstName, r.student.lastName), rollNo: r.rollNo, version: c?.version ?? null, generatedAt: c?.generatedAt.toISOString() ?? null };
    });
  }

  /** Latest card for a student. Parents: own child, published and not withheld. */
  async link(examId: string, studentId: string): Promise<DownloadLink> {
    const perms = RequestContextStore.tenant().permissions;
    const staff = perms['report_card.generate'] || perms['results.view'] === 'ALL';
    if (!staff) {
      const ok = (await this.scope.canAccessStudent('results.view', studentId)) && (await this.prisma.db.student.count({ where: { id: studentId } })) > 0;
      const visible = ok && (await this.prisma.db.examResult.count({ where: { examId, studentId, publishedAt: { not: null }, resultStatus: { not: 'WITHHELD' } } }));
      if (!visible) throw AppError.notFound('report card');
    } else {
      await this.exams.row(examId);
    }
    const card = await this.prisma.db.reportCard.findFirst({ where: { examId, studentId }, orderBy: { version: 'desc' } });
    if (!card) throw AppError.notFound('report card');
    return this.files.attachedLink(card.fileId);
  }

  /** The whole section's latest cards merged into one PDF (to print). */
  async bundle(examId: string, sectionId: string): Promise<{ data: Buffer; fileName: string }> {
    const exam = await this.exams.row(examId);
    const status = await this.status(examId, sectionId);
    const ids = status.filter((s) => s.version).map((s) => s.studentId);
    if (!ids.length) throw new AppError('NO_REPORT_CARDS', 422, 'Generate the report cards for this section first.');
    const cards = await this.prisma.db.reportCard.findMany({ where: { examId, studentId: { in: ids } }, orderBy: { version: 'desc' } });
    const latest = ids.map((id) => cards.find((c) => c.studentId === id)!.fileId);
    const data = await mergePdfs(await Promise.all(latest.map((f) => this.files.bytes(f))));
    const section = await this.prisma.db.section.findUniqueOrThrow({ where: { id: sectionId }, select: { name: true, class: { select: { name: true } } } });
    return { data, fileName: `${exam.name} - ${section.class.name.replace(/^Class\s+/i, '')}-${section.name} report cards.pdf` };
  }
}
