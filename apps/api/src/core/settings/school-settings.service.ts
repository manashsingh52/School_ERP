import { Injectable } from '@nestjs/common';
import type { z } from 'zod';
import { SETTINGS_SECTIONS, type SettingsSection } from '@schoolos/contracts';
import { AuditService, diff } from '../audit/audit.service.js';
import { RequestContextStore } from '../context/request-context.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';

type Out<S extends SettingsSection> = z.output<(typeof SETTINGS_SECTIONS)[S]>;

/**
 * Typed settings sections over the JSON columns of school_settings (docs/12 Phase 6).
 * Reads always succeed: missing or out-of-date values fall back to defaults field by field,
 * so a new setting never breaks an existing school. Works in jobs (needs only the school).
 */
@Injectable()
export class SchoolSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private parse<S extends SettingsSection>(section: S, stored: unknown): Out<S> {
    const schema = SETTINGS_SECTIONS[section];
    const value = (stored && typeof stored === 'object' ? stored : {}) as Record<string, unknown>;
    const whole = schema.safeParse(value);
    if (whole.success) return whole.data as Out<S>;
    // Keep the fields that are still valid; default the rest.
    const defaults = schema.parse({}) as Record<string, unknown>;
    const shape = schema.shape as Record<string, z.ZodType>;
    const merged = Object.fromEntries(Object.keys(defaults).map((k) => [k, k in value && shape[k]!.safeParse(value[k]).success ? shape[k]!.parse(value[k]) : defaults[k]]));
    return merged as Out<S>;
  }

  async get<S extends SettingsSection>(section: S): Promise<Out<S>> {
    const row = await this.prisma.db.schoolSettings.findUnique({ where: { schoolId: RequestContextStore.school().schoolId } });
    return this.parse(section, row?.[section]);
  }

  async all(): Promise<{ [S in SettingsSection]: Out<S> }> {
    const row = await this.prisma.db.schoolSettings.findUnique({ where: { schoolId: RequestContextStore.school().schoolId } });
    return {
      general: this.parse('general', row?.general),
      fees: this.parse('fees', row?.fees),
      examinations: this.parse('examinations', row?.examinations),
      branding: this.parse('branding', row?.branding),
      notifications: this.parse('notifications', row?.notifications),
    };
  }

  async update<S extends SettingsSection>(section: S, input: Out<S>): Promise<Out<S>> {
    const { schoolId } = RequestContextStore.school();
    const before = await this.get(section);
    await this.prisma.tenantTx(async (tx) => {
      await tx.schoolSettings.upsert({
        where: { schoolId },
        create: { schoolId, [section]: input } as Prisma.SchoolSettingsUncheckedCreateInput,
        update: { [section]: input as Prisma.InputJsonValue },
      });
      const changed = diff(before as Record<string, unknown>, input as Record<string, unknown>);
      if (changed) await this.audit.record(tx, { action: `settings.${section}`, entityType: 'SchoolSettings', entityId: schoolId, ...changed });
    });
    return this.get(section);
  }
}
