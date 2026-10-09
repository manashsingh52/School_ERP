import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Query } from '@nestjs/common';
import type { z } from 'zod';
import { createHomeworkSchema, homeworkSeenSchema, listHomeworkQuerySchema, publishHomeworkSchema, saveSubmissionsSchema, updateHomeworkSchema, uuidSchema } from '@schoolos/contracts';
import { RequirePermission } from '../../core/auth/decorators.js';
import { ZodPipe } from '../../core/validation/zod.pipe.js';
import { HomeworkService } from './homework.service.js';

const id = new ZodPipe(uuidSchema);
type Out<T extends z.ZodType> = z.output<T>;

@Controller('homework')
export class HomeworkController {
  constructor(private readonly homework: HomeworkService) {}

  @Get()
  @RequirePermission('homework.view')
  list(@Query(new ZodPipe(listHomeworkQuerySchema)) query: Out<typeof listHomeworkQuerySchema>) {
    return this.homework.list(query);
  }

  @Post()
  @RequirePermission('homework.manage')
  async create(@Body(new ZodPipe(createHomeworkSchema)) body: Out<typeof createHomeworkSchema>) {
    return { data: await this.homework.create(body) };
  }

  @Get('targets')
  @RequirePermission('homework.manage')
  async targets() {
    return { data: await this.homework.targets() };
  }

  @Get(':id')
  @RequirePermission('homework.view')
  async get(@Param('id', id) homeworkId: string) {
    return { data: await this.homework.get(homeworkId) };
  }

  @Patch(':id')
  @RequirePermission('homework.manage')
  async update(@Param('id', id) homeworkId: string, @Body(new ZodPipe(updateHomeworkSchema)) body: Out<typeof updateHomeworkSchema>) {
    return { data: await this.homework.update(homeworkId, body) };
  }

  @Post(':id/publish')
  @HttpCode(200)
  @RequirePermission('homework.manage')
  async publish(@Param('id', id) homeworkId: string, @Body(new ZodPipe(publishHomeworkSchema)) body: Out<typeof publishHomeworkSchema>) {
    return { data: await this.homework.publish(homeworkId, body.publishAt) };
  }

  @Delete(':id')
  @HttpCode(200)
  @RequirePermission('homework.manage')
  async remove(@Param('id', id) homeworkId: string) {
    await this.homework.remove(homeworkId);
    return { data: { ok: true } };
  }

  @Get(':id/submissions')
  @RequirePermission('homework.manage')
  async submissions(@Param('id', id) homeworkId: string) {
    return { data: await this.homework.submissions(homeworkId) };
  }

  @Put(':id/submissions')
  @RequirePermission('homework.manage')
  async saveSubmissions(@Param('id', id) homeworkId: string, @Body(new ZodPipe(saveSubmissionsSchema)) body: Out<typeof saveSubmissionsSchema>) {
    return { data: await this.homework.saveSubmissions(homeworkId, body) };
  }

  @Post(':id/seen')
  @HttpCode(200)
  @RequirePermission('homework.view')
  async seen(@Param('id', id) homeworkId: string, @Body(new ZodPipe(homeworkSeenSchema)) body: Out<typeof homeworkSeenSchema>) {
    await this.homework.markSeen(homeworkId, body.studentId);
    return { data: { ok: true } };
  }

  @Get(':id/attachments/:fileId')
  @RequirePermission('homework.view')
  async attachment(@Param('id', id) homeworkId: string, @Param('fileId', id) fileId: string) {
    return { data: await this.homework.attachmentLink(homeworkId, fileId) };
  }
}
