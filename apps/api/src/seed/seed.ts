/**
 * Local demo data: `pnpm db:seed`. Idempotent — does nothing if the demo school exists.
 * All demo users share SEED_PASSWORD from .env (local only).
 *
 *   superadmin@schoolos.local   Super Admin (platform console: http://admin.localhost:3000)
 *   support@schoolos.local      Support (platform; read-only, needs a school's approval)
 *   admin@demo.school           School Admin        +91 90000 00001
 *   principal@demo.school       Principal           +91 90000 00002
 *   accountant@demo.school      Accountant          +91 90000 00003
 *   teacher@demo.school         Teacher (8-A class teacher, Maths 8-B)  +91 90000 00004
 *   emp-002@demo.school …       Every other teacher, by employee number (emp-002 … emp-040)
 *   parent@demo.school          Parent of Rahul (8-A) and Ananya (5-B)  +91 90000 00005
 *
 * Web: http://demo.localhost:3000
 */
import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module.js';
import { loadEnv } from '../config/env.js';
import { createLogger } from '../core/logger/logger.js';
import { PasswordService } from '../core/auth/password.service.js';
import { PlatformPrismaService } from '../core/prisma/prisma.service.js';
import { SchoolsService } from '../modules/schools/schools.service.js';
import { PERMISSION_KEYS, type PermissionSet } from '@schoolos/permissions';
import type { INestApplicationContext } from '@nestjs/common';
import { RequestContextStore } from '../core/context/request-context.js';
import { ExamsService } from '../modules/exams/exams.service.js';
import { ResultsService } from '../modules/exams/results.service.js';
import { FeesService } from '../modules/fees/fees.service.js';
import { FinanceJobsService } from '../modules/finance/finance-jobs.service.js';
import { GatewayService } from '../modules/finance/gateway.service.js';
import { InvoicesService } from '../modules/finance/invoices.service.js';
import { PaymentsService } from '../modules/finance/payments.service.js';
import { PrismaService } from '../core/prisma/prisma.service.js';

const FIRST = ['Aarav', 'Aditi', 'Arjun', 'Ananya', 'Diya', 'Ishaan', 'Kabir', 'Kavya', 'Meera', 'Neha', 'Nikhil',
  'Priya', 'Rahul', 'Riya', 'Rohan', 'Saanvi', 'Sahil', 'Sara', 'Tanvi', 'Vihaan', 'Vivaan', 'Yash', 'Zoya', 'Aisha', 'Dev'];
const LAST = ['Sharma', 'Verma', 'Gupta', 'Singh', 'Kumar', 'Patel', 'Reddy', 'Nair', 'Iyer', 'Mehta', 'Joshi', 'Rao',
  'Das', 'Khan', 'Bose', 'Chopra', 'Malhotra', 'Pillai', 'Saxena', 'Agarwal'];
const CLASSES = ['Nursery', 'LKG', 'UKG', ...Array.from({ length: 12 }, (_, i) => `Class ${i + 1}`)];
const SUBJECTS = [
  ['English', 'ENG'], ['Hindi', 'HIN'], ['Mathematics', 'MATH'], ['Science', 'SCI'],
  ['Social Science', 'SST'], ['Computer', 'COMP'],
] as const;

const date = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

async function main() {
  const env = loadEnv();
  const password = process.env.SEED_PASSWORD;
  if (!password || env.NODE_ENV === 'production') throw new Error('Seeding needs SEED_PASSWORD and a non-production env');

  const logger = createLogger('warn', false);
  const app = await NestFactory.createApplicationContext(AppModule.forRoot(env, logger), { logger: false });
  const db = app.get(PlatformPrismaService);
  const schools = app.get(SchoolsService);
  const passwords = app.get(PasswordService);

  const existing = await db.school.findUnique({ where: { slug: 'demo' } });
  if (existing) {
    const added = await topUp(db, existing.id, app);
    console.log(added ? `Demo school topped up: ${added}.` : 'Demo school is complete — nothing to do.');
    await app.close();
    return;
  }

  // Platform super admin
  const superAdmin = await db.user.upsert({
    where: { email: 'superadmin@schoolos.local' },
    create: { name: 'Platform Admin', email: 'superadmin@schoolos.local', passwordHash: await passwords.hash(password), status: 'ACTIVE' },
    update: {},
  });
  await db.platformAdmin.upsert({ where: { userId: superAdmin.id }, create: { userId: superAdmin.id, role: 'SUPER_ADMIN' }, update: {} });

  const school = await schools.createSchool({ slug: 'demo', name: 'Demo Public School', board: 'CBSE', status: 'ACTIVE' });
  const schoolId = school.id;

  const year = await db.academicYear.create({
    data: { schoolId, name: '2026–27', startDate: date('2026-04-01'), endDate: date('2027-03-31'), status: 'ACTIVE' },
  });
  await db.school.update({ where: { id: schoolId }, data: { currentAcademicYearId: year.id, onboardingStep: 10, wentLiveAt: new Date() } });

  const sectionIds = new Map<string, string>(); // "Class 8-A" → id
  const classIds = new Map<string, string>();
  for (const [order, name] of CLASSES.entries()) {
    const cls = await db.schoolClass.create({ data: { schoolId, name, displayOrder: order + 1 } });
    classIds.set(name, cls.id);
    for (const section of ['A', 'B']) {
      const s = await db.section.create({ data: { schoolId, academicYearId: year.id, classId: cls.id, name: section, capacity: 40 } });
      sectionIds.set(`${name}-${section}`, s.id);
    }
  }
  const subjectIds = new Map<string, string>();
  for (const [name, code] of SUBJECTS) {
    const s = await db.subject.create({ data: { schoolId, name, code } });
    subjectIds.set(code, s.id);
  }

  const member = (name: string, email: string, phone: string, role: 'school_admin' | 'principal' | 'accountant' | 'teacher' | 'parent') =>
    schools.addMember({ schoolId, name, email, phone, password, roleKeys: [role] });

  await member('Anita Desai', 'admin@demo.school', '+919000000001', 'school_admin');
  await member('Dr. Suresh Menon', 'principal@demo.school', '+919000000002', 'principal');
  await member('Vikram Shah', 'accountant@demo.school', '+919000000003', 'accountant');
  const teacherMember = await member('Priya Sharma', 'teacher@demo.school', '+919000000004', 'teacher');
  const parentMember = await member('Raj Kumar', 'parent@demo.school', '+919000000005', 'parent');

  const teacher = await db.teacher.create({
    data: {
      schoolId, membershipId: teacherMember.membership.id, employeeId: 'EMP-001', firstName: 'Priya', lastName: 'Sharma',
      phone: '+919000000004', email: 'teacher@demo.school', department: 'Mathematics', designation: 'TGT', joiningDate: date('2019-06-01'),
    },
  });
  await db.section.update({ where: { id: sectionIds.get('Class 8-A')! }, data: { classTeacherId: teacher.id } });
  await db.teachingAssignment.create({
    data: { schoolId, academicYearId: year.id, sectionId: sectionIds.get('Class 8-B')!, subjectId: subjectIds.get('MATH')!, teacherId: teacher.id },
  });

  // ~600 students: 25 per section
  let admission = 1000;
  const students: { id: string; schoolId: string; admissionNo: string; firstName: string; lastName: string; gender: 'MALE' | 'FEMALE'; status: 'ACTIVE'; admissionDate: Date }[] = [];
  const enrollments: { schoolId: string; studentId: string; academicYearId: string; classId: string; sectionId: string; rollNo: number; enrolledOn: Date }[] = [];
  for (const [key, sectionId] of sectionIds) {
    const className = key.slice(0, key.lastIndexOf('-'));
    for (let roll = 1; roll <= 25; roll++) {
      admission += 1;
      const id = randomUUID();
      const i = admission - 1001; // spread first × last names so the list looks like a real school
      const firstName = FIRST[i % FIRST.length]!;
      students.push({
        id, schoolId, admissionNo: String(admission), firstName, lastName: LAST[(i * 7 + Math.floor(i / FIRST.length)) % LAST.length]!,
        gender: admission % 2 ? 'MALE' : 'FEMALE', status: 'ACTIVE', admissionDate: date('2026-04-01'),
      });
      enrollments.push({ schoolId, studentId: id, academicYearId: year.id, classId: classIds.get(className)!, sectionId, rollNo: roll, enrolledOn: date('2026-04-01') });
    }
  }
  // The parent's two children (fixed names so demos are predictable)
  const rahul = students.find((s) => enrollments.find((e) => e.studentId === s.id)?.sectionId === sectionIds.get('Class 8-A'))!;
  Object.assign(rahul, { firstName: 'Rahul', lastName: 'Kumar', gender: 'MALE' });
  const ananya = students.find((s) => enrollments.find((e) => e.studentId === s.id)?.sectionId === sectionIds.get('Class 5-B'))!;
  Object.assign(ananya, { firstName: 'Ananya', lastName: 'Kumar', gender: 'FEMALE' });

  await db.student.createMany({ data: students });
  await db.studentEnrollment.createMany({ data: enrollments });

  const guardian = await db.guardian.create({
    data: { schoolId, membershipId: parentMember.membership.id, name: 'Raj Kumar', phone: '+919000000005', email: 'parent@demo.school' },
  });
  await db.studentGuardian.createMany({
    data: [rahul, ananya].map((s) => ({ schoolId, studentId: s.id, guardianId: guardian.id, relation: 'FATHER' as const, isPrimary: true })),
  });

  const added = await topUp(db, schoolId, app);
  console.log(`Added: ${added}`);
  console.log(`Seeded "Demo Public School": ${CLASSES.length} classes, ${sectionIds.size} sections, ${students.length} students, 5 staff/parent logins + super admin.`);
  console.log('Open http://demo.localhost:3000 — logins are listed at the top of src/seed/seed.ts (password = SEED_PASSWORD).');
  await app.close();
}


