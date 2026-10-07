/** Upload pipeline (docs/09 §3): signed links, real-type checks, permissions, isolation. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTenant, createTestApp, type Tenant, type TestApp } from './helpers.js';

// A real 1×1 PNG and a minimal PDF header.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);
const FAKE_PNG = Buffer.from('<script>alert(1)</script> definitely not an image');

let t: TestApp;
let A: Tenant;
let B: Tenant;
let adminA: string;
let teacherA: string;
let adminB: string;

beforeAll(async () => {
  t = await createTestApp();
  A = await createTenant(t, 'files-a');
  B = await createTenant(t, 'files-b');
  adminA = (await t.login(A.users.admin, A.slug)).token;
  teacherA = (await t.login(A.users.teacher, A.slug)).token;
  adminB = (await t.login(B.users.admin, B.slug)).token;
});

afterAll(async () => {
  await t?.close();
});

async function upload(token: string, slug: string, body: Buffer, meta: { purpose: string; fileName: string; mimeType: string }) {
  const ticket = await t.as(token, slug).post('/v1/files/upload-url', { ...meta, sizeBytes: body.length });
  expect(ticket.status, JSON.stringify(ticket.body)).toBe(200);
  const { fileId, upload: link } = ticket.body.data;
  const put = await t.http.put(link.url).set(link.headers).send(body);
  expect(put.status).toBe(200);
  return { fileId: fileId as string, complete: await t.as(token, slug).post(`/v1/files/${fileId}/complete`) };
}

describe('uploads', () => {
  it('accepts a real image and serves it back through a short-lived link', async () => {
    const { fileId, complete } = await upload(adminA, A.slug, PNG, { purpose: 'student_photo', fileName: 'rahul.png', mimeType: 'image/png' });
    expect(complete.status).toBe(200);
    expect(complete.body.data).toMatchObject({ status: 'READY', purpose: 'student_photo', sizeBytes: PNG.length });

    const link = await t.as(adminA, A.slug).get(`/v1/files/${fileId}/download-url`);
    expect(link.status).toBe(200);
    const file = await t.http.get(link.body.data.url).buffer(true).parse((res, cb) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    expect(file.status).toBe(200);
    expect(Buffer.compare(file.body as Buffer, PNG)).toBe(0);
    expect(file.headers['content-disposition']).toContain('attachment');
    expect(file.headers['x-content-type-options']).toBe('nosniff');
  });

  it('rejects a file whose contents do not match its declared type', async () => {
    const { fileId, complete } = await upload(adminA, A.slug, FAKE_PNG, { purpose: 'student_photo', fileName: 'x.png', mimeType: 'image/png' });
    expect(complete.status).toBe(422);
    expect(complete.body.error.code).toBe('FILE_REJECTED');
    const link = await t.as(adminA, A.slug).get(`/v1/files/${fileId}/download-url`);
    expect(link.status).toBe(404);
  });

  it('accepts CSV imports and rejects binary disguised as CSV', async () => {
    const ok = await upload(adminA, A.slug, Buffer.from('name,class\nRahul,8-A\n'), { purpose: 'import', fileName: 'students.csv', mimeType: 'text/csv' });
    expect(ok.complete.status).toBe(200);
    const bad = await upload(adminA, A.slug, PNG, { purpose: 'import', fileName: 'students.csv', mimeType: 'text/csv' });
    expect(bad.complete.status).toBe(422);
  });

  it('refuses disallowed types and oversized files before any upload', async () => {
    const svg = await t.as(adminA, A.slug).post('/v1/files/upload-url', { purpose: 'school_logo', fileName: 'logo.svg', mimeType: 'image/svg+xml', sizeBytes: 100 });
    expect(svg.status).toBe(422);
    const big = await t.as(adminA, A.slug).post('/v1/files/upload-url', { purpose: 'student_photo', fileName: 'big.png', mimeType: 'image/png', sizeBytes: 50 * 1024 * 1024 });
    expect(big.status).toBe(422);
    expect(big.body.error.details[0].field).toBe('sizeBytes');
  });

  it('checks the permission for the purpose', async () => {
    const res = await t.as(teacherA, A.slug).post('/v1/files/upload-url', { purpose: 'student_photo', fileName: 'p.png', mimeType: 'image/png', sizeBytes: 10 });
    expect(res.status).toBe(403);
  });

  it('rejects forged or tampered storage links', async () => {
    const ticket = await t.as(adminA, A.slug).post('/v1/files/upload-url', { purpose: 'student_photo', fileName: 'p.png', mimeType: 'image/png', sizeBytes: PNG.length });
    const url: string = ticket.body.data.upload.url;
    const [body, mac] = url.split('/').pop()!.split('.');
    const claims = JSON.parse(Buffer.from(body!, 'base64url').toString());
    const forged = Buffer.from(JSON.stringify({ ...claims, k: `schools/${B.schoolId}/document/evil` })).toString('base64url');
    const res = await t.http.put(`/v1/files/local/${forged}.${mac}`).set('content-type', 'image/png').send(PNG);
    expect(res.status).toBe(404);
  });

  it("can't complete or download another school's file", async () => {
    expect((await t.as(adminB, B.slug).post(`/v1/files/${A.fileId}/complete`)).status).toBe(404);
    expect((await t.as(adminB, B.slug).get(`/v1/files/${A.fileId}/download-url`)).status).toBe(404);
  });
});
