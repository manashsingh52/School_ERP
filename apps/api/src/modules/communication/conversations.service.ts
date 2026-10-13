import { Injectable } from '@nestjs/common';
import type { z } from 'zod';
import {
  CONVERSATION_CATEGORY_LABELS,
  type ConversationDetail,
  type ConversationItem,
  type ConversationStatus,
  type MessageContact,
  type PageResponse,
  type listConversationsQuerySchema,
  type startConversationSchema,
} from '@schoolos/contracts';
import { AuditService } from '../../core/audit/audit.service.js';
import { RequestContextStore } from '../../core/context/request-context.js';
import { AppError } from '../../core/errors/app-error.js';
import { ScopeService } from '../../core/permissions/scope.service.js';
import { PrismaService } from '../../core/prisma/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { CommunicationPeople } from './people.js';

type Row = Prisma.ConversationGetPayload<{ include: { messages: { orderBy: { createdAt: 'desc' }; take: 1 } } }>;
type Role = ConversationItem['myRole'];

const STATUS_WORD: Record<ConversationStatus, string> = { OPEN: 'open', IN_PROGRESS: 'in progress', RESOLVED: 'resolved' };
const preview = (s: string) => (s.length > 140 ? `${s.slice(0, 137)}…` : s);

/**
 * Parent–teacher messages and complaints. A thread is about one child, between one parent and one
 * teacher — or the school office, which everyone with `complaint.manage` answers. Staff with
 * school-wide `message.use` can read every thread and step in. Messages are never deleted.
 */