const TEACHER_FIRST = ['Anil', 'Bhavna', 'Chetan', 'Deepa', 'Farhan', 'Gauri', 'Harish', 'Indu', 'Jatin', 'Kiran', 'Lata', 'Manoj', 'Nandini',
  'Om', 'Pallavi', 'Qasim', 'Rekha', 'Sanjay', 'Tara', 'Uday', 'Vandana', 'Waseem', 'Yamini', 'Zubin', 'Asha', 'Bharat', 'Charu', 'Dinesh',
  'Esha', 'Gopal', 'Hema', 'Imran', 'Jaya', 'Kunal', 'Leela', 'Mohan', 'Neeta', 'Prakash', 'Ritu'];
const TEACHER_LAST = ['Bhatt', 'Chauhan', 'Deshpande', 'Fernandes', 'Ghosh', 'Hegde', 'Jain', 'Kapoor', 'Lal', 'Mishra', 'Naidu', 'Oberoi', 'Pandey'];
const DEPARTMENTS = ['English', 'Hindi', 'Mathematics', 'Science', 'Social Science', 'Computer'];

/**
 * Phase 2 demo data, idempotent: 40 teachers, a class teacher for every section, subjects for every
 * class, and subject teachers for Classes 6–12. Safe to run on an existing demo school.
 */
async function topUp(db: PlatformPrismaService, schoolId: string, app: INestApplicationContext): Promise<string> {
  const notes: string[] = [];
  const school = await db.school.findUniqueOrThrow({ where: { id: schoolId } });
  const yearId = school.currentAcademicYearId!;

  const teacherCount = await db.teacher.count({ where: { schoolId } });
  if (teacherCount < 40) {
    const rows = Array.from({ length: 40 - teacherCount }, (_, i) => {
      const n = teacherCount + i + 1;
      return {
        schoolId,
        employeeId: `EMP-${String(n).padStart(3, '0')}`,
        firstName: TEACHER_FIRST[(n * 7) % TEACHER_FIRST.length]!,
        lastName: TEACHER_LAST[(n * 5) % TEACHER_LAST.length]!,
        phone: `+9190000${String(10000 + n).slice(-5)}`,
        department: DEPARTMENTS[n % DEPARTMENTS.length]!,
        designation: n % 3 === 0 ? 'PGT' : n % 3 === 1 ? 'TGT' : 'PRT',
        joiningDate: date(`${2012 + (n % 12)}-06-01`),
        gender: (n % 2 ? 'FEMALE' : 'MALE') as 'FEMALE' | 'MALE',
      };
    }).filter((r) => r.employeeId !== 'EMP-001');
    await db.teacher.createMany({ data: rows, skipDuplicates: true });
    notes.push(`${rows.length} teachers`);
  }

  const teachers = await db.teacher.findMany({ where: { schoolId }, orderBy: { employeeId: 'asc' } });
  const sections = await db.section.findMany({ where: { schoolId, academicYearId: yearId }, include: { class: true }, orderBy: [{ class: { displayOrder: 'asc' } }, { name: 'asc' }] });

  // Class teachers: one per section, never the same teacher twice.
  const busy = new Set(sections.map((s) => s.classTeacherId).filter(Boolean));
  const free = teachers.filter((t) => !busy.has(t.id));
  let assignedClassTeachers = 0;
  for (const s of sections) {
    if (s.classTeacherId) continue;
    const t = free.shift();
    if (!t) break;
    await db.section.update({ where: { id: s.id }, data: { classTeacherId: t.id } });
    assignedClassTeachers++;
  }
  if (assignedClassTeachers) notes.push(`${assignedClassTeachers} class teachers`);

  // Subjects for every class this year
  const subjects = await db.subject.findMany({ where: { schoolId } });
  if ((await db.classSubject.count({ where: { schoolId, academicYearId: yearId } })) === 0) {
    const classes = await db.schoolClass.findMany({ where: { schoolId } });
    await db.classSubject.createMany({
      data: classes.flatMap((c) => subjects.map((s) => ({ schoolId, academicYearId: yearId, classId: c.id, subjectId: s.id }))),
    });
    notes.push('subjects for every class');
  }

  // Subject teachers for Classes 6–12, by department
  if ((await db.teachingAssignment.count({ where: { schoolId, academicYearId: yearId } })) <= 1) {
    const senior = sections.filter((s) => s.class.displayOrder >= 9); // Class 6+
    const byDept = (dept: string) => teachers.filter((t) => t.department === dept);
    const rows: { schoolId: string; academicYearId: string; sectionId: string; subjectId: string; teacherId: string }[] = [];
    for (const [i, s] of senior.entries()) {
      for (const subject of subjects) {
        const dept = DEPARTMENTS.find((d) => d.toLowerCase().startsWith(subject.name.toLowerCase().slice(0, 4))) ?? subject.name;
        const pool = byDept(dept);
        const teacher = pool[i % Math.max(pool.length, 1)];
        if (teacher) rows.push({ schoolId, academicYearId: yearId, sectionId: s.id, subjectId: subject.id, teacherId: teacher.id });
      }
    }
    await db.teachingAssignment.createMany({ data: rows, skipDuplicates: true });
    notes.push(`${rows.length} subject assignments`);
  }
  notes.push(...(await dailyOps(db, schoolId, yearId)));
  notes.push(...(await exams(db, app, schoolId, yearId)));
  notes.push(...(await finance(db, app, schoolId, yearId)));
  notes.push(...(await platform(db, app, schoolId)));
  notes.push(...(await teacherLogins(db, app, schoolId)));
  notes.push(...(await moreTests(db, app, schoolId, yearId)));
  notes.push(...(await communication(db, schoolId)));
  notes.push(...(await upcomingExams(db, schoolId, yearId)));
  notes.push(...(await schoolCalendar(db, schoolId)));
  return notes.filter(Boolean).join(', ');
}

