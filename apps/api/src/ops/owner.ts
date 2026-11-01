import type { PasswordService } from '../core/auth/password.service.js';
import type { PlatformPrismaService } from '../core/prisma/prisma.service.js';
import { ensurePlatformDefaults } from '../seed/platform-defaults.js';

export interface OwnerInput {
  email: string;
  name?: string;
  password: string;
  phone?: string | null;
}

/**
 * A platform super admin with this email: created, or (if it exists) given the new password and
 * signed out everywhere. Also adds the starting plans and feature flags. Throws on bad input.
 */
export async function createOwner(db: PlatformPrismaService, passwords: PasswordService, input: OwnerInput): Promise<{ created: boolean; notes: string[] }> {
  const email = input.email.trim().toLowerCase();
  const name = input.name?.trim() || 'Bastaa Owner';
  const phone = input.phone?.trim() || null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Set OWNER_EMAIL to the owner’s email address');
  if (phone && !/^\+\d{10,15}$/.test(phone)) throw new Error('OWNER_PHONE must look like +919876543210');
  if (input.password.length < 12) throw new Error('OWNER_PASSWORD must be at least 12 characters');
  if (passwords.isTooCommon(input.password)) throw new Error('OWNER_PASSWORD is too common; choose another');

  const passwordHash = await passwords.hash(input.password);
  const existing = await db.user.findUnique({ where: { email } });
  const user = existing
    ? await db.user.update({ where: { id: existing.id }, data: { name, passwordHash, status: 'ACTIVE', ...(phone ? { phone } : {}) } })
    : await db.user.create({ data: { name, email, phone, passwordHash, status: 'ACTIVE', emailVerifiedAt: new Date() } });
  await db.platformAdmin.upsert({ where: { userId: user.id }, create: { userId: user.id, role: 'SUPER_ADMIN' }, update: { role: 'SUPER_ADMIN' } });
  if (existing) {
    await db.session.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date(), revokedReason: 'owner_password_reset' } });
  }
  return { created: !existing, notes: await ensurePlatformDefaults(db) };
}
