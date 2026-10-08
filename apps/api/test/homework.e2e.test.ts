/**
 * Homework (Master Prompt §30): who may set it where, drafts vs published vs scheduled,
 * parent visibility and alerts, attachments, edit/delete rights.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { QueueService } from '../src/core/queue/queue.service.js';
import { createTenant, createTestApp, type Tenant, type TestApp } from './helpers.js';

let t: TestApp;
let A: Tenant;
const tok: Record<'admin' | 'teacher' | 'parent' | 'accountant', string> = {} as never;
let attachmentId: string;

beforeAll(async () => {
  t = await createTestApp({ RUN_WORKERS: 'true' });
  await t.app.get(QueueService).startWorkers();
  A = await createTenant(t, 'hw');
  for (const role of ['admin', 'teacher', 'parent', 'accountant'] as const) tok[role] = (await t.login(A.users[role], A.slug)).token;
  const admin = await t.platform.membership.findFirstOrThrow({ where: { schoolId: A.schoolId, user: { email: A.users.teacher } } });
  attachmentId = (
    await t.platform.file.create({
      data: {
        schoolId: A.schoolId,
        bucket: 'local',
        objectKey: `schools/${A.schoolId}/homework_attachment/${randomUUID()}`,
        originalName: 'worksheet.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 10n,
        status: 'READY',
        uploadedByMemberId: admin.id,
      },
    })
  ).id;
});

afterAll(async () => {
  await t?.close();
});

const waitFor = async <T>(fn: () => Promise<T | null | undefined | false>, ms = 15_000): Promise<T> => {
  const until = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > until) throw new Error('timed out');
    await new Promise((r) => setTimeout(r, 100));
  }
};
const parentHomework = async () => (await t.as(tok.parent, A.slug).get('/v1/homework?pageSize=50')).body.data as { id: string; title: string }[];
const parentAlerts = async () =>
  ((await t.as(tok.parent, A.slug).get('/v1/notifications?limit=50')).body.data as { event: string; title: string; body: string; data: { homeworkId?: string } }[]).filter(
    (n) => n.event === 'homework.published',
  );

describe('setting homework', () => {
  let hwId: string;

  it('the class teacher sets homework for their class and parents are told', async () => {
    const res = await t.as(tok.teacher, A.slug).post('/v1/homework', {
      subjectId: A.subjectId,
      sectionIds: [A.sectionA],
      title: 'Exercise 4.2, Q1–10',
      description: 'Show working.',
      dueDate: '2026-12-01',
      attachmentFileIds: [attachmentId],
    });
    expect(res.status).toBe(201);
    hwId = res.body.data.id;
    expect(res.body.data).toMatchObject({ status: 'PUBLISHED', subject: { name: 'Mathematics' }, teacher: { name: 'Teacher' }, sections: [{ label: '8-A' }], canEdit: true });
    expect(res.body.data.attachments).toEqual([expect.objectContaining({ id: attachmentId, originalName: 'worksheet.pdf' })]);

    const alert = await waitFor(async () => (await parentAlerts()).find((n) => n.data.homeworkId === hwId));
    expect(alert.title).toBe('Mathematics homework for Student1');
    expect(alert.body).toBe('Exercise 4.2, Q1–10 · due 1 Dec');
  });

  it("a teacher can't set homework for a section they don't teach", async () => {
    const res = await t.as(tok.teacher, A.slug).post('/v1/homework', { subjectId: A.subjectId, sectionIds: [A.sectionA, A.sectionB], title: 'Nope' });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('NOT_YOUR_SECTION');
  });

  it('rejects attachments that are not verified homework uploads', async () => {
    const res = await t.as(tok.teacher, A.slug).post('/v1/homework', { subjectId: A.subjectId, sectionIds: [A.sectionA], title: 'Bad file', attachmentFileIds: [A.fileId] });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('INVALID_REFERENCE');
  });

  it('admins post on behalf of the subject teacher (or must choose one)', async () => {
    const forB = await t.as(tok.admin, A.slug).post('/v1/homework', { subjectId: A.subjectId, sectionIds: [A.sectionB], title: 'For 8-B', publish: 'DRAFT' });
    expect(forB.status).toBe(201);
    expect(forB.body.data.teacher.name).toBe('Second');
    const forA = await t.as(tok.admin, A.slug).post('/v1/homework', { subjectId: A.subjectId, sectionIds: [A.sectionA], title: 'For 8-A', publish: 'DRAFT' });
    expect(forA.status).toBe(422);
    expect(forA.body.error.code).toBe('TEACHER_REQUIRED');
    const chosen = await t.as(tok.admin, A.slug).post('/v1/homework', { subjectId: A.subjectId, sectionIds: [A.sectionA], title: 'For 8-A', publish: 'DRAFT', teacherId: A.teacherId });
    expect(chosen.status).toBe(201);
  });

  it('parents see only published homework for their child, and can open attachments', async () => {
    const list = await parentHomework();
    expect(list.map((h) => h.id)).toContain(hwId);
    expect(list.every((h) => !['For 8-A', 'For 8-B'].includes(h.title))).toBe(true); // drafts hidden
    const link = await t.as(tok.parent, A.slug).get(`/v1/homework/${hwId}/attachments/${attachmentId}`);
    expect(link.status).toBe(200);
    expect(link.body.data.url).toBeTruthy();
    expect((await t.as(tok.parent, A.slug).get(`/v1/homework?studentId=${A.students.s2}`)).status).toBe(404);
    expect((await t.as(tok.parent, A.slug).patch(`/v1/homework/${hwId}`, { title: 'x' })).status).toBe(403);
    expect((await t.as(tok.accountant, A.slug).get('/v1/homework')).status).toBe(403);
  });

  it("teachers can't edit someone else's homework", async () => {
    const other = await t.as(tok.admin, A.slug).post('/v1/homework', { subjectId: A.subjectId, sectionIds: [A.sectionA], title: 'By admin', publish: 'DRAFT', teacherId: (await t.platform.teacher.findFirstOrThrow({ where: { schoolId: A.schoolId, employeeId: 'T2' } })).id });
    const res = await t.as(tok.teacher, A.slug).patch(`/v1/homework/${other.body.data.id}`, { title: 'Mine now' });
    expect(res.status).toBe(403);
    const mine = await t.as(tok.teacher, A.slug).patch(`/v1/homework/${hwId}`, { title: 'Exercise 4.2, Q1–12', dueDate: null });
    expect(mine.body.data).toMatchObject({ title: 'Exercise 4.2, Q1–12', dueDate: null });
  });

  it('scheduled homework publishes itself and then notifies', async () => {
    const at = new Date(Date.now() + 1500).toISOString();
    const res = await t.as(tok.teacher, A.slug).post('/v1/homework', { subjectId: A.subjectId, sectionIds: [A.sectionA], title: 'Later', publish: 'SCHEDULE', publishAt: at });
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('SCHEDULED');
    expect((await parentHomework()).some((h) => h.id === res.body.data.id)).toBe(false);
    await waitFor(async () => (await parentHomework()).some((h) => h.id === res.body.data.id));
    await waitFor(async () => (await parentAlerts()).some((n) => n.data.homeworkId === res.body.data.id));
  });

  it('a scheduled time must be in the future', async () => {
    const res = await t.as(tok.teacher, A.slug).post('/v1/homework', { subjectId: A.subjectId, sectionIds: [A.sectionA], title: 'Past', publish: 'SCHEDULE', publishAt: '2020-01-01T00:00:00Z' });
    expect(res.status).toBe(422);
  });

  it('publishing a draft notifies; deleting published homework archives it', async () => {
    const draft = await t.as(tok.teacher, A.slug).post('/v1/homework', { subjectId: A.subjectId, sectionIds: [A.sectionA], title: 'Draft one', publish: 'DRAFT' });
    const pub = await t.as(tok.teacher, A.slug).post(`/v1/homework/${draft.body.data.id}/publish`, {});
    expect(pub.body.data.status).toBe('PUBLISHED');
    await waitFor(async () => (await parentAlerts()).some((n) => n.data.homeworkId === draft.body.data.id));

    expect((await t.as(tok.teacher, A.slug).delete(`/v1/homework/${draft.body.data.id}`)).status).toBe(200);
    expect((await parentHomework()).some((h) => h.id === draft.body.data.id)).toBe(false);
    const row = await t.platform.homework.findUniqueOrThrow({ where: { id: draft.body.data.id } });
    expect(row.status).toBe('ARCHIVED');
  });

  it('teachers can filter to their own homework', async () => {
    const res = await t.as(tok.teacher, A.slug).get('/v1/homework?mine=true&pageSize=50');
    expect(res.status).toBe(200);
    expect(res.body.data.every((h: { teacher: { id: string } }) => h.teacher.id === A.teacherId)).toBe(true);
  });
});
