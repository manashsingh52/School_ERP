import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Query } from '@nestjs/common';
import type { z } from 'zod';
import {
  concessionTypeSchema,
  decideConcessionSchema,
  feeHeadSchema,
  feeStructureSchema,
  listConcessionsQuerySchema,
  requestConcessionSchema,
  studentFeeOptionsSchema,
  uuidSchema,
} from '@schoolos/contracts';
import { RequirePermission } from '../../core/auth/decorators.js';
import { ZodPipe } from '../../core/validation/zod.pipe.js';
import { FeesService } from './fees.service.js';

const id = new ZodPipe(uuidSchema);
type Out<T extends z.ZodType> = z.output<T>;

@Controller()
export class FeesController {
  constructor(private readonly fees: FeesService) {}

  @Get('fee-heads')
  @RequirePermission('fee.view')
  async heads() {
    return { data: await this.fees.listHeads() };
  }

  @Post('fee-heads')
  @RequirePermission('fee.manage')
  async createHead(@Body(new ZodPipe(feeHeadSchema)) body: Out<typeof feeHeadSchema>) {
    return { data: await this.fees.saveHead(null, body) };
  }

  @Patch('fee-heads/:id')
  @RequirePermission('fee.manage')
  async updateHead(@Param('id', id) headId: string, @Body(new ZodPipe(feeHeadSchema)) body: Out<typeof feeHeadSchema>) {
    return { data: await this.fees.saveHead(headId, body) };
  }

  @Get('fee-structures')
  @RequirePermission('fee.view')
  async structures() {
    return { data: await this.fees.listStructures() };
  }

  @Post('fee-structures')
  @RequirePermission('fee.manage')
  async createStructure(@Body(new ZodPipe(feeStructureSchema)) body: Out<typeof feeStructureSchema>) {
    return { data: await this.fees.saveStructure(null, body) };
  }

  @Get('fee-structures/:id')
  @RequirePermission('fee.view')
  async structure(@Param('id', id) structureId: string) {
    return { data: await this.fees.getStructure(structureId) };
  }

  @Put('fee-structures/:id')
  @RequirePermission('fee.manage')
  async updateStructure(@Param('id', id) structureId: string, @Body(new ZodPipe(feeStructureSchema)) body: Out<typeof feeStructureSchema>) {
    return { data: await this.fees.saveStructure(structureId, body) };
  }

  @Post('fee-structures/:id/publish')
  @HttpCode(200)
  @RequirePermission('fee.manage')
  async publish(@Param('id', id) structureId: string) {
    return { data: await this.fees.publishStructure(structureId) };
  }

  @Delete('fee-structures/:id')
  @HttpCode(200)
  @RequirePermission('fee.manage')
  async archive(@Param('id', id) structureId: string) {
    await this.fees.archiveStructure(structureId);
    return { data: { ok: true } };
  }

  @Get('concession-types')
  @RequirePermission('fee.view')
  async concessionTypes() {
    return { data: await this.fees.listConcessionTypes() };
  }

  @Post('concession-types')
  @RequirePermission('fee.manage')
  async createConcessionType(@Body(new ZodPipe(concessionTypeSchema)) body: Out<typeof concessionTypeSchema>) {
    return { data: await this.fees.saveConcessionType(null, body) };
  }

  @Patch('concession-types/:id')
  @RequirePermission('fee.manage')
  async updateConcessionType(@Param('id', id) typeId: string, @Body(new ZodPipe(concessionTypeSchema)) body: Out<typeof concessionTypeSchema>) {
    return { data: await this.fees.saveConcessionType(typeId, body) };
  }

  @Get('concessions')
  @RequirePermission('concession.request')
  async concessions(@Query(new ZodPipe(listConcessionsQuerySchema)) query: Out<typeof listConcessionsQuerySchema>) {
    return { data: await this.fees.listConcessions(query) };
  }

  @Post('concessions')
  @RequirePermission('concession.request')
  async requestConcession(@Body(new ZodPipe(requestConcessionSchema)) body: Out<typeof requestConcessionSchema>) {
    return { data: await this.fees.requestConcession(body) };
  }

  @Post('concessions/:id/decision')
  @HttpCode(200)
  @RequirePermission('concession.approve')
  async decide(@Param('id', id) concessionId: string, @Body(new ZodPipe(decideConcessionSchema)) body: Out<typeof decideConcessionSchema>) {
    return { data: await this.fees.decideConcession(concessionId, body) };
  }

  @Get('students/:id/fee-options')
  @RequirePermission('fee.assign')
  async options(@Param('id', id) studentId: string) {
    return { data: await this.fees.getOptions(studentId) };
  }

  @Put('students/:id/fee-options')
  @RequirePermission('fee.assign')
  async setOptions(@Param('id', id) studentId: string, @Body(new ZodPipe(studentFeeOptionsSchema)) body: Out<typeof studentFeeOptionsSchema>) {
    return { data: await this.fees.setOptions(studentId, body.optedOptionalItemIds) };
  }
}
