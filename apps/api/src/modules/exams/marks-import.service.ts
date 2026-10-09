import { Injectable } from '@nestjs/common';
import writeXlsxFile from 'write-excel-file/node';
import type { z } from 'zod';
import type { MarksImportResult, MarksImportRow, marksImportSchema } from '@schoolos/contracts';
import { RequestContextStore } from '../../core/context/request-context.js';
import { AppError } from '../../core/errors/app-error.js';
import { PrismaService } from '../../core/prisma/prisma.service.js';
import { FilesService, purposeOf } from '../files/files.service.js';
import { parseSpreadsheet } from '../imports/parsing.js';
import { MarksService } from './marks.service.js';

type In<T extends z.ZodType> = z.output<T>;
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const ABSENT = new Set(['a', 'ab', 'abs', 'absent']);
const EXEMPT = new Set(['e', 'ex', 'exempt', 'exempted', 'na']);

/**
 * Marks from a spreadsheet (roadmap follow-up to Phase 4): download the class list with current
 * marks, fill it in offline, upload it. Every row is checked first; nothing is saved while any row
 * has a problem, and saving goes through the normal marks save (locks, version check, audit).
 */
@Injectable()
export class MarksImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly marks: MarksService,
    private readonly files: FilesService,
  ) {}

  async template(examSubjectId: string, sectionId: string): Promise<{ fileName: string; data: Buffer }> {
    const sheet = await this.marks.sheet(examSubjectId, sectionId);
    const max = sheet.examSubject.maxMarks;
    const value = (s: (typeof sheet.students)[number]) => (s.absent ? 'A' : s.exempt ? 'E' : s.marks === null ? '' : s.marks);
    const header = ['Admission no', 'Roll no', 'Student', `Marks (out of ${max})`].map((v) => ({ value: v, fontWeight: 'bold' as const }));
    const rows = sheet.students.map((s) => [
      { value: s.admissionNo, type: String },
      s.rollNo === null ? null : { value: s.rollNo, type: Number },
      { value: s.name, type: String },
      ((v) => (v === '' ? null : typeof v === 'number' ? { value: v, type: Number } : { value: v, type: String }))(value(s)),
    ]);
    const note = [[{ value: `Fill in marks out of ${max}. Use A for absent, E for exempt. Leave blank to keep a student as they are. Don't change the admission numbers.`, type: String }]];
    const data = await writeXlsxFile([header, ...rows, [], ...note] as never, { columns: [{ width: 14 }, { width: 8 }, { width: 28 }, { width: 18 }], sheet: 'Marks' }).toBuffer();
    const safe = (s: string) => s.replace(/[^\w\- ]+/g, '').trim();
    return { fileName: `${safe(sheet.exam.name)} - ${safe(sheet.examSubject.subject.name)} - ${safe(sheet.section.label)}.xlsx`, data };
  }

  async import(input: In<typeof marksImportSchema>): Promise<MarksImportResult> {
    const sheet = await this.marks.sheet(input.examSubjectId, input.sectionId);
    if (!sheet.editable) throw new AppError('MARKS_LOCKED', 422, sheet.lockedReason ?? 'These marks are locked.');
    const file = await this.prisma.db.file.findFirst({ where: { id: input.fileId, status: 'READY', uploadedByMemberId: RequestContextStore.tenant().membershipId } });
    if (!file || purposeOf(file.objectKey) !== 'marks_import') throw AppError.invalidReference('fileId', 'uploaded marks sheet');
    const parsed = await parseSpreadsheet(await this.files.bytes(file.id), file.mimeType).catch(() => {
      throw new AppError('UNREADABLE_FILE', 422, "We couldn't read that file. Save it as Excel (.xlsx) or CSV and try again.");
    });
    const admCol = parsed.headers.find((h) => /adm|scholar|sr ?no|reg/.test(h.toLowerCase()));
    const marksCol = parsed.headers.find((h) => /mark|score|obtained/.test(h.toLowerCase()));
    if (!admCol || !marksCol) throw new AppError('COLUMNS_MISSING', 422, 'The sheet needs an "Admission no" column and a "Marks" column — download the template to start from.');

    const max = sheet.examSubject.maxMarks;
    const byAdm = new Map(sheet.students.map((s) => [norm(s.admissionNo), s]));
    const seen = new Map<string, number>();
    const rows: MarksImportRow[] = [];
    parsed.rows.forEach((r, i) => {
      const row = i + 2;
      const adm = (r[admCol] ?? '').trim();
      const value = (r[marksCol] ?? '').trim();
      if (!adm && !value) return;
      if (!adm && /^fill in marks/i.test(Object.values(r).join(' '))) return; // the template's note
      const student = byAdm.get(norm(adm));
      const base = { row, admissionNo: adm, name: student?.name ?? null, value, marks: null as number | null, absent: false, exempt: false };
      const fail = (error: string) => rows.push({ ...base, change: 'blank', error });
      if (!student) return void fail(adm ? `No student with admission no. ${adm} in ${sheet.section.label}` : 'Admission no. is missing');
      if (seen.has(student.studentId)) return void fail(`Same student as row ${seen.get(student.studentId)}`);
      seen.set(student.studentId, row);
      if (!value) return void rows.push({ ...base, change: 'blank', error: null });
      const v = value.toLowerCase();
      let next: { marks: number | null; absent: boolean; exempt: boolean };
      if (ABSENT.has(v)) next = { marks: null, absent: true, exempt: false };
      else if (EXEMPT.has(v)) next = { marks: null, absent: false, exempt: true };
      else {
        const n = Number(value.replace(',', '.'));
        if (!Number.isFinite(n)) return void fail(`"${value}" isn't a number (use A for absent, E for exempt)`);
        if (n < 0 || n > max) return void fail(`${value} is outside 0–${max}`);
        if (Math.round(n * 100) !== n * 100) return void fail('At most 2 decimals');
        next = { marks: n, absent: false, exempt: false };
      }
      const same = student.marks === next.marks && student.absent === next.absent && student.exempt === next.exempt;
      const had = student.marks !== null || student.absent || student.exempt;
      rows.push({ ...base, ...next, change: same ? 'same' : had ? 'changed' : 'new', error: null });
    });

    const errors = rows.filter((r) => r.error).length;
    const changed = rows.filter((r) => !r.error && (r.change === 'new' || r.change === 'changed'));
    const missing = sheet.students.filter((s) => !seen.has(s.studentId)).map((s) => s.name);
    if (!rows.length) throw new AppError('EMPTY_FILE', 422, 'The sheet has no marks in it.');
    if (!input.apply || errors || !changed.length) return { rows, errors, changes: changed.length, missing, applied: false, sheet: null };

    const byRow = new Map(sheet.students.map((s) => [norm(s.admissionNo), s]));
    const saved = await this.marks.save({
      examSubjectId: input.examSubjectId,
      sectionId: input.sectionId,
      version: input.version ?? sheet.version,
      entries: changed.map((r) => {
        const st = byRow.get(norm(r.admissionNo))!;
        return { studentId: st.studentId, marks: r.marks, absent: r.absent, exempt: r.exempt, remarks: st.remarks ?? undefined };
      }),
    });
    return { rows, errors: 0, changes: changed.length, missing, applied: true, sheet: saved };
  }
}
