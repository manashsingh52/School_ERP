import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import type { z } from 'zod';
import { createDocumentSchema, listDocumentsQuerySchema, updateDocumentSchema, uuidSchema } from '@schoolos/contracts';
import { RequirePermission } from '../../core/auth/decorators.js';
import { ZodPipe } from '../../core/validation/zod.pipe.js';
import { DocumentsService } from './documents.service.js';

const id = new ZodPipe(uuidSchema);
type Out<T extends z.ZodType> = z.output<T>;

@Controller('documents')
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Get()
  @RequirePermission('document.view')
  async list(@Query(new ZodPipe(listDocumentsQuerySchema)) q: Out<typeof listDocumentsQuerySchema>) {
    return { data: await this.documents.list(q) };
  }

  @Post()
  @RequirePermission('document.manage')
  async create(@Body(new ZodPipe(createDocumentSchema)) body: Out<typeof createDocumentSchema>) {
    return { data: await this.documents.create(body) };
  }

  @Patch(':id')
  @RequirePermission('document.manage')
  async update(@Param('id', id) docId: string, @Body(new ZodPipe(updateDocumentSchema)) body: Out<typeof updateDocumentSchema>) {
    return { data: await this.documents.update(docId, body) };
  }

  @Delete(':id')
  @HttpCode(200)
  @RequirePermission('document.manage')
  async remove(@Param('id', id) docId: string) {
    await this.documents.remove(docId);
    return { data: { ok: true } };
  }

  @Get(':id/download')
  @RequirePermission('document.view')
  async download(@Param('id', id) docId: string) {
    return { data: await this.documents.download(docId) };
  }
}
