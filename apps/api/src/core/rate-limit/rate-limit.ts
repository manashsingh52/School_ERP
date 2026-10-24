import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  SetMetadata,
  applyDecorators,
  UseGuards,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import { RequestContextStore } from '../context/request-context.js';
import { AppError } from '../errors/app-error.js';
import { PlatformPrismaService } from '../prisma/prisma.service.js';

/**
 * Fixed-window rate limiter (docs/05 §5). Counters live in memory (development, tests, a single
 * instance) or in PostgreSQL (RATE_LIMIT_STORE=postgres), shared by every API instance.
 */
export abstract class RateLimitStore {
  abstract hit(key: string, windowSeconds: number): Promise<{ count: number; resetInSeconds: number }>;
}

export class MemoryRateLimitStore extends RateLimitStore {
  private readonly windows = new Map<string, { count: number; resetAt: number }>();

  async hit(key: string, windowSeconds: number) {
    const now = Date.now();
    let entry = this.windows.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowSeconds * 1000 };
      this.windows.set(key, entry);
      if (this.windows.size > 50_000) this.sweep(now);
    }
    entry.count += 1;
    return { count: entry.count, resetInSeconds: Math.ceil((entry.resetAt - now) / 1000) };
  }

  reset(): void {
    this.windows.clear();
  }

  private sweep(now: number): void {
    for (const [key, value] of this.windows) if (value.resetAt <= now) this.windows.delete(key);
  }
}

@Injectable()
export class PostgresRateLimitStore extends RateLimitStore {
  private hits = 0;

  constructor(private readonly platform: PlatformPrismaService) {
    super();
  }

  /** One atomic statement: start a new window when the old one is over, otherwise count. */
  async hit(key: string, windowSeconds: number) {
    const [row] = await this.platform.$queryRaw<{ count: number; reset_at: Date }[]>`
      INSERT INTO rate_limits (key, count, reset_at)
      VALUES (${key}, 1, (now() AT TIME ZONE 'UTC') + make_interval(secs => ${windowSeconds}::double precision))
      ON CONFLICT (key) DO UPDATE SET
        count = CASE WHEN rate_limits.reset_at <= (now() AT TIME ZONE 'UTC') THEN 1 ELSE rate_limits.count + 1 END,
        reset_at = CASE WHEN rate_limits.reset_at <= (now() AT TIME ZONE 'UTC') THEN EXCLUDED.reset_at ELSE rate_limits.reset_at END
      RETURNING count, reset_at`;
    if (++this.hits % 500 === 0) void this.platform.rateLimitCounter.deleteMany({ where: { resetAt: { lt: new Date() } } }).catch(() => undefined);
    return { count: row!.count, resetInSeconds: Math.max(1, Math.ceil((row!.reset_at.getTime() - Date.now()) / 1000)) };
  }
}

export interface RateLimitRule {
  name: string;
  limit: number;
  windowSeconds: number;
  /** Extra key material from the request body, e.g. the login identifier. */
  by?: 'ip' | 'ip+body.identifier' | 'ip+body.phone' | 'user';
}

const RATE_LIMIT_RULES = 'rate-limit:rules';

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly store: RateLimitStore,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const rules = this.reflector.get<RateLimitRule[] | undefined>(RATE_LIMIT_RULES, context.getHandler()) ?? [];
    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<Response>();
    for (const rule of rules) {
      const key = `${rule.name}:${this.keyFor(rule, req)}`;
      const { count, resetInSeconds } = await this.store.hit(key, rule.windowSeconds);
      if (count > rule.limit) {
        res.setHeader('Retry-After', String(resetInSeconds));
        throw new AppError('RATE_LIMITED', 429, 'Too many attempts. Please wait a moment and try again.');
      }
    }
    return true;
  }

  private keyFor(rule: RateLimitRule, req: Request): string {
    const ip = RequestContextStore.get()?.ip ?? req.ip ?? 'unknown';
    const body = (req.body ?? {}) as Record<string, unknown>;
    switch (rule.by) {
      case 'user': // signed-in routes: the global auth guard has already set the user
        return RequestContextStore.get()?.userId ?? ip;
      case 'ip+body.identifier':
        return `${ip}:${String(body.identifier ?? '').trim().toLowerCase()}`;
      case 'ip+body.phone':
        return `${ip}:${String(body.phone ?? '').replace(/\D/g, '')}`;
      default:
        return ip;
    }
  }
}

export const RateLimit = (...rules: RateLimitRule[]) =>
  applyDecorators(SetMetadata(RATE_LIMIT_RULES, rules), UseGuards(RateLimitGuard));