/** Phase 6: plans, feature flags, the demo school's subscription and a support user. Idempotent. */
async function platform(db: PlatformPrismaService, app: INestApplicationContext, schoolId: string): Promise<string[]> {
  const notes: string[] = [];
  const PLANS = [
    { code: 'basic', name: 'Basic', priceMonthlyPaise: 4_999_00, limits: { students: 500, storageGb: 5, smsPerMonth: 2_000, aiCallsPerMonth: 0 }, features: [] },
    { code: 'professional', name: 'Professional', priceMonthlyPaise: 12_999_00, limits: { students: 2_000, storageGb: 50, smsPerMonth: 10_000, aiCallsPerMonth: 500 }, features: ['online_payments', 'report_builder'] },
    { code: 'enterprise', name: 'Enterprise', priceMonthlyPaise: null, limits: { students: null, storageGb: 500, smsPerMonth: null, aiCallsPerMonth: 5_000 }, features: ['online_payments', 'report_builder', 'ai_assistant'] },
  ];
  if (!(await db.plan.count())) {
    for (const p of PLANS) await db.plan.create({ data: p });
    notes.push('3 plans');
  }
  const FLAGS = [
    { key: 'online_payments', description: 'Parents pay fees online through the school’s Razorpay account', defaultEnabled: false },
    { key: 'report_builder', description: 'Reports centre with exports (PDF, Excel, CSV)', defaultEnabled: false },
    { key: 'ai_assistant', description: 'AI assistant for staff (later phase)', defaultEnabled: false },
    { key: 'documents', description: 'Student and staff documents', defaultEnabled: true },
  ];
  for (const f of FLAGS) await db.featureFlag.upsert({ where: { key: f.key }, create: f, update: {} });
  // Phase 8: the demo school tries the AI assistant (offline rules provider unless Gemini is set).
  if (!(await db.schoolFeature.findUnique({ where: { schoolId_flagKey: { schoolId, flagKey: 'ai_assistant' } } }))) {
    await db.schoolFeature.create({ data: { schoolId, flagKey: 'ai_assistant', enabled: true } });
    notes.push('AI assistant on for the demo school');
  }
  if (!(await db.subscription.findUnique({ where: { schoolId } }))) {
    const pro = await db.plan.findUniqueOrThrow({ where: { code: 'professional' } });
    await db.subscription.create({ data: { schoolId, planId: pro.id, status: 'ACTIVE', currentPeriodStart: date('2026-04-01'), currentPeriodEnd: date('2027-03-31'), notes: 'Demo: annual, paid by bank transfer' } });
    notes.push('demo subscription (Professional)');
  }
  if (!(await db.user.findUnique({ where: { email: 'support@schoolos.local' } }))) {
    const support = await db.user.create({ data: { name: 'Sam Support', email: 'support@schoolos.local', passwordHash: await app.get(PasswordService).hash(process.env.SEED_PASSWORD!), status: 'ACTIVE' } });
    await db.platformAdmin.create({ data: { userId: support.id, role: 'SUPPORT' } });
    notes.push('support user');
  }
  return notes;
}

/** Deterministic pseudo-random numbers, so re-seeding gives the same demo. */
function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PERIODS = [
  ['P1', '08:00', '08:40', false], ['P2', '08:40', '09:20', false], ['P3', '09:20', '10:00', false], ['Break', '10:00', '10:20', true],
  ['P4', '10:20', '11:00', false], ['P5', '11:00', '11:40', false], ['Lunch', '11:40', '12:10', true], ['P6', '12:10', '12:50', false], ['P7', '12:50', '13:30', false],
] as const;
const HOMEWORK: Record<string, string[]> = {
  Mathematics: ['Exercise 3.2, questions 1–12', 'Worksheet: fractions and decimals', 'Practice problems on page 58'],
  English: ['Write a paragraph on "My favourite festival"', 'Read chapter 4 and answer the questions', 'Learn the spellings from lesson 6'],
  Hindi: ['पाठ 5 के प्रश्न-उत्तर लिखिए', 'Write 10 sentences on "मेरा विद्यालय"'],
  Science: ['Draw and label the parts of a plant cell', 'Activity 2.3: record your observations', 'Revise chapter 6 for the class test'],
  'Social Science': ['Map work: mark the major rivers of India', 'Answer the questions at the end of chapter 3'],
  Computer: ['Type and save the letter from page 22', 'Make a flowchart for making tea'],
};

/**
 * Phase 3 demo data, idempotent: a bell schedule, published clash-free timetables, about four
 * weeks of attendance, recent homework and a few notices. Written directly (no notifications).
 */
