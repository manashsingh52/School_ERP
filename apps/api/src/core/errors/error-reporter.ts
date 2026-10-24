import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { Logger } from 'pino';
import { ENV, type Env } from '../../config/env.js';
import { LOGGER } from '../logger/logger.js';

/**
 * Sends unexpected errors to Sentry (SENTRY_DSN), straight to its envelope endpoint — no SDK.
 * Only the error itself and a few tags go out: no request bodies, headers or user data.
 */
@Injectable()
export class ErrorReporter {
  private readonly target?: { url: string; auth: string };

  constructor(
    @Inject(ENV) private readonly env: Env,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {
    if (!env.SENTRY_DSN) return;
    const dsn = new URL(env.SENTRY_DSN);
    const project = dsn.pathname.replace(/^\//, '');
    this.target = {
      url: `${dsn.protocol}//${dsn.host}/api/${project}/envelope/`,
      auth: `Sentry sentry_version=7, sentry_client=schoolos/1.0, sentry_key=${dsn.username}`,
    };
  }

  /** Fire-and-forget: reporting must never break or slow down the request. */
  report(error: unknown, tags: Record<string, string | undefined> = {}): void {
    if (!this.target) return;
    const err = error instanceof Error ? error : new Error(String(error));
    const event = {
      event_id: randomUUID().replace(/-/g, ''),
      timestamp: Date.now() / 1000,
      platform: 'node',
      level: 'error',
      environment: this.env.NODE_ENV,
      release: this.env.RELEASE,
      tags: Object.fromEntries(Object.entries(tags).filter(([, v]) => v)),
      exception: { values: [{ type: err.name, value: err.message.slice(0, 500), stacktrace: { frames: frames(err.stack) } }] },
    };
    const envelope = `${JSON.stringify({ event_id: event.event_id, sent_at: new Date().toISOString() })}\n${JSON.stringify({ type: 'event' })}\n${JSON.stringify(event)}\n`;
    void fetch(this.target.url, { method: 'POST', headers: { 'content-type': 'application/x-sentry-envelope', 'x-sentry-auth': this.target.auth }, body: envelope })
      .then((res) => {
        if (!res.ok) this.logger.warn({ status: res.status }, 'sentry refused the error report');
      })
      .catch((e: unknown) => this.logger.warn({ err: e }, 'sentry unreachable'));
  }
}

/** Node stack lines → Sentry frames (innermost last, as Sentry expects). */
function frames(stack?: string) {
  return (stack ?? '')
    .split('\n')
    .slice(1, 30)
    .map((line) => line.trim().match(/^at (?:(.+?) \()?(.+?):(\d+):(\d+)\)?$/))
    .filter((m): m is RegExpMatchArray => !!m)
    .map(([, fn, file, line, col]) => ({ function: fn ?? '?', filename: file, lineno: Number(line), colno: Number(col), in_app: !file!.includes('node_modules') }))
    .reverse();
}
