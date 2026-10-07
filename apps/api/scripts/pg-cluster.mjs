// Shared helpers to run a real PostgreSQL 17 locally without Docker (embedded-postgres),
// and to bootstrap the three database roles described in docs/03-multi-tenancy.md §3.
import { existsSync } from 'node:fs';
import EmbeddedPostgres from 'embedded-postgres';
import pg from 'pg';

const SUPERUSER = 'postgres';
const SUPERUSER_PASSWORD = 'postgres';

export const ROLE_PASSWORDS = {
  schoolos_owner: 'owner_dev_pw',
  schoolos_app: 'app_dev_pw',
  schoolos_platform: 'platform_dev_pw',
};

/** Starts (initialising on first run) a Postgres cluster in `dir` listening on `port`. */
export async function startCluster({ dir, port, persistent = true, quiet = false }) {
  const cluster = new EmbeddedPostgres({
    databaseDir: dir,
    port,
    user: SUPERUSER,
    password: SUPERUSER_PASSWORD,
    persistent,
    authMethod: 'scram-sha-256',
    onLog: quiet ? () => {} : (m) => process.stdout.write(`[pg] ${m}`),
    onError: (e) => process.stderr.write(`[pg] ${e instanceof Error ? e.message : e}\n`),
  });
  if (!existsSync(`${dir}/PG_VERSION`)) await cluster.initialise();
  await cluster.start();
  return cluster;
}

export function superClient(port, database = 'postgres') {
  return new pg.Client({ host: 'localhost', port, user: SUPERUSER, password: SUPERUSER_PASSWORD, database });
}

/** Idempotently creates roles + database with the grants the app relies on. */
export async function bootstrapDatabase({ port, database }) {
  const admin = superClient(port);
  await admin.connect();
  try {
    const roles = [
      ['schoolos_owner', 'LOGIN CREATEDB NOBYPASSRLS'],
      ['schoolos_app', 'LOGIN NOBYPASSRLS'],
      ['schoolos_platform', 'LOGIN BYPASSRLS'],
    ];
    for (const [role, attrs] of roles) {
      const { rowCount } = await admin.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [role]);
      const verb = rowCount ? 'ALTER' : 'CREATE';
      await admin.query(`${verb} ROLE ${role} WITH ${attrs} PASSWORD '${ROLE_PASSWORDS[role]}'`);
    }
    const { rowCount } = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [database]);
    if (!rowCount) await admin.query(`CREATE DATABASE ${database} OWNER schoolos_owner`);
  } finally {
    await admin.end();
  }

  // Grants inside the database: runtime roles get DML on tables the owner creates.
  const db = superClient(port, database);
  await db.connect();
  try {
    await db.query(`
      CREATE EXTENSION IF NOT EXISTS pg_trgm;
      GRANT CONNECT ON DATABASE ${database} TO schoolos_app, schoolos_platform;
      GRANT USAGE ON SCHEMA public TO schoolos_app, schoolos_platform;
      ALTER DEFAULT PRIVILEGES FOR ROLE schoolos_owner IN SCHEMA public
        GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO schoolos_app, schoolos_platform;
      ALTER DEFAULT PRIVILEGES FOR ROLE schoolos_owner IN SCHEMA public
        GRANT USAGE, SELECT ON SEQUENCES TO schoolos_app, schoolos_platform;
    `);
  } finally {
    await db.end();
  }
}

export function urlsFor(port, database) {
  const u = (role) => `postgresql://${role}:${ROLE_PASSWORDS[role]}@localhost:${port}/${database}`;
  return {
    DATABASE_URL: u('schoolos_owner'),
    APP_DATABASE_URL: u('schoolos_app'),
    PLATFORM_DATABASE_URL: u('schoolos_platform'),
  };
}
