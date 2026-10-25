import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import type { z } from 'zod';
import { issueCertificatesSchema, listCertificatesQuerySchema, uuidSchema } from '@schoolos/contracts';
import { RequirePermission } from '../../core/auth/decorators.js';
import { ZodPipe } from '../../core/validation/zod.pipe.js';
import { CertificatesService } from './certificates.service.js';

const id = new ZodPipe(uuidSchema);
type Out<T extends z.ZodType> = z.output<T>;

@Controller('certificates')
export class CertificatesController {
  constructor(private readonly certificates: CertificatesService) {}

  @Get()
  @RequirePermission('certificate.view')
  list(@Query(new ZodPipe(listCertificatesQuerySchema)) query: Out<typeof listCertificatesQuerySchema>) {
    return this.certificates.list(query);
  }

  @Post()
  @RequirePermission('certificate.issue')
  async issue(@Body(new ZodPipe(issueCertificatesSchema)) body: Out<typeof issueCertificatesSchema>) {
    return { data: await this.certificates.issue(body) };
  }

  @Get(':id/download')
  @RequirePermission('certificate.view')
  async download(@Param('id', id) certificateId: string) {
    return { data: await this.certificates.download(certificateId) };
  }

  @Delete(':id')
  @HttpCode(200)
  @RequirePermission('certificate.issue')
  async remove(@Param('id', id) certificateId: string) {
    await this.certificates.remove(certificateId);
    return { data: { ok: true } };
  }
}
