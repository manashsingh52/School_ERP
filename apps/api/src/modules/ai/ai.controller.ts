import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import type { z } from 'zod';
import { askSchema, worksheetSchema } from '@schoolos/contracts';
import { RequirePermission } from '../../core/auth/decorators.js';
import { RateLimit } from '../../core/rate-limit/rate-limit.js';
import { ZodPipe } from '../../core/validation/zod.pipe.js';
import { AiService } from './ai.service.js';

type Out<T extends z.ZodType> = z.output<T>;

@Controller('ai')
export class AiController {
  constructor(private readonly ai: AiService) {}

  @Get('status')
  @RequirePermission('ai.use')
  async status() {
    return { data: await this.ai.status() };
  }

  @Post('ask')
  @HttpCode(200)
  @RequirePermission('ai.use')
  @RateLimit({ name: 'ai-ask', limit: 20, windowSeconds: 60, by: 'user' })
  async ask(@Body(new ZodPipe(askSchema)) body: Out<typeof askSchema>) {
    return { data: await this.ai.ask(body) };
  }

  @Post('worksheet')
  @HttpCode(200)
  @RequirePermission('ai.use')
  @RateLimit({ name: 'ai-worksheet', limit: 10, windowSeconds: 60, by: 'user' })
  async worksheet(@Body(new ZodPipe(worksheetSchema)) body: Out<typeof worksheetSchema>) {
    return { data: await this.ai.worksheet(body) };
  }
}
