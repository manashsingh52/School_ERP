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
import { ChannelGateway } from './core/notify/channel-gateway.js';
import { BasicPdfRenderer, ChromiumPdfRenderer, PdfRenderer } from './core/pdf/pdf-renderer.js';
import { GatewayClient, MockGatewayClient, RazorpayClient } from './core/payments/gateway-client.js';
import { SecretBox } from './core/payments/secret-box.js';
import { EntitlementsService } from './core/entitlements/entitlements.service.js';
import { SchoolSettingsService } from './core/settings/school-settings.service.js';
import { QueueService } from './core/queue/queue.service.js';
import { SchedulerService } from './core/queue/scheduler.service.js';
import { MemoryRateLimitStore, RateLimitGuard } from './core/rate-limit/rate-limit.js';
import { AcademicsModule } from './modules/academics/academics.module.js';
import { AttendanceModule } from './modules/attendance/attendance.module.js';
import { NotificationsModule } from './modules/notifications/notifications.module.js';
import { AuthController } from './modules/auth/auth.controller.js';
import { AuthService } from './modules/auth/auth.service.js';
import { ConsoleOtpSender, OtpSender } from './modules/auth/otp-sender.js';
import { SessionService } from './modules/auth/session.service.js';
import { FilesController, LocalStorageController } from './modules/files/files.controller.js';
import { FilesService } from './modules/files/files.service.js';
import { HomeworkController } from './modules/homework/homework.controller.js';
import { HomeworkService } from './modules/homework/homework.service.js';
import { BellSchedulesController, TimetablesController } from './modules/timetable/timetable.controller.js';
import { TimetableService } from './modules/timetable/timetable.service.js';
import { NoticesController } from './modules/notices/notices.controller.js';
import { NoticesService } from './modules/notices/notices.service.js';
import { DashboardController } from './modules/dashboard/dashboard.controller.js';
import { DashboardService } from './modules/dashboard/dashboard.service.js';
import { ExamsController, GradingScalesController, ReportCardsController, StudentResultsController } from './modules/exams/exams.controller.js';
import { ExamsService } from './modules/exams/exams.service.js';
import { MarksService } from './modules/exams/marks.service.js';
import { ReportCardsService } from './modules/exams/report-cards.service.js';
import { ResultsService } from './modules/exams/results.service.js';
import { FeesController } from './modules/fees/fees.controller.js';
import { FeesService } from './modules/fees/fees.service.js';
import { FinanceJobsController, FinanceReportsController, GatewayController, InvoicesController, OnlinePaymentsController, PaymentsController, StudentFeesController } from './modules/finance/finance.controller.js';
import { FinanceJobsService } from './modules/finance/finance-jobs.service.js';
import { FinanceReportsService } from './modules/finance/finance-reports.service.js';
import { GatewayService } from './modules/finance/gateway.service.js';
import { OnlinePaymentsService } from './modules/finance/online-payments.service.js';
import { WebhooksController } from './modules/webhooks/webhooks.controller.js';
import { WebhooksService } from './modules/webhooks/webhooks.service.js';
import { InvoicesService } from './modules/finance/invoices.service.js';
import { PaymentsService } from './modules/finance/payments.service.js';
import { MeController } from './modules/me/me.controller.js';
import { PublicController } from './modules/public/public.controller.js';
import { GuardiansController } from './modules/guardians/guardians.controller.js';
import { GuardiansService } from './modules/guardians/guardians.service.js';
import { ImportsController } from './modules/imports/imports.controller.js';
import { ImportsService } from './modules/imports/imports.service.js';
import { SetupImports } from './modules/imports/setup-imports.js';
import { MembersController, PermissionsController, RolesController } from './modules/members/members.controller.js';
import { MembersService } from './modules/members/members.service.js';
import { DocumentsController } from './modules/documents/documents.controller.js';
import { DocumentsService } from './modules/documents/documents.service.js';
import { PlatformController, SchoolPlanController } from './modules/platform/platform.controller.js';
import { ReportRunsService } from './modules/reports/report-runs.service.js';
import { AuditController, ReportsController } from './modules/reports/reports.controller.js';
import { ReportsService } from './modules/reports/reports.service.js';
import { PlatformService } from './modules/platform/platform.service.js';
import { SupportAccessService } from './modules/platform/support-access.service.js';
import { IdentityService } from './modules/schools/identity.service.js';
import { OnboardingController, PromotionsController, SchoolController } from './modules/school/school.controller.js';
import { SchoolSettingsController } from './modules/school/settings.controller.js';
import { SchoolService } from './modules/school/school.service.js';
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
      SchedulerService,
      OutboxService,
      IdempotencyInterceptor,
      ChannelGateway,
      SecretBox,
      EntitlementsService,
      SchoolSettingsService,
      { provide: GatewayClient, useClass: env.PAYMENTS_GATEWAY === 'razorpay' ? RazorpayClient : MockGatewayClient },
      { provide: PdfRenderer, useClass: env.PDF_RENDERER === 'chromium' ? ChromiumPdfRenderer : BasicPdfRenderer },
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



