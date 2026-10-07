import { Prisma } from '../../generated/prisma/client.js';
import { TENANT_MODELS } from '../../generated/tenant-models.js';
import { RequestContextStore } from '../context/request-context.js';

/**
 * Layer 2 of tenant isolation (docs/03-multi-tenancy.md §2).
 *
 * For every query through the app client:
 *  • tenant models get `schoolId` injected into `where` / `data` automatically
 *  • the query runs in a transaction that first calls set_config('app.school_id', …, true),
 *    so PostgreSQL Row-Level Security (layer 3) sees the same tenant
 *
 * Nested writes (e.g. `create: { enrollments: { create: … } }`) are NOT auto-scoped: pass
 * `schoolId` explicitly. RLS rejects a wrong value anyway.
 */

const WHERE_OPERATIONS = new Set([
  'findUnique',
  'findUniqueOrThrow',
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'count',
  'aggregate',
  'groupBy',
  'update',
  'updateMany',
  'updateManyAndReturn',
  'delete',
  'deleteMany',
  'upsert',
]);

const DATA_UPDATE_OPERATIONS = new Set(['update', 'updateMany', 'updateManyAndReturn']);
const CREATE_OPERATIONS = new Set(['create', 'createMany', 'createManyAndReturn']);

type Args = Record<string, unknown>;

/** Minimal view of the base client used inside the extension (keeps the compiler's types tractable). */
interface BatchClient {
  $transaction(operations: Promise<unknown>[]): Promise<unknown[]>;
  $executeRaw(query: TemplateStringsArray, ...values: unknown[]): Promise<number>;
}

class CrossTenantError extends Error {
  constructor(detail: string) {
    super(`Cross-tenant access blocked: ${detail}`);
    this.name = 'CrossTenantError';
  }
}

function withSchool(data: unknown, schoolId: string, model: string): Args {
  const row = { ...(data as Args) };
  if ('school' in row) throw new CrossTenantError(`${model}: use the schoolId scalar, not the school relation`);
  if (row.schoolId !== undefined && row.schoolId !== schoolId) {
    throw new CrossTenantError(`${model}: data.schoolId differs from the current school`);
  }
  row.schoolId = schoolId;
  return row;
}

function assertNoSchoolChange(data: unknown, schoolId: string, model: string): void {
  const value = (data as Args | undefined)?.schoolId;
  if (value !== undefined && value !== schoolId) {
    throw new CrossTenantError(`${model}: schoolId cannot be changed`);
  }
}

/** Pure function — exported for unit tests. */
export function scopeArgs(model: string, operation: string, args: unknown, schoolId: string): Args {
  const scoped: Args = { ...((args as Args | undefined) ?? {}) };

  if (WHERE_OPERATIONS.has(operation)) {
    const where = (scoped.where as Args | undefined) ?? {};
    if (where.schoolId !== undefined && where.schoolId !== schoolId) {
      throw new CrossTenantError(`${model}.${operation}: where.schoolId differs from the current school`);
    }
    scoped.where = { ...where, schoolId };
  }

  if (CREATE_OPERATIONS.has(operation)) {
    scoped.data = Array.isArray(scoped.data)
      ? scoped.data.map((row) => withSchool(row, schoolId, model))
      : withSchool(scoped.data, schoolId, model);
  }

  if (DATA_UPDATE_OPERATIONS.has(operation)) assertNoSchoolChange(scoped.data, schoolId, model);

  if (operation === 'upsert') {
    scoped.create = withSchool(scoped.create, schoolId, model);
    assertNoSchoolChange(scoped.update, schoolId, model);
  }

  return scoped;
}

export function tenantExtension() {
  return Prisma.defineExtension((client) =>
    client.$extends({
      name: 'tenant-isolation',
      query: {
        $allModels: {
          async $allOperations({ model, operation, args, query }) {
            const ctx = RequestContextStore.get();
            const isTenantModel = TENANT_MODELS.has(model);

            if (!ctx?.schoolId) {
              // No tenant: tenant tables are off-limits (fail loudly instead of returning nothing).
              if (isTenantModel) throw new CrossTenantError(`${model}.${operation} called without a school context`);
              return query(args);
            }

            let scoped = args;
            if (isTenantModel) scoped = scopeArgs(model, operation, args, ctx.schoolId) as never;

            // Inside tenantTx() the connection already carries the settings.
            if (ctx.inTenantTx) return query(scoped);

            const batch = client as unknown as BatchClient;
            const [, result] = await batch.$transaction([
              batch.$executeRaw`SELECT set_config('app.school_id', ${ctx.schoolId}, true), set_config('app.user_id', ${ctx.userId ?? ''}, true)`,
              query(scoped),
            ]);
            return result;
          },
        },
      },
    }),
  );
}
