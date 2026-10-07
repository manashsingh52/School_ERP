import { Controller, Get, Param } from '@nestjs/common';
import type { PublicSchoolBranding } from '@schoolos/contracts';
import { Public } from '../../core/auth/decorators.js';
import { AppError } from '../../core/errors/app-error.js';
import { PlatformPrismaService } from '../../core/prisma/prisma.service.js';

/** Unauthenticated data for login pages. Only non-sensitive branding fields. */
@Controller('public')
export class PublicController {
  constructor(private readonly platform: PlatformPrismaService) {}

  @Get('schools/:slug')
  @Public()
  async school(@Param('slug') slug: string): Promise<{ data: PublicSchoolBranding }> {
    const school = await this.platform.school.findUnique({
      where: { slug: slug.toLowerCase() },
      select: { id: true, slug: true, name: true, accentColor: true, status: true },
    });
    if (!school || school.status === 'ARCHIVED') throw AppError.notFound('school');
    return { data: { ...school, logoUrl: null } };
  }
}
