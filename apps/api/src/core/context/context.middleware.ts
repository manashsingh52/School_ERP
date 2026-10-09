import { randomUUID, timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';
import { Inject, Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import type { Logger } from 'pino';
import { ENV, type Env } from '../../config/env.js';
import { LOGGER } from '../logger/logger.js';
import { RequestContextStore } from './request-context.js';

const SAFE_REQUEST_ID = /^[A-Za-z0-9_-]{8,64}$/;

/** Opens the AsyncLocalStorage context for each request and writes one access-log line. */
@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  constructor(
    @Inject(LOGGER) private readonly logger: Logger,
    @Inject(ENV) private readonly env: Env,
  ) {}

  private static same(secret: string | undefined, sent: string | undefined): boolean {
    if (!secret || !sent) return false;
    const a = Buffer.from(secret);
    const b = Buffer.from(sent);
    return a.length === b.length && timingSafeEqual(a, b);
  }

  /**
   * The caller's IP. Behind the web BFF, trust X-Client-IP only with the BFF secret; behind the
   * Cloudflare Worker (apps, webhooks), trust CF-Connecting-IP only with the edge secret.
   */
  private clientIp(req: Request): string | undefined {
    const forwarded = req.header('x-client-ip');
    if (forwarded && isIP(forwarded) && RequestContextMiddleware.same(this.env.BFF_SHARED_SECRET, req.header('x-bff-key'))) return forwarded;
    const cf = req.header('cf-connecting-ip');
    if (cf && isIP(cf) && RequestContextMiddleware.same(this.env.EDGE_SHARED_SECRET, req.header('x-edge-secret'))) return cf;
    return req.ip;
  }

  use(req: Request, res: Response, next: NextFunction): void {
    // With an edge secret, only Cloudflare (and the web server) may call us; the public run.app URL
    // answers 404. Health checks stay open for Cloud Run.
    if (this.env.EDGE_SHARED_SECRET && req.path !== '/health' && !RequestContextMiddleware.same(this.env.EDGE_SHARED_SECRET, req.header('x-edge-secret'))) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Not found.' } });
      return;
    }
    const incoming = req.header('x-request-id');
    const requestId = incoming && SAFE_REQUEST_ID.test(incoming) ? incoming : `req_${randomUUID()}`;
    res.setHeader('X-Request-Id', requestId);

    const context = { requestId, ip: this.clientIp(req), userAgent: req.header('user-agent')?.slice(0, 300) };
    const started = process.hrtime.bigint();

    RequestContextStore.run(context, () => {
      res.on('finish', () => {
        const ms = Number(process.hrtime.bigint() - started) / 1e6;
        RequestContextStore.run(context, () =>
          this.logger.info(
            { method: req.method, path: req.route?.path ?? req.path, status: res.statusCode, ms: Math.round(ms) },
            'request',
          ),
        );
      });
      next();
    });
  }
}
