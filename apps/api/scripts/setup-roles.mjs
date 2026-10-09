// One-time database setup on managed PostgreSQL (Cloud SQL), the cloud twin of pg-cluster.mjs's
// bootstrapDatabase(). Run as the instance's admin user (e.g. "postgres"):
//
//   ADMIN_DATABASE_URL=postgresql://postgres:…@/schoolos?host=/cloudsql/PROJECT:REGION:INSTANCE \
//   OWNER_PASSWORD=… APP_PASSWORD=… PLATFORM_PASSWORD=… node scripts/setup-roles.mjs
//
// Creates schoolos_owner (owns tables; migrations), schoolos_app (runtime, subject to RLS) and
// schoolos_platform (runtime, sees all rows through its own policies — no BYPASSRLS needed).
// Idempotent: re-running updates passwords and grants.
import pg from 'pg';

const url = process.env.ADMIN_DATABASE_URL;
const passwords = { schoolos_owner: process.env.OWNER_PASSWORD, schoolos_app: process.env.APP_PASSWORD, schoolos_platform: process.env.PLATFORM_PASSWORD };
if (!url || Object.values(passwords).some((p) => !p || p.length < 16)) {
  console.error('Needs ADMIN_DATABASE_URL and OWNER_PASSWORD, APP_PASSWORD, PLATFORM_PASSWORD (16+ characters each).');
  process.exit(1);
}

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  const { rows } = await client.query('SELECT current_database() AS db, current_user AS me');
  const { db, me } = rows[0];
  for (const [role, password] of Object.entries(passwords)) {
    const exists = (await client.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [role])).rowCount;
    await client.query(`${exists ? 'ALTER' : 'CREATE'} ROLE ${role} WITH LOGIN NOBYPASSRLS PASSWORD ${client.escapeLiteral(password)}`);
  }
  await client.query(`
    GRANT schoolos_owner TO ${client.escapeIdentifier(me)};
    ALTER DATABASE ${client.escapeIdentifier(db)} OWNER TO schoolos_owner;
    GRANT ALL ON SCHEMA public TO schoolos_owner;
    CREATE EXTENSION IF NOT EXISTS pg_trgm;
    GRANT CONNECT ON DATABASE ${client.escapeIdentifier(db)} TO schoolos_app, schoolos_platform;
    GRANT USAGE ON SCHEMA public TO schoolos_app, schoolos_platform;
    ALTER DEFAULT PRIVILEGES FOR ROLE schoolos_owner IN SCHEMA public
      GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO schoolos_app, schoolos_platform;
    ALTER DEFAULT PRIVILEGES FOR ROLE schoolos_owner IN SCHEMA public
      GRANT USAGE, SELECT ON SEQUENCES TO schoolos_app, schoolos_platform;
  `);
  console.log(`Roles ready in "${db}": schoolos_owner (migrations), schoolos_app, schoolos_platform. Next: run the migrate job.`);
} finally {
  await client.end();
}