async function dailyOps(db: PlatformPrismaService, schoolId: string, yearId: string): Promise<string[]> {
  const notes: string[] = [];
  const random = rng(42);
  const admin = await db.membership.findFirstOrThrow({ where: { schoolId, roles: { some: { role: { key: 'school_admin' } } } } });
  const sections = await db.section.findMany({ where: { schoolId, academicYearId: yearId }, include: { class: true }, orderBy: [{ class: { displayOrder: 'asc' } }, { name: 'asc' }] });
  const subjects = await db.subject.findMany({ where: { schoolId, isActive: true }, orderBy: { name: 'asc' } });
  const assignments = await db.teachingAssignment.findMany({ where: { schoolId, academicYearId: yearId }, orderBy: { id: 'asc' } });

  // Bell schedule
  let bell = await db.bellSchedule.findFirst({ where: { schoolId, isDefault: true }, include: { periods: { orderBy: { order: 'asc' } } } });
  if (!bell) {
    bell = await db.bellSchedule.create({
      data: {
        schoolId,
        name: 'Regular',
        isDefault: true,
        periods: { create: PERIODS.map(([name, startTime, endTime, isBreak], i) => ({ schoolId, name, startTime, endTime, isBreak, order: i + 1 })) },
      },
      include: { periods: { orderBy: { order: 'asc' } } },
    });
    notes.push('bell schedule');
  }

  // Timetables (Mon–Sat) for sections that don't have one, never double-booking a teacher.
  const existing = await db.timetable.findMany({ where: { schoolId, academicYearId: yearId }, include: { entries: { include: { period: true } } } });
  const busy = new Set(existing.flatMap((t) => t.entries.filter((e) => e.teacherId).map((e) => `${e.teacherId}|${e.dayOfWeek}|${e.period.startTime}`)));
  const has = new Set(existing.map((t) => t.sectionId));
  let built = 0;
  for (const [si, section] of sections.entries()) {
    if (has.has(section.id)) continue;
    const entries: { schoolId: string; dayOfWeek: number; periodId: string; subjectId: string; teacherId: string | null }[] = [];
    for (let day = 1; day <= 6; day++) {
      for (const [pi, period] of bell.periods.filter((p) => !p.isBreak).entries()) {
        for (let k = 0; k < subjects.length; k++) {
          const subject = subjects[(si + day * 2 + pi + k) % subjects.length]!;
          const teacherId = assignments.find((a) => a.sectionId === section.id && a.subjectId === subject.id)?.teacherId ?? section.classTeacherId;
          const key = `${teacherId}|${day}|${period.startTime}`;
          if (teacherId && busy.has(key)) continue;
          if (teacherId) busy.add(key);
          entries.push({ schoolId, dayOfWeek: day, periodId: period.id, subjectId: subject.id, teacherId });
          break;
        }
      }
    }
    await db.timetable.create({
      data: {
        schoolId,
        academicYearId: yearId,
        sectionId: section.id,
        bellScheduleId: bell.id,
        status: 'PUBLISHED',
        publishedAt: new Date(),
        effectiveFrom: date('2026-04-01'),
        entries: { create: entries.map(({ schoolId: _s, ...e }) => ({ ...e, schoolId })) },
      },
    });
    built++;
  }
  if (built) notes.push(`${built} timetables`);

  // Attendance: the last 20 school days before today (Sunday off).
  const year = await db.academicYear.findUniqueOrThrow({ where: { id: yearId } });
  const today = new Date().toISOString().slice(0, 10);
  const days: string[] = [];
  for (let d = new Date(`${today}T00:00:00Z`); days.length < 20; ) {
    d = new Date(d.getTime() - 86_400_000);
    if (d < year.startDate) break;
    if (d.getUTCDay() !== 0) days.push(d.toISOString().slice(0, 10));
  }
  const enrollments = await db.studentEnrollment.findMany({ where: { schoolId, academicYearId: yearId, status: 'ENROLLED' }, select: { studentId: true, sectionId: true } });
  const taken = new Set((await db.attendanceSession.findMany({ where: { schoolId, date: { in: days.map(date) } }, select: { sectionId: true, date: true } })).map((s) => `${s.sectionId}|${s.date.toISOString().slice(0, 10)}`));
  let registers = 0;
  for (const day of days) {
    for (const section of sections) {
      if (taken.has(`${section.id}|${day}`)) continue;
      const roster = enrollments.filter((e) => e.sectionId === section.id);
      if (!roster.length) continue;
      const session = await db.attendanceSession.create({
        data: { schoolId, sectionId: section.id, date: date(day), status: 'SUBMITTED', takenByMemberId: admin.id, submittedAt: new Date(`${day}T04:00:00Z`) },
      });
      await db.attendanceRecord.createMany({
        data: roster.map((e) => {
          const r = random();
          const status = r < 0.9 ? 'PRESENT' : r < 0.95 ? 'ABSENT' : r < 0.97 ? 'LATE' : r < 0.985 ? 'LEAVE' : 'HALF_DAY';
          return { schoolId, sessionId: session.id, studentId: e.studentId, date: date(day), status, remark: status === 'ABSENT' && r < 0.91 ? 'Unwell' : null };
        }),
      });
      registers++;
    }
  }
  if (registers) notes.push(`${registers} attendance registers`);

  // Homework: two pieces per section in the last week.
  if ((await db.homework.count({ where: { schoolId } })) < 10) {
    let made = 0;
    for (const [si, section] of sections.entries()) {
      for (let k = 0; k < 2; k++) {
        const subject = subjects[(si + k * 3) % subjects.length]!;
        const teacherId = assignments.find((a) => a.sectionId === section.id && a.subjectId === subject.id)?.teacherId ?? section.classTeacherId;
        if (!teacherId) continue;
        const titles = HOMEWORK[subject.name] ?? [`${subject.name} revision`];
        const published = new Date(Date.now() - (k * 3 + (si % 3) + 1) * 86_400_000);
        const due = new Date(published.getTime() + (2 + (si % 3)) * 86_400_000).toISOString().slice(0, 10);
        await db.homework.create({
          data: {
            schoolId,
            academicYearId: yearId,
            subjectId: subject.id,
            teacherId,
            title: titles[(si + k) % titles.length]!,
            description: k === 0 ? 'Complete neatly in your notebook. Show all working.' : null,
            dueDate: date(due),
            status: 'PUBLISHED',
            publishedAt: published,
            createdAt: published,
            sections: { create: [{ schoolId, sectionId: section.id }] },
          },
        });
        made++;
      }
    }
    notes.push(`${made} homework`);
  }

  // Notices
  if ((await db.notice.count({ where: { schoolId } })) < 3) {
    const notices = [
      { title: 'Diwali holidays', body: 'School will remain **closed from 20 to 24 October** for Diwali.\nClasses resume on Monday, 27 October.\n\nWishing all our families a happy and safe Diwali!', type: 'CIRCULAR' as const, days: 1, pinned: true },
      { title: 'Parent–teacher meeting', body: 'The term 1 parent–teacher meeting is on **Saturday, 18 October, 9 am – 12 pm**.\n- Meet the class teacher first\n- Bring the report card acknowledgement slip', type: 'NOTICE' as const, days: 3, pinned: false },
      { title: 'Inter-house quiz results', body: 'Congratulations to **Tagore House** for winning the inter-house quiz! Certificates will be given in the assembly on Monday.', type: 'ANNOUNCEMENT' as const, days: 6, pinned: false },
    ];
    for (const n of notices) {
      const at = new Date(Date.now() - n.days * 86_400_000);
      await db.notice.create({
        data: {
          schoolId,
          type: n.type,
          title: n.title,
          body: n.body,
          status: 'PUBLISHED',
          publishedAt: at,
          createdAt: at,
          isPinned: n.pinned,
          createdByMemberId: admin.id,
          audiences: { create: [{ schoolId, type: 'SCHOOL' }] },
        },
      });
    }
    notes.push('3 notices');
  }
  return notes;
}

/**
 * Phase 4 demo data, idempotent: CBSE 9-point scale; "Unit Test 1" with marks and published
 * results (computed by the real ResultsService); "Half-Yearly" open for marks entry with a date
 * sheet and some sheets still to fill.
 */
