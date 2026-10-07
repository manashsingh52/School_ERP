import { Body, Controller, Get, HttpCode, Patch, Post, Put } from '@nestjs/common';
import type { z } from 'zod';
import {
  promotionCommitSchema,
  promotionPreviewSchema,
  setOnboardingStepSchema,
  updateBrandingSchema,
  updateSchoolProfileSchema,
} from '@schoolos/contracts';
import { RequirePermission, SchoolMember } from '../../core/auth/decorators.js';
import { Idempotent } from '../../core/idempotency/idempotency.js';
import { ZodPipe } from '../../core/validation/zod.pipe.js';
import { SchoolService } from './school.service.js';

@Controller('school')
export class SchoolController {
  constructor(private readonly school: SchoolService) {}

  @Get()
  @SchoolMember() // every member may see their school's name, logo and contact details
  async profile() {
    return { data: await this.school.profile() };
  }

  @Patch()
  @RequirePermission('school.settings.manage')
  async update(@Body(new ZodPipe(updateSchoolProfileSchema)) body: z.output<typeof updateSchoolProfileSchema>) {
    return { data: await this.school.updateProfile(body) };
  }

  @Patch('branding')
  @RequirePermission('school.branding.manage')
  async branding(@Body(new ZodPipe(updateBrandingSchema)) body: z.output<typeof updateBrandingSchema>) {
    return { data: await this.school.updateBranding(body) };
  }
}

@Controller('onboarding')
export class OnboardingController {
  constructor(private readonly school: SchoolService) {}

  @Get()
  @RequirePermission('school.settings.view')
  async state() {
    return { data: await this.school.onboarding() };
  }

  @Put('step')
  @RequirePermission('school.settings.manage')
  async step(@Body(new ZodPipe(setOnboardingStepSchema)) body: z.output<typeof setOnboardingStepSchema>) {
    return { data: await this.school.setOnboardingStep(body.step) };
  }

  @Post('go-live')
  @HttpCode(200)
  @RequirePermission('school.settings.manage')
  async goLive() {
    return { data: await this.school.goLive() };
  }
}

@Controller('promotions')
export class PromotionsController {
  constructor(private readonly school: SchoolService) {}

  @Post('preview')
  @HttpCode(200)
  @RequirePermission('student.promote')
  async preview(@Body(new ZodPipe(promotionPreviewSchema)) body: z.output<typeof promotionPreviewSchema>) {
    return { data: await this.school.promotionPreview(body.fromYearId, body.toYearId) };
  }

  @Post('commit')
  @HttpCode(200)
  @RequirePermission('student.promote')
  @Idempotent({ required: true })
  async commit(@Body(new ZodPipe(promotionCommitSchema)) body: z.output<typeof promotionCommitSchema>) {
    return { data: await this.school.promote(body) };
  }
}
