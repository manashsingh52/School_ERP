// Applies database security that Prisma can't express (docs/03-multi-tenancy.md §3).
// Idempotent — runs after every `prisma migrate dev/deploy`. Must connect as the table owner.
//
//  • Row-Level Security on EVERY table that has a school_id column (discovered, not hand-listed)
//  • Special policies for schools, users, memberships, notification_templates
//  • Grants: identity tables are platform-only, plans/subscriptions read-only, audit_logs append-only
//  • Coverage check: fails if any tenant table is left without RLS
//  • BullMQ's PostgreSQL queue schema ("bullmq"), owned by the owner role, used by the platform role
import pg from 'pg';
import { pathToFileURL } from 'node:url';
import { runMigrations as runQueueMigrations } from 'bullmq';

const SPECIAL_TENANT_POLICIES = {
  memberships: {
    using: 'school_id = app_current_school_id() OR user_id = app_current_user_id()',
    check: 'school_id = app_current_school_id()',
  },
  notification_templates: {
    using: 'school_id IS NULL OR school_id = app_current_school_id()',
    check: 'school_id = app_current_school_id()',
  },
};

const PLATFORM_ONLY_TABLES = ['sessions', 'otp_challenges', 'device_tokens', 'platform_admins', '_prisma_migrations'];
const APP_READ_ONLY_TABLES = ['plans', 'feature_flags', 'subscriptions', 'school_features'];
const APPEND_ONLY_TABLES = ['audit_logs'];

export async function applySecurity(connectionString, { log = console.log } = {}) {
  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    // Background-job tables (BullMQ manages its own migrations + advisory lock).
    await runQueueMigrations(client, 'bullmq');
    await client.query(`
      GRANT USAGE ON SCHEMA bullmq TO schoolos_platform;
      GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA bullmq TO schoolos_platform;
      GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA bullmq TO schoolos_platform;
      GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA bullmq TO schoolos_platform;
      REVOKE ALL ON SCHEMA bullmq FROM schoolos_app;
    `);

    await client.query('BEGIN');

    await client.query(`
      CREATE OR REPLACE FUNCTION app_current_school_id() RETURNS uuid
        LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('app.school_id', true), '')::uuid $$;
      CREATE OR REPLACE FUNCTION app_current_user_id() RETURNS uuid
        LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('app.user_id', true), '')::uuid $$;
    `);

    const { rows } = await client.query(`
      SELECT table_name FROM information_schema.columns
      WHERE table_schema = 'public' AND column_name = 'school_id'
      ORDER BY table_name`);
    const tenantTables = rows.map((r) => r.table_name);

    for (const table of tenantTables) {
      const policy = SPECIAL_TENANT_POLICIES[table] ?? {
        using: 'school_id = app_current_school_id()',
        check: 'school_id = app_current_school_id()',
      };
      await client.query(`
        ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY;
        ALTER TABLE "${table}" FORCE ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS tenant_isolation ON "${table}";
        CREATE POLICY tenant_isolation ON "${table}" USING (${policy.using}) WITH CHECK (${policy.check});
      `);
    }

    // The tenant registry: anyone may read basic rows (login page branding); a school may update only itself.
    await client.query(`
      ALTER TABLE schools ENABLE ROW LEVEL SECURITY;
      ALTER TABLE schools FORCE ROW LEVEL SECURITY;
      DROP POLICY IF EXISTS schools_read ON schools;
      DROP POLICY IF EXISTS schools_update_own ON schools;
      CREATE POLICY schools_read ON schools FOR SELECT USING (true);
      CREATE POLICY schools_update_own ON schools FOR UPDATE
        USING (id = app_current_school_id()) WITH CHECK (id = app_current_school_id());
    `);

    // Users are global: a tenant may see only users who are members of the current school (or itself).
    await client.query(`
      ALTER TABLE users ENABLE ROW LEVEL SECURITY;
      ALTER TABLE users FORCE ROW LEVEL SECURITY;
      DROP POLICY IF EXISTS users_read ON users;
      DROP POLICY IF EXISTS users_update_self ON users;
      CREATE POLICY users_read ON users FOR SELECT USING (
        id = app_current_user_id()
        OR EXISTS (SELECT 1 FROM memberships m WHERE m.user_id = users.id AND m.school_id = app_current_school_id())
      );
      CREATE POLICY users_update_self ON users FOR UPDATE
        USING (id = app_current_user_id()) WITH CHECK (id = app_current_user_id());
    `);

    for (const table of PLATFORM_ONLY_TABLES) {
      await client.query(`REVOKE ALL ON TABLE "${table}" FROM schoolos_app`);
    }
    for (const table of APP_READ_ONLY_TABLES) {
      await client.query(`REVOKE INSERT, UPDATE, DELETE ON TABLE "${table}" FROM schoolos_app`);
    }
    for (const table of APPEND_ONLY_TABLES) {
      await client.query(`REVOKE UPDATE, DELETE ON TABLE "${table}" FROM schoolos_app, schoolos_platform`);
    }

    const missing = await findUnprotectedTenantTables(client);
    if (missing.length) throw new Error(`RLS coverage check failed for: ${missing.join(', ')}`);

    await client.query('COMMIT');
    log(`Security applied: RLS on ${tenantTables.length} tenant tables + schools, users. Coverage check passed. Queue schema ready.`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}

/** Tables with a school_id column that lack enabled+forced RLS or a policy. Empty array = good. */
export async function findUnprotectedTenantTables(client) {
  const { rows } = await client.query(`
    SELECT c.relname AS table_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
    WHERE c.relkind = 'r'
      AND EXISTS (SELECT 1 FROM information_schema.columns col
                  WHERE col.table_schema = 'public' AND col.table_name = c.relname AND col.column_name = 'school_id')
      AND (NOT c.relrowsecurity OR NOT c.relforcerowsecurity
           OR NOT EXISTS (SELECT 1 FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = c.relname))
    ORDER BY 1`);
  return rows.map((r) => r.table_name);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL (owner role) is required');
    process.exit(1);
  }
  await applySecurity(url);
}
