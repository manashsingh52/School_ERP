import { generateKeyPairSync, randomBytes, randomInt, randomUUID } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { pino } from 'pino';
import supertest from 'supertest';
import { inject } from 'vitest';
import { createApp } from '../src/bootstrap.js';
import { loadEnv } from '../src/config/env.js';
import { AccessService } from '../src/core/auth/access.service.js';
import { PlatformPrismaService } from '../src/core/prisma/prisma.service.js';
import { MemoryRateLimitStore } from '../src/core/rate-limit/rate-limit.js';
import { ConsoleOtpSender } from '../src/modules/auth/otp-sender.js';
import { SchoolsService } from '../src/modules/schools/schools.service.js';

export const PASSWORD = 'Test@Pass123';

export function testEnv(overrides: Record<string, string> = {}) {
  const urls = inject('dbUrls');
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  return loadEnv({
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    APP_DATABASE_URL: urls.APP_DATABASE_URL,
    PLATFORM_DATABASE_URL: urls.PLATFORM_DATABASE_URL,
    JWT_PRIVATE_KEY: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    JWT_PUBLIC_KEY: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    OTP_PEPPER: 'test-pepper-0123456789abcdef',
    STORAGE_DRIVER: 'local',
    STORAGE_LOCAL_DIR: mkdtempSync(join(tmpdir(), 'schoolos-test-files-')),
    STORAGE_LOCAL_URL_BASE: '', // links become /v1/files/local/<token>, callable by supertest
    STORAGE_SIGNING_SECRET: randomBytes(32).toString('base64url'),
    RUN_WORKERS: 'false',
    ...overrides,
  });
}

export class TestApp {
  readonly http: ReturnType<typeof supertest>;
  readonly schools: SchoolsService;
  readonly platform: PlatformPrismaService;
  readonly otp: ConsoleOtpSender;

  constructor(readonly app: INestApplication) {
    this.http = supertest(app.getHttpServer());
    this.schools = app.get(SchoolsService);
    this.platform = app.get(PlatformPrismaService);
    this.otp = app.get(ConsoleOtpSender);
  }

  /** Rate limits are real in tests; reset between logins so suites don't trip them. */
  resetLimits(): void {
    this.app.get(MemoryRateLimitStore).reset();
  }

  clearAccessCache(): void {
    this.app.get(AccessService).clearAll();
  }

  async login(identifier: string, schoolSlug?: string, password = PASSWORD) {
    this.resetLimits();
    const res = await this.http.post('/v1/auth/login').send({ identifier, password, schoolSlug });
    if (res.status !== 200) throw new Error(`login failed for ${identifier}: ${res.status} ${JSON.stringify(res.body)}`);
    return {
      body: res.body,
      token: res.body.tokens.accessToken as string,
      refreshToken: res.body.tokens.refreshToken as string,
    };
  }

  /** Authenticated request helper: as(token).get(path) */
  as(token: string, slug?: string) {
    const withAuth = (req: supertest.Test) => {
      req.set('authorization', `Bearer ${token}`);
      if (slug) req.set('x-school-slug', slug);
      return req;
    };
    return {
      get: (path: string) => withAuth(this.http.get(path)),
      post: (path: string, body?: object) => withAuth(this.http.post(path)).send(body ?? {}),
      patch: (path: string, body?: object) => withAuth(this.http.patch(path)).send(body ?? {}),
      put: (path: string, body?: object) => withAuth(this.http.put(path)).send(body ?? {}),
      delete: (path: string) => withAuth(this.http.delete(path)),
    };
  }

  close(): Promise<void> {
    return this.app.close();
  }
}

export async function createTestApp(overrides: Record<string, string> = {}): Promise<TestApp> {
  const app = await createApp(testEnv(overrides), pino({ level: 'silent' }));
  await app.init();
  return new TestApp(app);
}

const randomPhone = () => `+9198${String(randomInt(0, 100_000_000)).padStart(8, '0')}`;
const date = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

export interface Tenant {
  slug: string;
  schoolId: string;
  sectionA: string;
  sectionB: string;
  /** s1: in A, parent's child · s2: in A · s3: in B */
  students: { s1: string; s2: string; s3: string };
  /** A READY file uploaded by the admin. */
  fileId: string;
  yearId: string;
  classId: string;
  subjectId: string;
  teacherId: string;
  assignmentId: string;
  guardianId: string;
  adminMembershipId: string;
  teacherRoleId: string;
  importJobId: string;
  /** An in-app notification in the admin's inbox. */
  notificationId: string;
  users: { admin: string; teacher: string; parent: string; accountant: string };
}

/**
 * One complete school: year, Class 8 (A, B), admin, accountant, a teacher who is class teacher
 * of 8-A only, and a parent whose only child is s1 (8-A).
 */
