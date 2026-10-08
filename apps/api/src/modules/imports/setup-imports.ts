import { Injectable } from '@nestjs/common';
import { AuditService } from '../../core/audit/audit.service.js';
import { RequestContextStore } from '../../core/context/request-context.js';
import { AppError } from '../../core/errors/app-error.js';
import { PrismaService } from '../../core/prisma/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { FeesService } from '../fees/fees.service.js';
import { classKey } from './parsing.js';

type Raw = Record<string, string>;
type Mapped = Record<string, string>;
interface RowError {
  field?: string;
  message: string;
}
export interface Checked {
  rowNumber: number;
  raw: Raw;
  normalized: Record<string, unknown>;
  errors: RowError[];
  status: 'VALID' | 'INVALID' | 'DUPLICATE';
}
type In = { rowNumber: number; raw: Raw; values: Mapped }[];

const PRE_PRIMARY: Record<string, number> = { prenursery: 0, nursery: 1, lkg: 2, ukg: 3 };
/** "8" → "Class 8"; "lkg" stays as typed ("LKG"). */
const className = (typed: string) => (/^\d{1,2}$/.test(classKey(typed)) ? `Class ${classKey(typed)}` : typed.trim().replace(/\s+/g, ' '));
const defaultOrder = (key: string) => (/^\d{1,2}$/.test(key) ? Number(key) + 3 : PRE_PRIMARY[key]);
const SUBJECT_TYPES: Record<string, 'CORE' | 'ELECTIVE' | 'CO_SCHOLASTIC'> = { core: 'CORE', main: 'CORE', compulsory: 'CORE', elective: 'ELECTIVE', optional: 'ELECTIVE', 'co scholastic': 'CO_SCHOLASTIC', coscholastic: 'CO_SCHOLASTIC', activity: 'CO_SCHOLASTIC' };
const NONE_WORDS = new Set(['', '-', 'none', 'nil', 'no', 'na', 'n/a']);
const norm = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** "A, B, C" · "A-C" · "A/B" · "3" (→ A, B, C) */
export function parseSections(input: string): string[] | null {
  const s = input.trim().toUpperCase();
  if (/^\d{1,2}$/.test(s)) {
    const n = Number(s);
    return n >= 1 && n <= 26 ? Array.from({ length: n }, (_, i) => String.fromCharCode(65 + i)) : null;
  }
  const range = s.match(/^([A-Z])\s*(?:-|TO)\s*([A-Z])$/);
  if (range) {
    const [a, b] = [range[1]!.charCodeAt(0), range[2]!.charCodeAt(0)];
    return b >= a ? Array.from({ length: b - a + 1 }, (_, i) => String.fromCharCode(a + i)) : null;
  }
  const parts = s.split(/[,/;&]|\s+AND\s+|\s+/).map((p) => p.trim()).filter(Boolean);
  if (!parts.length || parts.some((p) => !/^[A-Z0-9](?:[A-Z0-9 -]{0,8}[A-Z0-9])?$/.test(p))) return null;
  return [...new Set(parts)];
}

/** "1-5, 8" · "VI-X" · "Nursery, LKG" · "All" → class keys, or null for "all". */
export function parseClassList(input: string): { keys: string[] | null; bad: string[] } {
  const s = input.trim();
  if (!s || /^all( classes)?$/i.test(s)) return { keys: null, bad: [] };
  const keys: string[] = [];
  const bad: string[] = [];
  for (const token of s.split(/[,;]/).map((t) => t.trim()).filter(Boolean)) {
    const range = token.match(/^(.+?)\s*(?:-|to)\s*(.+)$/i);
    if (range) {
      const [a, b] = [classKey(range[1]!), classKey(range[2]!)];
      if (/^\d+$/.test(a) && /^\d+$/.test(b) && Number(a) <= Number(b)) {
        for (let n = Number(a); n <= Number(b); n++) keys.push(String(n));
        continue;
      }
    }
    const k = classKey(token);
    if (k) keys.push(k);
    else bad.push(token);
  }
  return { keys: [...new Set(keys)], bad };
}

/**
 * Import v2 (docs/12 Phase 6): classes with sections, subjects with the classes they're taught
 * in, and students' optional fees — the setup a new school usually has in a spreadsheet.
 * Same flow as students/teachers: map → check every row → preview → import in the background.
 */
