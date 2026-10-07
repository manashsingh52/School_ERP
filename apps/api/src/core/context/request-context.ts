import { AsyncLocalStorage } from 'node:async_hooks';
import type { PermissionSet } from '@schoolos/permissions';
import { AppError } from '../errors/app-error.js';

/**
 * Per-request (or per-job) context, carried through async calls with AsyncLocalStorage.
 * The tenant Prisma client reads `schoolId` from here — feature code never passes it around.
 */
export interface RequestContext {
  requestId: string;
  ip?: string;
  userAgent?: string;
  userId?: string;
  sessionId?: string;
  schoolId?: string;
  membershipId?: string;
  permissions?: PermissionSet;
  /** 'system' for background jobs and scheduled work acting for a school. */
  actor?: 'user' | 'system';
  /** Set inside tenantTx(): the transaction already ran set_config on its connection. */
  inTenantTx?: boolean;
}

export interface TenantContext extends RequestContext {
  userId: string;
  schoolId: string;
  membershipId: string;
  permissions: PermissionSet;
}

const storage = new AsyncLocalStorage<RequestContext>();

export const RequestContextStore = {
  run<T>(context: RequestContext, fn: () => T): T {
    return storage.run(context, fn);
  },

  get(): RequestContext | undefined {
    return storage.getStore();
  },

  /** Merge fields into the current context (used by the auth guard after verifying the token). */
  patch(fields: Partial<RequestContext>): void {
    const store = storage.getStore();
    if (!store) throw new Error('No request context — RequestContextMiddleware must run first');
    Object.assign(store, fields);
  },

  /** Current school (user request or system job). Throws if there is none. */
  school(): RequestContext & { schoolId: string } {
    const store = storage.getStore();
    if (!store?.schoolId) throw new AppError('SCHOOL_NOT_SELECTED', 403, 'Select a school to continue.');
    return store as RequestContext & { schoolId: string };
  },

  /** Run background work for one school, as the system (no user, no permissions). */
  runAsSystem<T>(schoolId: string, requestId: string, fn: () => T): T {
    return storage.run({ requestId, schoolId, actor: 'system' }, fn);
  },

  /** The current signed-in member. Throws if this code path runs without one (a programming error). */
  tenant(): TenantContext {
    const store = storage.getStore();
    if (!store?.schoolId || !store.userId || !store.membershipId || !store.permissions) {
      throw new AppError('SCHOOL_NOT_SELECTED', 403, 'Select a school to continue.');
    }
    return store as TenantContext;
  },
};
