import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import type { Logger } from 'pino';
import type { z } from 'zod';
import writeXlsxFile from 'write-excel-file/node';
import {
  IMPORT_FIELDS,
  normalizePhone,
  type ImportEntity,
  type ImportJobItem,
  type ImportRowItem,
  type ImportStats,
  type createImportSchema,
  type listImportRowsQuerySchema,
  type setImportMappingSchema,
} from '@schoolos/contracts';
import { EntitlementsService } from '../../core/entitlements/entitlements.service.js';
import { AuditService } from '../../core/audit/audit.service.js';
import { RequestContextStore } from '../../core/context/request-context.js';
import { AppError } from '../../core/errors/app-error.js';
import { LOGGER } from '../../core/logger/logger.js';
import { OutboxService } from '../../core/outbox/outbox.service.js';
import { PrismaService } from '../../core/prisma/prisma.service.js';
import { QUEUES, QueueService, type JobData } from '../../core/queue/queue.service.js';
import { StorageDriver } from '../../core/storage/storage.js';
import { toDate } from '../../core/util/dates.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { purposeOf } from '../files/files.service.js';
import { GuardiansService } from '../guardians/guardians.service.js';
import { IdentityService } from '../schools/identity.service.js';
import { classKey, parseDate, parseGender, parseSpreadsheet, splitClassSection, splitName, suggestMapping } from './parsing.js';

type In<T extends z.ZodType> = z.output<T>;
type Raw = Record<string, string>;
type Mapped = Record<string, string>; // field key → cell text
interface RowError {
  field?: string;
  message: string;
}

const MAX_ROWS = 5000;
const BLOOD = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface StoredMapping {
  columns: Record<string, string>;
  inviteLogins: boolean;
}

interface GuardianInput {
  name: string;
  phone: string;
  email?: string;
  relation: 'FATHER' | 'MOTHER' | 'GUARDIAN';
  isPrimary: boolean;
}

/**
 * Excel/CSV import (Master Prompt §23, docs/08 W10):
 * upload → detect columns → map → validate (every row, with reasons) → preview → commit
 * (background job) → report. Invalid and duplicate rows are never imported.
 */
