/**
 * Local demo data: `pnpm db:seed`. Idempotent — does nothing if the demo school exists.
 * All demo users share SEED_PASSWORD from .env (local only).
 *
 *   superadmin@schoolos.local   Super Admin (platform)
 *   admin@demo.school           School Admin        +91 90000 00001
 *   principal@demo.school       Principal           +91 90000 00002
 *   accountant@demo.school      Accountant          +91 90000 00003
 *   teacher@demo.school         Teacher (8-A class teacher, Maths 8-B)  +91 90000 00004
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
    const added = await topUp(db, existing.id);
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

  const added = await topUp(db, schoolId);
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
async function topUp(db: PlatformPrismaService, schoolId: string): Promise<string> {
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
  return notes.join(', ');
}

await main();
