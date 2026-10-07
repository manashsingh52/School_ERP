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
import { IdempotencyInterceptor } from './core/idempotency/idempotency.js';
import { OutboxService } from './core/outbox/outbox.service.js';
import { GcsStorageDriver } from './core/storage/gcs.driver.js';
import { LocalStorageDriver } from './core/storage/local.driver.js';
import { StorageDriver } from './core/storage/storage.js';
import { QueueService } from './core/queue/queue.service.js';
import { MemoryRateLimitStore, RateLimitGuard } from './core/rate-limit/rate-limit.js';
import { AcademicsModule } from './modules/academics/academics.module.js';
import { AuthController } from './modules/auth/auth.controller.js';
import { AuthService } from './modules/auth/auth.service.js';
import { ConsoleOtpSender, OtpSender } from './modules/auth/otp-sender.js';
import { SessionService } from './modules/auth/session.service.js';
import { FilesController, LocalStorageController } from './modules/files/files.controller.js';
import { FilesService } from './modules/files/files.service.js';
import { MeController } from './modules/me/me.controller.js';
import { PublicController } from './modules/public/public.controller.js';
import { GuardiansController } from './modules/guardians/guardians.controller.js';
import { GuardiansService } from './modules/guardians/guardians.service.js';
import { ImportsController } from './modules/imports/imports.controller.js';
import { ImportsService } from './modules/imports/imports.service.js';
import { MembersController, PermissionsController, RolesController } from './modules/members/members.controller.js';
import { MembersService } from './modules/members/members.service.js';
import { IdentityService } from './modules/schools/identity.service.js';
import { SchoolsService } from './modules/schools/schools.service.js';
import { SearchController, SearchService } from './modules/search/search.controller.js';
import { TeachersController } from './modules/teachers/teachers.controller.js';
import { TeachersService } from './modules/teachers/teachers.service.js';
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
      QueueService,
      OutboxService,
      IdempotencyInterceptor,
      {
        provide: StorageDriver,
        useFactory: () =>
          env.STORAGE_DRIVER === 'gcs'
            ? new GcsStorageDriver(env.GCS_PROJECT_ID!, env.GCS_PRIVATE_BUCKET!)
            : new LocalStorageDriver(env.STORAGE_LOCAL_DIR, env.STORAGE_SIGNING_SECRET!, env.STORAGE_LOCAL_URL_BASE),
      },
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

/** Platform provisioning + identity (the only feature-level users of the platform client). */
@Module({ providers: [SchoolsService, IdentityService], exports: [SchoolsService, IdentityService] })
export class SchoolsModule {}

@Module({ controllers: [FilesController, LocalStorageController], providers: [FilesService], exports: [FilesService] })
export class FilesModule {}

@Module({ imports: [SchoolsModule], controllers: [GuardiansController], providers: [GuardiansService], exports: [GuardiansService] })
export class GuardiansModule {}

@Module({
  imports: [SchoolsModule, FilesModule, GuardiansModule],
  controllers: [StudentsController],
  providers: [StudentsService],
  exports: [StudentsService],
})
export class StudentsModule {}

@Module({ imports: [SchoolsModule, FilesModule], controllers: [TeachersController], providers: [TeachersService], exports: [TeachersService] })
export class TeachersModule {}

@Module({ imports: [SchoolsModule], controllers: [MembersController, RolesController, PermissionsController], providers: [MembersService] })
export class MembersModule {}

@Module({ imports: [StudentsModule, TeachersModule, GuardiansModule], controllers: [SearchController], providers: [SearchService] })
export class SearchModule {}

@Module({ imports: [SchoolsModule, GuardiansModule], controllers: [ImportsController], providers: [ImportsService] })
export class ImportsModule {}

@Module({})
export class AppModule {
  static forRoot(env: Env, logger: Logger): DynamicModule {
    return {
      module: AppModule,
      imports: [
        CoreModule.forRoot(env, logger),
        AuthModule,
        PublicModule,
        SchoolsModule,
        FilesModule,
        AcademicsModule,
        GuardiansModule,
        StudentsModule,
        TeachersModule,
        MembersModule,
        SearchModule,
        ImportsModule,
      ],
    };
  }
}