@Injectable()
export class ImportsService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageDriver,
    private readonly queues: QueueService,
    private readonly guardians: GuardiansService,
    private readonly identity: IdentityService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    @Inject(LOGGER) private readonly logger: Logger,
    private readonly entitlements: EntitlementsService,
  ) {}

  onModuleInit(): void {
    this.queues.handle(QUEUES.imports, 'commit', (data) => this.runCommit(data));
  }

  // ---------------------------------------------------------------- 1. upload

  async create(input: In<typeof createImportSchema>): Promise<ImportJobItem> {
    const ctx = RequestContextStore.tenant();
    const file = await this.prisma.db.file.findUnique({ where: { id: input.fileId } });
    if (!file || file.status !== 'READY' || purposeOf(file.objectKey) !== 'import' || file.uploadedByMemberId !== ctx.membershipId) {
      throw AppError.invalidReference('fileId', 'file');
    }
    const sheet = await parseSpreadsheet(await this.storage.read(file.objectKey), file.mimeType).catch(() => {
      throw new AppError('UNREADABLE_FILE', 422, "We couldn't read this file. Save it as .xlsx or .csv and try again.");
    });
    if (!sheet.headers.length || !sheet.rows.length) throw new AppError('EMPTY_FILE', 422, 'This file has no rows to import.');
    if (sheet.rows.length > MAX_ROWS) {
      throw new AppError('TOO_MANY_ROWS', 422, `This file has ${sheet.rows.length} rows. Import at most ${MAX_ROWS} at a time.`);
    }

    const mapping: StoredMapping = { columns: suggestMapping(sheet.headers, IMPORT_FIELDS[input.entity]), inviteLogins: true };
    const id = await this.prisma.tenantTx(
      async (tx) => {
        const job = await tx.importJob.create({
          data: {
            entity: input.entity,
            fileId: file.id,
            status: 'MAPPING',
            detectedColumns: sheet.headers,
            mapping: mapping as unknown as Prisma.InputJsonValue,
            createdByMemberId: ctx.membershipId,
          } as Prisma.ImportJobUncheckedCreateInput,
        });
        await tx.importRow.createMany({
          data: sheet.rows.map((raw, i) => ({ importJobId: job.id, rowNumber: i + 2, raw, status: 'PENDING' })) as Prisma.ImportRowCreateManyInput[],
        });
        await this.audit.record(tx, { action: 'import.upload', entityType: 'ImportJob', entityId: job.id, after: { entity: input.entity, rows: sheet.rows.length } });
        return job.id;
      },
      { timeout: 60_000 },
    );
    return this.get(id);
  }

  // ---------------------------------------------------------------- 2. map + validate

  async validate(id: string, input: In<typeof setImportMappingSchema>): Promise<ImportJobItem> {
    const job = await this.prisma.db.importJob.findUnique({ where: { id } });
    if (!job) throw AppError.notFound('import');
    if (!['MAPPING', 'VALIDATED'].includes(job.status)) throw new AppError('IMPORT_LOCKED', 409, 'This import has already started.');
    const entity = job.entity as ImportEntity;

    const fields = new Set(IMPORT_FIELDS[entity].map((f) => f.key));
    const columns: Record<string, string> = {};
    const used = new Set<string>();
    for (const header of job.detectedColumns) {
      const key = input.mapping[header] ?? '';
      if (key && !fields.has(key)) throw new AppError('VALIDATION_FAILED', 422, `Unknown field "${key}".`, [{ field: 'mapping', message: header }]);
      if (key && used.has(key)) {
        const label = IMPORT_FIELDS[entity].find((f) => f.key === key)!.label;
        throw new AppError('VALIDATION_FAILED', 422, `Two columns are mapped to "${label}".`, [{ field: 'mapping', message: key }]);
      }
      if (key) used.add(key);
      columns[header] = key;
    }
    const missing = missingRequired(entity, columns);
    if (missing.length) {
      throw new AppError('MAPPING_INCOMPLETE', 422, `Map these fields first: ${missing.join(', ')}.`, missing.map((m) => ({ field: 'mapping', message: m })));
    }

    const rows = await this.prisma.db.importRow.findMany({ where: { importJobId: id }, orderBy: { rowNumber: 'asc' } });
    const mapped = rows.map((r) => ({ rowNumber: r.rowNumber, raw: r.raw as Raw, values: applyMapping(r.raw as Raw, columns) }));
    const results = entity === 'STUDENTS' ? await this.checkStudents(mapped) : await this.checkTeachers(mapped);
    const stats = statsOf(results.map((r) => r.status));

    await this.prisma.tenantTx(
      async (tx) => {
        await tx.importRow.deleteMany({ where: { importJobId: id } });
        await tx.importRow.createMany({
          data: results.map((r) => ({
            importJobId: id,
            rowNumber: r.rowNumber,
            raw: r.raw,
            normalized: (r.normalized ?? undefined) as Prisma.InputJsonValue | undefined,
            errors: r.errors.length ? (r.errors as unknown as Prisma.InputJsonValue) : undefined,
            status: r.status,
          })) as Prisma.ImportRowCreateManyInput[],
        });
        await tx.importJob.update({
          where: { id },
          data: {
            status: 'VALIDATED',
            mapping: { columns, inviteLogins: input.inviteLogins } as unknown as Prisma.InputJsonValue,
            stats: stats as unknown as Prisma.InputJsonValue,
          },
        });
      },
      { timeout: 60_000 },
    );
    return this.get(id);
  }

  private async checkStudents(rows: { rowNumber: number; raw: Raw; values: Mapped }[]) {
    const yearId = (await this.prisma.db.school.findUnique({ where: { id: RequestContextStore.school().schoolId }, select: { currentAcademicYearId: true } }))
      ?.currentAcademicYearId;
    if (!yearId) throw new AppError('NO_ACADEMIC_YEAR', 422, 'Create the academic year, classes and sections before importing students.');
    const sections = await this.prisma.db.section.findMany({ where: { academicYearId: yearId }, include: { class: { select: { name: true } } } });
    const byKey = new Map(sections.map((s) => [`${classKey(s.class.name)}|${s.name.toUpperCase()}`, s]));
    const classesByKey = new Map<string, typeof sections>();
    for (const s of sections) classesByKey.set(classKey(s.class.name), [...(classesByKey.get(classKey(s.class.name)) ?? []), s]);

    const admissionNos = rows.map((r) => r.values.admissionNo?.trim()).filter(Boolean) as string[];
    const existing = new Set(
      (await this.prisma.db.student.findMany({ where: { admissionNo: { in: admissionNos } }, select: { admissionNo: true } })).map((s) => s.admissionNo),
    );
    const seen = new Map<string, number>();

    return rows.map(({ rowNumber, raw, values: v }) => {
      const errors: RowError[] = [];
      const admissionNo = v.admissionNo?.trim() ?? '';
      if (!admissionNo) errors.push({ field: 'admissionNo', message: 'Admission number is missing' });
      else if (admissionNo.length > 30) errors.push({ field: 'admissionNo', message: 'Admission number is too long' });

      const name = v.firstName?.trim() ? { firstName: v.firstName.trim(), lastName: v.lastName?.trim() || undefined } : splitName(v.fullName ?? '');
      if (!name.firstName) errors.push({ field: 'firstName', message: 'Student name is missing' });

      // class + section, or a combined "8-A"
      let clsText = v.class?.trim() ?? '';
      let secText = v.section?.trim().toUpperCase() ?? '';
      if (!clsText && v.classSection?.trim()) {
        const split = splitClassSection(v.classSection);
        if (split) [clsText, secText] = [split.cls, split.section];
      }
      let section: (typeof sections)[number] | undefined;
      if (!clsText) errors.push({ field: 'class', message: 'Class is missing' });
      else {
        const inClass = classesByKey.get(classKey(clsText));
        if (!inClass) errors.push({ field: 'class', message: `Class "${clsText}" doesn't exist this year` });
        else if (!secText && inClass.length === 1) section = inClass[0];
        else if (!secText) errors.push({ field: 'section', message: `Section is missing (${clsText} has ${inClass.length} sections)` });
        else {
          section = byKey.get(`${classKey(clsText)}|${secText}`);
          if (!section) errors.push({ field: 'section', message: `Section ${clsText}-${secText} doesn't exist this year` });
        }
      }

      const rollNo = v.rollNo?.trim() ? Number(v.rollNo) : undefined;
      if (rollNo !== undefined && (!Number.isInteger(rollNo) || rollNo < 1 || rollNo > 999)) errors.push({ field: 'rollNo', message: 'Roll number must be 1–999' });

      const date = (field: string): string | undefined => {
        const text = v[field]?.trim();
        if (!text) return undefined;
        const parsed = parseDate(text);
        if (!parsed) errors.push({ field, message: `"${text}" isn't a date (use DD/MM/YYYY)` });
        return parsed ?? undefined;
      };
      const dateOfBirth = date('dateOfBirth');
      const admissionDate = date('admissionDate');

      const gender = v.gender?.trim() ? parseGender(v.gender) : null;
      if (v.gender?.trim() && !gender) errors.push({ field: 'gender', message: `"${v.gender}" isn't a gender (use M or F)` });

      const bloodGroup = v.bloodGroup?.trim() ? v.bloodGroup.toUpperCase().replace(/\s|VE$/g, '').replace('POS', '+').replace('NEG', '-') : undefined;
      if (bloodGroup && !BLOOD.includes(bloodGroup)) errors.push({ field: 'bloodGroup', message: `"${v.bloodGroup}" isn't a blood group` });

      const phone = (field: string): string | undefined => {
        const text = v[field]?.trim();
        if (!text) return undefined;
        const parsed = normalizePhone(text);
        if (!parsed) errors.push({ field, message: `"${text}" isn't a valid mobile number` });
        return parsed ?? undefined;
      };
      const email = (field: string): string | undefined => {
        const text = v[field]?.trim().toLowerCase();
        if (!text) return undefined;
        if (!EMAIL.test(text)) errors.push({ field, message: `"${text}" isn't a valid email` });
        return text;
      };
      const postalCode = v.postalCode?.trim() || undefined;
      if (postalCode && !/^\d{6}$/.test(postalCode)) errors.push({ field: 'postalCode', message: 'PIN code must be 6 digits' });

      // Parents: a parent is created only when there's a phone number (it identifies them).
      const studentFirst = name.firstName || 'student';
      const guardians: GuardianInput[] = [];
      for (const [rel, nameKey, phoneKey] of [
        ['FATHER', 'fatherName', 'fatherPhone'],
        ['MOTHER', 'motherName', 'motherPhone'],
        ['GUARDIAN', 'guardianName', 'guardianPhone'],
      ] as const) {
        const p = phone(phoneKey);
        if (!p || guardians.some((g) => g.phone === p)) continue;
        const label = rel === 'FATHER' ? 'Father' : rel === 'MOTHER' ? 'Mother' : 'Guardian';
        guardians.push({ name: v[nameKey]?.trim() || `${label} of ${studentFirst}`, phone: p, relation: rel, isPrimary: guardians.length === 0 });
      }
      const guardianEmail = email('guardianEmail');
      if (guardians[0] && guardianEmail) guardians[0].email = guardianEmail;

      const normalized = {
        admissionNo,
        ...name,
        sectionId: section?.id,
        classLabel: section ? `${section.class.name.replace(/^Class\s+/i, '')}-${section.name}` : null,
        rollNo,
        dateOfBirth,
        admissionDate,
        gender: gender ?? undefined,
        bloodGroup,
        phone: phone('studentPhone'),
        email: email('email'),
        addressLine1: v.address?.trim() || undefined,
        city: v.city?.trim() || undefined,
        state: v.state?.trim() || undefined,
        postalCode,
        guardians,
      };

      let status: 'VALID' | 'INVALID' | 'DUPLICATE' = errors.length ? 'INVALID' : 'VALID';
      if (admissionNo && seen.has(admissionNo)) {
        status = 'DUPLICATE';
        errors.unshift({ field: 'admissionNo', message: `Same admission number as row ${seen.get(admissionNo)}` });
      } else if (admissionNo && existing.has(admissionNo)) {
        status = 'DUPLICATE';
        errors.unshift({ field: 'admissionNo', message: `A student with admission number ${admissionNo} already exists` });
      }
      if (admissionNo && !seen.has(admissionNo)) seen.set(admissionNo, rowNumber);
      return { rowNumber, raw, normalized, errors, status };
    });
  }

  private async checkTeachers(rows: { rowNumber: number; raw: Raw; values: Mapped }[]) {
    const ids = rows.map((r) => r.values.employeeId?.trim()).filter(Boolean) as string[];
    const existing = new Set((await this.prisma.db.teacher.findMany({ where: { employeeId: { in: ids } }, select: { employeeId: true } })).map((t) => t.employeeId));
    const seenIds = new Map<string, number>();
    const seenPhones = new Map<string, number>();

    return rows.map(({ rowNumber, raw, values: v }) => {
      const errors: RowError[] = [];
      const employeeId = v.employeeId?.trim() ?? '';
      if (!employeeId) errors.push({ field: 'employeeId', message: 'Employee ID is missing' });
      const name = v.firstName?.trim() ? { firstName: v.firstName.trim(), lastName: v.lastName?.trim() || undefined } : splitName(v.fullName ?? '');
      if (!name.firstName) errors.push({ field: 'firstName', message: 'Name is missing' });
      const phone = v.phone?.trim() ? normalizePhone(v.phone) : null;
      if (!v.phone?.trim()) errors.push({ field: 'phone', message: 'Mobile number is missing' });
      else if (!phone) errors.push({ field: 'phone', message: `"${v.phone}" isn't a valid mobile number` });
      const email = v.email?.trim().toLowerCase() || undefined;
      if (email && !EMAIL.test(email)) errors.push({ field: 'email', message: `"${email}" isn't a valid email` });
      const gender = v.gender?.trim() ? parseGender(v.gender) : null;
      if (v.gender?.trim() && !gender) errors.push({ field: 'gender', message: `"${v.gender}" isn't a gender (use M or F)` });
      const date = (field: string) => {
        const text = v[field]?.trim();
        if (!text) return undefined;
        const parsed = parseDate(text);
        if (!parsed) errors.push({ field, message: `"${text}" isn't a date (use DD/MM/YYYY)` });
        return parsed ?? undefined;
      };
      const normalized = {
        employeeId,
        ...name,
        phone,
        email,
        gender: gender ?? undefined,
        dateOfBirth: date('dateOfBirth'),
        joiningDate: date('joiningDate'),
        department: v.department?.trim() || undefined,
        designation: v.designation?.trim() || undefined,
        qualification: v.qualification?.trim() || undefined,
      };

      let status: 'VALID' | 'INVALID' | 'DUPLICATE' = errors.length ? 'INVALID' : 'VALID';
      if (employeeId && (seenIds.has(employeeId) || existing.has(employeeId))) {
        status = 'DUPLICATE';
        errors.unshift({ field: 'employeeId', message: existing.has(employeeId) ? `Employee ${employeeId} already exists` : `Same employee ID as row ${seenIds.get(employeeId)}` });
      } else if (phone && seenPhones.has(phone)) {
        status = 'DUPLICATE';
        errors.unshift({ field: 'phone', message: `Same mobile number as row ${seenPhones.get(phone)}` });
      }
      if (employeeId && !seenIds.has(employeeId)) seenIds.set(employeeId, rowNumber);
      if (phone && !seenPhones.has(phone)) seenPhones.set(phone, rowNumber);
      return { rowNumber, raw, normalized, errors, status };
    });
  }

  // ---------------------------------------------------------------- 3. commit (background job)

  async commit(id: string): Promise<ImportJobItem> {
    const ctx = RequestContextStore.tenant();
    const job = await this.prisma.db.importJob.findUnique({ where: { id } });
    if (!job) throw AppError.notFound('import');
    if (job.status !== 'VALIDATED') throw new AppError('IMPORT_NOT_READY', 409, 'Check the file before importing.');
    if (!(job.stats as unknown as ImportStats | null)?.valid) throw new AppError('NOTHING_TO_IMPORT', 422, 'There are no valid rows to import.');
    if (job.entity === 'STUDENTS') await this.entitlements.assertStudents((job.stats as unknown as ImportStats).valid);
    // Conditional update: a double-click can't start two imports.
    const started = await this.prisma.db.importJob.updateMany({ where: { id, status: 'VALIDATED' }, data: { status: 'IMPORTING' } });
    if (started.count !== 1) throw new AppError('IMPORT_LOCKED', 409, 'This import has already started.');
    await this.queues.add(QUEUES.imports, 'commit', { schoolId: ctx.schoolId, importJobId: id, actorUserId: ctx.userId, actorMembershipId: ctx.membershipId }, { jobId: `import-${id}`, attempts: 1 });
    return this.get(id);
  }

  private async runCommit(data: JobData): Promise<void> {
    RequestContextStore.patch({ userId: String(data.actorUserId), membershipId: String(data.actorMembershipId) });
    const id = String(data.importJobId);
    const job = await this.prisma.db.importJob.findUnique({ where: { id } });
    if (!job || job.status !== 'IMPORTING') return;
    const { inviteLogins } = job.mapping as unknown as StoredMapping;
    const rows = await this.prisma.db.importRow.findMany({ where: { importJobId: id, status: 'VALID' }, orderBy: { rowNumber: 'asc' } });

    let imported = 0;
    let failed = 0;
    for (const row of rows) {
      try {
        const entityId = job.entity === 'STUDENTS'
          ? await this.importStudent(row.normalized as never, inviteLogins)
          : await this.importTeacher(row.normalized as never, inviteLogins);
        await this.prisma.db.importRow.update({ where: { id: row.id }, data: { status: 'IMPORTED', entityId } });
        imported++;
      } catch (error) {
        failed++;
        const message = error instanceof AppError ? error.message : 'Unexpected error';
        if (!(error instanceof AppError)) this.logger.error({ err: error, importJobId: id, row: row.rowNumber }, 'import row failed');
        const duplicate = error instanceof AppError && error.status === 409;
        await this.prisma.db.importRow.update({
          where: { id: row.id },
          data: { status: duplicate ? 'DUPLICATE' : 'INVALID', errors: [{ message: `Couldn't import: ${message}` }] },
        });
      }
    }

    const statuses = await this.prisma.db.importRow.groupBy({ by: ['status'], where: { importJobId: id }, _count: { _all: true } });
    const stats = { ...statsOf(statuses.flatMap((s) => Array(s._count._all).fill(s.status))), failed };
    await this.prisma.tenantTx(async (tx) => {
      await tx.importJob.update({ where: { id }, data: { status: 'COMPLETED', stats: stats as unknown as Prisma.InputJsonValue, completedAt: new Date() } });
      await this.audit.record(tx, { action: 'import.completed', entityType: 'ImportJob', entityId: id, after: { imported, failed } });
    });
    this.outbox.flush();
  }

  private async importStudent(n: {
    admissionNo: string;
    firstName: string;
    lastName?: string;
    sectionId: string;
    rollNo?: number;
    dateOfBirth?: string;
    admissionDate?: string;
    gender?: 'MALE' | 'FEMALE' | 'OTHER';
    bloodGroup?: string;
    phone?: string;
    email?: string;
    addressLine1?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    guardians: GuardianInput[];
  }, invite: boolean): Promise<string> {
    if (await this.prisma.db.student.findFirst({ where: { admissionNo: n.admissionNo }, select: { id: true } })) {
      throw new AppError('CONFLICT', 409, `Admission number ${n.admissionNo} already exists`);
    }
    const section = await this.prisma.db.section.findUnique({ where: { id: n.sectionId }, select: { id: true, classId: true, academicYearId: true } });
    if (!section) throw new AppError('INVALID_REFERENCE', 422, 'The section no longer exists');
    const guardianIds: string[] = [];
    for (const g of n.guardians) guardianIds.push(await this.guardians.ensure(g, invite));

    return this.prisma.tenantTx(async (tx) => {
      const student = await tx.student.create({
        data: {
          admissionNo: n.admissionNo,
          firstName: n.firstName,
          lastName: n.lastName,
          dateOfBirth: toDate(n.dateOfBirth),
          admissionDate: toDate(n.admissionDate),
          gender: n.gender,
          bloodGroup: n.bloodGroup,
          phone: n.phone,
          email: n.email,
          addressLine1: n.addressLine1,
          city: n.city,
          state: n.state,
          postalCode: n.postalCode,
        } as Prisma.StudentUncheckedCreateInput,
      });
      await tx.studentEnrollment.create({
        data: {
          studentId: student.id,
          academicYearId: section.academicYearId,
          classId: section.classId,
          sectionId: section.id,
          rollNo: n.rollNo,
          enrolledOn: toDate(n.admissionDate) ?? new Date(),
        } as Prisma.StudentEnrollmentUncheckedCreateInput,
      });
      for (const [i, g] of n.guardians.entries()) await this.guardians.link(tx, guardianIds[i]!, student.id, g.relation, g.isPrimary);
      await this.audit.record(tx, { action: 'student.create', entityType: 'Student', entityId: student.id, after: { admissionNo: n.admissionNo, via: 'import' } });
      await this.outbox.publish(tx, 'student.created', { studentId: student.id });
      return student.id;
    });
  }

  private async importTeacher(n: {
    employeeId: string;
    firstName: string;
    lastName?: string;
    phone: string;
    email?: string;
    gender?: 'MALE' | 'FEMALE' | 'OTHER';
    dateOfBirth?: string;
    joiningDate?: string;
    department?: string;
    designation?: string;
    qualification?: string;
  }, invite: boolean): Promise<string> {
    if (await this.prisma.db.teacher.findFirst({ where: { employeeId: n.employeeId }, select: { id: true } })) {
      throw new AppError('CONFLICT', 409, `Employee ${n.employeeId} already exists`);
    }
    let membershipId: string | null = null;
    if (invite) {
      ({ membershipId } = await this.identity.invite({ name: [n.firstName, n.lastName].filter(Boolean).join(' '), phone: n.phone, email: n.email, roleKey: 'teacher' }));
      if (await this.prisma.db.teacher.findFirst({ where: { membershipId }, select: { id: true } })) {
        throw new AppError('CONFLICT', 409, 'This mobile number already belongs to another teacher');
      }
    }
    return this.prisma.tenantTx(async (tx) => {
      const teacher = await tx.teacher.create({
        data: {
          membershipId,
          employeeId: n.employeeId,
          firstName: n.firstName,
          lastName: n.lastName,
          phone: n.phone,
          email: n.email,
          gender: n.gender,
          dateOfBirth: toDate(n.dateOfBirth),
          joiningDate: toDate(n.joiningDate),
          department: n.department,
          designation: n.designation,
          qualification: n.qualification,
        } as Prisma.TeacherUncheckedCreateInput,
      });
      await this.audit.record(tx, { action: 'teacher.create', entityType: 'Teacher', entityId: teacher.id, after: { employeeId: n.employeeId, via: 'import' } });
      return teacher.id;
    });
  }

  // ---------------------------------------------------------------- read

  async list(): Promise<ImportJobItem[]> {
    const jobs = await this.prisma.db.importJob.findMany({ orderBy: { createdAt: 'desc' }, take: 20, include: { file: { select: { originalName: true } } } });
    return Promise.all(jobs.map((j) => this.toItem(j, [])));
  }

  async get(id: string): Promise<ImportJobItem> {
    const job = await this.prisma.db.importJob.findUnique({ where: { id }, include: { file: { select: { originalName: true } } } });
    if (!job) throw AppError.notFound('import');
    const sample = await this.prisma.db.importRow.findMany({ where: { importJobId: id }, orderBy: { rowNumber: 'asc' }, take: 5, select: { raw: true } });
    return this.toItem(job, sample.map((s) => s.raw as Raw));
  }

  private async toItem(job: Prisma.ImportJobGetPayload<{ include: { file: { select: { originalName: true } } } }>, sample: Raw[]): Promise<ImportJobItem> {
    const stored = job.mapping as unknown as StoredMapping | null;
    const columns = stored?.columns ?? {};
    return {
      id: job.id,
      entity: job.entity as ImportEntity,
      status: job.status,
      fileName: job.file.originalName,
      detectedColumns: job.detectedColumns,
      mapping: columns,
      missingRequired: missingRequired(job.entity as ImportEntity, columns),
      stats: (job.stats as unknown as ImportStats | null) ?? null,
      sample,
      createdAt: job.createdAt.toISOString(),
      completedAt: job.completedAt?.toISOString() ?? null,
    };
  }

  async rows(id: string, query: In<typeof listImportRowsQuerySchema>) {
    const job = await this.prisma.db.importJob.findUnique({ where: { id }, select: { entity: true } });
    if (!job) throw AppError.notFound('import');
    const where = { importJobId: id, ...(query.status ? { status: query.status } : {}) };
    const [rows, total] = await Promise.all([
      this.prisma.db.importRow.findMany({ where, orderBy: { rowNumber: 'asc' }, skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
      this.prisma.db.importRow.count({ where }),
    ]);
    const data: ImportRowItem[] = rows.map((r) => ({
      rowNumber: r.rowNumber,
      status: r.status,
      summary: summarize(job.entity as ImportEntity, (r.normalized ?? {}) as Record<string, unknown>, r.raw as Raw),
      errors: (r.errors as unknown as RowError[] | null) ?? [],
      entityId: r.entityId,
    }));
    return { data, page: { page: query.page, pageSize: query.pageSize, total } };
  }

  /** CSV of rows that were not imported, with the reason — fix and re-upload. */
  async problemsCsv(id: string): Promise<{ fileName: string; csv: string }> {
    const job = await this.prisma.db.importJob.findUnique({ where: { id }, include: { file: { select: { originalName: true } } } });
    if (!job) throw AppError.notFound('import');
    const rows = await this.prisma.db.importRow.findMany({
      where: { importJobId: id, status: { in: ['INVALID', 'DUPLICATE'] } },
      orderBy: { rowNumber: 'asc' },
    });
    const headers = ['Row', 'Problem', ...job.detectedColumns];
    const esc = (s: string) => {
      const safe = /^[=+\-@]/.test(s) ? `'${s}` : s; // spreadsheet formula injection guard (docs/09 §3)
      return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
    };
    const lines = rows.map((r) => {
      const problem = ((r.errors as unknown as RowError[] | null) ?? []).map((e) => e.message).join('; ');
      return [String(r.rowNumber), problem, ...job.detectedColumns.map((h) => (r.raw as Raw)[h] ?? '')].map(esc).join(',');
    });
    const base = job.file.originalName.replace(/\.[^.]+$/, '');
    return { fileName: `${base} - rows to fix.csv`, csv: [headers.map(esc).join(','), ...lines].join('\n') };
  }

  /** Blank template with the right headers and one example row. */
  async template(entity: ImportEntity): Promise<Buffer> {
    const fields = IMPORT_FIELDS[entity].filter((f) => f.key !== 'fullName' && f.key !== 'classSection');
    const header = fields.map((f) => ({ value: f.label + (f.required ? ' *' : ''), fontWeight: 'bold' as const }));
    const example = fields.map((f) => ({ value: f.example }));
    return writeXlsxFile([header, example], { columns: fields.map(() => ({ width: 20 })) }).toBuffer();
  }
}

function applyMapping(raw: Raw, columns: Record<string, string>): Mapped {
  const out: Mapped = {};
  for (const [header, key] of Object.entries(columns)) if (key) out[key] = raw[header] ?? '';
  return out;
}

export function missingRequired(entity: ImportEntity, columns: Record<string, string>): string[] {
  const has = new Set(Object.values(columns).filter(Boolean));
  const missing: string[] = [];
  const name = (key: string) => IMPORT_FIELDS[entity].find((f) => f.key === key)!.label;
  if (entity === 'STUDENTS') {
    if (!has.has('admissionNo')) missing.push(name('admissionNo'));
    if (!has.has('fullName') && !has.has('firstName')) missing.push('Student name');
    if (!has.has('classSection') && !has.has('class')) missing.push('Class');
  } else {
    if (!has.has('employeeId')) missing.push(name('employeeId'));
    if (!has.has('fullName') && !has.has('firstName')) missing.push('Name');
    if (!has.has('phone')) missing.push(name('phone'));
  }
  return missing;
}

function statsOf(statuses: string[]): ImportStats {
  const count = (s: string) => statuses.filter((x) => x === s).length;
  return {
    total: statuses.length,
    valid: count('VALID'),
    invalid: count('INVALID'),
    duplicate: count('DUPLICATE'),
    imported: count('IMPORTED'),
    failed: 0,
  };
}

function summarize(entity: ImportEntity, n: Record<string, unknown>, raw: Raw): string {
  const name = [n.firstName, n.lastName].filter(Boolean).join(' ');
  if (!name) return Object.values(raw).filter(Boolean).slice(0, 3).join(' · ');
  return entity === 'STUDENTS'
    ? [name, n.classLabel, n.admissionNo].filter(Boolean).join(' · ')
    : [name, n.employeeId, n.department].filter(Boolean).join(' · ');
}
