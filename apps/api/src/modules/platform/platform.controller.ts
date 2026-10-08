import { Body, Controller, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common';
import type { z } from 'zod';
import {
  featureFlagSchema,
  listSchoolsQuerySchema,
  planSchema,
  platformAuditQuerySchema,
  provisionSchoolSchema,
  requestSupportAccessSchema,
  retryJobSchema,
  schoolFeatureSchema,
  schoolStatusSchema,
  subscriptionSchema,
  supportGrantsQuerySchema,
  userLookupQuerySchema,
  uuidSchema,
} from '@schoolos/contracts';
import { RequirePermission, RequirePlatform, SchoolMember } from '../../core/auth/decorators.js';
import { EntitlementsService } from '../../core/entitlements/entitlements.service.js';
import { RequestContextStore } from '../../core/context/request-context.js';
import { ZodPipe } from '../../core/validation/zod.pipe.js';
import { PlatformService } from './platform.service.js';
import { SupportAccessService } from './support-access.service.js';

const id = new ZodPipe(uuidSchema);
type Out<T extends z.ZodType> = z.output<T>;

/** Super-admin console API (admin.<domain>). Platform roles only — never a school permission. */
@Controller('platform')
export class PlatformController {
  constructor(
    private readonly platform: PlatformService,
    private readonly support: SupportAccessService,
  ) {}

  @Get('dashboard')
  @RequirePlatform('platform.dashboard.view')
  async dashboard() {
    return { data: await this.platform.dashboard() };
  }

  @Get('schools')
  @RequirePlatform('platform.dashboard.view')
  async schools(@Query(new ZodPipe(listSchoolsQuerySchema)) q: Out<typeof listSchoolsQuerySchema>) {
    return { data: await this.platform.listSchools(q) };
  }

  @Post('schools')
  @RequirePlatform('platform.schools.manage')
  async provision(@Body(new ZodPipe(provisionSchoolSchema)) body: Out<typeof provisionSchoolSchema>) {
    return { data: await this.platform.provision(body) };
  }

  @Get('schools/:id')
  @RequirePlatform('platform.dashboard.view')
  async school(@Param('id', id) schoolId: string) {
    return { data: await this.platform.school(schoolId) };
  }

  @Put('schools/:id/status')
  @RequirePlatform('platform.schools.manage')
  async status(@Param('id', id) schoolId: string, @Body(new ZodPipe(schoolStatusSchema)) body: Out<typeof schoolStatusSchema>) {
    return { data: await this.platform.setStatus(schoolId, body.status, body.reason) };
  }

  @Put('schools/:id/subscription')
  @RequirePlatform('platform.subscriptions.manage')
  async subscription(@Param('id', id) schoolId: string, @Body(new ZodPipe(subscriptionSchema)) body: Out<typeof subscriptionSchema>) {
    return { data: await this.platform.setSubscription(schoolId, body) };
  }

  @Put('schools/:id/features/:key')
  @RequirePlatform('platform.flags.manage')
  async schoolFeature(@Param('id', id) schoolId: string, @Param('key') key: string, @Body(new ZodPipe(schoolFeatureSchema)) body: Out<typeof schoolFeatureSchema>) {
    return { data: await this.platform.setSchoolFeature(schoolId, key, body.enabled) };
  }

  @Get('plans')
  @RequirePlatform('platform.dashboard.view')
  async plans() {
    return { data: await this.platform.plans() };
  }

  @Post('plans')
  @RequirePlatform('platform.subscriptions.manage')
  async createPlan(@Body(new ZodPipe(planSchema)) body: Out<typeof planSchema>) {
    return { data: await this.platform.savePlan(null, body) };
  }

  @Put('plans/:id')
  @RequirePlatform('platform.subscriptions.manage')
  async updatePlan(@Param('id', id) planId: string, @Body(new ZodPipe(planSchema)) body: Out<typeof planSchema>) {
    return { data: await this.platform.savePlan(planId, body) };
  }

  @Get('flags')
  @RequirePlatform('platform.dashboard.view')
  async flags() {
    return { data: await this.platform.flags() };
  }

  @Put('flags')
  @RequirePlatform('platform.flags.manage')
  async saveFlag(@Body(new ZodPipe(featureFlagSchema)) body: Out<typeof featureFlagSchema>) {
    return { data: await this.platform.saveFlag(body) };
  }

  @Get('users')
  @RequirePlatform('platform.schools.manage')
  async users(@Query(new ZodPipe(userLookupQuerySchema)) q: Out<typeof userLookupQuerySchema>) {
    return { data: await this.platform.users(q.q) };
  }

  @Get('audit')
  @RequirePlatform('platform.audit.view')
  auditLog(@Query(new ZodPipe(platformAuditQuerySchema)) q: Out<typeof platformAuditQuerySchema>) {
    return this.platform.auditLog(q);
  }

  @Get('system')
  @RequirePlatform('platform.system.view')
  async system() {
    return { data: await this.platform.system() };
  }

  @Post('system/retry')
  @HttpCode(200)
  @RequirePlatform('platform.schools.manage')
  async retry(@Body(new ZodPipe(retryJobSchema)) body: Out<typeof retryJobSchema>) {
    return { data: await this.platform.retryJob(body.queue, body.jobId) };
  }

  @Get('support-access')
  @RequirePlatform('platform.support_access.request')
  async grants(@Query(new ZodPipe(supportGrantsQuerySchema)) q: Out<typeof supportGrantsQuerySchema>) {
    return { data: await this.support.mine(q.all === 'true') };
  }

  @Post('support-access')
  @RequirePlatform('platform.support_access.request')
  async requestAccess(@Body(new ZodPipe(requestSupportAccessSchema)) body: Out<typeof requestSupportAccessSchema>) {
    return { data: await this.support.request(body) };
  }
}

/** The school's side: its plan and usage, its features, and support access requests. */
@Controller('school')
export class SchoolPlanController {
  constructor(
    private readonly entitlements: EntitlementsService,
    private readonly support: SupportAccessService,
  ) {}

  @Get('subscription')
  @RequirePermission('billing.view')
  async subscription() {
    return { data: await this.entitlements.entitlements(RequestContextStore.school().schoolId) };
  }

  @Get('features')
  @SchoolMember()
  async features() {
    const all = await this.entitlements.features(RequestContextStore.school().schoolId);
    return { data: all.filter((f) => f.enabled).map((f) => f.key) };
  }

  @Get('support-access')
  @RequirePermission('user.manage')
  async grants() {
    return { data: await this.support.list() };
  }

  @Post('support-access/:id/approve')
  @HttpCode(200)
  @RequirePermission('user.manage')
  async approve(@Param('id', id) grantId: string) {
    return { data: await this.support.approve(grantId) };
  }

  @Post('support-access/:id/revoke')
  @HttpCode(200)
  @RequirePermission('user.manage')
  async revoke(@Param('id', id) grantId: string) {
    return { data: await this.support.revoke(grantId) };
  }
}