async function exams(db: PlatformPrismaService, app: INestApplicationContext, schoolId: string, yearId: string): Promise<string[]> {
  if (await db.exam.count({ where: { schoolId } })) return [];
  const random = rng(7);
  const admin = await db.membership.findFirstOrThrow({ where: { schoolId, roles: { some: { role: { key: 'school_admin' } } } } });
  const permissions = Object.fromEntries(PERMISSION_KEYS.map((k) => [k, 'ALL'])) as PermissionSet;
  const asAdmin = <T>(fn: () => Promise<T>) =>
    RequestContextStore.run({ requestId: `seed-${randomUUID()}`, schoolId, userId: admin.userId, membershipId: admin.id, permissions, actor: 'user' }, fn);

  const scale = await asAdmin(() => app.get(ExamsService).createPreset('CBSE_9'));
  const classSubjects = await db.classSubject.findMany({ where: { schoolId, academicYearId: yearId }, include: { subject: true, class: true }, orderBy: { subject: { name: 'asc' } } });
  const enrollments = await db.studentEnrollment.findMany({ where: { schoolId, academicYearId: yearId, status: 'ENROLLED' }, select: { studentId: true, classId: true, sectionId: true } });
  const ability = new Map(enrollments.map((e) => [e.studentId, 0.45 + random() * 0.5]));

  const makeExam = async (name: string, term: string, start: string, end: string, max: number, pass: number, status: 'MARKS_ENTRY') => {
    const exam = await db.exam.create({ data: { schoolId, academicYearId: yearId, gradingScaleId: scale.id, name, term, startDate: date(start), endDate: date(end), rankingEnabled: true, status } });
    const days = Array.from({ length: 8 }, (_, i) => new Date(Date.parse(`${start}T00:00:00Z`) + i * 86_400_000)).filter((d) => d.getUTCDay() !== 0).map((d) => d.toISOString().slice(0, 10));
    const byClass = new Map<string, typeof classSubjects>();
    for (const cs of classSubjects) byClass.set(cs.classId, [...(byClass.get(cs.classId) ?? []), cs]);
    const rows = [...byClass.values()].flatMap((list) =>
      list.map((cs, i) => ({ schoolId, examId: exam.id, classId: cs.classId, subjectId: cs.subjectId, maxMarks: max, passMarks: pass, examDate: date(days[i % days.length]!), startTime: '09:00', endTime: max > 50 ? '12:00' : '10:00' })),
    );
    await db.examSubject.createMany({ data: rows });
    return { exam, subjects: await db.examSubject.findMany({ where: { examId: exam.id }, include: { class: true } }) };
  };
  const fill = async (subjects: { id: string; classId: string; maxMarks: unknown }[], skip?: (classId: string) => boolean) => {
    const data = [];
    for (const es of subjects) {
      if (skip?.(es.classId)) continue;
      const max = Number(es.maxMarks);
      for (const e of enrollments.filter((x) => x.classId === es.classId)) {
        const absent = random() < 0.015;
        const raw = ability.get(e.studentId)! * max + (random() - 0.5) * max * 0.25;
        data.push({ schoolId, examSubjectId: es.id, studentId: e.studentId, marksObtained: absent ? null : Math.max(0, Math.min(max, Math.round(raw))), isAbsent: absent, enteredByMemberId: admin.id });
      }
    }
    for (let i = 0; i < data.length; i += 2000) await db.mark.createMany({ data: data.slice(i, i + 2000) });
    return data.length;
  };

  const ut = await makeExam('Unit Test 1', 'Term 1', '2026-07-14', '2026-07-21', 25, 9, 'MARKS_ENTRY');
  const utMarks = await fill(ut.subjects);
  await asAdmin(() => app.get(ResultsService).compute(ut.exam.id, false));
  await asAdmin(() => app.get(ResultsService).publish(ut.exam.id));

  const hy = await makeExam('Half-Yearly', 'Term 1', '2026-09-21', '2026-09-30', 80, 27, 'MARKS_ENTRY');
  const hyMarks = await fill(hy.subjects, (classId) => ['Class 8', 'Class 9'].includes(hy.subjects.find((s) => s.classId === classId)!.class.name));
  return [`exams (Unit Test 1 published, ${utMarks} + ${hyMarks} marks)`];
}

/**
 * Phase 5 demo data, idempotent: fee heads, structures per class group (quarterly, late fee),
 * concessions, invoices for Q1–Q3, counter/online payments (Q1 mostly paid, Q2 partly, some
 * overdue — Rahul's Q2 is unpaid so the parent "Pay" flow has something to pay), sandbox gateway.
 * Everything goes through the real services.
 */
