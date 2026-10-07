import { Body, Controller, Get, HttpCode, Param, Post, Put, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import type { z } from 'zod';
import {
  createImportSchema,
  importEntitySchema,
  listImportRowsQuerySchema,
  setImportMappingSchema,
  uuidSchema,
  type ImportEntity,
} from '@schoolos/contracts';
import { RequirePermission } from '../../core/auth/decorators.js';
import { Idempotent } from '../../core/idempotency/idempotency.js';
import { contentDisposition } from '../../core/storage/storage.js';
import { ZodPipe } from '../../core/validation/zod.pipe.js';
import { ImportsService } from './imports.service.js';

const id = new ZodPipe(uuidSchema);
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

@Controller('imports')
export class ImportsController {
  constructor(private readonly imports: ImportsService) {}

  @Get('templates/:entity')
  @RequirePermission('import.run')
  async template(@Param('entity', new ZodPipe(importEntitySchema)) entity: ImportEntity, @Res() res: Response) {
    const buffer = await this.imports.template(entity);
    res.setHeader('content-type', XLSX);
    res.setHeader('content-disposition', contentDisposition(`${entity.toLowerCase()}-template.xlsx`));
    res.send(buffer);
  }

  @Get()
  @RequirePermission('import.run')
  async list() {
    return { data: await this.imports.list() };
  }

  @Post()
  @RequirePermission('import.run')
  async create(@Body(new ZodPipe(createImportSchema)) body: z.output<typeof createImportSchema>) {
    return { data: await this.imports.create(body) };
  }

  @Get(':id')
  @RequirePermission('import.run')
  async get(@Param('id', id) importId: string) {
    return { data: await this.imports.get(importId) };
  }

  @Put(':id/mapping')
  @RequirePermission('import.run')
  async validate(@Param('id', id) importId: string, @Body(new ZodPipe(setImportMappingSchema)) body: z.output<typeof setImportMappingSchema>) {
    return { data: await this.imports.validate(importId, body) };
  }

  @Get(':id/rows')
  @RequirePermission('import.run')
  rows(@Param('id', id) importId: string, @Query(new ZodPipe(listImportRowsQuerySchema)) query: z.output<typeof listImportRowsQuerySchema>) {
    return this.imports.rows(importId, query);
  }

  @Post(':id/commit')
  @HttpCode(200)
  @RequirePermission('import.run')
  @Idempotent({ required: false })
  async commit(@Param('id', id) importId: string) {
    return { data: await this.imports.commit(importId) };
  }

  @Get(':id/problems')
  @RequirePermission('import.run')
  async problems(@Param('id', id) importId: string, @Res() res: Response) {
    const { fileName, csv } = await this.imports.problemsCsv(importId);
    res.setHeader('content-type', 'text/csv; charset=utf-8');
    res.setHeader('content-disposition', contentDisposition(fileName));
    res.send(`\uFEFF${csv}`); // BOM so Excel opens UTF-8 correctly
  }
}
