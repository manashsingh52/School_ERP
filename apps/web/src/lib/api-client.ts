'use client';

import type { ErrorBody, ErrorDetail } from '@schoolos/contracts';

/** Error with the API's safe, user-facing message (docs/05 §3). */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: ErrorDetail[],
    readonly supportRef?: string,
  ) {
    super(message);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Browser → BFF (/api/...) fetch. Adds the CSRF header, maps errors to ApiError and sends the
 * user to sign-in when the session has ended.
 */
export async function apiFetch<T>(path: string, init: RequestInit = {}, retried = false): Promise<T> {
  const url = path.startsWith('/api/') ? path : `/api/v1${path}`;
  const res = await fetch(url, {
    ...init,
    headers: { 'content-type': 'application/json', 'x-schoolos-csrf': '1', ...init.headers },
    credentials: 'same-origin',
  });

  if (res.ok) return (await res.json()) as T;

  const body = (await res.json().catch(() => null)) as ErrorBody | null;
  const error = body?.error;

  // Another tab refreshed the session a moment ago — its cookies are now ours; retry once.
  if (res.status === 401 && error?.code === 'TOKEN_ROTATED' && !retried) {
    await sleep(300);
    return apiFetch<T>(path, init, true);
  }
  if (res.status === 401 && !url.startsWith('/api/session')) {
    const next = `${window.location.pathname}${window.location.search}`;
    window.location.assign(`/api/session/expired?next=${encodeURIComponent(next)}`);
  }
  throw new ApiError(
    res.status,
    error?.code ?? 'UNKNOWN',
    error?.message ?? 'Something went wrong. Please try again.',
    error?.details,
    error?.supportRef,
  );
}

export const apiPost = <T>(path: string, body?: unknown) =>
  apiFetch<T>(path, { method: 'POST', body: JSON.stringify(body ?? {}) });

export const apiPatch = <T>(path: string, body?: unknown) =>
  apiFetch<T>(path, { method: 'PATCH', body: JSON.stringify(body ?? {}) });

export const apiPut = <T>(path: string, body?: unknown) =>
  apiFetch<T>(path, { method: 'PUT', body: JSON.stringify(body ?? {}) });

export const apiDelete = <T>(path: string) => apiFetch<T>(path, { method: 'DELETE' });

/** A fresh Idempotency-Key for one user action (docs/05 §4). */
export const idempotencyKey = () => crypto.randomUUID();
