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
};
