/**
 * SchoolOS edge router (docs/10 §3, option B — the lean alternative to a Google load balancer).
 * Cloudflare serves *.<domain> and api.<domain>, then forwards to the Cloud Run services:
 *   api.<domain>            → API service (apps, Razorpay webhooks)
 *   everything else         → web service (school subdomains, admin console, "find your school")
 * The original host goes in X-Forwarded-Host; X-Edge-Secret proves the request came through here,
 * so the public *.run.app URLs refuse direct traffic.
 *
 * Settings (wrangler secret / vars): BASE_DOMAIN, API_ORIGIN, WEB_ORIGIN, EDGE_SECRET.
 */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const host = url.hostname.toLowerCase();
    if (host !== env.BASE_DOMAIN && !host.endsWith(`.${env.BASE_DOMAIN}`)) return new Response('Not found', { status: 404 });

    const origin = host === `api.${env.BASE_DOMAIN}` ? env.API_ORIGIN : env.WEB_ORIGIN;
    const target = new URL(url.pathname + url.search, origin);

    const headers = new Headers(request.headers);
    headers.set('x-forwarded-host', url.host);
    headers.set('x-forwarded-proto', 'https');
    headers.set('x-edge-secret', env.EDGE_SECRET);
    // Never trust these from the browser.
    headers.delete('x-school-slug');
    headers.delete('x-schoolos-console');
    headers.delete('x-bff-key');
    headers.delete('x-client-ip');

    const response = await fetch(target, {
      method: request.method,
      headers,
      body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body,
      redirect: 'manual', // the apps build redirects with the real host already
    });
    const out = new Response(response.body, response);
    out.headers.set('strict-transport-security', 'max-age=31536000; includeSubDomains');
    return out;
  },
};
