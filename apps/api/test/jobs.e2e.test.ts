/**
 * Outbox → queue → handler, end to end on the PostgreSQL queue backend (docs/01 §5).
 * A student created over HTTP produces exactly one "student.created" event, delivered to the
 * handler inside that school's tenant context.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RequestContextStore } from '../src/core/context/request-context.js';
import { OutboxService } from '../src/core/outbox/outbox.service.js';
import { QueueService } from '../src/core/queue/queue.service.js';
import { createTenant, createTestApp, type Tenant, type TestApp } from './helpers.js';

let t: TestApp;
let A: Tenant;
let token: string;
const received: { type: string; schoolId: string | null; contextSchool: string; studentId: unknown }[] = [];

beforeAll(async () => {
  t = await createTestApp({ RUN_WORKERS: 'true' });
  t.app.get(OutboxService).on('student.created', async (event) => {
    received.push({
      type: event.type,
      schoolId: event.schoolId,
      contextSchool: RequestContextStore.school().schoolId,
      studentId: event.payload.studentId,
    });
  });
  await t.app.get(QueueService).startWorkers();
  A = await createTenant(t, 'jobs');
  token = (await t.login(A.users.admin, A.slug)).token;
});

afterAll(async () => {
  await t?.close();
});

const waitFor = async (check: () => boolean, ms = 15_000) => {
  const until = Date.now() + ms;
  while (!check()) {
    if (Date.now() > until) throw new Error('timed out waiting for job');
    await new Promise((r) => setTimeout(r, 100));
  }
};

describe('background jobs', () => {
  it('delivers a domain event from the outbox to its handler, in the right school', async () => {
    const res = await t.as(token, A.slug).post('/v1/students', { admissionNo: 'JOB-1', firstName: 'Queue', sectionId: A.sectionA });
    expect(res.status).toBe(201);

    await waitFor(() => received.some((e) => e.studentId === res.body.data.id));
    const event = received.find((e) => e.studentId === res.body.data.id)!;
    expect(event).toMatchObject({ type: 'student.created', schoolId: A.schoolId, contextSchool: A.schoolId });

    const row = await t.platform.outboxEvent.findFirstOrThrow({ where: { schoolId: A.schoolId, type: 'student.created' } });
    expect(row.status).toBe('DISPATCHED');
  });

  it('writes no event when the change fails', async () => {
    const before = await t.platform.outboxEvent.count({ where: { schoolId: A.schoolId } });
    const dup = await t.as(token, A.slug).post('/v1/students', { admissionNo: 'JOB-1', firstName: 'Again', sectionId: A.sectionA });
    expect(dup.status).toBe(409);
    expect(await t.platform.outboxEvent.count({ where: { schoolId: A.schoolId } })).toBe(before);
  });
});
