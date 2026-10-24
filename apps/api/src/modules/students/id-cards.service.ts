import { Injectable } from '@nestjs/common';
import type { z } from 'zod';
import type { idCardsQuerySchema } from '@schoolos/contracts';
import { RequestContextStore } from '../../core/context/request-context.js';
import { AppError } from '../../core/errors/app-error.js';
import { PdfRenderer } from '../../core/pdf/pdf-renderer.js';
import { ScopeService } from '../../core/permissions/scope.service.js';
import { PrismaService } from '../../core/prisma/prisma.service.js';
import { SchoolSettingsService } from '../../core/settings/school-settings.service.js';
import { fromDate } from '../../core/util/dates.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { FilesService } from '../files/files.service.js';
import { idCardsHtml, type IdCardStudent } from './id-card.template.js';

type Query = z.output<typeof idCardsQuerySchema>;

const studentSelect = {
  firstName: true,
  lastName: true,
  admissionNo: true,
  dateOfBirth: true,
  bloodGroup: true,
  photoFileId: true,
  addressLine1: true,
  addressLine2: true,
  city: true,
  guardians: { orderBy: { isPrimary: 'desc' as const }, take: 1, select: { relation: true, guardian: { select: { name: true, phone: true } } } },
};

const fmtDate = (iso: string | null) => (iso ? new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`)) : null);
/** "+919000000005" → "+91 90000 00005" */
const fmtPhone = (p: string) => (/^\+91\d{10}$/.test(p) ? `+91 ${p.slice(3, 8)} ${p.slice(8)}` : p);
const classSection = (cls: string, section: string) => `${cls} - ${section}`;

/** Printable student ID cards (one student, or a whole section on A4 sheets). */
@Injectable()
export class IdCardsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: ScopeService,
    private readonly files: FilesService,
    private readonly settings: SchoolSettingsService,
    private readonly pdf: PdfRenderer,
  ) {}

  async render(query: Query): Promise<{ data: Buffer; fileName: string }> {
    const visible = await this.scope.studentWhere('student.edit');
    let academicYear: string | null;
    let fileName: string;
    let people: { rollNo: number | null; classSection: string | null; student: Prisma.StudentGetPayload<{ select: typeof studentSelect }> }[];

    if (query.sectionId) {
      const section = await this.prisma.db.section.findFirst({
        where: { id: query.sectionId },
        select: { name: true, class: { select: { name: true } }, academicYear: { select: { name: true } } },
      });
      if (!section) throw AppError.notFound('section');
      const rows = await this.prisma.db.studentEnrollment.findMany({
        where: { sectionId: query.sectionId, status: 'ENROLLED', student: { AND: [visible, { status: 'ACTIVE' }] } },
        orderBy: [{ rollNo: { sort: 'asc', nulls: 'last' } }, { student: { firstName: 'asc' } }],
        select: { rollNo: true, student: { select: studentSelect } },
      });
      if (rows.length === 0) throw new AppError('NO_STUDENTS', 422, 'There are no active students in this section.');
      const label = classSection(section.class.name, section.name);
      academicYear = section.academicYear.name;
      fileName = `ID cards - ${label}.pdf`;
      people = rows.map((r) => ({ rollNo: r.rollNo, classSection: label, student: r.student }));
    } else {
      const yearId = await this.scope.currentAcademicYearId();
      const student = await this.oneStudent(query.studentId!, visible, yearId);
      if (!student) throw AppError.notFound('student');
      const enrollment = student.enrollments[0];
      academicYear = yearId ? ((await this.prisma.db.academicYear.findFirst({ where: { id: yearId }, select: { name: true } }))?.name ?? null) : null;
      fileName = `ID card - ${[student.firstName, student.lastName].filter(Boolean).join(' ')}.pdf`;
      people = [{ rollNo: enrollment?.rollNo ?? null, classSection: enrollment ? classSection(enrollment.class.name, enrollment.section.name) : null, student }];
    }

    const school = await this.prisma.db.school.findUniqueOrThrow({
      where: { id: RequestContextStore.school().schoolId },
      select: { name: true, addressLine1: true, city: true, state: true, phone: true, accentColor: true, logoFileId: true },
    });
    const branding = await this.settings.get('branding');
    const students: IdCardStudent[] = await Promise.all(
      people.map(async ({ rollNo, classSection: cs, student: s }) => {
        const g = s.guardians[0];
        return {
          name: [s.firstName, s.lastName].filter(Boolean).join(' '),
          admissionNo: s.admissionNo,
          classSection: cs,
          rollNo,
          dateOfBirth: fmtDate(fromDate(s.dateOfBirth)),
          bloodGroup: s.bloodGroup,
          guardian: g ? { name: g.guardian.name, relation: g.relation, phone: fmtPhone(g.guardian.phone) } : null,
          address: [s.addressLine1, s.addressLine2, s.city].filter(Boolean).join(', ') || null,
          photoDataUri: await this.files.imageDataUri(s.photoFileId),
        };
      }),
    );
    const html = idCardsHtml({
      school: {
        name: school.name,
        address: [school.addressLine1, school.city, school.state].filter(Boolean).join(', ') || null,
        phone: school.phone ? fmtPhone(school.phone) : null,
        accent: school.accentColor,
        logoDataUri: await this.files.imageDataUri(school.logoFileId),
      },
      principal: { signatureDataUri: await this.files.imageDataUri(branding.signatureFileId) },
      academicYear,
      students,
    });
    return { data: await this.pdf.render(html), fileName };
  }

  private oneStudent(id: string, visible: Prisma.StudentWhereInput, yearId: string | null) {
    return this.prisma.db.student.findFirst({
      where: { AND: [{ id }, visible] },
      select: {
        ...studentSelect,
        enrollments: {
          where: { academicYearId: yearId ?? '00000000-0000-0000-0000-000000000000' },
          take: 1,
          select: { rollNo: true, class: { select: { name: true } }, section: { select: { name: true } } },
        },
      },
    });
  }
}
