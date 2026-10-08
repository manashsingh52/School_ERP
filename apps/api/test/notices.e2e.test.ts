/**
 * Notices (Master Prompt §32): audiences decide visibility and who is notified; whole-school
 * audiences need notice.publish_school; teachers post only to their sections; read receipts.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { QueueService } from '../src/core/queue/queue.service.js';
import { createTenant, createTestApp, type Tenant, type TestApp } from './helpers.js';

let t: TestApp;
let A: Tenant;
const tok: Record<'admin' | 'teacher' | 'parent' | 'accountant', string> = {} as never;

beforeAll(async () => {
  t = await createTestApp({ RUN_WORKERS: 'true' });
  await t.app.get(QueueService).startWorkers();
  A = await createTenant(t, 'ntc');
  for (const role of ['admin', 'teacher', 'parent', 'accountant'] as const) tok[role] = (await t.login(A.users[role], A.slug)).token;
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
const titles = async (who: keyof typeof tok) => ((await t.as(tok[who], A.slug).get('/v1/notices?pageSize=50')).body.data as { title: string }[]).map((n) => n.title);
const inbox = async (who: keyof typeof tok) =>
  ((await t.as(tok[who], A.slug).get('/v1/notifications?limit=50')).body.data as { event: string; title: string; readAt: string | null; data: { noticeId?: string } }[]).filter((n) => n.event === 'notice.published');

describe('notices', () => {
  let parentsNotice: string;

  it('everyone sees a whole-school notice', async () => {
    for (const who of ['admin', 'teacher', 'parent', 'accountant'] as const) expect(await titles(who)).toContain('Welcome back');
  });

  it('an all-parents notice reaches parents (and notifies them), not staff', async () => {
    const res = await t.as(tok.admin, A.slug).post('/v1/notices', { title: 'PTM on Saturday', body: '**Parent–teacher meeting** at 10 am.', audiences: [{ type: 'ALL_PARENTS' }] });
    expect(res.status).toBe(201);
    parentsNotice = res.body.data.id;
    expect(res.body.data).toMatchObject({ status: 'PUBLISHED', audiences: [{ type: 'ALL_PARENTS', label: 'All parents' }], author: { name: 'Admin' }, canEdit: true });
    expect(await titles('parent')).toContain('PTM on Saturday');
    expect(await titles('teacher')).not.toContain('PTM on Saturday');
    const alert = await waitFor(async () => (await inbox('parent')).find((n) => n.data.noticeId === parentsNotice));
    expect(alert.title).toBe('PTM on Saturday');
    expect((await inbox('admin')).some((n) => n.data.noticeId === parentsNotice)).toBe(false); // not the author
  });

  it('a section notice reaches that section\'s parents and teachers only', async () => {
    const res = await t.as(tok.admin, A.slug).post('/v1/notices', { title: '8-B trip', body: 'Bring a hat.', audiences: [{ type: 'SECTION', refId: A.sectionB }] });
    expect(res.status).toBe(201);
    expect(res.body.data.audiences[0].label).toBe('8-B');
    expect(await titles('parent')).not.toContain('8-B trip'); // child is in 8-A
    expect(await titles('teacher')).not.toContain('8-B trip'); // teaches 8-A only
    const toA = await t.as(tok.admin, A.slug).post('/v1/notices', { title: 'Class 8 test', body: 'Maths test Friday.', audiences: [{ type: 'CLASS', refId: A.classId }] });
    expect(toA.status).toBe(201);
    expect(await titles('parent')).toContain('Class 8 test');
    expect(await titles('teacher')).toContain('Class 8 test');
  });

  it('teachers post only to their own sections', async () => {
    const wide = await t.as(tok.teacher, A.slug).post('/v1/notices', { title: 'All', body: 'x', audiences: [{ type: 'SCHOOL' }] });
    expect(wide.status).toBe(403);
    const other = await t.as(tok.teacher, A.slug).post('/v1/notices', { title: 'B', body: 'x', audiences: [{ type: 'SECTION', refId: A.sectionB }] });
    expect(other.status).toBe(403);
    const mine = await t.as(tok.teacher, A.slug).post('/v1/notices', { title: 'Project due', body: 'Science project due Monday.', audiences: [{ type: 'SECTION', refId: A.sectionA }] });
    expect(mine.status).toBe(201);
    expect(await titles('parent')).toContain('Project due');
    const options = await t.as(tok.teacher, A.slug).get('/v1/notices/audience-options');
    expect(options.body.data).toEqual({ schoolWide: false, classes: [], sections: [{ id: A.sectionA, label: '8-A' }], roles: [] });
    expect((await t.as(tok.parent, A.slug).post('/v1/notices', { title: 'x', body: 'x', audiences: [{ type: 'SECTION', refId: A.sectionA }] })).status).toBe(403);
  });

  it('rejects unknown audience references', async () => {
    const res = await t.as(tok.admin, A.slug).post('/v1/notices', { title: 'x', body: 'x', audiences: [{ type: 'SECTION', refId: A.subjectId }] });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('INVALID_REFERENCE');
  });

  it('read receipts feed the stats and clear the inbox item', async () => {
    const before = await t.as(tok.admin, A.slug).get(`/v1/notices/${parentsNotice}/stats`);
    expect(before.body.data).toMatchObject({ recipients: 1, read: 0, percent: 0 });
    expect((await t.as(tok.parent, A.slug).post(`/v1/notices/${parentsNotice}/read`)).status).toBe(200);
    const after = await t.as(tok.admin, A.slug).get(`/v1/notices/${parentsNotice}/stats`);
    expect(after.body.data).toMatchObject({ recipients: 1, read: 1, percent: 100, byGroup: [{ group: 'Parents', recipients: 1, read: 1 }, { group: 'Staff', recipients: 0, read: 0 }] });
    expect((await inbox('parent')).find((n) => n.data.noticeId === parentsNotice)?.readAt).toBeTruthy();
    expect((await t.as(tok.parent, A.slug).get(`/v1/notices/${parentsNotice}`)).body.data.readAt).toBeTruthy();
    expect((await t.as(tok.parent, A.slug).get(`/v1/notices/${parentsNotice}/stats`)).status).toBe(403);
    expect((await t.as(tok.teacher, A.slug).get(`/v1/notices/${parentsNotice}`)).status).toBe(404);
  });

  it('drafts stay private; scheduled notices publish themselves', async () => {
    const draft = await t.as(tok.admin, A.slug).post('/v1/notices', { title: 'Draft one', body: 'x', audiences: [{ type: 'SCHOOL' }], publish: 'DRAFT' });
    expect(draft.body.data.status).toBe('DRAFT');
    expect(await titles('parent')).not.toContain('Draft one');
    const drafts = await t.as(tok.admin, A.slug).get('/v1/notices?status=DRAFT');
    expect(drafts.body.data.map((n: { title: string }) => n.title)).toContain('Draft one');

    const at = new Date(Date.now() + 1500).toISOString();
    const later = await t.as(tok.admin, A.slug).post('/v1/notices', { title: 'Later', body: 'x', audiences: [{ type: 'ALL_PARENTS' }], publish: 'SCHEDULE', publishAt: at, sendPush: false });
    expect(later.body.data.status).toBe('SCHEDULED');
    await waitFor(async () => (await titles('parent')).includes('Later'));
    await waitFor(async () => (await inbox('parent')).some((n) => n.data.noticeId === later.body.data.id));
    const notification = await t.platform.notification.findFirstOrThrow({ where: { event: 'notice.published', data: { path: ['noticeId'], equals: later.body.data.id } }, include: { deliveries: true } });
    expect(notification.deliveries).toEqual([]); // sendPush: false → inbox only
  });

  it('pinned first; deleting a published notice archives it', async () => {
    const pinned = await t.as(tok.admin, A.slug).post('/v1/notices', { title: 'Pinned', body: 'x', audiences: [{ type: 'SCHOOL' }], isPinned: true });
    expect((await titles('parent'))[0]).toBe('Pinned');
    expect((await t.as(tok.teacher, A.slug).delete(`/v1/notices/${pinned.body.data.id}`)).status).toBe(403);
    expect((await t.as(tok.admin, A.slug).delete(`/v1/notices/${pinned.body.data.id}`)).status).toBe(200);
    expect(await titles('parent')).not.toContain('Pinned');
    expect((await t.platform.notice.findUniqueOrThrow({ where: { id: pinned.body.data.id } })).status).toBe('ARCHIVED');
  });

  it('authors can edit their own notice', async () => {
    const mine = (await t.as(tok.teacher, A.slug).get('/v1/notices?mine=true')).body.data[0];
    const res = await t.as(tok.teacher, A.slug).patch(`/v1/notices/${mine.id}`, { title: 'Project due (updated)' });
    expect(res.body.data.title).toBe('Project due (updated)');
    expect((await t.as(tok.teacher, A.slug).patch(`/v1/notices/${parentsNotice}`, { title: 'x' })).status).toBe(404);
  });
});
