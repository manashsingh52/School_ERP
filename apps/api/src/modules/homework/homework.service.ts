import { Injectable, type OnModuleInit } from '@nestjs/common';
import type { z } from 'zod';
import type {
  DownloadLink,
  HomeworkItem,
  HomeworkTargets,
  PageResponse,
  createHomeworkSchema,
  listHomeworkQuerySchema,
  updateHomeworkSchema,
} from '@schoolos/contracts';
import { AuditService } from '../../core/audit/audit.service.js';
import { RequestContextStore } from '../../core/context/request-context.js';
import { AppError } from '../../core/errors/app-error.js';
import { OutboxService } from '../../core/outbox/outbox.service.js';
import { ScopeService } from '../../core/permissions/scope.service.js';
import { PrismaService, type TenantTx } from '../../core/prisma/prisma.service.js';
import { QUEUES, QueueService } from '../../core/queue/queue.service.js';
import { fromDate, fullName, toDate } from '../../core/util/dates.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { FilesService } from '../files/files.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';

type In<T extends z.ZodType> = z.output<T>;

const include = {
  subject: { select: { id: true, name: true } },
  teacher: { select: { id: true, firstName: true, lastName: true } },
  sections: { include: { section: { select: { id: true, name: true, class: { select: { name: true, displayOrder: true } } } } } },
  attachments: { include: { file: { select: { id: true, originalName: true, mimeType: true, sizeBytes: true } } } },
} satisfies Prisma.HomeworkInclude;
type Row = Prisma.HomeworkGetPayload<{ include: typeof include }>;

