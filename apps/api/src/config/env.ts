import { z } from 'zod';

/** Validated configuration. The app refuses to start on missing or invalid values (docs/01 §8). */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
  PORT: z.coerce.number().int().default(4000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  APP_DATABASE_URL: z.url(),
  PLATFORM_DATABASE_URL: z.url(),
  DB_POOL_SIZE: z.coerce.number().int().min(1).max(50).default(5),

  JWT_PRIVATE_KEY: z.string().min(40, 'JWT_PRIVATE_KEY missing — run keys:generate'),
  JWT_PUBLIC_KEY: z.string().min(40, 'JWT_PUBLIC_KEY missing — run keys:generate'),
  JWT_ISSUER: z.string().default('schoolos'),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().default(15 * 60),

  OTP_PEPPER: z.string().min(16),
  OTP_PROVIDER: z.enum(['console', 'msg91']).default('console'),

  APP_BASE_DOMAIN: z.string().default('localhost'),

  /** Shared with the web BFF so it can pass the real client IP (X-Client-IP) for rate limits & sessions. */
  BFF_SHARED_SECRET: z.preprocess((v) => (v === '' ? undefined : v), z.string().min(32).optional()),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  • ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid configuration:\n${issues}`);
  }
  if (parsed.data.NODE_ENV === 'production' && parsed.data.OTP_PROVIDER === 'console') {
    throw new Error('OTP_PROVIDER=console is not allowed in production');
  }
  return parsed.data;
}

export const ENV = Symbol('ENV');
