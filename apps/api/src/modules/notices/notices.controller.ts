import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import type { z } from 'zod';
import { createNoticeSchema, listNoticesQuerySchema, publishNoticeSchema, updateNoticeSchema, uuidSchema } from '@schoolos/contracts';
import { RequirePermission } from '../../core/auth/decorators.js';
import { ZodPipe } from '../../core/validation/zod.pipe.js';
import { NoticesService } from './notices.service.js';

const id = new ZodPipe(uuidSchema);
type Out<T extends z.ZodType> = z.output<T>;

@Controller('notices')
export class NoticesController {
  constructor(private readonly notices: NoticesService) {}

  @Get()
  @RequirePermission('notice.view')
  list(@Query(new ZodPipe(listNoticesQuerySchema)) query: Out<typeof listNoticesQuerySchema>) {
    return this.notices.list(query);
  }

  @Post()
  @RequirePermission('notice.create')
  async create(@Body(new ZodPipe(createNoticeSchema)) body: Out<typeof createNoticeSchema>) {
    return { data: await this.notices.create(body) };
  }

  @Get('audience-options')
  @RequirePermission('notice.create')
  async audienceOptions() {
    return { data: await this.notices.audienceOptions() };
  }

  @Get(':id')
  @RequirePermission('notice.view')
  async get(@Param('id', id) noticeId: string) {
    return { data: await this.notices.get(noticeId) };
  }

  @Patch(':id')
  @RequirePermission('notice.create')
  async update(@Param('id', id) noticeId: string, @Body(new ZodPipe(updateNoticeSchema)) body: Out<typeof updateNoticeSchema>) {
    return { data: await this.notices.update(noticeId, body) };
  }

  @Post(':id/publish')
  @HttpCode(200)
  @RequirePermission('notice.create')
  async publish(@Param('id', id) noticeId: string, @Body(new ZodPipe(publishNoticeSchema)) body: Out<typeof publishNoticeSchema>) {
    return { data: await this.notices.publish(noticeId, body.publishAt) };
  }

  @Delete(':id')
  @HttpCode(200)
  @RequirePermission('notice.create')
  async remove(@Param('id', id) noticeId: string) {
    await this.notices.remove(noticeId);
    return { data: { ok: true } };
  }

  @Post(':id/read')
  @HttpCode(200)
  @RequirePermission('notice.view')
  async read(@Param('id', id) noticeId: string) {
    await this.notices.markRead(noticeId);
    return { data: { ok: true } };
  }

  @Get(':id/stats')
  @RequirePermission('notice.create')
  async stats(@Param('id', id) noticeId: string) {
    return { data: await this.notices.stats(noticeId) };
  }

  @Get(':id/attachments/:fileId')
  @RequirePermission('notice.view')
  async attachment(@Param('id', id) noticeId: string, @Param('fileId', id) fileId: string) {
    return { data: await this.notices.attachmentLink(noticeId, fileId) };
  }
}