async function finance(db: PlatformPrismaService, app: INestApplicationContext, schoolId: string, yearId: string): Promise<string[]> {
  if (await db.feeHead.count({ where: { schoolId } })) return [];
  const random = rng(11);
  const admin = await db.membership.findFirstOrThrow({ where: { schoolId, roles: { some: { role: { key: 'school_admin' } } } } });
  const accountant = await db.membership.findFirst({ where: { schoolId, roles: { some: { role: { key: 'accountant' } } } } });
  const permissions = Object.fromEntries(PERMISSION_KEYS.map((k) => [k, 'ALL'])) as PermissionSet;
  const asAdmin = <T>(fn: () => Promise<T>) =>
    RequestContextStore.run({ requestId: `seed-${randomUUID()}`, schoolId, userId: admin.userId, membershipId: admin.id, permissions, actor: 'user' }, fn);
  const fees = app.get(FeesService);
  const R = (rupees: number) => rupees * 100;

  const head = (name: string, code: string, type: 'TUITION' | 'ADMISSION' | 'EXAM' | 'TRANSPORT' | 'ACTIVITY' | 'OTHER', isOptional = false) =>
    asAdmin(() => fees.saveHead(null, { name, code, type, frequency: 'RECURRING', isOptional, isActive: true }));
  const tuition = await head('Tuition Fee', 'TUI', 'TUITION');
  const dev = await head('Development Fee', 'DEV', 'OTHER');
  const exam = await head('Examination Fee', 'EXM', 'EXAM');
  const lab = await head('Computer Lab', 'LAB', 'ACTIVITY');
  const transport = await head('Transport', 'TRN', 'TRANSPORT', true);

  const classes = await db.schoolClass.findMany({ where: { schoolId }, orderBy: { displayOrder: 'asc' } });
  const groups: { name: string; from: number; to: number; tuition: number; lab: number }[] = [
    { name: 'Pre-primary', from: 0, to: 3, tuition: 24_000, lab: 0 },
    { name: 'Classes 1–5', from: 4, to: 8, tuition: 30_000, lab: 0 },
    { name: 'Classes 6–8', from: 9, to: 11, tuition: 36_000, lab: 2_400 },
    { name: 'Classes 9–10', from: 12, to: 13, tuition: 42_000, lab: 2_400 },
    { name: 'Classes 11–12', from: 14, to: 15, tuition: 48_000, lab: 3_600 },
  ];
  const dues = ['2026-04-10', '2026-07-10', '2026-10-10', '2027-01-10'];
  const structures = [];
  for (const g of groups) {
    const classIds = classes.filter((c) => c.displayOrder >= g.from && c.displayOrder <= g.to).map((c) => c.id);
    if (!classIds.length) continue;
    const items = [
      { feeHeadId: tuition.id, amountPaise: R(g.tuition), isOptional: false },
      { feeHeadId: dev.id, amountPaise: R(3_000), isOptional: false },
      { feeHeadId: exam.id, amountPaise: R(1_200), isOptional: false },
      ...(g.lab ? [{ feeHeadId: lab.id, amountPaise: R(g.lab), isOptional: false }] : []),
      { feeHeadId: transport.id, amountPaise: R(9_600), isOptional: true },
    ];
    const installments = dues.map((dueDate, q) => ({
      name: `Quarter ${q + 1}`,
      dueDate,
      splits: {
        [tuition.id]: R(g.tuition / 4),
        [transport.id]: R(2_400),
        ...(q === 0 ? { [dev.id]: R(3_000) } : {}),
        ...(q === 1 || q === 3 ? { [exam.id]: R(600) } : {}),
        ...(g.lab && q === 0 ? { [lab.id]: R(g.lab) } : {}),
      },
    }));
    const st = await asAdmin(() =>
      fees.saveStructure(null, { name: `${g.name} · 2026–27`, classIds, items, installments, lateFee: { calc: 'PER_DAY', graceDays: 7, valuePaise: R(10), maxPaise: R(200) } }),
    );
    await asAdmin(() => fees.publishStructure(st.id));
    structures.push(await asAdmin(() => fees.getStructure(st.id)));
  }

  // Concessions
  const sibling = await asAdmin(() => fees.saveConcessionType(null, { name: 'Sibling 10%', kind: 'SIBLING', calc: 'PERCENT', valueBasisPoints: 1_000, feeHeadIds: [tuition.id], requiresApproval: true, isActive: true }));
  const staff = await asAdmin(() => fees.saveConcessionType(null, { name: 'Staff ward 50%', kind: 'STAFF_WARD', calc: 'PERCENT', valueBasisPoints: 5_000, feeHeadIds: [tuition.id], requiresApproval: true, isActive: true }));
  const merit = await asAdmin(() => fees.saveConcessionType(null, { name: 'Merit scholarship', kind: 'MERIT', calc: 'FLAT', valuePaise: R(2_000), feeHeadIds: [tuition.id], requiresApproval: true, isActive: true }));
  const students = await db.studentEnrollment.findMany({ where: { schoolId, academicYearId: yearId, status: 'ENROLLED' }, select: { studentId: true, student: { select: { firstName: true, lastName: true } } } });
  const ananya = students.find((s) => s.student.firstName === 'Ananya' && s.student.lastName === 'Kumar');
  const rahul = await db.student.findFirst({ where: { schoolId, firstName: 'Rahul', lastName: 'Kumar', admissionNo: '1501' } });
  const give = (studentId: string, concessionTypeId: string, reason: string) => asAdmin(() => fees.requestConcession({ studentId, concessionTypeId, reason })).catch(() => undefined);
  if (ananya) await give(ananya.studentId, sibling.id, 'Younger sibling of Rahul Kumar (8-A)');
  for (const s of students.filter(() => random() < 0.012)) await give(s.studentId, sibling.id, 'Sibling studies here');
  for (const s of students.filter(() => random() < 0.004)) await give(s.studentId, staff.id, 'Child of staff member');
  for (const s of students.filter(() => random() < 0.003)) await give(s.studentId, merit.id, 'Topped the class last year');
  // A request waiting for approval, so the approvals list isn't empty.
  const waiting = students.find((s) => s.studentId !== ananya?.studentId && s.studentId !== rahul?.id);
  if (waiting) {
    await RequestContextStore.run(
      { requestId: `seed-${randomUUID()}`, schoolId, userId: admin.userId, membershipId: accountant?.id ?? admin.id, permissions: { ...permissions, 'concession.approve': undefined }, actor: 'user' },
      () => fees.requestConcession({ studentId: waiting.studentId, concessionTypeId: merit.id, reason: 'Scored 98% in the last exam' }),
    ).catch(() => undefined);
  }
  // Transport for about a third of the students
  for (const s of students) {
    if (random() >= 0.35) continue;
    const st = await fees.structureFor(s.studentId).catch(() => null);
    const item = st?.items.find((i) => i.feeHeadId === transport.id);
    if (item) await asAdmin(() => fees.setOptions(s.studentId, [item.id]));
  }

  // Invoices for Q1–Q3
  const invoices = app.get(InvoicesService);
  let issued = 0;
  for (const st of structures) for (const ins of st.installments.slice(0, 3)) issued += await asAdmin(() => invoices.generateNow(ins.id, undefined, admin.id));

  // Payments: Q1 mostly paid in April, Q2 most in July, a few Q3 early in October.
  const payments = app.get(PaymentsService);
  const prisma = app.get(PrismaService);
  const all = await db.invoice.findMany({ where: { schoolId, academicYearId: yearId }, include: { installment: { select: { order: true } } }, orderBy: { number: 'asc' } });
  const methods = ['CASH', 'CASH', 'CASH', 'UPI_DIRECT', 'UPI_DIRECT', 'ONLINE', 'ONLINE', 'BANK_TRANSFER', 'POS_CARD'] as const;
  const plan = all.filter((inv) => {
    const q = inv.installment?.order ?? 1;
    if (inv.studentId === rahul?.id) return q === 1;
    if (inv.studentId === ananya?.studentId) return q <= 2;
    return random() < (q === 1 ? 0.96 : q === 2 ? 0.82 : 0.18);
  });
  let paid = 0;
  for (let i = 0; i < plan.length; i += 100) {
    await asAdmin(() =>
      prisma.tenantTx(
        async (tx) => {
          for (const inv of plan.slice(i, i + 100)) {
            const q = inv.installment?.order ?? 1;
            const month = q === 1 ? '04' : q === 2 ? '07' : '10';
            const day = String(1 + Math.floor(random() * (q === 3 ? 7 : 24))).padStart(2, '0');
            const receivedAt = new Date(`2026-${month}-${day}T${String(9 + Math.floor(random() * 6)).padStart(2, '0')}:${String(Math.floor(random() * 60)).padStart(2, '0')}:00+05:30`);
            const method = methods[Math.floor(random() * methods.length)]!;
            await payments.apply(tx, {
              studentId: inv.studentId,
              amountPaise: inv.balancePaise,
              method,
              invoiceIds: [inv.id],
              receivedAt,
              collectedByMemberId: method === 'ONLINE' ? null : (accountant?.id ?? admin.id),
              referenceNo: method === 'UPI_DIRECT' || method === 'BANK_TRANSFER' ? `UTR${Math.floor(random() * 1e12)}` : method === 'POS_CARD' ? `POS${Math.floor(random() * 1e6)}` : null,
              gatewayPaymentId: method === 'ONLINE' ? `pay_seed${randomUUID().replace(/-/g, '').slice(0, 14)}` : undefined,
              gatewayMethod: method === 'ONLINE' ? (random() < 0.7 ? 'upi' : 'card') : null,
            });
            paid++;
          }
        },
        { timeout: 120_000 },
      ),
    );
  }
  // Seed payments don't send receipts or notifications; receipts are made on demand.
  await db.outboxEvent.updateMany({ where: { schoolId, type: 'payment.captured', status: 'PENDING' }, data: { status: 'DISPATCHED', dispatchedAt: new Date() } });
  const late = await asAdmin(() => app.get(FinanceJobsService).lateFees());

  // Sandbox gateway, verified and on, so parents can try paying online.
  const gateway = app.get(GatewayService);
  if ((await asAdmin(() => gateway.status())).driver === 'mock') {
    await asAdmin(() => gateway.connect({ mode: 'TEST', keyId: 'rzp_test_DemoSchool01', keySecret: 'demo-sandbox-secret' }));
    await asAdmin(() => gateway.sendTestWebhook('TEST'));
    await asAdmin(() => gateway.activate('TEST', true));
  }
  return [`fees (${structures.length} structures, ${issued} invoices, ${paid} payments, ${late.invoices} late fees, sandbox gateway on)`];
}

