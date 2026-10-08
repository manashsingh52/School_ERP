import type { TenantTx } from '../../core/prisma/prisma.service.js';
import { RequestContextStore } from '../../core/context/request-context.js';

/** "2026–27" → "2026-27" (numbers are typed by people; keep them plain ASCII). */
export const yearKey = (yearName: string) => yearName.replace(/[‒-―]/g, '-').replace(/\s+/g, '');

/**
 * Gap-free document numbers (invoice, receipt) per school and key. The row is locked by the
 * UPSERT for the rest of the transaction, so concurrent issues queue up instead of skipping or
 * repeating a number; a rolled-back transaction gives its number back.
 */
export async function nextNumber(tx: TenantTx, key: string, prefix: string, width = 6): Promise<string> {
  const { schoolId } = RequestContextStore.school();
  const [row] = await tx.$queryRaw<{ value: number }[]>`
    INSERT INTO school_sequences (school_id, key, prefix, next_value)
    VALUES (${schoolId}::uuid, ${key}, ${prefix}, 2)
    ON CONFLICT (school_id, key) DO UPDATE SET next_value = school_sequences.next_value + 1
    RETURNING next_value - 1 AS value`;
  return `${prefix}${String(row!.value).padStart(width, '0')}`;
}
