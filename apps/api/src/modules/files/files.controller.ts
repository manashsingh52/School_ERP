import { Body, Controller, Get, HttpCode, Param, Post, Put, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { createReadStream } from 'node:fs';
import type { z } from 'zod';
import { requestUploadSchema, uuidSchema } from '@schoolos/contracts';
import { Public, SchoolMember } from '../../core/auth/decorators.js';
import { AppError } from '../../core/errors/app-error.js';
import { LocalStorageDriver } from '../../core/storage/local.driver.js';
import { StorageDriver, contentDisposition } from '../../core/storage/storage.js';
import { ZodPipe } from '../../core/validation/zod.pipe.js';
import { FilesService } from './files.service.js';

const idPipe = new ZodPipe(uuidSchema);

@Controller('files')
export class FilesController {
  constructor(private readonly files: FilesService) {}

  @Post('upload-url')
  @HttpCode(200)
  @SchoolMember() // permission depends on the purpose; checked in FilesService
  async requestUpload(@Body(new ZodPipe(requestUploadSchema)) body: z.output<typeof requestUploadSchema>) {
    return { data: await this.files.requestUpload(body) };
  }

  @Post(':id/complete')
  @HttpCode(200)
  @SchoolMember()
  async complete(@Param('id', idPipe) id: string) {
    return { data: await this.files.complete(id) };
  }

  @Get(':id/download-url')
  @SchoolMember()
  async download(@Param('id', idPipe) id: string) {
    return { data: await this.files.downloadLink(id) };
  }
}

/**
 * Development-only stand-in for signed cloud-storage URLs. The token in the URL is HMAC-signed
 * and carries the key, action, expiry and size cap. Returns 404 when another driver is active.
 */
@Controller('files/local')
export class LocalStorageController {
  constructor(private readonly storage: StorageDriver) {}

  private local(): LocalStorageDriver {
    if (!(this.storage instanceof LocalStorageDriver)) throw AppError.notFound('file');
    return this.storage;
  }

  @Put(':token')
  @HttpCode(200)
  @Public() // authorised by the signed token
  async upload(@Param('token') token: string, @Req() req: Request) {
    const local = this.local();
    const claims = local.verify(token, 'put');
    const body = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    if (claims.max !== undefined && body.length > claims.max) {
      throw new AppError('PAYLOAD_TOO_LARGE', 413, 'This file is too large.');
    }
    if ((req.header('content-type') ?? '') !== claims.ct) {
      throw new AppError('BAD_REQUEST', 400, 'The upload content type does not match.');
    }
    await local.write(claims.k, body);
    return { data: { ok: true } };
  }

  @Get(':token')
  @Public() // authorised by the signed token
  download(@Param('token') token: string, @Res() res: Response) {
    const local = this.local();
    const claims = local.verify(token, 'get');
    res.setHeader('content-type', claims.ct);
    res.setHeader('content-disposition', contentDisposition(claims.fn ?? 'file', claims.in));
    res.setHeader('cache-control', 'private, no-store');
    res.setHeader('x-content-type-options', 'nosniff');
    createReadStream(local.path(claims.k))
      .on('error', () => res.status(404).end())
      .pipe(res);
  }
}