const label = (className: string, section: string) => `${className.replace(/^Class\s+/i, '')}-${section}`;
const prettyDate = (date: string) =>
  new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`));

/**
 * Homework (Master Prompt §30): a teacher sets work for one or more sections of a subject they
 * teach; publishing (now or scheduled) tells the parents of every student in those sections.
 */
@Injectable()
export class HomeworkService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: ScopeService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly queues: QueueService,
    private readonly files: FilesService,
    private readonly notifications: NotificationsService,
  ) {}

  onModuleInit(): void {
    this.outbox.on('homework.published', (event) => this.notifyParents(String(event.payload.homeworkId)));
    this.queues.handle(QUEUES.maintenance, 'homework.publish', (data) => this.publishScheduled(String(data.homeworkId)));
  }

  // ---------------------------------------------------------------- access

  /** Homework the caller may see. */
  private async visibleWhere(): Promise<Prisma.HomeworkWhereInput> {
    const scope = RequestContextStore.tenant().permissions['homework.view'];
    if (scope === 'ALL') return {};
    if (scope === 'ASSIGNED') {
      const [sections, teacherId] = await Promise.all([this.scope.assignedSectionIds(), this.scope.myTeacherId()]);
      return { OR: [{ sections: { some: { sectionId: { in: sections } } } }, ...(teacherId ? [{ teacherId }] : [])] };
    }
    if (scope === 'OWN_CHILDREN') {
      return { status: 'PUBLISHED', sections: { some: { sectionId: { in: await this.scope.childSectionIds() } } } };
    }
    return { id: { in: [] } };
  }

  private async canEdit(row: { teacherId: string }): Promise<boolean> {
    const scope = RequestContextStore.tenant().permissions['homework.manage'];
    if (scope === 'ALL') return true;
    return scope === 'ASSIGNED' && row.teacherId === (await this.scope.myTeacherId());
  }

  private async editable(id: string): Promise<Row> {
    const row = await this.prisma.db.homework.findFirst({ where: { AND: [{ id }, await this.visibleWhere()] }, include });
    if (!row) throw AppError.notFound('homework');
    if (!(await this.canEdit(row))) throw AppError.forbidden('Only the teacher who set this homework can change it.');
    return row;
  }

  /**
   * Sections must be in the current year; teachers may only set homework for a subject they
   * teach in that section (or any subject in their own class). Returns the teacher to post as.
   */
  private async checkTarget(subjectId: string, sectionIds: string[], requestedTeacherId?: string): Promise<{ teacherId: string; yearId: string }> {
    const yearId = await this.scope.currentAcademicYearId();
    if (!yearId) throw new AppError('NO_ACADEMIC_YEAR', 422, 'Create an academic year first.');
    const ids = [...new Set(sectionIds)];
    const [subject, sections] = await Promise.all([
      this.prisma.db.subject.findUnique({ where: { id: subjectId }, select: { id: true } }),
      this.prisma.db.section.findMany({ where: { id: { in: ids }, academicYearId: yearId }, select: { id: true, classTeacherId: true } }),
    ]);
    if (!subject) throw AppError.invalidReference('subjectId', 'subject');
    if (sections.length !== ids.length) throw AppError.invalidReference('sectionIds', 'section');

    const manage = RequestContextStore.tenant().permissions['homework.manage'];
    const me = await this.scope.myTeacherId();
    if (manage !== 'ALL') {
      if (!me) throw AppError.forbidden();
      const taught = new Set(
        (await this.prisma.db.teachingAssignment.findMany({ where: { teacherId: me, subjectId, sectionId: { in: ids } }, select: { sectionId: true } })).map((a) => a.sectionId),
      );
      const outside = sections.filter((s) => !taught.has(s.id) && s.classTeacherId !== me);
      if (outside.length) {
        throw new AppError('NOT_YOUR_SECTION', 422, "You can only set homework for subjects you teach in that section.", [{ field: 'sectionIds', message: "You don't teach this subject in every chosen section" }]);
      }
      return { teacherId: me, yearId };
    }
    if (requestedTeacherId) {
      if (!(await this.prisma.db.teacher.findUnique({ where: { id: requestedTeacherId }, select: { id: true } }))) throw AppError.invalidReference('teacherId', 'teacher');
      return { teacherId: requestedTeacherId, yearId };
    }
    if (me) return { teacherId: me, yearId };
    // The subject teacher of the first chosen section (deterministic when sections differ).
    const assignments = await this.prisma.db.teachingAssignment.findMany({ where: { subjectId, sectionId: { in: ids } }, select: { teacherId: true, sectionId: true }, orderBy: { id: 'asc' } });
    const assigned = assignments.sort((a, b) => ids.indexOf(a.sectionId) - ids.indexOf(b.sectionId))[0];
    if (!assigned) throw new AppError('TEACHER_REQUIRED', 422, 'Choose which teacher this homework is from.', [{ field: 'teacherId', message: 'Choose a teacher' }]);
    return { teacherId: assigned.teacherId, yearId };
  }

  // ---------------------------------------------------------------- read

  async targets(): Promise<HomeworkTargets> {
    const yearId = await this.scope.currentAcademicYearId();
    const manage = RequestContextStore.tenant().permissions['homework.manage'];
    if (!yearId || !manage) return { anyTeacher: false, sections: [] };
    const me = await this.scope.myTeacherId();
    const [sections, classSubjects, assignments, allSubjects] = await Promise.all([
      this.prisma.db.section.findMany({
        where: { academicYearId: yearId, ...(manage === 'ALL' ? {} : { OR: [{ classTeacherId: me ?? undefined }, { assignments: { some: { teacherId: me ?? undefined } } }] }) },
        select: { id: true, name: true, classId: true, classTeacherId: true, class: { select: { name: true, displayOrder: true } } },
      }),
      this.prisma.db.classSubject.findMany({ where: { academicYearId: yearId }, select: { classId: true, subject: { select: { id: true, name: true } } } }),
      this.prisma.db.teachingAssignment.findMany({
        where: { academicYearId: yearId },
        orderBy: { id: 'asc' },
        select: { sectionId: true, subjectId: true, teacherId: true, subject: { select: { id: true, name: true } }, teacher: { select: { firstName: true, lastName: true } } },
      }),
      this.prisma.db.subject.findMany({ where: { isActive: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    ]);
    if (manage !== 'ALL' && !me) return { anyTeacher: false, sections: [] };
    sections.sort((a, b) => a.class.displayOrder - b.class.displayOrder || a.name.localeCompare(b.name));
    return {
      anyTeacher: manage === 'ALL',
      sections: sections
        .map((sec) => {
          const teacherOf = (subjectId: string) => {
            const a = assignments.find((x) => x.sectionId === sec.id && x.subjectId === subjectId);
            return a ? fullName(a.teacher.firstName, a.teacher.lastName) : null;
          };
          const ofClass = classSubjects.filter((c) => c.classId === sec.classId).map((c) => c.subject);
          let subjects: { id: string; name: string }[];
          if (manage === 'ALL' || sec.classTeacherId === me) subjects = ofClass.length ? ofClass : allSubjects;
          else subjects = assignments.filter((a) => a.sectionId === sec.id && a.teacherId === me).map((a) => a.subject);
          const unique = [...new Map(subjects.map((x) => [x.id, x])).values()].sort((a, b) => a.name.localeCompare(b.name));
          return { id: sec.id, label: label(sec.class.name, sec.name), subjects: unique.map((x) => ({ ...x, teacherName: teacherOf(x.id) })) };
        })
        .filter((s) => s.subjects.length),
    };
  }

  async list(query: In<typeof listHomeworkQuerySchema>): Promise<PageResponse<HomeworkItem>> {
    const filters: Prisma.HomeworkWhereInput[] = [await this.visibleWhere()];
    if (query.sectionId) filters.push({ sections: { some: { sectionId: query.sectionId } } });
    if (query.subjectId) filters.push({ subjectId: query.subjectId });
    if (query.status) filters.push({ status: query.status });
    else filters.push({ status: { not: 'ARCHIVED' } });
    if (query.mine === 'true') filters.push({ teacherId: (await this.scope.myTeacherId()) ?? '00000000-0000-0000-0000-000000000000' });
    if (query.dueFrom || query.dueTo) filters.push({ dueDate: { gte: toDate(query.dueFrom), lte: toDate(query.dueTo) } });
    if (query.q) filters.push({ OR: [{ title: { contains: query.q, mode: 'insensitive' } }, { description: { contains: query.q, mode: 'insensitive' } }] });
    if (query.studentId) {
      if (!(await this.scope.canAccessStudent('homework.view', query.studentId))) throw AppError.notFound('student');
      const yearId = await this.scope.currentAcademicYearId();
      const enrollment = await this.prisma.db.studentEnrollment.findFirst({ where: { studentId: query.studentId, academicYearId: yearId ?? undefined }, select: { sectionId: true } });
      filters.push({ sections: { some: { sectionId: enrollment?.sectionId ?? '00000000-0000-0000-0000-000000000000' } } });
    }
    const where = { AND: filters };
    const [rows, total] = await Promise.all([
      this.prisma.db.homework.findMany({
        where,
        include,
        orderBy: [{ publishedAt: { sort: 'desc', nulls: 'first' } }, { createdAt: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.db.homework.count({ where }),
    ]);
    return { data: await Promise.all(rows.map((r) => this.toItem(r))), page: { page: query.page, pageSize: query.pageSize, total } };
  }

  async get(id: string): Promise<HomeworkItem> {
    const row = await this.prisma.db.homework.findFirst({ where: { AND: [{ id }, await this.visibleWhere()] }, include });
    if (!row) throw AppError.notFound('homework');
    return this.toItem(row);
  }

  async attachmentLink(id: string, fileId: string): Promise<DownloadLink> {
    const row = await this.prisma.db.homework.findFirst({ where: { AND: [{ id }, await this.visibleWhere()] }, select: { attachments: { where: { fileId } } } });
    if (!row?.attachments.length) throw AppError.notFound('file');
    return this.files.attachedLink(fileId);
  }

  // ---------------------------------------------------------------- write

  async create(input: In<typeof createHomeworkSchema>): Promise<HomeworkItem> {
    const { teacherId, yearId } = await this.checkTarget(input.subjectId, input.sectionIds, input.teacherId);
    await this.files.assertAllReady(input.attachmentFileIds, 'homework_attachment', 'attachmentFileIds');
    const publishAt = input.publish === 'SCHEDULE' ? new Date(input.publishAt!) : null;
    if (publishAt && publishAt.getTime() <= Date.now()) throw new AppError('VALIDATION_FAILED', 422, 'Choose a time in the future.', [{ field: 'publishAt', message: 'Must be in the future' }]);

    const { schoolId } = RequestContextStore.school();
    const id = await this.prisma.tenantTx(async (tx) => {
      const hw = await tx.homework.create({
        data: {
          academicYearId: yearId,
          subjectId: input.subjectId,
          teacherId,
          title: input.title,
          description: input.description,
          dueDate: toDate(input.dueDate),
          status: input.publish === 'NOW' ? 'PUBLISHED' : input.publish === 'SCHEDULE' ? 'SCHEDULED' : 'DRAFT',
          publishAt,
          publishedAt: input.publish === 'NOW' ? new Date() : null,
          // Nested writes aren't auto-scoped by the tenant extension: set schoolId explicitly.
          sections: { create: [...new Set(input.sectionIds)].map((sectionId) => ({ sectionId, schoolId })) },
          attachments: { create: [...new Set(input.attachmentFileIds)].map((fileId) => ({ fileId, schoolId })) },
        } as Prisma.HomeworkUncheckedCreateInput,
      });
      await this.audit.record(tx, { action: 'homework.create', entityType: 'Homework', entityId: hw.id, after: { title: input.title, status: hw.status } });
      if (hw.status === 'PUBLISHED') await this.outbox.publish(tx, 'homework.published', { homeworkId: hw.id });
      return hw.id;
    });
    this.outbox.flush();
    if (publishAt) await this.schedule(id, publishAt);
    return this.get(id);
  }

  async update(id: string, input: In<typeof updateHomeworkSchema>): Promise<HomeworkItem> {
    const row = await this.editable(id);
    if (row.status === 'ARCHIVED') throw new AppError('HOMEWORK_ARCHIVED', 422, 'This homework was deleted.');
    const subjectId = input.subjectId ?? row.subjectId;
    const sectionIds = input.sectionIds ?? row.sections.map((s) => s.sectionId);
    if (input.subjectId || input.sectionIds) await this.checkTarget(subjectId, sectionIds, row.teacherId);
    if (input.attachmentFileIds) await this.files.assertAllReady(input.attachmentFileIds, 'homework_attachment', 'attachmentFileIds');

    await this.prisma.tenantTx(async (tx) => {
      await tx.homework.update({
        where: { id },
        data: {
          subjectId,
          title: input.title,
          description: input.description,
          dueDate: input.dueDate === null ? null : toDate(input.dueDate),
        },
      });
      if (input.sectionIds) {
        await tx.homeworkSection.deleteMany({ where: { homeworkId: id } });
        await tx.homeworkSection.createMany({ data: [...new Set(sectionIds)].map((sectionId) => ({ homeworkId: id, sectionId }) as Prisma.HomeworkSectionCreateManyInput) });
      }
      if (input.attachmentFileIds) {
        await tx.homeworkAttachment.deleteMany({ where: { homeworkId: id } });
        await tx.homeworkAttachment.createMany({ data: [...new Set(input.attachmentFileIds)].map((fileId) => ({ homeworkId: id, fileId }) as Prisma.HomeworkAttachmentCreateManyInput) });
      }
      await this.audit.record(tx, { action: 'homework.update', entityType: 'Homework', entityId: id, before: { title: row.title }, after: input });
    });
    return this.get(id);
  }

  async publish(id: string, publishAt?: string): Promise<HomeworkItem> {
    const row = await this.editable(id);
    if (row.status === 'PUBLISHED') return this.toItem(row);
    if (row.status === 'ARCHIVED') throw new AppError('HOMEWORK_ARCHIVED', 422, 'This homework was deleted.');
    const at = publishAt ? new Date(publishAt) : null;
    if (at && at.getTime() > Date.now()) {
      await this.prisma.tenantTx(async (tx) => {
        await tx.homework.update({ where: { id }, data: { status: 'SCHEDULED', publishAt: at } });
        await this.audit.record(tx, { action: 'homework.schedule', entityType: 'Homework', entityId: id, after: { publishAt: at.toISOString() } });
      });
      await this.schedule(id, at);
    } else {
      await this.prisma.tenantTx((tx) => this.markPublished(tx, id));
      this.outbox.flush();
    }
    return this.get(id);
  }

  /** Drafts and scheduled homework are deleted; published homework is archived (parents saw it). */
  async remove(id: string): Promise<void> {
    const row = await this.editable(id);
    await this.prisma.tenantTx(async (tx) => {
      if (row.status === 'PUBLISHED') await tx.homework.update({ where: { id }, data: { status: 'ARCHIVED' } });
      else await tx.homework.delete({ where: { id } });
      await this.audit.record(tx, { action: 'homework.delete', entityType: 'Homework', entityId: id, before: { title: row.title, status: row.status } });
    });
  }

  // ---------------------------------------------------------------- publishing

  private async schedule(id: string, at: Date): Promise<void> {
    const { schoolId } = RequestContextStore.school();
    await this.queues.add(QUEUES.maintenance, 'homework.publish', { schoolId, homeworkId: id }, { delay: Math.max(0, at.getTime() - Date.now()), jobId: `homework-${id}-${at.getTime()}` });
  }

  private async markPublished(tx: TenantTx, id: string): Promise<void> {
    await tx.homework.update({ where: { id }, data: { status: 'PUBLISHED', publishedAt: new Date() } });
    await this.audit.record(tx, { action: 'homework.publish', entityType: 'Homework', entityId: id });
    await this.outbox.publish(tx, 'homework.published', { homeworkId: id });
  }

  /** Delayed job: publish if still scheduled for (about) now. A rescheduled or cancelled item is a no-op. */
  private async publishScheduled(id: string): Promise<void> {
    const row = await this.prisma.db.homework.findUnique({ where: { id }, select: { status: true, publishAt: true } });
    if (row?.status !== 'SCHEDULED' || !row.publishAt || row.publishAt.getTime() > Date.now() + 5_000) return;
    await this.prisma.tenantTx((tx) => this.markPublished(tx, id));
    this.outbox.flush();
  }

  private async notifyParents(id: string): Promise<void> {
    const hw = await this.prisma.db.homework.findUnique({
      where: { id },
      select: { status: true, title: true, dueDate: true, subject: { select: { name: true } }, sections: { select: { sectionId: true } } },
    });
    if (hw?.status !== 'PUBLISHED') return;
    const enrollments = await this.prisma.db.studentEnrollment.findMany({
      where: { sectionId: { in: hw.sections.map((s) => s.sectionId) }, status: 'ENROLLED' },
      select: { studentId: true, student: { select: { firstName: true } } },
    });
    const names = new Map(enrollments.map((e) => [e.studentId, e.student.firstName]));
    const guardians = await this.notifications.guardiansOf([...names.keys()]);
    const due = fromDate(hw.dueDate);
    await this.notifications.notify({
      event: 'homework.published',
      recipients: guardians.map((g) => ({
        membershipId: g.membershipId,
        vars: { subject: hw.subject.name, student: names.get(g.studentId), title: hw.title, due: due ? ` · due ${prettyDate(due)}` : '' },
        data: { route: '/homework', homeworkId: id, studentId: g.studentId },
      })),
      dedupeKey: (_m, i) => `homework:${id}:${guardians[i]!.studentId}`,
    });
  }

  private async toItem(r: Row): Promise<HomeworkItem> {
    const sections = [...r.sections].sort((a, b) => a.section.class.displayOrder - b.section.class.displayOrder || a.section.name.localeCompare(b.section.name));
    return {
      id: r.id,
      title: r.title,
      description: r.description,
      subject: r.subject,
      teacher: { id: r.teacher.id, name: fullName(r.teacher.firstName, r.teacher.lastName) },
      sections: sections.map((s) => ({ id: s.section.id, label: label(s.section.class.name, s.section.name) })),
      dueDate: fromDate(r.dueDate),
      status: r.status,
      publishAt: r.publishAt?.toISOString() ?? null,
      publishedAt: r.publishedAt?.toISOString() ?? null,
      attachments: r.attachments.map((a) => ({ id: a.file.id, originalName: a.file.originalName, mimeType: a.file.mimeType, sizeBytes: Number(a.file.sizeBytes) })),
      createdAt: r.createdAt.toISOString(),
      canEdit: await this.canEdit(r),
    };
  }
}
