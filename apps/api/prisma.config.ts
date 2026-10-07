import 'dotenv/config';
import { defineConfig } from 'prisma/config';

// Migrations run as the table owner (schoolos_owner). The running app never uses this URL:
// it connects as schoolos_app (subject to RLS) and schoolos_platform (bypasses RLS).
// `prisma generate` needs no database, so the URL is optional (CI type checks run without one).
const url = process.env.DATABASE_URL;

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  ...(url ? { datasource: { url } } : {}),
});
