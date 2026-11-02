import type { PlatformPrismaService } from '../core/prisma/prisma.service.js';

/** Starting plans; the owner edits prices and limits in the console (Plans). */
export const DEFAULT_PLANS = [
  { code: 'basic', name: 'Basic', priceMonthlyPaise: 4_999_00, limits: { students: 500, storageGb: 5, smsPerMonth: 2_000, aiCallsPerMonth: 0 }, features: [] },
  { code: 'professional', name: 'Professional', priceMonthlyPaise: 12_999_00, limits: { students: 2_000, storageGb: 50, smsPerMonth: 10_000, aiCallsPerMonth: 500 }, features: ['online_payments', 'report_builder'] },
  { code: 'enterprise', name: 'Enterprise', priceMonthlyPaise: null, limits: { students: null, storageGb: 500, smsPerMonth: null, aiCallsPerMonth: 5_000 }, features: ['online_payments', 'report_builder', 'ai_assistant'] },
];

export const DEFAULT_FLAGS = [
  { key: 'online_payments', description: 'Parents pay fees online through the school’s Razorpay account', defaultEnabled: false },
  { key: 'report_builder', description: 'Reports centre with exports (PDF, Excel, CSV)', defaultEnabled: false },
  { key: 'ai_assistant', description: 'AI assistant for staff (later phase)', defaultEnabled: false },
  { key: 'documents', description: 'Student and staff documents', defaultEnabled: true },
];

/** Plans (only if there are none yet) and feature flags (missing ones only). Safe to run again. */
export async function ensurePlatformDefaults(db: PlatformPrismaService): Promise<string[]> {
  const notes: string[] = [];
  if (!(await db.plan.count())) {
    for (const p of DEFAULT_PLANS) await db.plan.create({ data: p });
    notes.push(`${DEFAULT_PLANS.length} plans`);
  }
  for (const f of DEFAULT_FLAGS) {
    if (await db.featureFlag.findUnique({ where: { key: f.key } })) continue;
    await db.featureFlag.create({ data: f });
    notes.push(`flag ${f.key}`);
  }
  return notes;
}
