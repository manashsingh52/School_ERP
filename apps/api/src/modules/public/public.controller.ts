import { Controller, Get, Inject, Param } from '@nestjs/common';
import type { PublicSchoolBranding } from '@schoolos/contracts';
import { ENV, type Env } from '../../config/env.js';
import { Public } from '../../core/auth/decorators.js';
import { AppError } from '../../core/errors/app-error.js';
import { PlatformPrismaService } from '../../core/prisma/prisma.service.js';
import { StorageDriver } from '../../core/storage/storage.js';

/** Unauthenticated data for login pages. Only non-sensitive branding fields. */
@Controller('public')
export class PublicController {
  constructor(
    private readonly platform: PlatformPrismaService,
    private readonly storage: StorageDriver,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Get('schools/:slug')
  @Public()
  async school(@Param('slug') slug: string): Promise<{ data: PublicSchoolBranding }> {
    const school = await this.platform.school.findUnique({
      where: { slug: slug.toLowerCase() },
      select: { id: true, slug: true, name: true, accentColor: true, status: true, logoFileId: true },
    });
    if (!school || school.status === 'ARCHIVED') throw AppError.notFound('school');
    const { logoFileId, ...rest } = school;
    const logo = logoFileId
      ? await this.platform.file.findFirst({ where: { id: logoFileId, schoolId: school.id, status: 'READY' } })
      : null;
    const logoUrl = logo
      ? await this.storage.downloadUrl({ key: logo.objectKey, fileName: logo.originalName, contentType: logo.mimeType, expiresInSec: 24 * 3600, inline: true })
      : null;
    return { data: { ...rest, logoUrl, otpLogin: this.env.OTP_PROVIDER !== 'none' } };
  }
}
