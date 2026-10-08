import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { Injectable } from '@nestjs/common';

export interface GatewayCreds {
  keyId: string;
  keySecret: string;
}

export interface GatewayPayment {
  id: string;
  orderId: string | null;
  amountPaise: number;
  status: 'created' | 'authorized' | 'captured' | 'refunded' | 'failed';
  method: string | null;
}

export class GatewayAuthError extends Error {}
export class GatewayUnavailableError extends Error {}

/** HMAC-SHA256 hex, compared in constant time (Razorpay checkout + webhook signatures). */
export function hmacHex(secret: string, data: string | Buffer): string {
  return createHmac('sha256', secret).update(data).digest('hex');
}
export function safeEqualHex(a: string, b: string): boolean {
  const x = Buffer.from(a, 'utf8');
  const y = Buffer.from(b, 'utf8');
  return x.length === y.length && timingSafeEqual(x, y);
}

/** The only code that talks to a payment gateway (docs/11). */
export abstract class GatewayClient {
  abstract readonly driver: 'mock' | 'razorpay';
  abstract verifyKeys(creds: GatewayCreds): Promise<void>;
  abstract createOrder(creds: GatewayCreds, o: { amountPaise: number; receipt: string; notes: Record<string, string> }): Promise<{ id: string }>;
  abstract fetchPayment(creds: GatewayCreds, paymentId: string): Promise<GatewayPayment>;
  abstract fetchOrderPayments(creds: GatewayCreds, orderId: string): Promise<GatewayPayment[]>;
  abstract capture(creds: GatewayCreds, paymentId: string, amountPaise: number): Promise<GatewayPayment>;
  abstract refund(creds: GatewayCreds, paymentId: string, amountPaise: number, notes: Record<string, string>): Promise<{ id: string; status: 'pending' | 'processed' | 'failed' }>;
}

const toPayment = (p: { id: string; order_id: string | null; amount: number; status: GatewayPayment['status']; method?: string | null }): GatewayPayment => ({
  id: p.id,
  orderId: p.order_id,
  amountPaise: p.amount,
  status: p.status,
  method: p.method ?? null,
});

/** Razorpay REST API with the school's own keys. ⏸ Needs a Razorpay account (docs/SETUP-LATER.md). */
@Injectable()
export class RazorpayClient extends GatewayClient {
  readonly driver = 'razorpay' as const;
  private readonly base = 'https://api.razorpay.com/v1';