@Injectable()
export class SetupImports {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly fees: FeesService,
  ) {}

  private async yearId(): Promise<string> {
    const school = await this.prisma.db.school.findUnique({ where: { id: RequestContextStore.school().schoolId }, select: { currentAcademicYearId: true } });
    if (!school?.currentAcademicYearId) throw new AppError('NO_ACADEMIC_YEAR', 422, 'Create the academic year first (Settings → Academic year).');
    return school.currentAcademicYearId;
  }

  // ---------------------------------------------------------------- classes

  async checkClasses(rows: In): Promise<Checked[]> {
    const yearId = await this.yearId();
    const classes = await this.prisma.db.schoolClass.findMany({ include: { sections: { where: { academicYearId: yearId }, select: { name: true } } } });
    const byKey = new Map(classes.map((c) => [classKey(c.name), c]));
    const seen = new Map<string, number>();
    return rows.map(({ rowNumber, raw, values: v }) => {
      const errors: RowError[] = [];
      const typed = v.className?.trim() ?? '';
      const key = typed ? classKey(typed) : '';
      if (!typed) errors.push({ field: 'className', message: 'Class is missing' });
      else if (typed.length > 40) errors.push({ field: 'className', message: 'Class name is too long' });
      const sections = v.sections?.trim() ? parseSections(v.sections) : null;
      if (!v.sections?.trim()) errors.push({ field: 'sections', message: 'Sections are missing (e.g. A, B, C)' });
      else if (!sections) errors.push({ field: 'sections', message: `"${v.sections}" isn't a list of sections (use A, B, C or A-C)` });
      const capacity = v.capacity?.trim() ? Number(v.capacity) : undefined;
      if (capacity !== undefined && (!Number.isInteger(capacity) || capacity < 1 || capacity > 200)) errors.push({ field: 'capacity', message: 'Seats must be 1–200' });
      const order = v.displayOrder?.trim() ? Number(v.displayOrder) : undefined;
      if (order !== undefined && (!Number.isInteger(order) || order < 0 || order > 999)) errors.push({ field: 'displayOrder', message: 'Order must be a whole number' });

      const existing = key ? byKey.get(key) : undefined;
      const have = new Set(existing?.sections.map((s) => s.name.toUpperCase()) ?? []);
      const newSections = (sections ?? []).filter((s) => !have.has(s));
      const normalized = { classId: existing?.id ?? null, name: existing?.name ?? (typed ? className(typed) : ''), key, sections: newSections, capacity, displayOrder: order ?? existing?.displayOrder ?? defaultOrder(key) };

      let status: Checked['status'] = errors.length ? 'INVALID' : 'VALID';
      if (key && seen.has(key)) {
        status = 'DUPLICATE';
        errors.unshift({ field: 'className', message: `Same class as row ${seen.get(key)}` });
      } else if (!errors.length && existing && !newSections.length) {
        status = 'DUPLICATE';
        errors.unshift({ field: 'sections', message: `${existing.name} already has these sections` });
      }
      if (key && !seen.has(key)) seen.set(key, rowNumber);
      return { rowNumber, raw, normalized, errors, status };
    });
  }

  async importClass(n: { classId: string | null; name: string; sections: string[]; capacity?: number; displayOrder?: number }): Promise<string> {
    const yearId = await this.yearId();
    return this.prisma.tenantTx(async (tx) => {
      let classId = n.classId;
      if (!classId) {
        if (await tx.schoolClass.findFirst({ where: { name: n.name }, select: { id: true } })) throw new AppError('CONFLICT', 409, `${n.name} already exists`);
        const order = n.displayOrder ?? ((await tx.schoolClass.aggregate({ _max: { displayOrder: true } }))._max.displayOrder ?? 0) + 1;
        classId = (await tx.schoolClass.create({ data: { name: n.name, displayOrder: order } as Prisma.SchoolClassUncheckedCreateInput })).id;
      }
      const have = new Set((await tx.section.findMany({ where: { classId, academicYearId: yearId }, select: { name: true } })).map((s) => s.name.toUpperCase()));
      const add = n.sections.filter((s) => !have.has(s));
      if (add.length) {
        await tx.section.createMany({ data: add.map((name) => ({ schoolId: RequestContextStore.school().schoolId, academicYearId: yearId, classId: classId!, name, capacity: n.capacity ?? null })) });
      }
      await this.audit.record(tx, { action: n.classId ? 'section.create' : 'class.create', entityType: 'SchoolClass', entityId: classId, after: { name: n.name, sections: add, via: 'import' } });
      return classId;
    });
  }

  // ---------------------------------------------------------------- subjects

  async checkSubjects(rows: In): Promise<Checked[]> {
    const yearId = await this.yearId();
    const [subjects, classes, links] = await Promise.all([
      this.prisma.db.subject.findMany({ select: { id: true, name: true, code: true } }),
      this.prisma.db.schoolClass.findMany({ select: { id: true, name: true } }),
      this.prisma.db.classSubject.findMany({ where: { academicYearId: yearId }, select: { classId: true, subjectId: true } }),
    ]);
    const classByKey = new Map(classes.map((c) => [classKey(c.name), c]));
    const seenNames = new Map<string, number>();
    const seenCodes = new Map<string, number>();
    return rows.map(({ rowNumber, raw, values: v }) => {
      const errors: RowError[] = [];
      const name = v.name?.trim().replace(/\s+/g, ' ') ?? '';
      if (!name) errors.push({ field: 'name', message: 'Subject name is missing' });
      else if (name.length > 60) errors.push({ field: 'name', message: 'Subject name is too long' });
      // Matched by name; a code that belongs to a differently named subject is a clash, not a match.
      const existing = subjects.find((s) => norm(s.name) === norm(name));
      const code = (v.code?.trim() || existing?.code || name.replace(/[^A-Za-z0-9]/g, '').slice(0, 4)).toUpperCase();
      if (!/^[A-Z0-9-]{1,12}$/.test(code)) errors.push({ field: 'code', message: `"${code}" isn't a valid code (letters and digits, up to 12)` });
      const clash = subjects.find((s) => s.code.toUpperCase() === code && s.id !== existing?.id);
      if (clash) errors.push({ field: 'code', message: `Code ${code} is already used by ${clash.name}` });
      const type = v.type?.trim() ? SUBJECT_TYPES[norm(v.type)] : 'CORE';
      if (!type) errors.push({ field: 'type', message: `"${v.type}" isn't a type (Core, Elective or Co-scholastic)` });

      const list = parseClassList(v.classes ?? '');
      const wanted = list.keys === null ? [...classByKey.keys()] : list.keys;
      const unknown = [...list.bad, ...wanted.filter((k) => !classByKey.has(k))];
      if (unknown.length) errors.push({ field: 'classes', message: `No class called ${unknown.map((u) => `"${u}"`).join(', ')}` });
      const classIds = wanted.map((k) => classByKey.get(k)?.id).filter((x): x is string => !!x);
      const newClassIds = classIds.filter((cid) => !existing || !links.some((l) => l.classId === cid && l.subjectId === existing.id));

      const normalized = { subjectId: existing?.id ?? null, name: existing?.name ?? name, code, type: type ?? 'CORE', classIds: newClassIds, classes: classIds.map((cid) => classes.find((c) => c.id === cid)!.name) };
      let status: Checked['status'] = errors.length ? 'INVALID' : 'VALID';
      const nk = norm(name);
      if (nk && seenNames.has(nk)) {
        status = 'DUPLICATE';
        errors.unshift({ field: 'name', message: `Same subject as row ${seenNames.get(nk)}` });
      } else if (seenCodes.has(code) && !errors.length) {
        status = 'INVALID';
        errors.unshift({ field: 'code', message: `Same code as row ${seenCodes.get(code)}` });
      } else if (!errors.length && existing && !newClassIds.length) {
        status = 'DUPLICATE';
        errors.unshift({ field: 'name', message: `${existing.name} already exists${classIds.length ? ' in these classes' : ''}` });
      }
      if (nk && !seenNames.has(nk)) seenNames.set(nk, rowNumber);
      if (!seenCodes.has(code)) seenCodes.set(code, rowNumber);
      return { rowNumber, raw, normalized, errors, status };
    });
  }

  async importSubject(n: { subjectId: string | null; name: string; code: string; type: 'CORE' | 'ELECTIVE' | 'CO_SCHOLASTIC'; classIds: string[] }): Promise<string> {
    const yearId = await this.yearId();
    const { schoolId } = RequestContextStore.school();
    return this.prisma.tenantTx(async (tx) => {
      let subjectId = n.subjectId;
      if (!subjectId) {
        if (await tx.subject.findFirst({ where: { code: n.code }, select: { id: true } })) throw new AppError('CONFLICT', 409, `Code ${n.code} is already used`);
        subjectId = (await tx.subject.create({ data: { name: n.name, code: n.code, type: n.type } as Prisma.SubjectUncheckedCreateInput })).id;
      }
      if (n.classIds.length) {
        await tx.classSubject.createMany({ data: n.classIds.map((classId) => ({ schoolId, academicYearId: yearId, classId, subjectId: subjectId! })), skipDuplicates: true });
      }
      await this.audit.record(tx, { action: n.subjectId ? 'class_subjects.update' : 'subject.create', entityType: 'Subject', entityId: subjectId, after: { name: n.name, code: n.code, classes: n.classIds.length, via: 'import' } });
      return subjectId;
    });
  }

  // ---------------------------------------------------------------- optional fees per student

  async checkFeeAssignments(rows: In): Promise<Checked[]> {
    const yearId = await this.yearId();
    const nos = rows.map((r) => r.values.admissionNo?.trim()).filter(Boolean) as string[];
    const students = await this.prisma.db.student.findMany({
      where: { admissionNo: { in: nos }, archivedAt: null },
      select: { id: true, admissionNo: true, firstName: true, lastName: true, enrollments: { where: { academicYearId: yearId }, select: { classId: true } } },
    });
    const structures = await this.prisma.db.feeStructure.findMany({
      where: { academicYearId: yearId, status: 'PUBLISHED' },
      select: { id: true, name: true, classes: { select: { classId: true } }, items: { where: { isOptional: true }, select: { id: true, amountPaise: true, feeHead: { select: { name: true, code: true } } } } },
    });
    const seen = new Map<string, number>();
    return rows.map(({ rowNumber, raw, values: v }) => {
      const errors: RowError[] = [];
      const admissionNo = v.admissionNo?.trim() ?? '';
      const student = students.find((s) => s.admissionNo === admissionNo);
      if (!admissionNo) errors.push({ field: 'admissionNo', message: 'Admission number is missing' });
      else if (!student) errors.push({ field: 'admissionNo', message: `No student with admission number ${admissionNo}` });
      const classId = student?.enrollments[0]?.classId;
      if (student && !classId) errors.push({ field: 'admissionNo', message: 'This student is not in a class this year' });
      const structure = classId ? structures.find((s) => s.classes.some((c) => c.classId === classId)) : undefined;
      if (classId && !structure) errors.push({ field: 'admissionNo', message: "This student's class has no published fee structure" });

      const text = v.optionalFees?.trim() ?? '';
      const tokens = NONE_WORDS.has(text.toLowerCase()) ? [] : text.split(/[,;/+]|\s+and\s+/i).map((t) => t.trim()).filter(Boolean);
      const itemIds: string[] = [];
      const labels: string[] = [];
      for (const token of tokens) {
        if (!structure) break;
        const item = structure.items.find((i) => norm(i.feeHead.name) === norm(token) || i.feeHead.code.toUpperCase() === token.toUpperCase() || norm(i.feeHead.name).startsWith(norm(token)));
        if (!item) errors.push({ field: 'optionalFees', message: `"${token}" isn't an optional fee for ${structure.name}${structure.items.length ? ` (choose from ${structure.items.map((i) => i.feeHead.name).join(', ')})` : ''}` });
        else if (!itemIds.includes(item.id)) {
          itemIds.push(item.id);
          labels.push(item.feeHead.name);
        }
      }
      const normalized = { studentId: student?.id ?? null, name: student ? [student.firstName, student.lastName].filter(Boolean).join(' ') : '', admissionNo, itemIds, labels };
      let status: Checked['status'] = errors.length ? 'INVALID' : 'VALID';
      if (admissionNo && seen.has(admissionNo)) {
        status = 'DUPLICATE';
        errors.unshift({ field: 'admissionNo', message: `Same student as row ${seen.get(admissionNo)}` });
      }
      if (admissionNo && !seen.has(admissionNo)) seen.set(admissionNo, rowNumber);
      return { rowNumber, raw, normalized, errors, status };
    });
  }

  async importFeeAssignment(n: { studentId: string; itemIds: string[] }): Promise<string> {
    await this.fees.setOptions(n.studentId, n.itemIds);
    return n.studentId;
  }
}