@Injectable()
export class ConversationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: ScopeService,
    private readonly people: CommunicationPeople,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
  ) {}

  private me() {
    return RequestContextStore.tenant().membershipId;
  }

  private isParentScope() {
    return this.scope.scopeOf('message.use') === 'OWN_CHILDREN';
  }

  /** Where I stand in a thread, or null if I may not see it. */
  private roleIn(c: { parentMemberId: string; staffMemberId: string | null }): Role | null {
    const me = this.me();
    if (c.parentMemberId === me) return 'PARENT';
    if (c.staffMemberId === me) return 'STAFF';
    return this.scope.scopeOf('message.use') === 'ALL' ? 'OFFICE' : null;
  }

  private canChangeStatus(role: Role): boolean {
    return role === 'STAFF' || (role === 'OFFICE' && !!RequestContextStore.tenant().permissions['complaint.manage']);
  }

  // ---------------------------------------------------------------- reading

  async contacts(studentId: string): Promise<MessageContact[]> {
    if (!(await this.scope.canAccessStudent('message.use', studentId))) throw AppError.notFound('student');
    if (this.isParentScope()) {
      const teachers = await this.people.teachersOf(studentId);
      // Only teachers who can sign in can be written to; the others are listed so parents know who teaches their child.
      const active = await this.activeMembers(teachers.map((t) => t.memberId));
      return [
        ...teachers.map((t) => ({ ...t, memberId: t.memberId && active.has(t.memberId) ? t.memberId : null, available: !!t.memberId && active.has(t.memberId) })),
        { memberId: null, name: 'School office', role: 'Principal and office staff', subjects: [], available: true },
      ];
    }
    const parents = await this.people.parentsOf(studentId);
    const active = await this.activeMembers(parents.map((p) => p.memberId));
    return parents.map((p) => ({ ...p, subjects: [], available: active.has(p.memberId) }));
  }

  /** Memberships that can sign in (not removed or suspended). */
  private async activeMembers(ids: (string | null)[]): Promise<Set<string>> {
    const wanted = ids.filter((x): x is string => !!x);
    if (!wanted.length) return new Set();
    const rows = await this.prisma.db.membership.findMany({ where: { id: { in: wanted }, status: { in: ['ACTIVE', 'INVITED'] } }, select: { id: true } });
    return new Set(rows.map((r) => r.id));
  }

  async list(query: z.output<typeof listConversationsQuerySchema>): Promise<PageResponse<ConversationItem>> {
    const me = this.me();
    const scope = this.scope.scopeOf('message.use');
    const mine: Prisma.ConversationWhereInput =
      scope === 'OWN_CHILDREN'
        ? { parentMemberId: me }
        : scope === 'ALL'
          ? query.view === 'all'
            ? {}
            : { OR: [{ staffMemberId: me }, { staffMemberId: null }] }
          : { staffMemberId: me };
    const where: Prisma.ConversationWhereInput = {
      AND: [mine, { status: query.status, category: query.category, studentId: query.studentId }],
    };
    const [total, rows] = await Promise.all([
      this.prisma.db.conversation.count({ where }),
      this.prisma.db.conversation.findMany({
        where,
        orderBy: { lastMessageAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: { messages: { orderBy: { createdAt: 'desc' }, take: 1 } },
      }),
    ]);
    return { data: await this.toItems(rows), page: { page: query.page, pageSize: query.pageSize, total } };
  }

  async unreadCount(): Promise<number> {
    const { data } = await this.list({ view: 'mine', page: 1, pageSize: 100 });
    return data.filter((c) => c.unread).length;
  }

  async get(id: string): Promise<ConversationDetail> {
    const c = await this.prisma.db.conversation.findUnique({ where: { id }, include: { messages: { orderBy: { createdAt: 'desc' }, take: 1 } } });
    const role = c && this.roleIn(c);
    if (!c || !role) throw AppError.notFound('conversation');

    // Opening the thread marks it read for my side (office staff only for office threads).
    const now = new Date();
    if (role === 'PARENT') c.parentReadAt = now;
    else if (role === 'STAFF' || c.staffMemberId === null) c.staffReadAt = now;
    await this.prisma.tenantTx((tx) =>
      tx.conversation.update({ where: { id }, data: role === 'PARENT' ? { parentReadAt: now } : role === 'STAFF' || c.staffMemberId === null ? { staffReadAt: now } : {} }),
    );

    const [item] = await this.toItems([c]);
    const messages = await this.prisma.db.conversationMessage.findMany({ where: { conversationId: id }, orderBy: { createdAt: 'asc' } });
    const names = await this.people.memberNames(messages.map((m) => m.senderMemberId));
    const me = this.me();
    return {
      ...item!,
      messages: messages.map((m) => {
        const side = m.senderMemberId === c.parentMemberId ? 'PARENT' : 'STAFF';
        const otherReadAt = side === 'PARENT' ? c.staffReadAt : c.parentReadAt;
        return {
          id: m.id,
          body: m.body,
          sender: { memberId: m.senderMemberId, name: names.get(m.senderMemberId) ?? 'Someone', side },
          fromMe: m.senderMemberId === me,
          seen: !!otherReadAt && otherReadAt >= m.createdAt,
          createdAt: m.createdAt.toISOString(),
        };
      }),
    };
  }

  private async toItems(rows: Row[]): Promise<ConversationItem[]> {
    const me = this.me();
    const [students, names] = await Promise.all([
      this.people.students(rows.map((r) => r.studentId)),
      this.people.memberNames(rows.flatMap((r) => [r.parentMemberId, r.staffMemberId, r.messages[0]?.senderMemberId ?? null])),
    ]);
    return rows.map((r) => {
      const role = this.roleIn(r) ?? 'OFFICE';
      const last = r.messages[0];
      const lastFromParent = last?.senderMemberId === r.parentMemberId;
      const myReadAt = role === 'PARENT' ? r.parentReadAt : r.staffReadAt;
      const fromOtherSide = role === 'PARENT' ? !lastFromParent : lastFromParent;
      return {
        id: r.id,
        student: students.get(r.studentId) ?? { id: r.studentId, name: 'Student', classLabel: null },
        parent: { memberId: r.parentMemberId, name: names.get(r.parentMemberId) ?? 'Parent' },
        staff: r.staffMemberId ? { memberId: r.staffMemberId, name: names.get(r.staffMemberId) ?? 'Teacher' } : null,
        category: r.category,
        subject: r.subject,
        status: r.status,
        lastMessageAt: r.lastMessageAt.toISOString(),
        lastMessage: last ? { body: preview(last.body), senderName: names.get(last.senderMemberId) ?? 'Someone', fromMe: last.senderMemberId === me } : null,
        unread: !!last && fromOtherSide && last.senderMemberId !== me && (!myReadAt || myReadAt < last.createdAt),
        myRole: role,
        canChangeStatus: this.canChangeStatus(role),
        createdAt: r.createdAt.toISOString(),
        resolvedAt: r.resolvedAt?.toISOString() ?? null,
      };
    });
  }

  // ---------------------------------------------------------------- writing

  async start(input: z.output<typeof startConversationSchema>): Promise<ConversationDetail> {
    const me = this.me();
    const contacts = await this.contacts(input.studentId); // also checks I may see the child
    const parentSide = this.isParentScope();
    if (!parentSide && input.toMemberId === null) throw new AppError('CHOOSE_PARENT', 422, 'Choose which parent to write to.', [{ field: 'toMemberId', message: 'Choose a parent' }]);
    // Only someone who teaches this child (or the office) — and who can sign in — can be written to.
    if (!contacts.some((c) => c.available && c.memberId === input.toMemberId)) throw AppError.invalidReference('toMemberId', parentSide ? 'teacher' : 'parent');

    const now = new Date();
    const id = await this.prisma.tenantTx(async (tx) => {
      const c = await tx.conversation.create({
        data: {
          studentId: input.studentId,
          parentMemberId: parentSide ? me : input.toMemberId!,
          staffMemberId: parentSide ? input.toMemberId : me,
          category: input.category,
          subject: input.subject,
          startedByMemberId: me,
          lastMessageAt: now,
          ...(parentSide ? { parentReadAt: now } : { staffReadAt: now }),
        } as Prisma.ConversationUncheckedCreateInput,
      });
      await tx.conversationMessage.create({ data: { conversationId: c.id, senderMemberId: me, body: input.body, createdAt: now } as Prisma.ConversationMessageUncheckedCreateInput });
      if (input.category === 'COMPLAINT') await this.audit.record(tx, { action: 'complaint.create', entityType: 'Conversation', entityId: c.id, metadata: { studentId: input.studentId } });
      return c.id;
    });
    await this.notifyOtherSide(id, input.body);
    return this.get(id);
  }

  async reply(id: string, body: string): Promise<ConversationDetail> {
    const c = await this.prisma.db.conversation.findUnique({ where: { id } });
    const role = c && this.roleIn(c);
    if (!c || !role) throw AppError.notFound('conversation');
    const now = new Date();
    await this.prisma.tenantTx(async (tx) => {
      await tx.conversationMessage.create({ data: { conversationId: id, senderMemberId: this.me(), body, createdAt: now } as Prisma.ConversationMessageUncheckedCreateInput });
      await tx.conversation.update({
        where: { id },
        data: {
          lastMessageAt: now,
          ...(role === 'PARENT' ? { parentReadAt: now } : { staffReadAt: now }),
          // A parent writing again reopens a resolved thread.
          ...(role === 'PARENT' && c.status === 'RESOLVED' ? { status: 'OPEN', resolvedAt: null } : {}),
        },
      });
    });
    await this.notifyOtherSide(id, body);
    return this.get(id);
  }

  async setStatus(id: string, status: ConversationStatus): Promise<ConversationDetail> {
    const c = await this.prisma.db.conversation.findUnique({ where: { id } });
    const role = c && this.roleIn(c);
    if (!c || !role) throw AppError.notFound('conversation');
    if (!this.canChangeStatus(role)) throw AppError.forbidden('Only the teacher or the school office can change the status.');
    if (c.status !== status) {
      await this.prisma.tenantTx(async (tx) => {
        await tx.conversation.update({ where: { id }, data: { status, resolvedAt: status === 'RESOLVED' ? new Date() : null } });
        await this.audit.record(tx, { action: 'conversation.status', entityType: 'Conversation', entityId: id, before: { status: c.status }, after: { status } });
      });
      const [student, names] = await Promise.all([this.people.students([c.studentId]), this.people.memberNames([this.me()])]);
      await this.notifications.notify({
        event: 'complaint.status_changed',
        recipients: [
          {
            membershipId: c.parentMemberId,
            vars: {
              subject: c.subject,
              status: STATUS_WORD[status],
              who: names.get(this.me()) ?? 'The school',
              category: CONVERSATION_CATEGORY_LABELS[c.category].toLowerCase(),
              student: student.get(c.studentId)?.name.split(' ')[0] ?? 'your child',
            },
            data: { route: `/messages/${id}`, conversationId: id },
          },
        ],
      });
    }
    return this.get(id);
  }

  /** Tell whoever is on the other side (the office's staff when nobody specific is). */
  private async notifyOtherSide(id: string, body: string): Promise<void> {
    const c = await this.prisma.db.conversation.findUniqueOrThrow({ where: { id } });
    const me = this.me();
    const toParent = me !== c.parentMemberId;
    const recipients = toParent ? [c.parentMemberId] : c.staffMemberId ? [c.staffMemberId] : await this.people.officeMembers();
    const names = await this.people.memberNames([me]);
    await this.notifications.notify({
      event: 'message.received',
      recipients: recipients
        .filter((m) => m !== me)
        .map((membershipId) => ({
          membershipId,
          vars: { sender: names.get(me) ?? 'Someone', subject: c.subject, preview: preview(body) },
          data: { route: `/messages/${id}`, conversationId: id },
        })),
    });
  }
}
