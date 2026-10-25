import 'server-only';

/** Server-side configuration. Never import from client components. */
export const serverEnv = {
  apiUrl: process.env.API_URL ?? 'http://localhost:4000',
  baseDomain: process.env.APP_BASE_DOMAIN ?? 'localhost',
  bffSecret: process.env.BFF_SHARED_SECRET,
  secureCookies: process.env.NODE_ENV === 'production',
  /** e.g. "cf-connecting-ip" behind Cloudflare. Unset = last X-Forwarded-For hop. */
  clientIpHeader: process.env.CLIENT_IP_HEADER?.toLowerCase(),
  /** Set when Cloudflare fronts Cloud Run (docs/10 §3 option B): requests without it are refused. */
  edgeSecret: process.env.EDGE_SHARED_SECRET || undefined,
  /** Only the public website (home, privacy, terms), e.g. on Vercel before the API is deployed. Sign-in is hidden. */
  siteOnly: process.env.SITE_ONLY === 'true',
  /** The whole product with a sample school and no API (demo/fixtures.json); changes aren't saved. */
  demo: process.env.DEMO_MODE === 'true',
  /** Local only: record API answers for the demo (tool/demo/record.mjs). */
  recordDemoDir: process.env.RECORD_DEMO_DIR || undefined,
};