@Module({ imports: [FilesModule], controllers: [SchoolController, SchoolSettingsController, OnboardingController, PromotionsController], providers: [SchoolService] })
export class SchoolModule {}

@Module({ imports: [FilesModule, NotificationsModule], controllers: [HomeworkController], providers: [HomeworkService] })
export class HomeworkModule {}

@Module({ controllers: [BellSchedulesController, TimetablesController], providers: [TimetableService], exports: [TimetableService] })
export class TimetableModule {}

@Module({ imports: [FilesModule, NotificationsModule], controllers: [NoticesController], providers: [NoticesService] })
export class NoticesModule {}

@Module({ imports: [AttendanceModule, TimetableModule], controllers: [DashboardController], providers: [DashboardService] })
export class DashboardModule {}

@Module({
  imports: [NotificationsModule, FilesModule],
  controllers: [GradingScalesController, ExamsController, ReportCardsController, StudentResultsController],
  providers: [ExamsService, MarksService, ResultsService, ReportCardsService],
  exports: [ExamsService, MarksService, ResultsService],
})
export class ExamsModule {}

@Module({ controllers: [WebhooksController], providers: [WebhooksService], exports: [WebhooksService] })
export class WebhooksModule {}

@Module({
  imports: [NotificationsModule, FilesModule, WebhooksModule],
  controllers: [FeesController, InvoicesController, PaymentsController, StudentFeesController, GatewayController, OnlinePaymentsController, FinanceJobsController, FinanceReportsController],
  providers: [FeesService, InvoicesService, PaymentsService, GatewayService, OnlinePaymentsService, FinanceJobsService, FinanceReportsService],
  exports: [FeesService, InvoicesService, PaymentsService, GatewayService, OnlinePaymentsService, FinanceReportsService],
})
export class FinanceModule {}

@Module({ imports: [SchoolsModule, NotificationsModule], controllers: [PlatformController, SchoolPlanController], providers: [PlatformService, SupportAccessService] })
export class PlatformModule {}

@Module({ imports: [SchoolsModule, GuardiansModule, FinanceModule], controllers: [ImportsController], providers: [ImportsService, SetupImports] })
export class ImportsModule {}

@Module({ imports: [FilesModule], controllers: [DocumentsController], providers: [DocumentsService] })
export class DocumentsModule {}

@Module({ imports: [FilesModule, FinanceModule], controllers: [ReportsController, AuditController], providers: [ReportsService, ReportRunsService] })
export class ReportsModule {}

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
        SchoolModule,
        NotificationsModule,
        AttendanceModule,
        HomeworkModule,
        TimetableModule,
        NoticesModule,
        DashboardModule,
        ExamsModule,
        FinanceModule,
        PlatformModule,
        DocumentsModule,
        ReportsModule,
      ],
    };
  }
}
