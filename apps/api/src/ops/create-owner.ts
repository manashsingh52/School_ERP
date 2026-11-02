/**
 * Creates (or recovers) a Bastaa owner account for the platform console, and the starting plans
 * and feature flags. The one way to get the first super admin on a live server; the demo seed
 * refuses to run in production.
 *
 *   OWNER_EMAIL=you@example.com OWNER_NAME="Your Name" OWNER_PASSWORD=… pnpm owner:create
 *
 * On Cloud Run: `ENV=production OWNER_EMAIL=… ./infra/gcp/deploy.sh owner` asks for the password
 * and passes it through Secret Manager, so it never appears in logs or the job's settings.
 * Running it again for the same email sets a new password and signs that account out everywhere.
 */
import 'reflect-metadata';
import { PasswordService } from '../core/auth/password.service.js';
import { PlatformPrismaService } from '../core/prisma/prisma.service.js';
import type { Env } from '../config/env.js';
import { createOwner } from './owner.js';

async function main() {
  const url = process.env.PLATFORM_DATABASE_URL;
  if (!url) throw new Error('PLATFORM_DATABASE_URL is not set');
  const email = process.env.OWNER_EMAIL ?? '';
  const db = new PlatformPrismaService({ PLATFORM_DATABASE_URL: url } as Env);
  try {
    const { created, notes } = await createOwner(db, new PasswordService(), { email, name: process.env.OWNER_NAME, password: process.env.OWNER_PASSWORD ?? '', phone: process.env.OWNER_PHONE });
    console.log(`✓ ${created ? 'Created' : 'Updated'} owner ${email.trim().toLowerCase()} (super admin).`);
    if (notes.length) console.log(`✓ Added ${notes.join(', ')}.`);
    console.log('Sign in at https://admin.<your domain>/login.');
  } finally {
    await db.$disconnect();
  }
}

main().catch((err: unknown) => {
  console.error(`✗ ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
