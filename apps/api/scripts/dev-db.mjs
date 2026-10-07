// `pnpm db:start` — runs the local development database in the foreground (Ctrl+C to stop).
// Data lives in apps/api/.data/pg and survives restarts. Replaced by docker-compose once Docker is installed.
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { bootstrapDatabase, startCluster } from './pg-cluster.mjs';

const port = Number(process.env.PG_PORT ?? 54329);
const dir = fileURLToPath(new URL('../.data/pg', import.meta.url));
mkdirSync(dir, { recursive: true });

const cluster = await startCluster({ dir, port, quiet: true });
await bootstrapDatabase({ port, database: 'schoolos' });
console.log(`\nPostgreSQL 17 ready on localhost:${port} (database "schoolos"). Press Ctrl+C to stop.\n`);

const stop = async () => {
  console.log('\nStopping PostgreSQL…');
  await cluster.stop();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
setInterval(() => {}, 1 << 30);