export async function createTenant(t: TestApp, label: string): Promise<Tenant> {
  const slug = `${label}-${randomInt(100_000, 999_999)}`;
  const db = t.platform;
  const school = await t.schools.createSchool({ slug, name: `${label} School`, status: 'ACTIVE' });
  const schoolId = school.id;
  const year = await db.academicYear.create({
    data: { schoolId, name: '2026–27', startDate: date('2026-04-01'), endDate: date('2027-03-31'), status: 'ACTIVE' },
  });
  await db.school.update({ where: { id: schoolId }, data: { currentAcademicYearId: year.id } });
  const cls = await db.schoolClass.create({ data: { schoolId, name: 'Class 8', displayOrder: 8 } });
  const [a, b] = await Promise.all(
    ['A', 'B'].map((name) => db.section.create({ data: { schoolId, academicYearId: year.id, classId: cls.id, name } })),
  );

  const users = {
    admin: `admin-${slug}@test.school`,
    accountant: `acct-${slug}@test.school`,
    teacher: `teacher-${slug}@test.school`,
    parent: `parent-${slug}@test.school`,
  };
  await t.schools.addMember({ schoolId, name: 'Admin', email: users.admin, phone: randomPhone(), password: PASSWORD, roleKeys: ['school_admin'] });
  await t.schools.addMember({ schoolId, name: 'Accountant', email: users.accountant, phone: randomPhone(), password: PASSWORD, roleKeys: ['accountant'] });
  const teacherM = await t.schools.addMember({ schoolId, name: 'Teacher', email: users.teacher, phone: randomPhone(), password: PASSWORD, roleKeys: ['teacher'] });
  const parentM = await t.schools.addMember({ schoolId, name: 'Parent', email: users.parent, phone: randomPhone(), password: PASSWORD, roleKeys: ['parent'] });

  const teacher = await db.teacher.create({
    data: { schoolId, membershipId: teacherM.membership.id, employeeId: 'T1', firstName: 'Teacher', phone: randomPhone() },
  });
  await db.section.update({ where: { id: a!.id }, data: { classTeacherId: teacher.id } });

  const mkStudent = async (admissionNo: string, sectionId: string) => {
    const s = await db.student.create({ data: { schoolId, admissionNo, firstName: `Student${admissionNo}` } });
    await db.studentEnrollment.create({
      data: { schoolId, studentId: s.id, academicYearId: year.id, classId: cls.id, sectionId, enrolledOn: date('2026-04-01') },
    });
    return s.id;
  };
  const s1 = await mkStudent('1', a!.id);
  const s2 = await mkStudent('2', a!.id);
  const s3 = await mkStudent('3', b!.id);

  const guardian = await db.guardian.create({
    data: { schoolId, membershipId: parentM.membership.id, name: 'Parent', phone: randomPhone() },
  });
  await db.studentGuardian.create({ data: { schoolId, studentId: s1, guardianId: guardian.id, relation: 'FATHER' } });

  const adminMembership = await db.membership.findFirstOrThrow({ where: { schoolId, user: { email: users.admin } } });
  const file = await db.file.create({
    data: {
      schoolId,
      bucket: 'local',
      objectKey: `schools/${schoolId}/document/${randomUUID()}`,
      originalName: 'report.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 10n,
      status: 'READY',
      uploadedByMemberId: adminMembership.id,
    },
  });

  const subject = await db.subject.create({ data: { schoolId, name: 'Mathematics', code: 'MATH' } });
  // A second teacher (no login) teaches Maths in 8-B, so the main teacher's scope stays 8-A only.
  const teacher2 = await db.teacher.create({ data: { schoolId, employeeId: 'T2', firstName: 'Second', phone: randomPhone() } });
  const assignment = await db.teachingAssignment.create({
    data: { schoolId, academicYearId: year.id, sectionId: b!.id, subjectId: subject.id, teacherId: teacher2.id },
  });

  return {
    slug,
    schoolId,
    sectionA: a!.id,
    sectionB: b!.id,
    students: { s1, s2, s3 },
    users,
    fileId: file.id,
    yearId: year.id,
    classId: cls.id,
    subjectId: subject.id,
    teacherId: teacher.id,
    assignmentId: assignment.id,
    guardianId: guardian.id,
    adminMembershipId: adminMembership.id,
    teacherRoleId: (await db.role.findFirstOrThrow({ where: { schoolId, key: 'teacher' } })).id,
    notificationId: (
      await db.notification.create({
        data: { schoolId, membershipId: adminMembership.id, event: 'notice.published', title: 'Welcome', body: 'Hello', data: {} },
      })
    ).id,
    importJobId: (
      await db.importJob.create({
        data: { schoolId, entity: 'STUDENTS', fileId: file.id, status: 'MAPPING', detectedColumns: ['Name'], createdByMemberId: adminMembership.id },
      })
    ).id,
  };
}