/**
 * Two more internal tests between Unit Test 1 and the Half-Yearly, published, so the results
 * charts have a progress line and every subject opens into several tests. Each student drifts a
 * little from test to test (some improve, some slip). Idempotent.
 */
async function moreTests(db: PlatformPrismaService, app: INestApplicationContext, schoolId: string, yearId: string): Promise<string[]> {
  const scale = await db.gradingScale.findFirst({ where: { schoolId } });
  if (!scale || (await db.exam.count({ where: { schoolId, name: 'Monthly Test (August)' } }))) return [];
  const random = rng(23);
  const admin = await db.membership.findFirstOrThrow({ where: { schoolId, roles: { some: { role: { key: 'school_admin' } } } } });
  const permissions = Object.fromEntries(PERMISSION_KEYS.map((k) => [k, 'ALL'])) as PermissionSet;
  const asAdmin = <T>(fn: () => Promise<T>) =>
    RequestContextStore.run({ requestId: `seed-${randomUUID()}`, schoolId, userId: admin.userId, membershipId: admin.id, permissions, actor: 'user' }, fn);
  const classSubjects = await db.classSubject.findMany({ where: { schoolId, academicYearId: yearId } });
  const enrollments = await db.studentEnrollment.findMany({ where: { schoolId, academicYearId: yearId, status: 'ENROLLED' }, select: { studentId: true, classId: true } });
  // Start from each student's Unit Test 1 level so the line continues from there.
  const ut1 = await db.examResult.findMany({ where: { schoolId, exam: { name: 'Unit Test 1' } }, select: { studentId: true, percentage: true } });
  const level = new Map(ut1.map((r) => [r.studentId, Number(r.percentage) / 100]));
  const slope = new Map(enrollments.map((e) => [e.studentId, (random() - 0.4) * 0.12]));

  let marks = 0;
  for (const [i, t] of [
    { name: 'Monthly Test (August)', start: '2026-08-18', end: '2026-08-22', max: 20, pass: 7 },
    { name: 'Unit Test 2', start: '2026-09-07', end: '2026-09-12', max: 25, pass: 9 },
  ].entries()) {
    const exam = await db.exam.create({ data: { schoolId, academicYearId: yearId, gradingScaleId: scale.id, name: t.name, term: 'Term 1', startDate: date(t.start), endDate: date(t.end), rankingEnabled: true, status: 'MARKS_ENTRY' } });
    await db.examSubject.createMany({
      data: classSubjects.map((cs, k) => ({ schoolId, examId: exam.id, classId: cs.classId, subjectId: cs.subjectId, maxMarks: t.max, passMarks: t.pass, examDate: date(new Date(Date.parse(`${t.start}T00:00:00Z`) + (k % 5) * 86_400_000).toISOString().slice(0, 10)), startTime: '09:00', endTime: '10:00' })),
    });
    const subjects = await db.examSubject.findMany({ where: { examId: exam.id } });
    const rows = [];
    for (const es of subjects) {
      for (const e of enrollments.filter((x) => x.classId === es.classId)) {
        const base = (level.get(e.studentId) ?? 0.6) + slope.get(e.studentId)! * (i + 1);
        const raw = base * t.max + (random() - 0.5) * t.max * 0.3;
        const absent = random() < 0.01;
        rows.push({ schoolId, examSubjectId: es.id, studentId: e.studentId, marksObtained: absent ? null : Math.max(0, Math.min(t.max, Math.round(raw))), isAbsent: absent, enteredByMemberId: admin.id });
      }
    }
    for (let k = 0; k < rows.length; k += 2000) await db.mark.createMany({ data: rows.slice(k, k + 2000) });
    marks += rows.length;
    await asAdmin(() => app.get(ResultsService).compute(exam.id, false));
    await asAdmin(() => app.get(ResultsService).publish(exam.id));
  }
  return [`2 more published tests (${marks} marks)`];
}

/**
 * Parent–teacher communication for the demo parent (Raj, Rahul's father): a question being worked
 * on with the class teacher, a complaint to the office, a video meeting tomorrow and two reminders.
 * Idempotent.
 */
async function communication(db: PlatformPrismaService, schoolId: string): Promise<string[]> {
  if (await db.conversation.count({ where: { schoolId } })) return [];
  const parent = await db.membership.findFirst({ where: { schoolId, user: { email: 'parent@demo.school' } } });
  const teacher = await db.membership.findFirst({ where: { schoolId, user: { email: 'teacher@demo.school' } } });
  if (!parent || !teacher) return [];
  const guardian = await db.guardian.findFirst({ where: { schoolId, membershipId: parent.id } });
  const links = guardian ? await db.studentGuardian.findMany({ where: { guardianId: guardian.id }, include: { student: true } }) : [];
  const rahul = links.find((l) => l.student.firstName === 'Rahul')?.student;
  if (!rahul) return [];
  const ago = (hours: number) => new Date(Date.now() - hours * 3_600_000);

  await db.conversation.create({
    data: {
      schoolId, studentId: rahul.id, parentMemberId: parent.id, staffMemberId: teacher.id, category: 'ACADEMIC', subject: 'Help with fractions', status: 'IN_PROGRESS',
      startedByMemberId: parent.id, lastMessageAt: ago(3), parentReadAt: ago(20), staffReadAt: ago(3), createdAt: ago(26),
      messages: {
        create: [
          { schoolId, senderMemberId: parent.id, body: 'Rahul is finding fractions hard this week. Is there extra practice we can do at home?', createdAt: ago(26) },
          { schoolId, senderMemberId: teacher.id, body: "Thanks for letting me know. I'll send a short worksheet tomorrow and check in with him in class.", createdAt: ago(22) },
          { schoolId, senderMemberId: teacher.id, body: 'Worksheet sent with his homework. Ten minutes a day is plenty.', createdAt: ago(3) },
        ],
      },
    },
  });
  await db.conversation.create({
    data: {
      schoolId, studentId: rahul.id, parentMemberId: parent.id, staffMemberId: null, category: 'COMPLAINT', subject: 'Bus on Route 4 is often late', status: 'OPEN',
      startedByMemberId: parent.id, lastMessageAt: ago(5), parentReadAt: ago(5), createdAt: ago(5),
      messages: { create: [{ schoolId, senderMemberId: parent.id, body: 'The Route 4 bus reached our stop 25 minutes late three times this week.', createdAt: ago(5) }] },
    },
  });

  // Tomorrow 4:30 PM IST; the pick-up alarm at the next 1:30 PM IST.
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  await db.meeting.create({
    data: { schoolId, studentId: rahul.id, organizerMemberId: teacher.id, title: 'Mid-term progress chat', agenda: 'Maths (fractions), class participation, and the Half-Yearly plan.', category: 'ACADEMIC', scheduledAt: new Date(`${tomorrow}T11:00:00Z`), durationMinutes: 20, roomCode: randomUUID().replace(/-/g, '').slice(0, 16) },
  });
  let pickUp = new Date(`${new Date().toISOString().slice(0, 10)}T08:00:00Z`);
  while (pickUp.getTime() <= Date.now() || pickUp.getUTCDay() === 0) pickUp = new Date(pickUp.getTime() + 86_400_000);
  await db.reminder.createMany({
    data: [
      { schoolId, memberId: parent.id, studentId: rahul.id, title: 'Pick up Rahul', notes: 'Gate 2', remindAt: pickUp, repeat: 'WEEKDAYS' },
      { schoolId, memberId: parent.id, title: 'Pay Quarter 3 fees', remindAt: new Date(Date.now() + 2 * 86_400_000), repeat: 'NONE' },
    ],
  });
  return ['messages, a meeting and reminders for the demo parent'];
}

