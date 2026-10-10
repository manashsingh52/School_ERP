import { type ChildProcess, execFileSync, spawn } from 'node:child_process';
import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { cpSync, createWriteStream, existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
// Plain .mjs helpers shared with the API's dev scripts and tests.
import { bootstrapDatabase, startCluster, urlsFor } from '../api/scripts/pg-cluster.mjs';
import { applySecurity } from '../api/scripts/apply-sql.mjs';
import { API_PORT, PASSWORD, WEB_PORT } from './fixtures.js';

const here = dirname(fileURLToPath(import.meta.url));
const apiDir = join(here, '../api');
const webDir = join(here, '../web');
const logDir = join(here, 'test-results');

async function waitFor(url: string, child: ChildProcess, name: string, ms = 90_000) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if (child.exitCode !== null) throw new Error(`${name} exited (${child.exitCode}) — see ${logDir}/${name}.log`);
    try {
      if ((await fetch(url)).status < 500) return;
    } catch {
      // not listening yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`${name} didn't start within ${ms / 1000}s — see ${logDir}/${name}.log`);
}

function start(name: string, args: string[], cwd: string, env: Record<string, string>): ChildProcess {
  const log = createWriteStream(join(logDir, `${name}.log`));
  const child = spawn(process.execPath, args, { cwd, env: { PATH: process.env.PATH ?? '', ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout!.pipe(log);
  child.stderr!.pipe(log);
  return child;
}

/**
 * A throwaway PostgreSQL with the real migrations, RLS and demo seed, then the built API and web
 * app in front of it. Nothing is mocked except the payment gateway (mock sandbox) and PDFs (basic).
 */
export default async function globalSetup() {
  for (const built of [join(apiDir, 'dist/main.js'), join(webDir, '.next/standalone/apps/web/server.js')]) {
    if (!existsSync(built)) throw new Error(`${built} is missing — run \`pnpm e2e\` from the repo root (it builds first).`);
  }
  mkdirSync(logDir, { recursive: true });

  const dir = mkdtempSync(join(tmpdir(), 'schoolos-e2e-pg-'));
  const files = mkdtempSync(join(tmpdir(), 'schoolos-e2e-files-'));
  const port = 54900 + Math.floor(Math.random() * 500);
  const cluster = await startCluster({ dir, port, persistent: false, quiet: true });
  await bootstrapDatabase({ port, database: 'schoolos_e2e' });
  const urls = urlsFor(port, 'schoolos_e2e') as { DATABASE_URL: string; APP_DATABASE_URL: string; PLATFORM_DATABASE_URL: string };
  execFileSync('npx', ['prisma', 'migrate', 'deploy'], { cwd: apiDir, env: { ...process.env, DATABASE_URL: urls.DATABASE_URL }, stdio: 'pipe' });
  await applySecurity(urls.DATABASE_URL, { log: () => {} });

  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const bff = randomBytes(32).toString('base64url');
  // No --env-file: nothing from a developer's apps/api/.env (keys, providers) leaks into the run.
  const apiEnv = {
    NODE_ENV: 'development',
    LOG_LEVEL: 'warn',
    PORT: String(API_PORT),
    APP_DATABASE_URL: urls.APP_DATABASE_URL,
    PLATFORM_DATABASE_URL: urls.PLATFORM_DATABASE_URL,
    JWT_PRIVATE_KEY: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    JWT_PUBLIC_KEY: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    OTP_PEPPER: randomBytes(16).toString('hex'),
    STORAGE_DRIVER: 'local',
    STORAGE_LOCAL_DIR: files,
    STORAGE_SIGNING_SECRET: randomBytes(32).toString('base64url'),
    PDF_RENDERER: 'basic',
    PAYMENTS_GATEWAY: 'mock',
    PAYMENT_SECRETS_KEY: randomBytes(32).toString('base64'),
    AI_PROVIDER: 'mock',
    RUN_WORKERS: 'true',
    BFF_SHARED_SECRET: bff,
    PUBLIC_API_URL: `http://localhost:${API_PORT}`,
  };
  execFileSync(process.execPath, ['dist/seed/seed.js'], { cwd: apiDir, env: { PATH: process.env.PATH ?? '', ...apiEnv, SEED_PASSWORD: PASSWORD }, stdio: 'pipe' });

  const api = start('api', ['--enable-source-maps', 'dist/main.js'], apiDir, apiEnv);
  await waitFor(`http://localhost:${API_PORT}/health`, api, 'api');

  // The standalone server serves .next/static only when it sits next to it (as in the Dockerfile).
  const standalone = join(webDir, '.next/standalone/apps/web');
  cpSync(join(webDir, '.next/static'), join(standalone, '.next/static'), { recursive: true });
  const web = start('web', ['server.js'], standalone, {
    NODE_ENV: 'production',
    PORT: String(WEB_PORT),
    HOSTNAME: '::',
    API_URL: `http://localhost:${API_PORT}`,
    APP_BASE_DOMAIN: 'localhost',
    BFF_SHARED_SECRET: bff,
    NEXT_TELEMETRY_DISABLED: '1',
  });
  await waitFor(`http://localhost:${WEB_PORT}/login`, web, 'web');

  return async () => {
    for (const child of [web, api]) child.kill('SIGTERM');
    await cluster.stop();
    rmSync(dir, { recursive: true, force: true });
    rmSync(files, { recursive: true, force: true });
  };
}
