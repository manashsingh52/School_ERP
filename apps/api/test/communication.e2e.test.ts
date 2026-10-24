/**
 * Parent–teacher communication: messages and complaints (with status tracking and read receipts),
 * video meetings (Jitsi links, reschedule/cancel alerts, 15-minute reminders) and personal reminders.
 * Fixture: the teacher is class teacher of 8-A; the parent's only child is s1 (8-A); s3 is in 8-B.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ConversationDetail, ConversationItem, MeetingItem, MessageContact, ReminderItem } from '@schoolos/contracts';
import { RequestContextStore } from '../src/core/context/request-context.js';
import { MeetingsService } from '../src/modules/communication/meetings.service.js';
import { RemindersService, nextOccurrence } from '../src/modules/communication/reminders.service.js';
import { type Tenant, type TestApp, createTenant, createTestApp } from './helpers.js';

let t: TestApp;
let A: Tenant;
const tok: Record<string, string> = {};
const as = (who: string) => t.as(tok[who]!, A.slug);
const inbox = async (who: string, event: string) =>
  ((await as(who).get('/v1/notifications')).body.data as { event: string; title: string; body: string; data: Record<string, unknown> }[]).filter((n) => n.event === event);
const inHours = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();

beforeAll(async () => {
  t = await createTestApp();
  A = await createTenant(t, 'comms');
  for (const who of ['admin', 'teacher', 'parent', 'accountant'] as const) tok[who] = (await t.login(A.users[who], A.slug)).token;
});

afterAll(async () => {
  await t?.close();
});

describe('messages and complaints', () => {
  let complaintId = '';

  it("a parent can write to their child's teachers or the school office — about their own child only", async () => {
    const res = await as('parent').get(`/v1/conversations/contacts?studentId=${A.students.s1}`);
    expect(res.status).toBe(200);
    expect(res.body.data as MessageContact[]).toEqual([
      { memberId: A.teacherMembershipId, name: 'Teacher', role: 'Class teacher', subjects: [], available: true },
      { memberId: null, name: 'School office', role: 'Principal and office staff', subjects: [], available: true },
    ]);
    expect((await as('parent').get(`/v1/conversations/contacts?studentId=${A.students.s2}`)).status).toBe(404);
    expect((await as('accountant').get('/v1/conversations')).status).toBe(403);
  });

  it("subject teachers are listed too; only those who teach the child and can sign in can be written to", async () => {
    const db = t.platform;
    const english = await db.subject.create({ data: { schoolId: A.schoolId, name: 'English', code: 'ENG' } });
    const science = await db.subject.create({ data: { schoolId: A.schoolId, name: 'Science', code: 'SCI' } });
    // English teacher of 8-A with a login; Science teacher of 8-A without one; a Maths teacher of 8-B only.
    const withLogin = await t.schools.addMember({ schoolId: A.schoolId, name: 'Anita Rao', email: `anita-${A.slug}@test.school`, password: 'Test@Pass123', roleKeys: ['teacher'] });
    const anita = await db.teacher.create({ data: { schoolId: A.schoolId, membershipId: withLogin.membership.id, employeeId: 'T12', firstName: 'Anita', lastName: 'Rao', phone: '+919811000002' } });
    const noLogin = await db.teacher.create({ data: { schoolId: A.schoolId, employeeId: 'T13', firstName: 'Vikram', lastName: 'Shah', phone: '+919811000003' } });
    const otherLogin = await t.schools.addMember({ schoolId: A.schoolId, name: 'Bina Das', email: `bina-${A.slug}@test.school`, password: 'Test@Pass123', roleKeys: ['teacher'] });
    const bina = await db.teacher.create({ data: { schoolId: A.schoolId, membershipId: otherLogin.membership.id, employeeId: 'T14', firstName: 'Bina', lastName: 'Das', phone: '+919811000004' } });
    await db.teachingAssignment.createMany({
      data: [
        { schoolId: A.schoolId, academicYearId: A.yearId, sectionId: A.sectionA, subjectId: english.id, teacherId: anita.id },
        { schoolId: A.schoolId, academicYearId: A.yearId, sectionId: A.sectionA, subjectId: science.id, teacherId: noLogin.id },
        { schoolId: A.schoolId, academicYearId: A.yearId, sectionId: A.sectionB, subjectId: A.subjectId, teacherId: bina.id },
      ],
    });

    const contacts = (await as('parent').get(`/v1/conversations/contacts?studentId=${A.students.s1}`)).body.data as MessageContact[];
    expect(contacts.map((c) => [c.name, c.role, c.available])).toEqual([
      ['Teacher', 'Class teacher', true],
      ['Anita Rao', 'English', true],
      ['Vikram Shah', 'Science', false],
      ['School office', 'Principal and office staff', true],
    ]);
    expect(contacts.find((c) => c.name === 'Vikram Shah')!.memberId).toBeNull();

    const ok = await as('parent').post('/v1/conversations', { studentId: A.students.s1, toMemberId: withLogin.membership.id, category: 'ACADEMIC', subject: 'English reading', body: 'Which book should we read at home?' });
    expect(ok.status, JSON.stringify(ok.body)).toBe(201);
    expect(ok.body.data.staff.name).toBe('Anita Rao');
    // A teacher who doesn't teach this child can't be written to.
    expect((await as('parent').post('/v1/conversations', { studentId: A.students.s1, toMemberId: otherLogin.membership.id, subject: 'Hello there', body: 'Hi' })).status).toBe(422);
  });

  it('a complaint reaches the teacher, who sees it unread; opening it shows the parent it was seen', async () => {
    const res = await as('parent').post('/v1/conversations', { studentId: A.students.s1, toMemberId: A.teacherMembershipId, category: 'COMPLAINT', subject: 'Bus was late again', body: 'The school bus was 40 minutes late today.' });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const c = res.body.data as ConversationDetail;
    complaintId = c.id;
    expect(c).toMatchObject({ myRole: 'PARENT', status: 'OPEN', category: 'COMPLAINT', canChangeStatus: false, staff: { memberId: A.teacherMembershipId } });
    expect(c.messages).toEqual([expect.objectContaining({ body: 'The school bus was 40 minutes late today.', fromMe: true, seen: false })]);

    expect((await inbox('teacher', 'message.received')).map((n) => n.title)).toContain('Parent: Bus was late again');
    const list = (await as('teacher').get('/v1/conversations')).body.data as ConversationItem[];
    expect(list.find((x) => x.id === complaintId)).toMatchObject({ unread: true, myRole: 'STAFF', canChangeStatus: true });
    expect((await as('teacher').get('/v1/conversations/unread')).body.data.count).toBeGreaterThanOrEqual(1);

    await as('teacher').get(`/v1/conversations/${complaintId}`); // opens it
    const seen = (await as('parent').get(`/v1/conversations/${complaintId}`)).body.data as ConversationDetail;
    expect(seen.messages[0]!.seen).toBe(true);
  });

  it('the teacher replies and tracks it; the parent is told; parents cannot change the status', async () => {
    const reply = await as('teacher').post(`/v1/conversations/${complaintId}/messages`, { body: 'Sorry about that — I have told the transport office.' });
    expect(reply.status).toBe(201);
    expect((await inbox('parent', 'message.received')).length).toBe(1);

    const progress = await as('teacher').patch(`/v1/conversations/${complaintId}`, { status: 'IN_PROGRESS' });
    expect(progress.body.data.status).toBe('IN_PROGRESS');
    const told = await inbox('parent', 'complaint.status_changed');
    expect(told[0]).toMatchObject({ title: '"Bus was late again" is now in progress', body: 'Teacher updated your complaint about Student1.' });
    expect((await as('parent').patch(`/v1/conversations/${complaintId}`, { status: 'RESOLVED' })).status).toBe(403);

    await as('teacher').patch(`/v1/conversations/${complaintId}`, { status: 'RESOLVED' });
    // The parent writing again reopens it.
    const again = await as('parent').post(`/v1/conversations/${complaintId}/messages`, { body: 'It happened again today.' });
    expect(again.body.data.status).toBe('OPEN');
    expect(again.body.data.messages).toHaveLength(3);
    const audit = (await as('admin').get('/v1/audit?action=conversation')).body.data.map((a: { action: string }) => a.action);
    expect(audit).toContain('conversation.status');
  });

  it('the school office answers office threads; teachers never see them; admins can look into any thread', async () => {
    const res = await as('parent').post('/v1/conversations', { studentId: A.students.s1, toMemberId: null, category: 'SUGGESTION', subject: 'Library hours', body: 'Could the library open on Saturdays?' });
    expect(res.status).toBe(201);
    const officeId = res.body.data.id as string;
    expect((await inbox('admin', 'message.received')).map((n) => n.title)).toContain('Parent: Library hours');
    expect((await as('teacher').get(`/v1/conversations/${officeId}`)).status).toBe(404);

    const mine = (await as('admin').get('/v1/conversations')).body.data as ConversationItem[];
    expect(mine.map((c) => c.id)).toContain(officeId);
    expect(mine.map((c) => c.id)).not.toContain(complaintId); // the teacher's thread isn't "mine"…
    const all = (await as('admin').get('/v1/conversations?view=all&category=COMPLAINT')).body.data as ConversationItem[];
    expect(all.map((c) => c.id)).toEqual([complaintId]); // …but the office can find it
    expect(all[0]!.myRole).toBe('OFFICE');
    // Looking in doesn't mark it read for the teacher.
    await as('teacher').get(`/v1/conversations/${complaintId}`);
    await as('admin').get(`/v1/conversations/${complaintId}`);
  });

  it('a teacher can start a thread with a parent of a child they teach — nobody else', async () => {
    const contacts = (await as('teacher').get(`/v1/conversations/contacts?studentId=${A.students.s1}`)).body.data as MessageContact[];
    expect(contacts).toEqual([{ memberId: A.parentMembershipId, name: 'Parent', role: 'Father', subjects: [], available: true }]);
    const res = await as('teacher').post('/v1/conversations', { studentId: A.students.s1, toMemberId: A.parentMembershipId, category: 'BEHAVIOUR', subject: 'Great week', body: 'Student1 helped a classmate today.' });
    expect(res.status).toBe(201);
    expect(res.body.data.myRole).toBe('STAFF');
    expect((await as('teacher').post('/v1/conversations', { studentId: A.students.s1, toMemberId: null, subject: 'Hello', body: 'Hi' })).status).toBe(422);
    expect((await as('teacher').get(`/v1/conversations/contacts?studentId=${A.students.s3}`)).status).toBe(404);
  });
});

describe('video meetings', () => {
  let meetingId = '';

  it('a teacher books a meeting; the parent is told and gets a Jitsi link', async () => {
    const res = await as('teacher').post('/v1/meetings', { studentId: A.students.s1, title: 'Maths progress', agenda: 'Fractions', category: 'ACADEMIC', scheduledAt: inHours(26), durationMinutes: 20 });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const m = res.body.data as MeetingItem;
    meetingId = m.id;
    expect(m).toMatchObject({ status: 'SCHEDULED', joinable: false, canManage: true, organizer: { name: 'Teacher' } });
    expect(m.joinUrl).toMatch(/^https:\/\/meet\.jit\.si\/Bastaa-[\w-]{16}#userInfo\.displayName=/);

    const told = await inbox('parent', 'meeting.scheduled');
    expect(told[0]!.title).toMatch(/^Video meeting with Teacher on /);
    const parentView = (await as('parent').get('/v1/meetings')).body.data as MeetingItem[];
    expect(parentView.map((x) => x.id)).toContain(meetingId);
    expect(parentView.find((x) => x.id === meetingId)!.canManage).toBe(false);
  });

  it('only staff who teach the child book meetings, and only in the future', async () => {
    expect((await as('parent').post('/v1/meetings', { studentId: A.students.s1, title: 'Hi there', scheduledAt: inHours(2) })).status).toBe(403);
    expect((await as('teacher').post('/v1/meetings', { studentId: A.students.s3, title: 'Hi there', scheduledAt: inHours(2) })).status).toBe(404);
    expect((await as('teacher').post('/v1/meetings', { studentId: A.students.s1, title: 'Hi there', scheduledAt: inHours(-2) })).status).toBe(422);
    expect((await as('teacher').post('/v1/meetings', { studentId: A.students.s2, title: 'Hi there', scheduledAt: inHours(2) })).body.error.code).toBe('NO_PARENT_LOGIN');
  });

  it('moving and cancelling tell the parent; a cancelled meeting has no link', async () => {
    const moved = await as('teacher').patch(`/v1/meetings/${meetingId}`, { scheduledAt: inHours(30) });
    expect(moved.status).toBe(200);
    expect((await inbox('parent', 'meeting.rescheduled')).length).toBe(1);
    const cancelled = await as('teacher').post(`/v1/meetings/${meetingId}/cancel`, { reason: 'Teacher unwell' });
    expect(cancelled.body.data).toMatchObject({ status: 'CANCELLED', joinUrl: null, canManage: false });
    expect((await inbox('parent', 'meeting.cancelled'))[0]!.body).toContain('Reason: Teacher unwell');
    expect(((await as('parent').get('/v1/meetings?when=past')).body.data as MeetingItem[]).map((x) => x.id)).toContain(meetingId);
    expect((await as('teacher').post(`/v1/meetings/${meetingId}/cancel`, {})).status).toBe(409);
  });

  it('15 minutes before, the parent and the teacher are reminded — once', async () => {
    const soon = (await as('teacher').post('/v1/meetings', { studentId: A.students.s1, title: 'Quick check-in', scheduledAt: new Date(Date.now() + 10 * 60_000).toISOString() })).body.data as MeetingItem;
    expect(soon.joinable).toBe(true);
    const meetings = t.app.get(MeetingsService);
    await RequestContextStore.runAsSystem(A.schoolId, 'test', () => meetings.remindStarting());
    await RequestContextStore.runAsSystem(A.schoolId, 'test', () => meetings.remindStarting());
    expect((await inbox('parent', 'meeting.starting')).map((n) => n.title)).toEqual([expect.stringMatching(/^"Quick check-in" starts at \d{1,2}:\d{2} (AM|PM)$/)]);
    expect((await inbox('teacher', 'meeting.starting')).length).toBe(1);
  });
});

describe('reminders', () => {
  it("a parent's reminders are theirs alone", async () => {
    expect((await as('parent').post('/v1/reminders', { title: 'Pick up', remindAt: inHours(-1) })).status).toBe(422);
    const res = await as('parent').post('/v1/reminders', { title: 'Pick up Student1', notes: 'Gate 2', remindAt: inHours(3), repeat: 'WEEKDAYS', studentId: A.students.s1 });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const r = res.body.data as ReminderItem;
    expect(r).toMatchObject({ title: 'Pick up Student1', repeat: 'WEEKDAYS', student: { name: 'Student1' }, completedAt: null });
    expect((await as('teacher').patch(`/v1/reminders/${r.id}`, { title: 'Hijack' })).status).toBe(404);
    expect(((await as('teacher').get('/v1/reminders')).body.data as ReminderItem[]).length).toBe(0);
    expect((await as('parent').post('/v1/reminders', { title: 'X', remindAt: inHours(1), studentId: A.students.s2 })).status).toBe(422);
  });

  it('goes off at its time: a one-off is then done, a repeating one moves to its next day', async () => {
    const once = (await as('parent').post('/v1/reminders', { title: 'Parent–teacher meeting', remindAt: inHours(1) })).body.data as ReminderItem;
    const daily = (await as('parent').post('/v1/reminders', { title: 'School bus', remindAt: inHours(2), repeat: 'DAILY' })).body.data as ReminderItem;
    // Both are now due (the clock moved on).
    const past = new Date(Date.now() - 60_000);
    await t.platform.reminder.updateMany({ where: { id: { in: [once.id, daily.id] } }, data: { remindAt: past } });

    const reminders = t.app.get(RemindersService);
    await RequestContextStore.runAsSystem(A.schoolId, 'test', () => reminders.fireDue());
    await RequestContextStore.runAsSystem(A.schoolId, 'test', () => reminders.fireDue()); // retried tick: nothing twice
    const alarms = await inbox('parent', 'reminder.due');
    expect(alarms.map((n) => n.title).sort()).toEqual(['⏰ Parent–teacher meeting', '⏰ School bus']);

    const done = (await as('parent').get('/v1/reminders?status=done')).body.data as ReminderItem[];
    expect(done.map((r) => r.id)).toEqual([once.id]);
    const active = (await as('parent').get('/v1/reminders')).body.data as ReminderItem[];
    const bus = active.find((r) => r.id === daily.id)!;
    expect(Date.parse(bus.remindAt) - past.getTime()).toBe(86_400_000);

    // Reopen with a new time; delete.
    expect((await as('parent').patch(`/v1/reminders/${once.id}`, { completed: false })).status).toBe(422);
    const reopened = await as('parent').patch(`/v1/reminders/${once.id}`, { completed: false, remindAt: inHours(5) });
    expect(reopened.body.data.completedAt).toBeNull();
    expect((await as('parent').delete(`/v1/reminders/${once.id}`)).status).toBe(200);
  });

  it("personal reminders aren't a school alert setting", async () => {
    const rules = (await as('admin').get('/v1/notification-rules')).body.data as { event: string }[];
    expect(rules.map((r) => r.event)).not.toContain('reminder.due');
    expect(rules.map((r) => r.event)).toEqual(expect.arrayContaining(['attendance.arrived', 'message.received', 'meeting.scheduled']));
  });

  it('repeats skip Sundays for "Monday to Saturday"', () => {
    const saturday = new Date('2026-10-17T03:00:00Z'); // 8:30 AM IST, a Saturday
    const next = nextOccurrence(saturday, 'WEEKDAYS', saturday)!;
    expect(next.toISOString()).toBe('2026-10-19T03:00:00.000Z'); // Monday
    expect(nextOccurrence(saturday, 'WEEKLY', saturday)!.toISOString()).toBe('2026-10-24T03:00:00.000Z');
    expect(nextOccurrence(saturday, 'NONE', saturday)).toBeNull();
  });
});
