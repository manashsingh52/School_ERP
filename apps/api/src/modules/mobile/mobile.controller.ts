import { Body, Controller, Delete, Get, HttpCode, Inject, Put } from '@nestjs/common';
import type { z } from 'zod';
import { buildOpenApi, registerDeviceSchema, type AppConfig } from '@schoolos/contracts';
import { AppError } from '../../core/errors/app-error.js';
import { ENV, type Env } from '../../config/env.js';
import { Authenticated, Public } from '../../core/auth/decorators.js';
import { RequestContextStore } from '../../core/context/request-context.js';
import { PlatformPrismaService } from '../../core/prisma/prisma.service.js';
import { ZodPipe } from '../../core/validation/zod.pipe.js';

/** What the mobile app checks at start-up: must it update, and which checkout to use. */
@Controller('app')
export class AppConfigController {
  constructor(@Inject(ENV) private readonly env: Env) {}

  @Get('config')
  @Public()
  config(): { data: AppConfig } {
    return {
      data: {
        minVersion: this.env.MOBILE_MIN_VERSION,
        latestVersion: this.env.MOBILE_LATEST_VERSION,
        storeUrls: { android: this.env.MOBILE_ANDROID_URL ?? null, ios: this.env.MOBILE_IOS_URL ?? null },
        paymentsDriver: this.env.PAYMENTS_GATEWAY === 'razorpay' ? 'razorpay' : 'mock',
        otpLogin: this.env.OTP_PROVIDER !== 'none',
      },
    };
  }
}

/** The API description for tooling (Postman, client generators). Hidden in production. */
@Controller()
export class OpenApiController {
  private doc?: object;
  constructor(@Inject(ENV) private readonly env: Env) {}

  @Get('openapi.json')
  @Public()
  openapi() {
    if (this.env.NODE_ENV === 'production') throw AppError.notFound('page');
    return (this.doc ??= buildOpenApi());
  }
}

/**
 * Push tokens (FCM) for the signed-in device. Tokens are global (one per app install) and tied to the
 * session that registered them, so signing out — or being signed out — stops pushes to that phone.
 */
@Controller('me/devices')
export class DevicesController {
  constructor(private readonly platform: PlatformPrismaService) {}

  @Put()
  @Authenticated()
  async register(@Body(new ZodPipe(registerDeviceSchema)) body: z.output<typeof registerDeviceSchema>) {
    const ctx = RequestContextStore.get()!;
    // A token moves with the install: if another account used this phone before, it's re-assigned.
    await this.platform.deviceToken.upsert({
      where: { token: body.token },
      create: { token: body.token, platform: body.platform, userId: ctx.userId!, sessionId: ctx.sessionId ?? null },
      update: { platform: body.platform, userId: ctx.userId!, sessionId: ctx.sessionId ?? null, lastSeenAt: new Date() },
    });
    return { data: { ok: true } };
  }

  @Delete()
  @HttpCode(200)
  @Authenticated()
  async unregister(@Body(new ZodPipe(registerDeviceSchema.pick({ token: true }))) body: { token: string }) {
    await this.platform.deviceToken.deleteMany({ where: { token: body.token, userId: RequestContextStore.get()!.userId! } });
    return { data: { ok: true } };
  }
}
