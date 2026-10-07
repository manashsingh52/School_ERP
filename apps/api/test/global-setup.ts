import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { TestProject } from 'vitest/node';
// @ts-expect-error — plain .mjs helper shared with the dev scripts
import { bootstrapDatabase, startCluster, urlsFor } from '../scripts/pg-cluster.mjs';
// @ts-expect-error — plain .mjs helper shared with the dev scripts
import { applySecurity } from '../scripts/apply-sql.mjs';

/**
 * Starts a throwaway PostgreSQL 17, applies the real migrations + RLS security, and hands the
 * connection URLs to the tests. Nothing is mocked: tenant isolation is tested against real RLS.
 */
export default async function setup(project: TestProject) {
  const dir = mkdtempSync(join(tmpdir(), 'schoolos-test-pg-'));
  const port = 54400 + Math.floor(Math.random() * 500);
  const cluster = await startCluster({ dir, port, persistent: false, quiet: true });
  await bootstrapDatabase({ port, database: 'schoolos_test' });
  const urls = urlsFor(port, 'schoolos_test') as {
    DATABASE_URL: string;
    APP_DATABASE_URL: string;
    PLATFORM_DATABASE_URL: string;
  };

  execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
    env: { ...process.env, DATABASE_URL: urls.DATABASE_URL },
    stdio: 'pipe',
  });
  await applySecurity(urls.DATABASE_URL, { log: () => {} });

  project.provide('dbUrls', urls);

  return async () => {
    await cluster.stop();
    rmSync(dir, { recursive: true, force: true });
  };
}

declare module 'vitest' {
  export interface ProvidedContext {
    dbUrls: { DATABASE_URL: string; APP_DATABASE_URL: string; PLATFORM_DATABASE_URL: string };
  }
}
