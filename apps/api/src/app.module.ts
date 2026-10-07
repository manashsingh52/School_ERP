import { type DynamicModule, Global, Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, DiscoveryModule } from '@nestjs/core';
import type { Logger } from 'pino';
import { ENV, type Env } from './config/env.js';
import { AuditService } from './core/audit/audit.service.js';
import { AccessService } from './core/auth/access.service.js';
import { AuthGuard } from './core/auth/auth.guard.js';
import { PasswordService } from './core/auth/password.service.js';
import { RouteAccessCheck } from './core/auth/route-access.check.js';
import { TokenService } from './core/auth/token.service.js';
import { RequestContextMiddleware } from './core/context/context.middleware.js';
import { AllExceptionsFilter } from './core/errors/error.filter.js';
import { HealthController } from './core/health/health.controller.js';
import { LOGGER } from './core/logger/logger.js';
import { ScopeService } from './core/permissions/scope.service.js';
import { PlatformPrismaService, PrismaService } from './core/prisma/prisma.service.js';
import { MemoryRateLimitStore, RateLimitGuard } from './core/rate-limit/rate-limit.js';
import { AuthController } from './modules/auth/auth.controller.js';
import { AuthService } from './modules/auth/auth.service.js';
import { ConsoleOtpSender, OtpSender } from './modules/auth/otp-sender.js';
import { SessionService } from './modules/auth/session.service.js';
import { MeController } from './modules/me/me.controller.js';
import { PublicController } from './modules/public/public.controller.js';
import { SchoolsService } from './modules/schools/schools.service.js';
import { StudentsController } from './modules/students/students.controller.js';
import { StudentsService } from './modules/students/students.service.js';

/** Cross-cutting services every module may use (docs/01 §3 "core"). */
@Global()
@Module({})
export class CoreModule {
  static forRoot(env: Env, logger: Logger): DynamicModule {
    const providers = [
      { provide: ENV, useValue: env },
      { provide: LOGGER, useValue: logger },
      PrismaService,
      PlatformPrismaService,
      TokenService,
      PasswordService,
      AccessService,
      ScopeService,
      AuditService,
      MemoryRateLimitStore,
      RateLimitGuard,
      RequestContextMiddleware,
      RouteAccessCheck,
    ];
    return {
      module: CoreModule,
      imports: [DiscoveryModule],
      controllers: [HealthController],
      providers: [
        ...providers,
        { provide: APP_GUARD, useClass: AuthGuard },
        { provide: APP_FILTER, useClass: AllExceptionsFilter },
      ],
      exports: providers,
    };
  }
}

@Module({
  controllers: [AuthController, MeController],
  providers: [AuthService, SessionService, ConsoleOtpSender, { provide: OtpSender, useExisting: ConsoleOtpSender }],
  exports: [AuthService, SessionService, OtpSender, ConsoleOtpSender],
})
export class AuthModule {}

@Module({ controllers: [PublicController] })
export class PublicModule {}

@Module({ providers: [SchoolsService], exports: [SchoolsService] })
export class SchoolsModule {}

@Module({ controllers: [StudentsController], providers: [StudentsService] })
export class StudentsModule {}

@Module({})
export class AppModule {
  static forRoot(env: Env, logger: Logger): DynamicModule {
    return {
      module: AppModule,
      imports: [CoreModule.forRoot(env, logger), AuthModule, PublicModule, SchoolsModule, StudentsModule],
    };
  }
}
