import { Injectable } from '@nestjs/common';
import type { z } from 'zod';
import type {
  OnboardingState,
  PromotionPlan,
  PromotionResult,
  SchoolProfile,
  promotionCommitSchema,
  updateBrandingSchema,
  updateSchoolProfileSchema,
} from '@schoolos/contracts';
import { AccessService } from '../../core/auth/access.service.js';
import { AuditService } from '../../core/audit/audit.service.js';
import { RequestContextStore } from '../../core/context/request-context.js';
import { AppError } from '../../core/errors/app-error.js';
import { PrismaService } from '../../core/prisma/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { FilesService } from '../files/files.service.js';

type In<T extends z.ZodType> = z.output<T>;
const label = (className: string, section: string) => `${className.replace(/^Class\s+/i, '')}-${section}`;

@Injectable()
export class SchoolService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly files: FilesService,
    private readonly access: AccessService,
  ) {}

  private get schoolId() {
    return RequestContextStore.school().schoolId;
  }

  // ---------------------------------------------------------------- profile & branding

  async profile(): Promise<SchoolProfile> {
    const s = await this.prisma.db.school.findUniqueOrThrow({ where: { id: this.schoolId } });
    const year = s.currentAcademicYearId
      ? await this.prisma.db.academicYear.findUnique({ where: { id: s.currentAcademicYearId }, select: { id: true, name: true } })
      : null;
    return {
      id: s.id,
      slug: s.slug,
      code: s.code,
      name: s.name,
      legalName: s.legalName,
      board: s.board,
      status: s.status,
      timezone: s.timezone,
      phone: s.phone,
      email: s.email,
      website: s.website,
      address: { line1: s.addressLine1, line2: s.addressLine2, city: s.city, state: s.state, postalCode: s.postalCode },
      accentColor: s.accentColor,
      logoUrl: s.logoFileId ? await this.files.inlineUrl(s.logoFileId) : null,
      currentAcademicYear: year,
      onboardingStep: s.onboardingStep,
      wentLiveAt: s.wentLiveAt?.toISOString() ?? null,
    };
  }

  async updateProfile(input: In<typeof updateSchoolProfileSchema>): Promise<SchoolProfile> {
    const before = await this.prisma.db.school.findUniqueOrThrow({ where: { id: this.schoolId } });
    const changes = Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined));
    await this.prisma.tenantTx(async (tx) => {
      await tx.school.update({ where: { id: this.schoolId }, data: changes });
      await this.audit.record(tx, {
        action: 'school.profile.update',
        entityType: 'School',
        entityId: this.schoolId,
        before: Object.fromEntries(Object.keys(changes).map((k) => [k, (before as Record<string, unknown>)[k]])),
        after: changes,
      });
    });
    return this.profile();
  }

  async updateBranding(input: In<typeof updateBrandingSchema>): Promise<SchoolProfile> {
    if (input.logoFileId) await this.files.assertReady(input.logoFileId, 'school_logo');
    const before = await this.prisma.db.school.findUniqueOrThrow({ where: { id: this.schoolId } });
    await this.prisma.tenantTx(async (tx) => {
      await tx.school.update({ where: { id: this.schoolId }, data: input });
      await this.audit.record(tx, {
        action: 'school.branding.update',
        entityType: 'School',
        entityId: this.schoolId,
        before: { accentColor: before.accentColor, logoFileId: before.logoFileId },
        after: input,
      });
    });
    return this.profile();
  }

  // ---------------------------------------------------------------- onboarding

  async onboarding(): Promise<OnboardingState> {
    const school = await this.prisma.db.school.findUniqueOrThrow({ where: { id: this.schoolId } });
    const yearId = school.currentAcademicYearId;
    const [classes, sections, subjects, teachers, students, admins] = await Promise.all([
      this.prisma.db.schoolClass.count({ where: { isActive: true } }),
      yearId ? this.prisma.db.section.count({ where: { academicYearId: yearId } }) : 0,
      this.prisma.db.subject.count({ where: { isActive: true } }),
      this.prisma.db.teacher.count({ where: { status: { not: 'LEFT' } } }),
      yearId ? this.prisma.db.studentEnrollment.count({ where: { academicYearId: yearId, status: 'ENROLLED' } }) : 0,
      this.prisma.db.membership.count({ where: { status: 'ACTIVE', roles: { some: { role: { permissions: { some: { permission: 'role.manage' } } } } } } }),
    ]);
    const year = yearId ? await this.prisma.db.academicYear.findUnique({ where: { id: yearId }, select: { name: true } }) : null;
    const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
    const checklist = [
      { key: 'school', label: 'School information', required: true, done: !!(school.name && (school.phone || school.email) && school.city), detail: school.city ? `${school.name}, ${school.city}` : 'Add a phone or email and the city' },
      { key: 'year', label: 'Academic year', required: true, done: !!year, detail: year ? `${year.name} is current` : 'Create the current academic year' },
      { key: 'classes', label: 'Classes', required: true, done: classes > 0, detail: plural(classes, 'class', 'classes') },
      { key: 'sections', label: 'Sections', required: true, done: sections > 0, detail: plural(sections, 'section') },
      { key: 'subjects', label: 'Subjects', required: false, done: subjects > 0, detail: plural(subjects, 'subject') },
      { key: 'teachers', label: 'Teachers', required: false, done: teachers > 0, detail: plural(teachers, 'teacher') },
      { key: 'students', label: 'Students', required: false, done: students > 0, detail: plural(students, 'student') },
      { key: 'admin', label: 'School admin', required: true, done: admins > 0, detail: plural(admins, 'person', 'people') + ' can manage roles' },
    ];
    return {
      step: school.onboardingStep,
      status: school.status,
      checklist,
      canGoLive: checklist.every((c) => c.done || !c.required),
    };
  }

  async setOnboardingStep(step: number): Promise<OnboardingState> {
    await this.prisma.db.school.update({ where: { id: this.schoolId }, data: { onboardingStep: step } });
    return this.onboarding();
  }

  async goLive(): Promise<OnboardingState> {
    const state = await this.onboarding();
    if (state.status === 'ACTIVE') return state;
    if (!state.canGoLive) {
      const missing = state.checklist.filter((c) => c.required && !c.done).map((c) => c.label);
      throw new AppError('NOT_READY', 422, `Finish these first: ${missing.join(', ')}.`);
    }
    await this.prisma.tenantTx(async (tx) => {
      await tx.school.update({ where: { id: this.schoolId }, data: { status: 'ACTIVE', wentLiveAt: new Date(), onboardingStep: 10 } });
      await this.audit.record(tx, { action: 'school.go_live', entityType: 'School', entityId: this.schoolId });
    });
    return this.onboarding();
  }

  // ---------------------------------------------------------------- year-end promotion

  private async years(fromYearId: string, toYearId: string) {
    if (fromYearId === toYearId) throw new AppError('VALIDATION_FAILED', 422, 'Choose two different academic years.');
    const [from, to] = await Promise.all([
      this.prisma.db.academicYear.findUnique({ where: { id: fromYearId } }),
      this.prisma.db.academicYear.findUnique({ where: { id: toYearId } }),
    ]);
    if (!from) throw AppError.invalidReference('fromYearId', 'academic year');
    if (!to) throw AppError.invalidReference('toYearId', 'academic year');
    if (to.status === 'CLOSED') throw new AppError('YEAR_CLOSED', 422, `${to.name} is closed.`);
    if (to.startDate <= from.startDate) throw new AppError('VALIDATION_FAILED', 422, 'Students can only be promoted into a later year.');
    return { from, to };
  }

  async promotionPreview(fromYearId: string, toYearId: string): Promise<PromotionPlan> {
    const { from, to } = await this.years(fromYearId, toYearId);
    const [fromSections, toSections, classes] = await Promise.all([
      this.prisma.db.section.findMany({ where: { academicYearId: from.id }, include: { class: true } }),
      this.prisma.db.section.findMany({ where: { academicYearId: to.id }, include: { class: true } }),
      this.prisma.db.schoolClass.findMany({ where: { isActive: true }, orderBy: { displayOrder: 'asc' } }),
    ]);
    const counts = await this.prisma.db.studentEnrollment.groupBy({
      by: ['sectionId'],
      where: { academicYearId: from.id, status: 'ENROLLED' },
      _count: { _all: true },
    });
    const done = await this.prisma.db.studentEnrollment.groupBy({
      by: ['sectionId'],
      where: { academicYearId: from.id, status: { in: ['PROMOTED', 'DETAINED', 'GRADUATED'] } },
      _count: { _all: true },
    });

    const rows = fromSections
      .sort((a, b) => a.class.displayOrder - b.class.displayOrder || a.name.localeCompare(b.name))
      .map((s) => {
        const nextClass = classes.find((c) => c.displayOrder > s.class.displayOrder);
        const inNext = nextClass ? toSections.filter((t) => t.classId === nextClass.id) : [];
        const target = inNext.find((t) => t.name === s.name) ?? inNext[0] ?? null;
        return {
          fromSection: { id: s.id, label: label(s.class.name, s.name), studentCount: counts.find((c) => c.sectionId === s.id)?._count._all ?? 0 },
          suggestedToSectionId: target?.id ?? null,
          alreadyPromoted: done.find((c) => c.sectionId === s.id)?._count._all ?? 0,
        };
      });
    return {
      from: { id: from.id, name: from.name },
      to: { id: to.id, name: to.name },
      rows,
      toSections: toSections
        .sort((a, b) => a.class.displayOrder - b.class.displayOrder || a.name.localeCompare(b.name))
        .map((t) => ({ id: t.id, label: label(t.class.name, t.name), classOrder: t.class.displayOrder })),
    };
  }

  /**
   * Year-end promotion (docs/02 D4): last year's enrollment is CLOSED with an outcome and a new
   * enrollment is created — history is never overwritten. Safe to run again: students already
   * moved are skipped.
   */
  async promote(input: In<typeof promotionCommitSchema>): Promise<PromotionResult> {
    const { from, to } = await this.years(input.fromYearId, input.toYearId);
    const [fromSections, toSections] = await Promise.all([
      this.prisma.db.section.findMany({ where: { academicYearId: from.id }, select: { id: true, name: true, classId: true } }),
      this.prisma.db.section.findMany({ where: { academicYearId: to.id }, select: { id: true, name: true, classId: true } }),
    ]);
    for (const move of input.moves) {
      if (!fromSections.some((s) => s.id === move.fromSectionId)) throw AppError.invalidReference('moves', 'section');
      if (move.toSectionId && !toSections.some((s) => s.id === move.toSectionId)) throw AppError.invalidReference('moves', 'section');
    }
    const detained = new Set(input.detainedStudentIds);

    const enrollments = await this.prisma.db.studentEnrollment.findMany({
      where: { academicYearId: from.id, status: 'ENROLLED', sectionId: { in: input.moves.map((m) => m.fromSectionId) } },
      select: { id: true, studentId: true, sectionId: true },
    });
    const alreadyThere = new Set(
      (await this.prisma.db.studentEnrollment.findMany({ where: { academicYearId: to.id, studentId: { in: enrollments.map((e) => e.studentId) } }, select: { studentId: true } })).map(
        (e) => e.studentId,
      ),
    );

    const result: PromotionResult = { promoted: 0, detained: 0, graduated: 0, skipped: 0 };
    const newEnrollments: Prisma.StudentEnrollmentCreateManyInput[] = [];
    const outcome: Record<'PROMOTED' | 'DETAINED' | 'GRADUATED', string[]> = { PROMOTED: [], DETAINED: [], GRADUATED: [] };
    const enrolledOn = to.startDate;

    for (const e of enrollments) {
      if (alreadyThere.has(e.studentId)) {
        result.skipped++;
        continue;
      }
      const fromSection = fromSections.find((s) => s.id === e.sectionId)!;
      if (detained.has(e.studentId)) {
        const same = toSections.find((s) => s.classId === fromSection.classId && s.name === fromSection.name)
          ?? toSections.find((s) => s.classId === fromSection.classId);
        if (!same) throw new AppError('NO_SECTION', 422, `Create a section for detained students' class in ${to.name} first.`);
        newEnrollments.push({ studentId: e.studentId, academicYearId: to.id, classId: same.classId, sectionId: same.id, enrolledOn } as Prisma.StudentEnrollmentCreateManyInput);
        outcome.DETAINED.push(e.id);
        result.detained++;
        continue;
      }
      const target = input.moves.find((m) => m.fromSectionId === e.sectionId)!.toSectionId;
      if (!target) {
        outcome.GRADUATED.push(e.id);
        result.graduated++;
        continue;
      }
      const toSection = toSections.find((s) => s.id === target)!;
      newEnrollments.push({ studentId: e.studentId, academicYearId: to.id, classId: toSection.classId, sectionId: toSection.id, enrolledOn } as Prisma.StudentEnrollmentCreateManyInput);
      outcome.PROMOTED.push(e.id);
      result.promoted++;
    }

    const leftOn = from.endDate;
    await this.prisma.tenantTx(
      async (tx) => {
        if (newEnrollments.length) await tx.studentEnrollment.createMany({ data: newEnrollments });
        for (const status of ['PROMOTED', 'DETAINED', 'GRADUATED'] as const) {
          if (outcome[status].length) await tx.studentEnrollment.updateMany({ where: { id: { in: outcome[status] } }, data: { status, leftOn } });
        }
        if (outcome.GRADUATED.length) {
          const graduated = enrollments.filter((e) => outcome.GRADUATED.includes(e.id)).map((e) => e.studentId);
          await tx.student.updateMany({ where: { id: { in: graduated } }, data: { status: 'ALUMNI' } });
        }
        await this.audit.record(tx, { action: 'students.promote', entityType: 'AcademicYear', entityId: to.id, after: { from: from.name, to: to.name, ...result } });
      },
      { timeout: 60_000 },
    );
    this.access.clearAll(); // teacher scopes depend on enrollments
    return result;
  }
}