  private async call<T>(creds: GatewayCreds, method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${this.base}${path}`, {
        method,
        headers: { authorization: `Basic ${Buffer.from(`${creds.keyId}:${creds.keySecret}`).toString('base64')}`, 'content-type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(15_000),
      });
    } catch (err) {
      throw new GatewayUnavailableError(err instanceof Error ? err.message : 'network error');
    }
    if (res.status === 401) throw new GatewayAuthError('Razorpay rejected the keys');
    if (res.status >= 500) throw new GatewayUnavailableError(`Razorpay responded ${res.status}`);
    const json = (await res.json().catch(() => ({}))) as T & { error?: { description?: string } };
    if (!res.ok) throw new Error(json.error?.description ?? `Razorpay responded ${res.status}`);
    return json;
  }

  async verifyKeys(creds: GatewayCreds): Promise<void> {
    await this.call(creds, 'GET', '/orders?count=1');
  }

  createOrder(creds: GatewayCreds, o: { amountPaise: number; receipt: string; notes: Record<string, string> }) {
    return this.call<{ id: string }>(creds, 'POST', '/orders', { amount: o.amountPaise, currency: 'INR', receipt: o.receipt.slice(0, 40), notes: o.notes, payment_capture: 1 });
  }

  async fetchPayment(creds: GatewayCreds, paymentId: string) {
    return toPayment(await this.call(creds, 'GET', `/payments/${encodeURIComponent(paymentId)}`));
  }

  async fetchOrderPayments(creds: GatewayCreds, orderId: string) {
    const res = await this.call<{ items: Parameters<typeof toPayment>[0][] }>(creds, 'GET', `/orders/${encodeURIComponent(orderId)}/payments`);
    return res.items.map(toPayment);
  }

  async capture(creds: GatewayCreds, paymentId: string, amountPaise: number) {
    return toPayment(await this.call(creds, 'POST', `/payments/${encodeURIComponent(paymentId)}/capture`, { amount: amountPaise, currency: 'INR' }));
  }

  async refund(creds: GatewayCreds, paymentId: string, amountPaise: number, notes: Record<string, string>) {
    return this.call<{ id: string; status: 'pending' | 'processed' | 'failed' }>(creds, 'POST', `/payments/${encodeURIComponent(paymentId)}/refund`, { amount: amountPaise, notes });
  }
}

interface MockOrder {
  id: string;
  keyId: string;
  amountPaise: number;
  payments: GatewayPayment[];
}

/**
 * Local sandbox gateway: same signatures and states as Razorpay, kept in memory, so the whole
 * online flow (checkout → verify → webhook → reconcile → refund) runs without an account.
 * Keys whose secret is "wrong-secret" are rejected, to exercise the connect flow.
 */
@Injectable()
export class MockGatewayClient extends GatewayClient {
  readonly driver = 'mock' as const;
  private static readonly orders = new Map<string, MockOrder>();
  private static readonly payments = new Map<string, GatewayPayment & { keyId: string }>();
  /** Lets tests and the dev sandbox pretend the network is down. */
  static down = false;

  private check(creds: GatewayCreds) {
    if (MockGatewayClient.down) throw new GatewayUnavailableError('mock gateway is down');
    if (creds.keySecret === 'wrong-secret') throw new GatewayAuthError('bad keys');
  }

  async verifyKeys(creds: GatewayCreds) {
    this.check(creds);
  }

  async createOrder(creds: GatewayCreds, o: { amountPaise: number }) {
    this.check(creds);
    const id = `order_mock${randomBytes(7).toString('hex')}`;
    MockGatewayClient.orders.set(id, { id, keyId: creds.keyId, amountPaise: o.amountPaise, payments: [] });
    return { id };
  }

  async fetchPayment(creds: GatewayCreds, paymentId: string) {
    this.check(creds);
    const p = MockGatewayClient.payments.get(paymentId);
    if (!p || p.keyId !== creds.keyId) throw new Error('payment not found');
    return { ...p };
  }

  async fetchOrderPayments(creds: GatewayCreds, orderId: string) {
    this.check(creds);
    return (MockGatewayClient.orders.get(orderId)?.payments ?? []).map((p) => ({ ...p }));
  }

  async capture(creds: GatewayCreds, paymentId: string) {
    const p = await this.fetchPayment(creds, paymentId);
    this.setStatus(paymentId, 'captured');
    return { ...p, status: 'captured' as const };
  }

  async refund(creds: GatewayCreds, paymentId: string) {
    await this.fetchPayment(creds, paymentId);
    return { id: `rfnd_mock${randomBytes(7).toString('hex')}`, status: 'pending' as const };
  }

  // ---------------------------------------------------------------- sandbox controls

  /** Simulate the customer finishing checkout. Returns what Razorpay Checkout hands the browser. */
  simulate(creds: GatewayCreds, orderId: string, outcome: 'success' | 'failure' | 'authorized', method: string, amountPaise?: number) {
    const order = MockGatewayClient.orders.get(orderId);
    if (!order || order.keyId !== creds.keyId) throw new Error('order not found');
    const id = `pay_mock${randomBytes(7).toString('hex')}`;
    const payment = { id, orderId, amountPaise: amountPaise ?? order.amountPaise, status: outcome === 'success' ? 'captured' : outcome === 'authorized' ? 'authorized' : 'failed', method } as const;
    order.payments.push({ ...payment });
    MockGatewayClient.payments.set(id, { ...payment, keyId: creds.keyId });
    return { payment: { ...payment }, signature: hmacHex(creds.keySecret, `${orderId}|${id}`) };
  }

  private setStatus(paymentId: string, status: GatewayPayment['status']) {
    const p = MockGatewayClient.payments.get(paymentId);
    if (!p) return;
    p.status = status;
    for (const o of MockGatewayClient.orders.values()) for (const op of o.payments) if (op.id === paymentId) op.status = status;
  }
}
