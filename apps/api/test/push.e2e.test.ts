/** Push notifications through FCM (HTTP v1), against a fake Google server. */
import { generateKeyPairSync } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ChannelGateway } from '../src/core/notify/channel-gateway.js';
import { createTenant, createTestApp, type Tenant, type TestApp } from './helpers.js';

let server: Server;
let t: TestApp;
let A: Tenant;
const sends: { auth: string; body: { message: { token: string; notification: object; data: Record<string, string> } } }[] = [];
let tokenRequests = 0;
let fcmDown = false;

beforeAll(async () => {
  server = createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      res.setHeader('content-type', 'application/json');
      if (req.url === '/token') {
        tokenRequests++;
        expect(new URLSearchParams(raw).get('grant_type')).toBe('urn:ietf:params:oauth:grant-type:jwt-bearer');
        return res.end(JSON.stringify({ access_token: 'fcm-access', expires_in: 3600 }));
      }
      if (fcmDown) {
        res.statusCode = 503;
        return res.end('{}');
      }
      const body = JSON.parse(raw);
      sends.push({ auth: req.headers.authorization!, body });
      if (body.message.token.startsWith('dead')) {
        res.statusCode = 404;
        return res.end(JSON.stringify({ error: { status: 'NOT_FOUND', details: [{ errorCode: 'UNREGISTERED' }] } }));
      }
      res.end(JSON.stringify({ name: 'projects/p/messages/1' }));
    });
  });
  await new Promise<void>((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const account = { client_email: 'push@p.iam.gserviceaccount.com', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(), token_uri: `${base}/token` };
  t = await createTestApp({ PUSH_PROVIDER: 'fcm', FCM_PROJECT_ID: 'schoolos-test', FCM_BASE_URL: base, FCM_SERVICE_ACCOUNT_JSON: JSON.stringify(account) });
  A = await createTenant(t, 'push');
});

afterAll(async () => {
  await t?.close();
  server?.close();
});

const parent = () => t.platform.user.findUniqueOrThrow({ where: { email: A.users.parent } });

describe('FCM push', () => {
  it('sends to every phone, and forgets a phone whose app was removed', async () => {
    const user = await parent();
    await t.platform.deviceToken.createMany({ data: [{ userId: user.id, platform: 'ANDROID', token: 'live-token-0123456789' }, { userId: user.id, platform: 'ANDROID', token: 'dead-token-0123456789' }] });
    const gateway = t.app.get(ChannelGateway);
    const result = await gateway.send({ channel: 'PUSH', userId: user.id, phone: null, email: null, title: 'Rahul is absent', body: 'Marked absent in 8-A today.', data: { route: '/attendance', count: 2 } });
    expect(result.status).toBe('SENT');

    const live = sends.find((s) => s.body.message.token === 'live-token-0123456789')!;
    expect(live.auth).toBe('Bearer fcm-access');
    expect(live.body.message.notification).toEqual({ title: 'Rahul is absent', body: 'Marked absent in 8-A today.' });
    expect(live.body.message.data).toEqual({ route: '/attendance', count: '2' });
    expect(await t.platform.deviceToken.findUnique({ where: { token: 'dead-token-0123456789' } })).toBeNull();

    // The access token is reused, not fetched per message.
    await gateway.send({ channel: 'PUSH', userId: user.id, phone: null, email: null, title: 'Again', body: 'Again', data: {} });
    expect(tokenRequests).toBe(1);
  });

  it('asks the queue to retry when FCM is down, and skips people without the app', async () => {
    const user = await parent();
    const gateway = t.app.get(ChannelGateway);
    fcmDown = true;
    await expect(gateway.send({ channel: 'PUSH', userId: user.id, phone: null, email: null, title: 'x', body: 'x', data: {} })).rejects.toThrow(/FCM/);
    fcmDown = false;

    const teacher = await t.platform.user.findUniqueOrThrow({ where: { email: A.users.teacher } });
    const none = await gateway.send({ channel: 'PUSH', userId: teacher.id, phone: null, email: null, title: 'x', body: 'x', data: {} });
    expect(none).toMatchObject({ status: 'SKIPPED', reason: 'No app installed' });
  });
});
