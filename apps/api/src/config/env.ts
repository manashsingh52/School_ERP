import { z } from 'zod';

const optional = <T extends z.ZodType>(schema: T) => z.preprocess((v) => (v === '' ? undefined : v), schema.optional());
const flag = (fallback: boolean) =>
  z.preprocess((v) => (v === undefined || v === '' ? fallback : ['1', 'true', 'yes'].includes(String(v).toLowerCase())), z.boolean());

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
  // ⏸ SMS — fill in once the company is DLT-registered (docs/SETUP-LATER.md)
  MSG91_AUTH_KEY: optional(z.string()),
  MSG91_SENDER_ID: optional(z.string()),
  MSG91_OTP_TEMPLATE_ID: optional(z.string()),

  // Notification channels (docs/01 §3 notifications). console = print to the log (development).
  PUSH_PROVIDER: z.enum(['none', 'console', 'fcm']).default('none'),
  SMS_PROVIDER: z.enum(['none', 'console', 'msg91']).default('none'),
  EMAIL_PROVIDER: z.enum(['none', 'console', 'resend']).default('none'),
  // ⏸ Email via Resend — fill in once the sending domain is verified
  RESEND_API_KEY: optional(z.string()),
  EMAIL_FROM: optional(z.string()),

  // Background jobs (docs/01 §5). V1 runs BullMQ on PostgreSQL — no Redis needed.
  QUEUE_BACKEND: z.enum(['postgres', 'redis']).default('postgres'),
  /** Defaults to PLATFORM_DATABASE_URL. */
  QUEUE_DATABASE_URL: optional(z.url()),
  // ⏸ Only when QUEUE_BACKEND=redis (e.g. Upstash, later)
  REDIS_URL: optional(z.url()),
  /** Run job processors + outbox relay in this process ("lean mode"); the worker entrypoint always does. */
  RUN_WORKERS: flag(false),

  // File storage (docs/09 §3). Local disk in development; Google Cloud Storage in staging/production.
  STORAGE_DRIVER: z.enum(['local', 'gcs']).default('local'),
  /** chromium = real PDFs (report cards, receipts); basic = plain-text PDFs for tests/CI without a browser. */
  PDF_RENDERER: z.enum(['chromium', 'basic']).default('chromium'),
  /** Chrome/Chromium binary. Empty = the usual install location for this OS. */
  CHROMIUM_PATH: z.string().optional(),
  STORAGE_LOCAL_DIR: z.string().default('.data/storage'),
  /** Where the browser sends local-driver uploads (the web BFF proxies /api/v1/* to this API). */
  STORAGE_LOCAL_URL_BASE: z.string().default('/api'),
  STORAGE_SIGNING_SECRET: optional(z.string().min(32)),
  // ⏸ Google Cloud Storage — fill in at deploy time
  GCS_PROJECT_ID: optional(z.string()),
  GCS_PRIVATE_BUCKET: optional(z.string()),
  GCS_PUBLIC_BUCKET: optional(z.string()),

  APP_BASE_DOMAIN: z.string().default('localhost'),
  /** Public URL of this API (shown to schools as their Razorpay webhook URL). */
  PUBLIC_API_URL: z.string().default('http://localhost:4000'),

  // Payments (docs/11). mock = local sandbox (no real money, no Razorpay account needed);
  // razorpay = real API with each school's own keys.
  PAYMENTS_GATEWAY: z.enum(['mock', 'razorpay']).default('mock'),
  /** AES-256-GCM key (base64, 32 bytes) for schools' gateway secrets — run keys:generate. ⏸ Secret Manager in production. */
  PAYMENT_SECRETS_KEY: optional(z.string().min(40)),

  /** Shared with the web BFF so it can pass the real client IP (X-Client-IP) for rate limits & sessions. */
  BFF_SHARED_SECRET: optional(z.string().min(32)),
});

export type Env = z.infer<typeof envSchema>;

/** Cross-field rules: a selected provider must have its settings. */
function checkProviders(env: Env): string[] {
  const problems: string[] = [];
  if (env.QUEUE_BACKEND === 'redis' && !env.REDIS_URL) problems.push('QUEUE_BACKEND=redis needs REDIS_URL');
  if (env.STORAGE_DRIVER === 'local' && !env.STORAGE_SIGNING_SECRET) problems.push('STORAGE_DRIVER=local needs STORAGE_SIGNING_SECRET (32+ chars)');
  if (env.STORAGE_DRIVER === 'gcs' && (!env.GCS_PRIVATE_BUCKET || !env.GCS_PROJECT_ID)) {
    problems.push('STORAGE_DRIVER=gcs needs GCS_PROJECT_ID and GCS_PRIVATE_BUCKET');
  }
  if (env.PAYMENT_SECRETS_KEY && Buffer.from(env.PAYMENT_SECRETS_KEY, 'base64').length !== 32) problems.push('PAYMENT_SECRETS_KEY must be 32 bytes, base64');
  if (env.EMAIL_PROVIDER === 'resend' && (!env.RESEND_API_KEY || !env.EMAIL_FROM)) problems.push('EMAIL_PROVIDER=resend needs RESEND_API_KEY and EMAIL_FROM');
  if (env.OTP_PROVIDER === 'msg91' && (!env.MSG91_AUTH_KEY || !env.MSG91_OTP_TEMPLATE_ID)) {
    problems.push('OTP_PROVIDER=msg91 needs MSG91_AUTH_KEY and MSG91_OTP_TEMPLATE_ID');
  }
  return problems;
}

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  • ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid configuration:\n${issues}`);
  }
  if (parsed.data.NODE_ENV === 'production' && parsed.data.PAYMENTS_GATEWAY === 'mock') {
    throw new Error('PAYMENTS_GATEWAY=mock is not allowed in production');
  }
  if (parsed.data.NODE_ENV === 'production' && parsed.data.OTP_PROVIDER === 'console') {
    throw new Error('OTP_PROVIDER=console is not allowed in production');
  }
  if (parsed.data.NODE_ENV === 'production' && parsed.data.STORAGE_DRIVER === 'local') {
    throw new Error('STORAGE_DRIVER=local is not allowed in production');
  }
  const problems = checkProviders(parsed.data);
  if (problems.length) throw new Error(`Invalid configuration:\n${problems.map((p) => `  • ${p}`).join('\n')}`);
  return parsed.data;
}

export const ENV = Symbol('ENV');
