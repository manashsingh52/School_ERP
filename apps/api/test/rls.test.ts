/**
 * Layer 3 — PostgreSQL Row-Level Security, tested with raw SQL as the runtime role
 * (docs/03-multi-tenancy.md §7, DB-level rows). No application code involved.
 */
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { inject } from 'vitest';
// @ts-expect-error — plain .mjs helper
import { findUnprotectedTenantTables } from '../scripts/apply-sql.mjs';
import { createTenant, createTestApp, type Tenant, type TestApp } from './helpers.js';

let t: TestApp;
let A: Tenant;
let B: Tenant;
let app: pg.Client;
let tenantTables: string[];

/** Runs `fn` in a transaction as schoolos_app with the given tenant settings, then rolls back. */
async function asTenant<T>(schoolId: string | null, fn: (c: pg.Client) => Promise<T>, userId = ''): Promise<T> {
  await app.query('BEGIN');
  try {
    if (schoolId) {
      await app.query(`SELECT set_config('app.school_id', $1, true), set_config('app.user_id', $2, true)`, [schoolId, userId]);
    }
    return await fn(app);
  } finally {
    await app.query('ROLLBACK');
  }
}

beforeAll(async () => {
  t = await createTestApp();
  A = await createTenant(t, 'rls-a');
  B = await createTenant(t, 'rls-b');
  app = new pg.Client({ connectionString: inject('dbUrls').APP_DATABASE_URL });
  await app.connect();
  const { rows } = await app.query(`
    SELECT table_name FROM information_schema.columns
    WHERE table_schema = 'public' AND column_name = 'school_id' ORDER BY 1`);
  tenantTables = rows.map((r) => r.table_name as string);
});

afterAll(async () => {
  await app?.end();
  await t?.close();
});

describe('row-level security (as schoolos_app)', () => {
  it('covers every table that has a school_id column', async () => {
    const owner = new pg.Client({ connectionString: inject('dbUrls').DATABASE_URL });
    await owner.connect();
    try {
      expect(await findUnprotectedTenantTables(owner)).toEqual([]);
      expect(tenantTables.length).toBeGreaterThan(70);
    } finally {
      await owner.end();
    }
  });

  it('returns nothing from any tenant table when no school is set (fails closed)', async () => {
    await asTenant(null, async (c) => {
      for (const table of tenantTables) {
        const { rows } = await c.query(`SELECT count(*)::int AS n FROM "${table}"`);
        expect(rows[0].n, table).toBe(0);
      }
    });
  });

  it("never returns another school's rows, even when asked for them directly", async () => {
    await asTenant(A.schoolId, async (c) => {
      const own = await c.query('SELECT count(*)::int AS n FROM students');
      expect(own.rows[0].n).toBe(3);
      const other = await c.query('SELECT count(*)::int AS n FROM students WHERE school_id = $1', [B.schoolId]);
      expect(other.rows[0].n).toBe(0);
      const byId = await c.query('SELECT id FROM students WHERE id = $1', [B.students.s1]);
      expect(byId.rowCount).toBe(0);
    });
  });

  it("rejects inserting a row for another school", async () => {
    await expect(
      asTenant(A.schoolId, (c) =>
        c.query(`INSERT INTO students (id, school_id, admission_no, first_name, updated_at)
                 VALUES (gen_random_uuid(), $1, 'X1', 'Mallory', now())`, [B.schoolId]),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it("can't update or delete another school's rows", async () => {
    await asTenant(A.schoolId, async (c) => {
      const upd = await c.query(`UPDATE students SET first_name = 'Hacked' WHERE id = $1`, [B.students.s1]);
      expect(upd.rowCount).toBe(0);
      const del = await c.query('DELETE FROM student_guardians WHERE school_id = $1', [B.schoolId]);
      expect(del.rowCount).toBe(0);
    });
  });

  it("can't move a row into another school", async () => {
    await expect(
      asTenant(A.schoolId, (c) => c.query('UPDATE students SET school_id = $1 WHERE id = $2', [B.schoolId, A.students.s1])),
    ).rejects.toThrow(/row-level security/);
  });

  it('only shows users who are members of the current school', async () => {
    await asTenant(A.schoolId, async (c) => {
      const { rows } = await c.query('SELECT email FROM users WHERE email LIKE $1', ['%@test.school']);
      const emails = rows.map((r) => r.email as string);
      expect(emails).toContain(A.users.admin);
      expect(emails).not.toContain(B.users.admin);
    });
  });

  it('lets a school update only its own schools row', async () => {
    await asTenant(A.schoolId, async (c) => {
      const own = await c.query(`UPDATE schools SET name = name WHERE id = $1`, [A.schoolId]);
      expect(own.rowCount).toBe(1);
      const other = await c.query(`UPDATE schools SET name = 'Hacked' WHERE id = $1`, [B.schoolId]);
      expect(other.rowCount).toBe(0);
    });
  });

  it('keeps identity tables out of reach of the app role', async () => {
    for (const table of ['sessions', 'otp_challenges', 'device_tokens', 'platform_admins']) {
      await expect(asTenant(A.schoolId, (c) => c.query(`SELECT 1 FROM ${table} LIMIT 1`)), table).rejects.toThrow(
        /permission denied/,
      );
    }
  });

  it('makes the audit log append-only', async () => {
    await expect(asTenant(A.schoolId, (c) => c.query('UPDATE audit_logs SET action = action'))).rejects.toThrow(
      /permission denied/,
    );
    await expect(asTenant(A.schoolId, (c) => c.query('DELETE FROM audit_logs'))).rejects.toThrow(/permission denied/);
  });

  it("doesn't let a school change its plan or feature flags", async () => {
    await expect(
      asTenant(A.schoolId, (c) => c.query(`UPDATE school_features SET enabled = true`)),
    ).rejects.toThrow(/permission denied/);
  });
});
