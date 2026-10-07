import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { RequestContextStore } from '../context/request-context.js';
import type { TenantTx } from '../prisma/prisma.service.js';

export interface AuditEntry {
  action: string; // "student.update"
  entityType: string; // "Student"
  entityId?: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

/** Keeps only fields that changed, so the audit trail shows exactly what happened. */
export function diff(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): { before: Record<string, unknown>; after: Record<string, unknown> } | null {
  const b: Record<string, unknown> = {};
  const a: Record<string, unknown> = {};
  for (const key of Object.keys(after)) {
    const prev = normalise(before[key]);
    const next = normalise(after[key]);
    if (JSON.stringify(prev) !== JSON.stringify(next)) {
      b[key] = prev;
      a[key] = next;
    }
  }
  return Object.keys(a).length ? { before: b, after: a } : null;
}

function normalise(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  return value ?? null;
}

/**
 * Append-only audit log (docs/09 §6). Always write inside the same transaction as the change,
 * so an audited change can never be committed without its audit row.
 */
@Injectable()
export class AuditService {
  async record(tx: TenantTx, entry: AuditEntry): Promise<void> {
    const ctx = RequestContextStore.school();
    await tx.auditLog.create({
      data: {
        schoolId: ctx.schoolId,
        actorType: ctx.actor === 'system' ? 'SYSTEM' : 'USER',
        actorUserId: ctx.userId,
        actorMembershipId: ctx.membershipId,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        before: entry.before as Prisma.InputJsonValue | undefined,
        after: entry.after as Prisma.InputJsonValue | undefined,
        metadata: entry.metadata as Prisma.InputJsonValue | undefined,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        requestId: ctx.requestId,
      },
    });
  }
}
