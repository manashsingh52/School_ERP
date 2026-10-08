'use client';

import type { GatewayConnected, GatewayStatus } from '@schoolos/contracts';
import { Badge, Button, Card, CardHeader, Field, Input, Select, Skeleton, toast } from '@schoolos/ui';
import { useQueryClient } from '@tanstack/react-query';
import { Copy, Plug, RefreshCw, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { ApiError, apiPost, apiPut } from '@/lib/api-client';
import { formatDate } from '@/lib/format';
import { useData } from '@/lib/hooks';

const copy = (text: string) => void navigator.clipboard.writeText(text).then(() => toast.success('Copied'));

/** Connect the school's own Razorpay account (docs/11 §2). */
export function GatewayTab() {
  const qc = useQueryClient();
  const status = useData<GatewayStatus>(['payments', 'gateway'], '/payments/gateway');
  const [mode, setMode] = useState<'TEST' | 'LIVE'>('TEST');
  const [keyId, setKeyId] = useState('');
  const [keySecret, setKeySecret] = useState('');
  const [connected, setConnected] = useState<GatewayConnected | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ['payments', 'gateway'] });

  async function act(name: string, fn: () => Promise<unknown>, ok: string) {
    setBusy(name);
    try {
      await fn();
      await refresh();
      toast.success(ok);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'That didn’t work.');
    } finally {
      setBusy(null);
    }
  }

  if (!status.data) return <Skeleton className="h-80" />;
  const s = status.data;
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_380px]">
      <div className="flex flex-col gap-4">
        {s.driver === 'mock' && (
          <div className="rounded-lg border border-info-border bg-info-bg px-4 py-3 text-small text-info">
            Sandbox mode: payments are simulated on this server — no Razorpay account or real money involved. Any key like <code>rzp_test_ABC123</code> works.
          </div>
        )}
        {s.accounts.map((a) => (
          <Card key={a.mode}>
            <CardHeader
              title={`${a.mode === 'LIVE' ? 'Live' : 'Test'} account`}
              description={`Key ${a.keyId} · connected ${formatDate(a.createdAt)}`}
              action={<Badge tone={a.isActive ? 'success' : a.verifiedAt ? 'info' : 'warning'} dot>{a.isActive ? 'Parents can pay' : a.verifiedAt ? 'Ready' : 'Waiting for webhook'}</Badge>}
            />
            <div className="flex flex-col gap-3 p-5">
              <Field label="Webhook URL (add this in Razorpay → Settings → Webhooks)" htmlFor={`wh-${a.mode}`}>
                <div className="flex gap-2"><Input id={`wh-${a.mode}`} readOnly value={a.webhookUrl} className="font-mono text-small" /><Button variant="secondary" size="icon" aria-label="Copy URL" onClick={() => copy(a.webhookUrl)}><Copy /></Button></div>
              </Field>
              <div className="flex flex-wrap gap-2">
                {!a.verifiedAt && s.driver === 'mock' && <Button variant="secondary" onClick={() => void act('ping', () => apiPost('/payments/gateway/test-webhook', { mode: a.mode }), 'Webhook verified')} loading={busy === 'ping'}><ShieldCheck /> Send test webhook</Button>}
                {a.verifiedAt && !a.isActive && <Button onClick={() => void act('on', () => apiPost('/payments/gateway/activate', { mode: a.mode, active: true }), 'Online payments are on')} loading={busy === 'on'}>Turn on online payments</Button>}
                {a.isActive && <Button variant="secondary" onClick={() => void act('off', () => apiPost('/payments/gateway/activate', { mode: a.mode, active: false }), 'Online payments are off')} loading={busy === 'off'}>Turn off</Button>}
                {a.isActive && <Button variant="ghost" onClick={() => void act('rec', () => apiPost('/payments/online/reconcile'), 'Checked open payments with Razorpay')} loading={busy === 'rec'}><RefreshCw /> Check pending payments</Button>}
              </div>
              {!a.verifiedAt && s.driver === 'razorpay' && <p className="text-small text-fg-secondary">Add the webhook in Razorpay with the secret shown when you connected, then make a ₹1 test payment. It turns “Ready” when the first webhook arrives.</p>}
            </div>
          </Card>
        ))}
        {connected && (
          <Card className="border-warning-border">
            <CardHeader title="Copy this webhook secret now" description="It is shown only once. Paste it into Razorpay along with the webhook URL." />
            <div className="flex flex-col gap-3 p-5">
              <div className="flex gap-2"><Input readOnly value={connected.webhookSecret} className="font-mono" aria-label="Webhook secret" /><Button variant="secondary" size="icon" aria-label="Copy secret" onClick={() => copy(connected.webhookSecret)}><Copy /></Button></div>
              <p className="text-small text-fg-secondary">Tick these events: {connected.events.join(', ')}.</p>
              <Button variant="ghost" className="self-start" onClick={() => setConnected(null)}>I've copied it</Button>
            </div>
          </Card>
        )}
      </div>
      <Card className="h-fit">
        <CardHeader title={s.accounts.length ? 'Connect again / change keys' : 'Connect Razorpay'} description="Fees go straight to your school's own Razorpay account." />
        <div className="flex flex-col gap-4 p-5">
          <Field label="Mode" htmlFor="gw-mode"><Select id="gw-mode" value={mode} onChange={(e) => setMode(e.target.value as 'TEST' | 'LIVE')}><option value="TEST">Test (no real money)</option><option value="LIVE">Live</option></Select></Field>
          <Field label="Key ID" htmlFor="gw-key"><Input id="gw-key" value={keyId} onChange={(e) => setKeyId(e.target.value.trim())} placeholder={mode === 'LIVE' ? 'rzp_live_…' : 'rzp_test_…'} /></Field>
          <Field label="Key secret" htmlFor="gw-secret" hint="Stored encrypted. We never show it again."><Input id="gw-secret" type="password" value={keySecret} onChange={(e) => setKeySecret(e.target.value)} autoComplete="off" /></Field>
          <Button
            onClick={() =>
              void act(
                'connect',
                async () => {
                  setConnected((await apiPut<{ data: GatewayConnected }>('/payments/gateway', { mode, keyId, keySecret })).data);
                  setKeySecret('');
                },
                'Keys accepted by Razorpay',
              )
            }
            loading={busy === 'connect'}
            disabled={!keyId || !keySecret}
          >
            <Plug /> Connect
          </Button>
        </div>
      </Card>
    </div>
  );
}
