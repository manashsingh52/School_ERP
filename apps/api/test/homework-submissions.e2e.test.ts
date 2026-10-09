/** Homework submissions: the teacher records who handed it in (and feedback); parents see their child's status. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type Tenant, TestApp, createTenant, createTestApp } from './helpers.js';

let t: TestApp;
let A: Tenant;
const tok: Record<string, string> = {};
const as = (who: string) => t.as(tok[who]!, A.slug);
const path = () => `/v1/homework/${A.homeworkId}/submissions`;

beforeAll(async () => {
  t = await createTestApp();
  A = await createTenant(t, 'hws');
  for (const who of ['admin', 'teacher', 'parent', 'accountant'] as const) tok[who] = (await t.login(A.users[who], A.slug)).token;
});

afterAll(async () => {
  await t?.close();
});

describe('homework submissions', () => {
  it('the roster is the students of the sections it was set for', async () => {
    const res = await as('teacher').get(path());
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data.rows.map((r: { studentId: string }) => r.studentId).sort()).toEqual([A.students.s1, A.students.s2].sort());
    expect(res.body.data.counts).toEqual({ ASSIGNED: 2, VIEWED: 0, SUBMITTED: 0, REVIEWED: 0 });
  });

  it('a parent opening it shows the teacher it was seen', async () => {
    expect((await as('parent').post(`/v1/homework/${A.homeworkId}/seen`, { studentId: A.students.s1 })).status).toBe(200);
    expect((await as('parent').post(`/v1/homework/${A.homeworkId}/seen`, { studentId: A.students.s2 })).status).toBe(404); // not their child
    const rows = (await as('teacher').get(path())).body.data.rows as { studentId: string; status: string; viewedAt: string | null }[];
    expect(rows.find((r) => r.studentId === A.students.s1)).toMatchObject({ status: 'VIEWED', viewedAt: expect.any(String) });
  });

  it('the teacher marks submissions and reviews with feedback', async () => {
    const res = await as('teacher').put(path(), {
      entries: [
        { studentId: A.students.s1, status: 'REVIEWED', feedback: 'Neat work — check Q4 again.' },
        { studentId: A.students.s2, status: 'SUBMITTED' },
      ],
    });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data.counts).toMatchObject({ REVIEWED: 1, SUBMITTED: 1, ASSIGNED: 0 });
    const s1 = res.body.data.rows.find((r: { studentId: string }) => r.studentId === A.students.s1);
    expect(s1).toMatchObject({ feedback: 'Neat work — check Q4 again.', submittedAt: expect.any(String), reviewedAt: expect.any(String) });
  });

  it('parents see their child’s status and feedback in the homework list', async () => {
    const list = (await as('parent').get(`/v1/homework?studentId=${A.students.s1}`)).body.data as { id: string; submission: { status: string; feedback: string | null } }[];
    expect(list.find((h) => h.id === A.homeworkId)!.submission).toMatchObject({ status: 'REVIEWED', feedback: 'Neat work — check Q4 again.' });
  });

  it('undo keeps the "seen" signal; students outside the sections are refused', async () => {
    const res = await as('teacher').put(path(), { entries: [{ studentId: A.students.s1, status: 'ASSIGNED' }] });
    expect(res.body.data.rows.find((r: { studentId: string }) => r.studentId === A.students.s1)).toMatchObject({ status: 'VIEWED', submittedAt: null, reviewedAt: null });
    expect((await as('teacher').put(path(), { entries: [{ studentId: A.students.s3, status: 'SUBMITTED' }] })).status).toBe(422);
  });

  it('only those who can edit the homework record submissions', async () => {
    expect((await as('parent').get(path())).status).toBe(403);
    expect((await as('accountant').put(path(), { entries: [{ studentId: A.students.s1, status: 'SUBMITTED' }] })).status).toBe(403);
    expect((await as('admin').get(path())).status).toBe(200);
    const audit = (await as('admin').get('/v1/audit?action=homework.submissions')).body.data;
    expect(audit.length).toBe(2);
  });
});