/**
 * Every demo teacher can sign in (emp-002@demo.school …), so parents can message their child's
 * class and subject teachers. In a real school the office invites teachers from the Teachers page.
 * Idempotent.
 */
async function teacherLogins(db: PlatformPrismaService, app: INestApplicationContext, schoolId: string): Promise<string[]> {
  const without = await db.teacher.findMany({ where: { schoolId, membershipId: null, status: { not: 'LEFT' } } });
  if (!without.length) return [];
  const schools = app.get(SchoolsService);
  for (const t of without) {
    const { membership } = await schools.addMember({
      schoolId,
      name: [t.firstName, t.lastName].filter(Boolean).join(' '),
      email: `${t.employeeId.toLowerCase()}@demo.school`,
      password: process.env.SEED_PASSWORD!,
      roleKeys: ['teacher'],
      status: 'ACTIVE',
    });
    await db.teacher.update({ where: { id: t.id }, data: { membershipId: membership.id } });
  }
  return [`app logins for ${without.length} more teachers`];
}

/** Two exams still to come (scheduled, with a date sheet), so the calendar shows exams in advance. Idempotent. */
async function upcomingExams(db: PlatformPrismaService, schoolId: string, yearId: string): Promise<string[]> {
  const scale = await db.gradingScale.findFirst({ where: { schoolId } });
  if (!scale || (await db.exam.count({ where: { schoolId, name: 'Annual Exams' } }))) return [];
  const classSubjects = await db.classSubject.findMany({ where: { schoolId, academicYearId: yearId }, orderBy: { subject: { name: 'asc' } } });
  for (const t of [
    { name: 'Unit Test 3', term: 'Term 2', start: '2026-11-23', max: 25, pass: 9, time: ['09:00', '10:00'] },
    { name: 'Annual Exams', term: 'Term 2', start: '2027-03-01', max: 80, pass: 27, time: ['09:00', '12:00'] },
  ]) {
    // One paper a day, Sundays skipped.
    const days: string[] = [];
    for (let d = Date.parse(`${t.start}T00:00:00Z`); days.length < 8; d += 86_400_000) if (new Date(d).getUTCDay() !== 0) days.push(new Date(d).toISOString().slice(0, 10));
    const perClass = new Map<string, number>();
    const rows = classSubjects.map((cs) => {
      const i = perClass.get(cs.classId) ?? 0;
      perClass.set(cs.classId, i + 1);
      return { schoolId, classId: cs.classId, subjectId: cs.subjectId, maxMarks: t.max, passMarks: t.pass, examDate: date(days[i % days.length]!), startTime: t.time[0], endTime: t.time[1] };
    });
    const used = rows.map((r) => r.examDate.toISOString().slice(0, 10)).sort();
    await db.exam.create({
      data: { schoolId, academicYearId: yearId, gradingScaleId: scale.id, name: t.name, term: t.term, startDate: date(used[0]!), endDate: date(used.at(-1)!), status: 'SCHEDULED', subjects: { create: rows.map(({ schoolId: _s, ...r }) => ({ ...r, schoolId })) } },
    });
  }
  return ['2 upcoming exams with date sheets'];
}

/** The 2026–27 school calendar: holidays, vacations, events and parent–teacher meetings. Idempotent. */
async function schoolCalendar(db: PlatformPrismaService, schoolId: string): Promise<string[]> {
  if (await db.calendarEvent.count({ where: { schoolId } })) return [];
  const admin = await db.membership.findFirstOrThrow({ where: { schoolId, roles: { some: { role: { key: 'school_admin' } } } } });
  const senior = await db.schoolClass.findMany({ where: { schoolId, name: { in: ['Class 6', 'Class 7', 'Class 8', 'Class 9', 'Class 10'] } }, select: { id: true } });
  const rows: { title: string; kind: 'HOLIDAY' | 'VACATION' | 'EVENT' | 'PTM'; start: string; end?: string; description?: string; classIds?: string[] }[] = [
    { title: 'Gandhi Jayanti', kind: 'HOLIDAY', start: '2026-10-02' },
    { title: 'Dussehra', kind: 'HOLIDAY', start: '2026-10-20' },
    { title: 'Parent–teacher meeting', kind: 'PTM', start: '2026-10-24', description: 'Half-Yearly results and report cards. 9 AM – 1 PM in the classrooms.' },
    { title: 'Diwali break', kind: 'VACATION', start: '2026-11-07', end: '2026-11-10', description: 'School reopens on Wednesday, 11 November.' },
    { title: "Children's Day celebration", kind: 'EVENT', start: '2026-11-14', description: 'Cultural programme; no regular classes after 10 AM.' },
    { title: 'Annual Sports Day', kind: 'EVENT', start: '2026-11-21', description: 'Parents are welcome. Sports uniform.' },
    { title: 'Guru Nanak Jayanti', kind: 'HOLIDAY', start: '2026-11-24' },
    { title: 'Annual Day', kind: 'EVENT', start: '2026-12-19', description: 'Evening programme at the school auditorium, 5 PM.' },
    { title: 'Winter vacation', kind: 'VACATION', start: '2026-12-24', end: '2027-01-02', description: 'School reopens on Monday, 4 January.' },
    { title: 'Republic Day', kind: 'HOLIDAY', start: '2027-01-26', description: 'Flag hoisting at 8 AM — students in uniform.' },
    { title: 'Science exhibition', kind: 'EVENT', start: '2027-02-06', classIds: senior.map((c) => c.id), description: 'Classes 6–10 present their projects.' },
    { title: 'Holi', kind: 'HOLIDAY', start: '2027-03-22' },
    { title: 'Result day and parent–teacher meeting', kind: 'PTM', start: '2027-03-27', description: 'Annual results and report cards.' },
  ];
  await db.calendarEvent.createMany({
    data: rows.map((r) => ({ schoolId, title: r.title, kind: r.kind, description: r.description ?? null, startDate: date(r.start), endDate: date(r.end ?? r.start), classIds: r.classIds ?? [], createdByMemberId: admin.id })),
  });
  return [`school calendar (${rows.length} holidays and events)`];
}

await main();
