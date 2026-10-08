import { Injectable, type OnModuleInit } from '@nestjs/common';
import type { z } from 'zod';
import {
  SCHOOL_WIDE_AUDIENCES,
  type Audience,
  type DownloadLink,
  type NoticeAudienceOptions,
  type NoticeItem,
  type NoticeStats,
  type PageResponse,
  type createNoticeSchema,
  type listNoticesQuerySchema,
  type updateNoticeSchema,
} from '@schoolos/contracts';
import { AuditService } from '../../core/audit/audit.service.js';
import { RequestContextStore } from '../../core/context/request-context.js';
import { AppError } from '../../core/errors/app-error.js';
import { OutboxService } from '../../core/outbox/outbox.service.js';
import { ScopeService } from '../../core/permissions/scope.service.js';
import { PrismaService, type TenantTx } from '../../core/prisma/prisma.service.js';
import { QUEUES, QueueService } from '../../core/queue/queue.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { FilesService } from '../files/files.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';

type In<T extends z.ZodType> = z.output<T>;

const include = {
  audiences: true,
  attachments: { include: { file: { select: { id: true, originalName: true, mimeType: true, sizeBytes: true } } } },
} satisfies Prisma.NoticeInclude;
type Row = Prisma.NoticeGetPayload<{ include: typeof include }>;

const label = (className: string, section: string) => `${className.replace(/^Class\s+/i, '')}-${section}`;
const GROUP_LABEL: Record<string, string> = { SCHOOL: 'Everyone', ALL_PARENTS: 'All parents', ALL_TEACHERS: 'All teachers', ALL_STAFF: 'All staff' };
const ACTIVE_MEMBER = { status: { notIn: ['SUSPENDED', 'REMOVED'] } } satisfies Prisma.MembershipWhereInput;
const NONE = '00000000-0000-0000-0000-000000000000';

