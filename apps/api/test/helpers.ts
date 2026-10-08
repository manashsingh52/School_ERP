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
    PDF_RENDERER: 'basic',
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
  /** Default bell schedule (P1 08:00–08:40, P2 08:40–09:20, Break, P3 09:40–10:20). */
  bellScheduleId: string;
  /** Draft timetable for 8-A on that schedule (empty). */
  timetableId: string;
  /** CBSE 9-point scale; exam 'Unit Test 1' (marks entry open) with Class 8 Maths (max 50, pass 17). */
  gradingScaleId: string;
  examId: string;
  examSubjectId: string;
  /** Fees: Tuition head; published Class 8 structure (₹12,000/yr in 2 installments of ₹6,000); invoice for s1 (unpaid) and s2 (paid at the counter). */
  feeHeadId: string;
  feeStructureId: string;
  installmentId: string;
  invoiceId: string;
  paymentId: string;
  concessionTypeId: string;
  concessionId: string;
  /** Published notice to everyone, by the admin. */
  noticeId: string;
  /** Published homework for 8-A (Maths, by the class teacher). */
  homeworkId: string;
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
    ...(await (async () => {
      const bell = await db.bellSchedule.create({
        data: {
          schoolId,
          name: 'Regular',
          isDefault: true,
          periods: {
            create: [
              { schoolId, name: 'P1', order: 1, startTime: '08:00', endTime: '08:40' },
              { schoolId, name: 'P2', order: 2, startTime: '08:40', endTime: '09:20' },
              { schoolId, name: 'Break', order: 3, startTime: '09:20', endTime: '09:40', isBreak: true },
              { schoolId, name: 'P3', order: 4, startTime: '09:40', endTime: '10:20' },
            ],
          },
        },
      });
      const tt = await db.timetable.create({ data: { schoolId, academicYearId: year.id, sectionId: a!.id, bellScheduleId: bell.id, effectiveFrom: date('2026-04-01') } });
      return { bellScheduleId: bell.id, timetableId: tt.id };
    })()),
    ...(await (async () => {
      const scale = await db.gradingScale.create({
        data: {
          schoolId,
          name: 'CBSE 9-point',
          isDefault: true,
          bands: {
            create: (
              [
                ['A1', 91, 100], ['A2', 81, 90.99], ['B1', 71, 80.99], ['B2', 61, 70.99], ['C1', 51, 60.99], ['C2', 41, 50.99], ['D', 33, 40.99], ['E', 0, 32.99],
              ] as const
            ).map(([label, minPercent, maxPercent], i) => ({ schoolId, label, minPercent, maxPercent, order: i + 1 })),
          },
        },
      });
      const exam = await db.exam.create({ data: { schoolId, academicYearId: year.id, gradingScaleId: scale.id, name: 'Unit Test 1', status: 'MARKS_ENTRY' } });
      const es = await db.examSubject.create({ data: { schoolId, examId: exam.id, classId: cls.id, subjectId: subject.id, maxMarks: 50, passMarks: 17 } });
      return { gradingScaleId: scale.id, examId: exam.id, examSubjectId: es.id };
    })()),
    ...(await (async () => {
      const head = await db.feeHead.create({ data: { schoolId, name: 'Tuition Fee', code: 'TUI', type: 'TUITION', frequency: 'RECURRING' } });
      const structure = await db.feeStructure.create({ data: { schoolId, academicYearId: year.id, name: 'Class 8', status: 'PUBLISHED', classes: { create: [{ schoolId, classId: cls.id }] } } });
      const item = await db.feeStructureItem.create({ data: { schoolId, feeStructureId: structure.id, feeHeadId: head.id, amountPaise: 1_200_000 } });
      const [q1, q2] = await Promise.all(
        [['Term 1', '2026-04-10', 1], ['Term 2', '2026-10-10', 2]].map(([name, due, order]) =>
          db.feeInstallment.create({ data: { schoolId, feeStructureId: structure.id, name: name as string, dueDate: date(due as string), order: order as number, splits: { create: [{ schoolId, itemId: item.id, amountPaise: 600_000 }] } } }),
        ),
      );
      const invoice = (number: string, studentId: string, paid: boolean) =>
        db.invoice.create({
          data: {
            schoolId, number, studentId, academicYearId: year.id, installmentId: q1!.id, issueDate: date('2026-04-01'), dueDate: date('2026-04-10'),
            status: paid ? 'PAID' : 'ISSUED', subtotalPaise: 600_000, totalPaise: 600_000, paidPaise: paid ? 600_000 : 0, balancePaise: paid ? 0 : 600_000,
            lines: { create: [{ schoolId, kind: 'FEE', feeHeadId: head.id, description: 'Tuition Fee', amountPaise: 600_000 }] },
          },
        });
      const inv1 = await invoice('INV/FX/000001', s1, false);
      const inv2 = await invoice('INV/FX/000002', s2, true);
      const payment = await db.payment.create({
        data: { schoolId, studentId: s2, amountPaise: 600_000, method: 'CASH', status: 'CAPTURED', receivedAt: new Date(), collectedByMemberId: adminMembership.id,
          allocations: { create: [{ schoolId, invoiceId: inv2.id, amountPaise: 600_000 }] }, receipt: { create: { schoolId, number: 'RCPT/FX/000001' } } },
      });
      const ctype = await db.concessionType.create({ data: { schoolId, name: 'Sibling 10%', kind: 'SIBLING', calc: 'PERCENT', valueBasisPoints: 1000 } });
      const conc = await db.studentConcession.create({ data: { schoolId, studentId: s3, academicYearId: year.id, concessionTypeId: ctype.id, status: 'PENDING', requestedByMemberId: adminMembership.id } });
      return { feeHeadId: head.id, feeStructureId: structure.id, installmentId: q2!.id, invoiceId: inv1.id, paymentId: payment.id, concessionTypeId: ctype.id, concessionId: conc.id };
    })()),
    noticeId: (
      await db.notice.create({
        data: {
          schoolId,
          title: 'Welcome back',
          body: 'School reopens on Monday.',
          status: 'PUBLISHED',
          publishedAt: new Date(),
          createdByMemberId: adminMembership.id,
          audiences: { create: [{ schoolId, type: 'SCHOOL' }] },
        },
      })
    ).id,
    homeworkId: (
      await db.homework.create({
        data: {
          schoolId,
          academicYearId: year.id,
          subjectId: subject.id,
          teacherId: teacher.id,
          title: 'Fixture homework',
          status: 'PUBLISHED',
          publishedAt: new Date(),
          sections: { create: [{ schoolId, sectionId: a!.id }] },
        },
      })
    ).id,
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
