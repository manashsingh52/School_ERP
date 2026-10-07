import { Controller, Get, Injectable, Query } from '@nestjs/common';
import type { z } from 'zod';
import { searchQuerySchema, type SearchResults } from '@schoolos/contracts';
import { SchoolMember } from '../../core/auth/decorators.js';
import { RequestContextStore } from '../../core/context/request-context.js';
import { fullName } from '../../core/util/dates.js';
import { ZodPipe } from '../../core/validation/zod.pipe.js';
import { GuardiansService } from '../guardians/guardians.service.js';
import { StudentsService } from '../students/students.service.js';
import { TeachersService } from '../teachers/teachers.service.js';

const TAKE = 5;

/** ⌘K search (docs/06 §2). Each section only appears if the member may see it, at their scope. */
@Injectable()
export class SearchService {
  constructor(
    private readonly students: StudentsService,
    private readonly teachers: TeachersService,
    private readonly guardians: GuardiansService,
  ) {}

  async search(q: string): Promise<SearchResults> {
    const perms = RequestContextStore.tenant().permissions;
    const page = { q, page: 1, pageSize: TAKE };
    const staff = (scope: string | undefined) => scope === 'ALL' || scope === 'ASSIGNED';
    const [students, teachers, guardians] = await Promise.all([
      perms['student.view'] ? this.students.list(page) : null,
      staff(perms['teacher.view']) ? this.teachers.list(page) : null,
      staff(perms['guardian.view']) ? this.guardians.list(page) : null,
    ]);
    return {
      students: (students?.data ?? []).map((s) => ({
        id: s.id,
        name: fullName(s.firstName, s.lastName),
        admissionNo: s.admissionNo,
        className: s.className,
        sectionName: s.sectionName,
      })),
      teachers: (teachers?.data ?? []).map((t) => ({
        id: t.id,
        name: fullName(t.firstName, t.lastName),
        employeeId: t.employeeId,
        department: t.department,
      })),
      guardians: (guardians?.data ?? []).map((g) => ({
        id: g.id,
        name: g.name,
        phone: perms['student.contact.view'] ? g.phone : null,
        childCount: g.children.length,
      })),
    };
  }
}

@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get()
  @SchoolMember() // each result type is filtered by its own permission inside SearchService
  async search(@Query(new ZodPipe(searchQuerySchema)) query: z.output<typeof searchQuerySchema>) {
    return { data: await this.searchService.search(query.q) };
  }
}
