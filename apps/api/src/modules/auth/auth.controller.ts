import { Body, Controller, HttpCode, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import type { z } from 'zod';
import {
  loginRequestSchema,
  otpSendRequestSchema,
  otpVerifyRequestSchema,
  passwordResetRequestSchema,
  refreshRequestSchema,
  schoolCodeRedeemSchema,
  selectSchoolRequestSchema,
} from '@schoolos/contracts';
import { Authenticated, Public } from '../../core/auth/decorators.js';
import { RequestContextStore } from '../../core/context/request-context.js';
import { RateLimit } from '../../core/rate-limit/rate-limit.js';
import { ZodPipe } from '../../core/validation/zod.pipe.js';
import { AuthService } from './auth.service.js';
import type { DeviceInfo } from './session.service.js';

const device = (req: Request, body: { platform: DeviceInfo['platform']; deviceName?: string }): DeviceInfo => ({
  platform: body.platform,
  deviceName: body.deviceName,
  ip: RequestContextStore.get()?.ip ?? req.ip,
  userAgent: req.header('user-agent')?.slice(0, 300),
});

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login')
  @HttpCode(200)
  @Public()
  @RateLimit(
    { name: 'login-id', limit: 5, windowSeconds: 60, by: 'ip+body.identifier' },
    { name: 'login-ip', limit: 20, windowSeconds: 60, by: 'ip' },
  )
  login(@Req() req: Request, @Body(new ZodPipe(loginRequestSchema)) body: z.output<typeof loginRequestSchema>) {
    return this.auth.loginWithPassword(body.identifier, body.password, body.schoolSlug, device(req, body));
  }

  @Post('otp/send')
  @HttpCode(200)
  @Public()
  @RateLimit({ name: 'otp-send-ip', limit: 30, windowSeconds: 3600, by: 'ip' })
  sendOtp(@Req() req: Request, @Body(new ZodPipe(otpSendRequestSchema)) body: z.output<typeof otpSendRequestSchema>) {
    return this.auth.sendOtp(body.phone, body.purpose, RequestContextStore.get()?.ip ?? req.ip);
  }

  @Post('otp/verify')
  @HttpCode(200)
  @Public()
  @RateLimit({ name: 'otp-verify-ip', limit: 20, windowSeconds: 60, by: 'ip' })
  verifyOtp(
    @Req() req: Request,
    @Body(new ZodPipe(otpVerifyRequestSchema)) body: z.output<typeof otpVerifyRequestSchema>,
  ) {
    return this.auth.loginWithOtp(body.challengeId, body.code, body.schoolSlug, device(req, body));
  }

  @Post('code/redeem')
  @HttpCode(200)
  @Public()
  @RateLimit(
    { name: 'code-redeem-id', limit: 5, windowSeconds: 300, by: 'ip+body.identifier' },
    { name: 'code-redeem-ip', limit: 20, windowSeconds: 60, by: 'ip' },
  )
  redeemCode(@Req() req: Request, @Body(new ZodPipe(schoolCodeRedeemSchema)) body: z.output<typeof schoolCodeRedeemSchema>) {
    return this.auth.redeemOfficeCode(body.identifier, body.code, body.newPassword, body.schoolSlug, device(req, body));
  }

  @Post('password/reset')
  @HttpCode(200)
  @Public()
  @RateLimit({ name: 'reset-ip', limit: 10, windowSeconds: 600, by: 'ip' })
  async resetPassword(@Body(new ZodPipe(passwordResetRequestSchema)) body: z.output<typeof passwordResetRequestSchema>) {
    await this.auth.resetPassword(body.challengeId, body.code, body.newPassword);
    return { data: { ok: true } };
  }

  @Post('refresh')
  @HttpCode(200)
  @Public()
  @RateLimit({ name: 'refresh-ip', limit: 120, windowSeconds: 60, by: 'ip' })
  async refresh(@Req() req: Request, @Body(new ZodPipe(refreshRequestSchema)) body: z.output<typeof refreshRequestSchema>) {
    return { tokens: await this.auth.refresh(body.refreshToken, RequestContextStore.get()?.ip ?? req.ip) };
  }

  @Post('select-school')
  @HttpCode(200)
  @Authenticated()
  selectSchool(@Body(new ZodPipe(selectSchoolRequestSchema)) body: z.output<typeof selectSchoolRequestSchema>) {
    const ctx = RequestContextStore.get()!;
    return this.auth.selectSchool(ctx.userId!, ctx.sessionId!, body.membershipId);
  }

  @Post('logout')
  @HttpCode(200)
  @Authenticated()
  async logout() {
    await this.auth.logout(RequestContextStore.get()!.sessionId!);
    return { data: { ok: true } };
  }
}
