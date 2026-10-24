import { Injectable } from '@nestjs/common';
import type { Entitlements, PlanLimits } from '@schoolos/contracts';
import { RequestContextStore } from '../context/request-context.js';
import { AppError } from '../errors/app-error.js';
import { PlatformPrismaService } from '../prisma/prisma.service.js';
import { TtlCache } from '../cache/ttl-cache.js';

const UNLIMITED: PlanLimits = { students: null, storageGb: null, smsPerMonth: null, aiCallsPerMonth: null };
export type Metric = 'sms' | 'email' | 'ai_calls';
const GB = 1024 ** 3;

/** "2026-10" in India time. */
export const usagePeriod = (at = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit' }).format(at).slice(0, 7);

export type FeatureSource = 'kill_switch' | 'override' | 'plan' | 'default';

/**
 * Plan limits and feature flags (docs/12 Phase 6). Plans, flags and usage are platform data, so
 * this core service reads them with the platform client — always filtered by one school id.
 * A school without a subscription is treated as unlimited (never lock out a live school by accident).
 */
@Injectable()
export class EntitlementsService {
  private readonly cache = new TtlCache<{ limits: PlanLimits; plan: { code: string; name: string } | null; status: Entitlements['status']; planFeatures: string[] }>(60_000);

  constructor(private readonly platform: PlatformPrismaService) {}

  private plan(schoolId: string) {
    return this.cache.getOrLoad(schoolId, async () => {
      const sub = await this.platform.subscription.findUnique({ where: { schoolId }, include: { plan: true } });
      if (!sub) return { limits: UNLIMITED, plan: null, status: null, planFeatures: [] };
      const base = { ...UNLIMITED, ...(sub.plan.limits as Partial<PlanLimits>) };
      const limits = { ...base, ...((sub.limitOverrides as Partial<PlanLimits> | null) ?? {}) };
      return { limits, plan: { code: sub.plan.code, name: sub.plan.name }, status: sub.status, planFeatures: sub.plan.features };
    });
  }

  invalidate(schoolId: string): void {
    this.cache.delete(schoolId);
  }

  async limits(schoolId = RequestContextStore.school().schoolId): Promise<PlanLimits> {
    return (await this.plan(schoolId)).limits;
  }

  async usage(schoolId: string): Promise<Entitlements['usage']> {
    const period = usagePeriod();
    const [students, storage, counters] = await Promise.all([
      this.platform.student.count({ where: { schoolId, status: 'ACTIVE', archivedAt: null } }),
      this.platform.file.aggregate({ where: { schoolId, status: 'READY', deletedAt: null }, _sum: { sizeBytes: true } }),
      this.platform.usageCounter.findMany({ where: { schoolId, period } }),
    ]);
    const c = (m: string) => Number(counters.find((x) => x.metric === m)?.value ?? 0);
    return { students, storageBytes: Number(storage._sum.sizeBytes ?? 0), smsThisMonth: c('sms'), aiCallsThisMonth: c('ai_calls') };
  }

  async entitlements(schoolId = RequestContextStore.school().schoolId): Promise<Entitlements> {
    const [p, usage, features] = await Promise.all([this.plan(schoolId), this.usage(schoolId), this.features(schoolId)]);
    return { plan: p.plan, status: p.status, limits: p.limits, usage, features: features.filter((f) => f.enabled).map((f) => f.key) };
  }

  /** Refuse adding `count` more students beyond the plan. */
  async assertStudents(count = 1): Promise<void> {
    const schoolId = RequestContextStore.school().schoolId;
    const { students } = await this.limits(schoolId);
    if (students === null) return;
    const current = await this.platform.student.count({ where: { schoolId, status: 'ACTIVE', archivedAt: null } });
    if (current + count > students) {
      throw new AppError('PLAN_LIMIT_STUDENTS', 422, `Your plan allows ${students} students and you have ${current}. Ask Bastaa to upgrade your plan.`);
    }
  }

  async assertStorage(addBytes: number): Promise<void> {
    const schoolId = RequestContextStore.school().schoolId;
    const { storageGb } = await this.limits(schoolId);
    if (storageGb === null) return;
    const used = Number((await this.platform.file.aggregate({ where: { schoolId, status: { in: ['READY', 'PENDING_UPLOAD'] }, deletedAt: null }, _sum: { sizeBytes: true } }))._sum.sizeBytes ?? 0);
    if (used + addBytes > storageGb * GB) throw new AppError('PLAN_LIMIT_STORAGE', 422, `Your plan's ${storageGb} GB of file storage is full. Delete old files or upgrade your plan.`);
  }

  /** True if one more `metric` fits this month (SMS etc.). */
  /** This month's count for a metered metric. */
  async used(metric: Metric, schoolId: string): Promise<number> {
    const row = await this.platform.usageCounter.findUnique({ where: { schoolId_metric_period: { schoolId, metric, period: usagePeriod() } } });
    return Number(row?.value ?? 0);
  }

  async withinMonthly(metric: Metric, schoolId: string): Promise<boolean> {
    const limits = await this.limits(schoolId);
    const cap = metric === 'sms' ? limits.smsPerMonth : metric === 'ai_calls' ? limits.aiCallsPerMonth : null;
    if (cap === null) return true;
    const row = await this.platform.usageCounter.findUnique({ where: { schoolId_metric_period: { schoolId, metric, period: usagePeriod() } } });
    return Number(row?.value ?? 0) < cap;
  }

  async record(metric: Metric, schoolId: string, amount = 1): Promise<void> {
    const period = usagePeriod();
    await this.platform.usageCounter.upsert({
      where: { schoolId_metric_period: { schoolId, metric, period } },
      create: { schoolId, metric, period, value: amount },
      update: { value: { increment: amount } },
    });
  }

  // ---------------------------------------------------------------- feature flags

  async features(schoolId: string): Promise<{ key: string; description: string; enabled: boolean; source: FeatureSource }[]> {
    const [flags, overrides, p] = await Promise.all([
      this.platform.featureFlag.findMany({ orderBy: { key: 'asc' } }),
      this.platform.schoolFeature.findMany({ where: { schoolId } }),
      this.plan(schoolId),
    ]);
    return flags.map((f) => {
      const o = overrides.find((x) => x.flagKey === f.key);
      const [enabled, source]: [boolean, FeatureSource] = f.killSwitch
        ? [false, 'kill_switch']
        : o
          ? [o.enabled, 'override']
          : p.planFeatures.includes(f.key)
            ? [true, 'plan']
            : [f.defaultEnabled, 'default'];
      return { key: f.key, description: f.description, enabled, source };
    });
  }

  async enabled(key: string, schoolId = RequestContextStore.school().schoolId): Promise<boolean> {
    return (await this.features(schoolId)).find((f) => f.key === key)?.enabled ?? false;
  }
}
