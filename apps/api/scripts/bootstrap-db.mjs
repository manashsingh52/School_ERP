// `pnpm db:bootstrap` — create the three roles + database on an already-running PostgreSQL
// (Docker Compose). `pnpm db:start` does this automatically for the embedded server.
import { bootstrapDatabase } from './pg-cluster.mjs';

const port = Number(process.env.PG_PORT ?? 54329);
await bootstrapDatabase({ port, database: 'schoolos' });
console.log(`Roles and database "schoolos" ready on localhost:${port}.`);
