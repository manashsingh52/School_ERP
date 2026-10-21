import { importPKCS8, SignJWT } from 'jose';
import type { Env } from '../../config/env.js';

const SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';
const METADATA_TOKEN_URL = 'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token';

export type FcmResult = 'sent' | 'gone' | 'retry';

/**
 * Firebase Cloud Messaging, HTTP v1 API. Access tokens come from FCM_SERVICE_ACCOUNT_JSON when set,
 * otherwise from the Cloud Run service account (metadata server) — which needs the "Firebase Cloud
 * Messaging API Admin" role on the Firebase project.
 */
export class FcmClient {
  private token?: { value: string; expiresAt: number };

  constructor(private readonly env: Env) {}

  /** One message to one install. "gone" = the token is dead (app removed): forget it. */
  async send(token: string, title: string, body: string, data: Record<string, unknown>): Promise<FcmResult> {
    const res = await fetch(`${this.env.FCM_BASE_URL}/v1/projects/${this.env.FCM_PROJECT_ID}/messages:send`, {
      method: 'POST',
      headers: { authorization: `Bearer ${await this.accessToken()}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        message: {
          token,
          notification: { title, body },
          // FCM data values must be strings; the app reads `route` to open the right screen.
          data: Object.fromEntries(Object.entries(data).filter(([, v]) => v != null).map(([k, v]) => [k, typeof v === 'string' ? v : JSON.stringify(v)])),
          android: { priority: 'HIGH' },
        },
      }),
    });
    if (res.ok) return 'sent';
    if (res.status === 404) return 'gone';
    const error = (await res.json().catch(() => ({}))) as { error?: { status?: string; details?: { errorCode?: string }[] } };
    const code = error.error?.details?.find((d) => d.errorCode)?.errorCode ?? error.error?.status;
    if (code === 'UNREGISTERED' || code === 'INVALID_ARGUMENT') return 'gone';
    if (res.status === 401) this.token = undefined;
    return 'retry';
  }

  private async accessToken(): Promise<string> {
    if (this.token && this.token.expiresAt > Date.now() + 60_000) return this.token.value;
    const json = this.env.FCM_SERVICE_ACCOUNT_JSON;
    let res: Response;
    if (json) {
      const account = JSON.parse(json) as { client_email: string; private_key: string; token_uri?: string };
      const tokenUri = account.token_uri ?? 'https://oauth2.googleapis.com/token';
      const assertion = await new SignJWT({ scope: SCOPE })
        .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
        .setIssuer(account.client_email)
        .setAudience(tokenUri)
        .setIssuedAt()
        .setExpirationTime('1h')
        .sign(await importPKCS8(account.private_key, 'RS256'));
      res = await fetch(tokenUri, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
      });
    } else {
      res = await fetch(`${METADATA_TOKEN_URL}?scopes=${encodeURIComponent(SCOPE)}`, { headers: { 'Metadata-Flavor': 'Google' } });
    }
    if (!res.ok) throw new Error(`FCM access token: ${res.status}`);
    const body = (await res.json()) as { access_token: string; expires_in: number };
    this.token = { value: body.access_token, expiresAt: Date.now() + body.expires_in * 1000 };
    return body.access_token;
  }
}
