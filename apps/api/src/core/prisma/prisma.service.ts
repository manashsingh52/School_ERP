import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client.js';
import { ENV, type Env } from '../../config/env.js';
import { RequestContextStore } from '../context/request-context.js';
import { tenantExtension } from './tenant-extension.js';

function createTenantClient(base: PrismaClient) {
  return base.$extends(tenantExtension());
}

export type TenantClient = ReturnType<typeof createTenantClient>;
/** Client available inside tenantTx(): same API minus connection/transaction management. */
export type TenantTx = Omit<TenantClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$extends'>;

/**
 * The client feature modules use. Connects as `schoolos_app` (subject to RLS) and auto-scopes
 * every query to the current school.
 */
@Injectable()
export class PrismaService implements OnModuleDestroy {
  private readonly base: PrismaClient;
  readonly db: TenantClient;

  constructor(@Inject(ENV) env: Env) {
    this.base = new PrismaClient({
      adapter: new PrismaPg({ connectionString: env.APP_DATABASE_URL, max: env.DB_POOL_SIZE }),
    });
    this.db = createTenantClient(this.base);
  }

  /**
   * Interactive transaction for multi-step work. Tenant settings are applied once on the
   * transaction's connection; all queries made through `tx` are auto-scoped as usual.
   */
  async tenantTx<T>(fn: (tx: TenantTx) => Promise<T>, options?: { timeout?: number }): Promise<T> {
    const ctx = RequestContextStore.school();
    return this.db.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.school_id', ${ctx.schoolId}, true), set_config('app.user_id', ${ctx.userId ?? ''}, true)`;
        return RequestContextStore.run({ ...ctx, inTenantTx: true }, () => fn(tx as TenantTx));
      },
      { timeout: options?.timeout ?? 10_000 },
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.base.$disconnect();
  }
}

/**
 * Bypasses RLS (connects as `schoolos_platform`). Only for core/auth and platform modules:
 * login lookups, sessions, school creation, cross-school jobs. Never inject in feature modules.
 */
@Injectable()
export class PlatformPrismaService extends PrismaClient implements OnModuleDestroy {
  constructor(@Inject(ENV) env: Env) {
    super({ adapter: new PrismaPg({ connectionString: env.PLATFORM_DATABASE_URL, max: 3 }) });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