/** "**Sports day** is on …" → "Sports day is on …" (for notification previews). */
const plain = (md: string) => md.replace(/[*_`#>[\]()]/g, '').replace(/\s+/g, ' ').trim();

/**
 * Notices & circulars (Master Prompt §32). Audiences decide both who can see a notice and who
 * is notified; class/section audiences reach the parents and the teachers of those sections.
 */
@Injectable()
export class NoticesService implements OnModuleInit {
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
    this.outbox.on('notice.published', (event) => this.notifyRecipients(String(event.payload.noticeId)));
    this.queues.handle(QUEUES.maintenance, 'notice.publish', (data) => this.publishScheduled(String(data.noticeId)));
  }

  // ---------------------------------------------------------------- audiences

  private get canSchoolWide(): boolean {
    return !!RequestContextStore.tenant().permissions['notice.publish_school'];
  }

  /** Audience rows that include the caller. */
  private async myAudienceWhere(): Promise<Prisma.NoticeAudienceWhereInput> {
    const { membershipId } = RequestContextStore.tenant();
    const [roles, guardian, teacherId] = await Promise.all([
      this.prisma.db.membershipRole.findMany({ where: { membershipId }, select: { role: { select: { key: true } } } }),
      this.prisma.db.guardian.findUnique({ where: { membershipId }, select: { id: true } }),
      this.scope.myTeacherId(),
    ]);
    const roleKeys = roles.map((r) => r.role.key);
    const sectionIds = [...(guardian ? await this.scope.childSectionIds() : []), ...(teacherId ? await this.scope.assignedSectionIds() : [])];
    const classIds = sectionIds.length
      ? [...new Set((await this.prisma.db.section.findMany({ where: { id: { in: sectionIds } }, select: { classId: true } })).map((s) => s.classId))]
      : [];
    const or: Prisma.NoticeAudienceWhereInput[] = [
      { type: 'SCHOOL' },
      { type: 'MEMBERSHIP', refId: membershipId },
      { type: 'ROLE', refId: { in: roleKeys } },
      { type: 'SECTION', refId: { in: sectionIds } },
      { type: 'CLASS', refId: { in: classIds } },
    ];
    if (guardian) or.push({ type: 'ALL_PARENTS' });
    if (teacherId) or.push({ type: 'ALL_TEACHERS' });
    if (roleKeys.some((k) => k !== 'parent')) or.push({ type: 'ALL_STAFF' });
    return { OR: or };
  }

  /** Notices the caller may see: managers see all; others see published ones addressed to them, plus their own. */
  private async visibleWhere(): Promise<Prisma.NoticeWhereInput> {
    if (this.canSchoolWide) return {};
    const { membershipId } = RequestContextStore.tenant();
    return { OR: [{ status: 'PUBLISHED', audiences: { some: await this.myAudienceWhere() } }, { createdByMemberId: membershipId }] };
  }

  private canEdit(row: { createdByMemberId: string }): boolean {
    const ctx = RequestContextStore.tenant();
    return this.canSchoolWide || (!!ctx.permissions['notice.create'] && row.createdByMemberId === ctx.membershipId);
  }

  private async checkAudiences(audiences: Audience[]): Promise<void> {
    const create = RequestContextStore.tenant().permissions['notice.create'];
    const wide = audiences.find((a) => (SCHOOL_WIDE_AUDIENCES as readonly string[]).includes(a.type));
    if (wide && !this.canSchoolWide) throw new AppError('FORBIDDEN', 403, 'Only the school office can send notices to the whole school.');
    if (create === 'ASSIGNED' && !this.canSchoolWide) {
      const mine = await this.scope.assignedSectionIds();
      if (audiences.some((a) => a.type !== 'SECTION' || !mine.includes(a.refId!))) {
        throw new AppError('FORBIDDEN', 403, 'You can send notices only to sections you teach.', [{ field: 'audiences', message: 'Only your sections' }]);
      }
    }
    const ids = (type: Audience['type']) => [...new Set(audiences.filter((a) => a.type === type).map((a) => a.refId!))];
    const yearId = await this.scope.currentAcademicYearId();
    const uuid = /^[0-9a-f-]{36}$/i;
    const [classes, sections, roles, members] = await Promise.all([
      ids('CLASS').every((x) => uuid.test(x)) ? this.prisma.db.schoolClass.count({ where: { id: { in: ids('CLASS') } } }) : -1,
      ids('SECTION').every((x) => uuid.test(x)) ? this.prisma.db.section.count({ where: { id: { in: ids('SECTION') }, academicYearId: yearId ?? NONE } }) : -1,
      this.prisma.db.role.count({ where: { key: { in: ids('ROLE') } } }),
      ids('MEMBERSHIP').every((x) => uuid.test(x)) ? this.prisma.db.membership.count({ where: { id: { in: ids('MEMBERSHIP') }, ...ACTIVE_MEMBER } }) : -1,
    ]);
    if (classes !== ids('CLASS').length) throw AppError.invalidReference('audiences', 'class');
    if (sections !== ids('SECTION').length) throw AppError.invalidReference('audiences', 'section');
    if (roles !== ids('ROLE').length) throw AppError.invalidReference('audiences', 'role');
    if (members !== ids('MEMBERSHIP').length) throw AppError.invalidReference('audiences', 'person');
  }

  /** Every membership a notice reaches, split into parents and staff (for stats). */
  async recipients(audiences: { type: string; refId: string | null }[]): Promise<{ parents: Set<string>; staff: Set<string> }> {
    const parents = new Set<string>();
    const staff = new Set<string>();
    const yearId = (await this.scope.currentAcademicYearId()) ?? NONE;
    const has = (t: string) => audiences.some((a) => a.type === t);
    const refs = (t: string) => audiences.filter((a) => a.type === t).map((a) => a.refId!);

    const allGuardians = () =>
      this.prisma.db.guardian.findMany({ where: { membershipId: { not: null }, archivedAt: null, membership: ACTIVE_MEMBER }, select: { membershipId: true } });
    const staffMembers = (roleKeys?: string[]) =>
      this.prisma.db.membership.findMany({
        where: { ...ACTIVE_MEMBER, roles: { some: { role: roleKeys ? { key: { in: roleKeys } } : { key: { not: 'parent' } } } } },
        select: { id: true, guardian: { select: { id: true } } },
      });

    if (has('SCHOOL') || has('ALL_PARENTS')) for (const g of await allGuardians()) parents.add(g.membershipId!);
    if (has('SCHOOL') || has('ALL_STAFF')) for (const m of await staffMembers()) staff.add(m.id);
    if (has('ALL_TEACHERS')) {
      const teachers = await this.prisma.db.teacher.findMany({ where: { membershipId: { not: null }, status: { not: 'LEFT' }, membership: ACTIVE_MEMBER }, select: { membershipId: true } });
      for (const t of teachers) staff.add(t.membershipId!);
    }
    if (has('ROLE')) for (const m of await staffMembers(refs('ROLE'))) (m.guardian ? parents : staff).add(m.id);
    if (has('MEMBERSHIP')) {
      const members = await this.prisma.db.membership.findMany({ where: { id: { in: refs('MEMBERSHIP') }, ...ACTIVE_MEMBER }, select: { id: true, guardian: { select: { id: true } } } });
      for (const m of members) (m.guardian ? parents : staff).add(m.id);
    }
    const sectionIds = [
      ...refs('SECTION'),
      ...(has('CLASS') ? (await this.prisma.db.section.findMany({ where: { classId: { in: refs('CLASS') }, academicYearId: yearId }, select: { id: true } })).map((s) => s.id) : []),
    ];
    if (sectionIds.length) {
      const [guardians, sections, assignments] = await Promise.all([
        this.prisma.db.studentGuardian.findMany({
          where: { student: { enrollments: { some: { sectionId: { in: sectionIds }, status: 'ENROLLED' } } }, guardian: { membershipId: { not: null }, archivedAt: null, membership: ACTIVE_MEMBER } },
          select: { guardian: { select: { membershipId: true } } },
        }),
        this.prisma.db.section.findMany({ where: { id: { in: sectionIds } }, select: { classTeacher: { select: { membershipId: true } } } }),
        this.prisma.db.teachingAssignment.findMany({ where: { sectionId: { in: sectionIds } }, select: { teacher: { select: { membershipId: true } } } }),
      ]);
      for (const g of guardians) parents.add(g.guardian.membershipId!);
      for (const t of [...sections.map((s) => s.classTeacher), ...assignments.map((a) => a.teacher)]) if (t?.membershipId) staff.add(t.membershipId);
    }
    for (const id of parents) staff.delete(id); // someone who is both counts once, as a parent
    return { parents, staff };
  }

  async audienceOptions(): Promise<NoticeAudienceOptions> {
    const yearId = (await this.scope.currentAcademicYearId()) ?? NONE;
    const create = RequestContextStore.tenant().permissions['notice.create'];
    const mine = create === 'ALL' || this.canSchoolWide ? null : await this.scope.assignedSectionIds();
    const [sections, roles] = await Promise.all([
      this.prisma.db.section.findMany({
        where: { academicYearId: yearId, ...(mine ? { id: { in: mine } } : {}) },
        select: { id: true, name: true, classId: true, class: { select: { name: true, displayOrder: true } } },
      }),
      this.canSchoolWide ? this.prisma.db.role.findMany({ select: { key: true, name: true }, orderBy: { name: 'asc' } }) : [],
    ]);
    sections.sort((a, b) => a.class.displayOrder - b.class.displayOrder || a.name.localeCompare(b.name));
    const classes = mine ? [] : [...new Map(sections.map((s) => [s.classId, { id: s.classId, label: s.class.name }])).values()];
    return { schoolWide: this.canSchoolWide, classes, sections: sections.map((s) => ({ id: s.id, label: label(s.class.name, s.name) })), roles };
  }

  // ---------------------------------------------------------------- read

  async list(query: In<typeof listNoticesQuerySchema>): Promise<PageResponse<NoticeItem>> {
    const { membershipId } = RequestContextStore.tenant();
    const filters: Prisma.NoticeWhereInput[] = [await this.visibleWhere(), { status: query.status ?? 'PUBLISHED' }];
    if (query.type) filters.push({ type: query.type });
    if (query.mine === 'true') filters.push({ createdByMemberId: membershipId });
    if (query.unread === 'true') filters.push({ reads: { none: { membershipId } } });
    if (query.q) filters.push({ OR: [{ title: { contains: query.q, mode: 'insensitive' } }, { body: { contains: query.q, mode: 'insensitive' } }] });
    const where = { AND: filters };
    const [rows, total] = await Promise.all([
      this.prisma.db.notice.findMany({
        where,
        include: { ...include, reads: { where: { membershipId }, select: { readAt: true } } },
        orderBy: [{ isPinned: 'desc' }, { publishedAt: { sort: 'desc', nulls: 'first' } }, { createdAt: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.db.notice.count({ where }),
    ]);
    const items = await this.toItems(rows);
    return { data: items, page: { page: query.page, pageSize: query.pageSize, total } };
  }

  private async visible(id: string): Promise<Row & { reads: { readAt: Date }[] }> {
    const row = await this.prisma.db.notice.findFirst({
      where: { AND: [{ id }, await this.visibleWhere()] },
      include: { ...include, reads: { where: { membershipId: RequestContextStore.tenant().membershipId }, select: { readAt: true } } },
    });
    if (!row) throw AppError.notFound('notice');
    return row;
  }

  async get(id: string): Promise<NoticeItem> {
    return (await this.toItems([await this.visible(id)]))[0]!;
  }

  /** Read receipt; also clears the matching inbox notification. */
  async markRead(id: string): Promise<void> {
    const row = await this.visible(id);
    if (row.status !== 'PUBLISHED') return;
    const { membershipId } = RequestContextStore.tenant();
    await this.prisma.tenantTx(async (tx) => {
      await tx.noticeRead.createMany({ data: [{ noticeId: id, membershipId } as Prisma.NoticeReadCreateManyInput], skipDuplicates: true });
      await tx.notification.updateMany({ where: { membershipId, event: 'notice.published', readAt: null, data: { path: ['noticeId'], equals: id } }, data: { readAt: new Date() } });
    });
  }

  async stats(id: string): Promise<NoticeStats> {
    const row = await this.visible(id);
    if (!this.canEdit(row)) throw AppError.forbidden();
    const { parents, staff } = await this.recipients(row.audiences);
    const reads = new Set((await this.prisma.db.noticeRead.findMany({ where: { noticeId: id }, select: { membershipId: true } })).map((r) => r.membershipId));
    const count = (set: Set<string>) => [...set].filter((m) => reads.has(m)).length;
    const recipients = parents.size + staff.size;
    const read = count(parents) + count(staff);
    return {
      recipients,
      read,
      percent: recipients ? Math.round((read / recipients) * 100) : null,
      byGroup: [
        { group: 'Parents', recipients: parents.size, read: count(parents) },
        { group: 'Staff', recipients: staff.size, read: count(staff) },
      ],
    };
  }

  async attachmentLink(id: string, fileId: string): Promise<DownloadLink> {
    const row = await this.visible(id);
    if (!row.attachments.some((a) => a.fileId === fileId)) throw AppError.notFound('file');
    return this.files.attachedLink(fileId);
  }

  // ---------------------------------------------------------------- write

  async create(input: In<typeof createNoticeSchema>): Promise<NoticeItem> {
    await this.checkAudiences(input.audiences);
    await this.files.assertAllReady(input.attachmentFileIds, 'notice_attachment', 'attachmentFileIds');
    const publishAt = input.publish === 'SCHEDULE' ? new Date(input.publishAt!) : null;
    if (publishAt && publishAt.getTime() <= Date.now()) throw new AppError('VALIDATION_FAILED', 422, 'Choose a time in the future.', [{ field: 'publishAt', message: 'Must be in the future' }]);
    const { schoolId } = RequestContextStore.school();
    const { membershipId } = RequestContextStore.tenant();
    const id = await this.prisma.tenantTx(async (tx) => {
      const n = await tx.notice.create({
        data: {
          type: input.type,
          title: input.title,
          body: input.body,
          isPinned: input.isPinned,
          sendPush: input.sendPush,
          eventStartsAt: input.eventStartsAt ? new Date(input.eventStartsAt) : null,
          eventEndsAt: input.eventEndsAt ? new Date(input.eventEndsAt) : null,
          status: input.publish === 'NOW' ? 'PUBLISHED' : input.publish === 'SCHEDULE' ? 'SCHEDULED' : 'DRAFT',
          publishAt,
          publishedAt: input.publish === 'NOW' ? new Date() : null,
          createdByMemberId: membershipId,
          audiences: { create: input.audiences.map((a) => ({ type: a.type, refId: a.refId ?? null, schoolId })) },
          attachments: { create: [...new Set(input.attachmentFileIds)].map((fileId) => ({ fileId, schoolId })) },
        } as Prisma.NoticeUncheckedCreateInput,
      });
      await this.audit.record(tx, { action: 'notice.create', entityType: 'Notice', entityId: n.id, after: { title: input.title, status: n.status, audiences: input.audiences } });
      if (n.status === 'PUBLISHED') await this.outbox.publish(tx, 'notice.published', { noticeId: n.id });
      return n.id;
    });
    this.outbox.flush();
    if (publishAt) await this.schedule(id, publishAt);
    return this.get(id);
  }

  async update(id: string, input: In<typeof updateNoticeSchema>): Promise<NoticeItem> {
    const row = await this.visible(id);
    if (!this.canEdit(row)) throw AppError.forbidden('Only the author or the school office can change this notice.');
    if (row.status === 'ARCHIVED') throw new AppError('NOTICE_ARCHIVED', 422, 'This notice was deleted.');
    if (input.audiences) await this.checkAudiences(input.audiences);
    if (input.attachmentFileIds) await this.files.assertAllReady(input.attachmentFileIds, 'notice_attachment', 'attachmentFileIds');
    const { schoolId } = RequestContextStore.school();
    const date = (v: string | null | undefined) => (v === undefined ? undefined : v ? new Date(v) : null);
    await this.prisma.tenantTx(async (tx) => {
      await tx.notice.update({
        where: { id },
        data: {
          type: input.type,
          title: input.title,
          body: input.body,
          isPinned: input.isPinned,
          sendPush: input.sendPush,
          eventStartsAt: date(input.eventStartsAt),
          eventEndsAt: date(input.eventEndsAt),
        },
      });
      if (input.audiences) {
        await tx.noticeAudience.deleteMany({ where: { noticeId: id } });
        await tx.noticeAudience.createMany({ data: input.audiences.map((a) => ({ noticeId: id, type: a.type, refId: a.refId ?? null, schoolId }) as Prisma.NoticeAudienceCreateManyInput) });
      }
      if (input.attachmentFileIds) {
        await tx.noticeAttachment.deleteMany({ where: { noticeId: id } });
        await tx.noticeAttachment.createMany({ data: [...new Set(input.attachmentFileIds)].map((fileId) => ({ noticeId: id, fileId, schoolId }) as Prisma.NoticeAttachmentCreateManyInput) });
      }
      await this.audit.record(tx, { action: 'notice.update', entityType: 'Notice', entityId: id, before: { title: row.title }, after: input });
    });
    return this.get(id);
  }

  async publish(id: string, publishAt?: string): Promise<NoticeItem> {
    const row = await this.visible(id);
    if (!this.canEdit(row)) throw AppError.forbidden();
    if (row.status === 'PUBLISHED') return this.get(id);
    if (row.status === 'ARCHIVED') throw new AppError('NOTICE_ARCHIVED', 422, 'This notice was deleted.');
    const at = publishAt ? new Date(publishAt) : null;
    if (at && at.getTime() > Date.now()) {
      await this.prisma.tenantTx(async (tx) => {
        await tx.notice.update({ where: { id }, data: { status: 'SCHEDULED', publishAt: at } });
        await this.audit.record(tx, { action: 'notice.schedule', entityType: 'Notice', entityId: id, after: { publishAt: at.toISOString() } });
      });
      await this.schedule(id, at);
    } else {
      await this.prisma.tenantTx((tx) => this.markPublished(tx, id));
      this.outbox.flush();
    }
    return this.get(id);
  }

  async remove(id: string): Promise<void> {
    const row = await this.visible(id);
    if (!this.canEdit(row)) throw AppError.forbidden();
    await this.prisma.tenantTx(async (tx) => {
      if (row.status === 'PUBLISHED') await tx.notice.update({ where: { id }, data: { status: 'ARCHIVED', isPinned: false } });
      else await tx.notice.delete({ where: { id } });
      await this.audit.record(tx, { action: 'notice.delete', entityType: 'Notice', entityId: id, before: { title: row.title, status: row.status } });
    });
  }

  // ---------------------------------------------------------------- publishing

  private async schedule(id: string, at: Date): Promise<void> {
    const { schoolId } = RequestContextStore.school();
    await this.queues.add(QUEUES.maintenance, 'notice.publish', { schoolId, noticeId: id }, { delay: Math.max(0, at.getTime() - Date.now()), jobId: `notice-${id}-${at.getTime()}` });
  }

  private async markPublished(tx: TenantTx, id: string): Promise<void> {
    await tx.notice.update({ where: { id }, data: { status: 'PUBLISHED', publishedAt: new Date() } });
    await this.audit.record(tx, { action: 'notice.publish', entityType: 'Notice', entityId: id });
    await this.outbox.publish(tx, 'notice.published', { noticeId: id });
  }

  private async publishScheduled(id: string): Promise<void> {
    const row = await this.prisma.db.notice.findUnique({ where: { id }, select: { status: true, publishAt: true } });
    if (row?.status !== 'SCHEDULED' || !row.publishAt || row.publishAt.getTime() > Date.now() + 5_000) return;
    await this.prisma.tenantTx((tx) => this.markPublished(tx, id));
    this.outbox.flush();
  }

  private async notifyRecipients(id: string): Promise<void> {
    const n = await this.prisma.db.notice.findUnique({ where: { id }, include: { audiences: true } });
    if (n?.status !== 'PUBLISHED') return;
    const { parents, staff } = await this.recipients(n.audiences);
    const members = [...parents, ...staff].filter((m) => m !== n.createdByMemberId);
    const preview = plain(n.body);
    await this.notifications.notify({
      event: 'notice.published',
      inAppOnly: !n.sendPush,
      recipients: members.map((membershipId) => ({
        membershipId,
        vars: { title: n.title, preview: preview.length > 140 ? `${preview.slice(0, 139)}…` : preview },
        data: { route: `/notices/${id}`, noticeId: id },
      })),
      dedupeKey: () => `notice:${id}`,
    });
  }

  // ---------------------------------------------------------------- mapping

  private async toItems(rows: (Row & { reads: { readAt: Date }[] })[]): Promise<NoticeItem[]> {
    const audiences = rows.flatMap((r) => r.audiences);
    const ids = (t: string) => [...new Set(audiences.filter((a) => a.type === t && a.refId).map((a) => a.refId!))];
    const isUuid = (x: string) => /^[0-9a-f-]{36}$/i.test(x);
    const [classes, sections, roles, members, authors] = await Promise.all([
      this.prisma.db.schoolClass.findMany({ where: { id: { in: ids('CLASS').filter(isUuid) } }, select: { id: true, name: true } }),
      this.prisma.db.section.findMany({ where: { id: { in: ids('SECTION').filter(isUuid) } }, select: { id: true, name: true, class: { select: { name: true } } } }),
      this.prisma.db.role.findMany({ where: { key: { in: ids('ROLE') } }, select: { key: true, name: true } }),
      this.prisma.db.membership.findMany({ where: { id: { in: ids('MEMBERSHIP').filter(isUuid) } }, select: { id: true, user: { select: { name: true } } } }),
      this.prisma.db.membership.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.createdByMemberId))] } }, select: { id: true, user: { select: { name: true } } } }),
    ]);
    const labelOf = (a: { type: string; refId: string | null }) => {
      if (GROUP_LABEL[a.type]) return GROUP_LABEL[a.type]!;
      if (a.type === 'CLASS') return classes.find((c) => c.id === a.refId)?.name ?? 'Class';
      if (a.type === 'SECTION') {
        const s = sections.find((x) => x.id === a.refId);
        return s ? label(s.class.name, s.name) : 'Section';
      }
      if (a.type === 'ROLE') return roles.find((r) => r.key === a.refId)?.name ?? a.refId ?? 'Role';
      return members.find((m) => m.id === a.refId)?.user.name ?? 'Someone';
    };
    return rows.map((r) => ({
      id: r.id,
      type: r.type,
      title: r.title,
      body: r.body,
      status: r.status,
      publishAt: r.publishAt?.toISOString() ?? null,
      publishedAt: r.publishedAt?.toISOString() ?? null,
      eventStartsAt: r.eventStartsAt?.toISOString() ?? null,
      eventEndsAt: r.eventEndsAt?.toISOString() ?? null,
      isPinned: r.isPinned,
      sendPush: r.sendPush,
      audiences: r.audiences.map((a) => ({ type: a.type, refId: a.refId, label: labelOf(a) })),
      attachments: r.attachments.map((a) => ({ id: a.file.id, originalName: a.file.originalName, mimeType: a.file.mimeType, sizeBytes: Number(a.file.sizeBytes) })),
      author: { name: authors.find((m) => m.id === r.createdByMemberId)?.user.name ?? 'School' },
      createdAt: r.createdAt.toISOString(),
      readAt: r.reads[0]?.readAt.toISOString() ?? null,
      canEdit: this.canEdit(r),
    }));
  }
}
