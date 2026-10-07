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

  /** The browser's IP. Behind the web BFF, trust X-Client-IP only with the shared secret. */
  private clientIp(req: Request): string | undefined {
    const secret = this.env.BFF_SHARED_SECRET;
    const key = req.header('x-bff-key');
    const forwarded = req.header('x-client-ip');
    if (secret && key && forwarded && isIP(forwarded)) {
      const a = Buffer.from(secret);
      const b = Buffer.from(key);
      if (a.length === b.length && timingSafeEqual(a, b)) return forwarded;
    }
    return req.ip;
  }

  use(req: Request, res: Response, next: NextFunction): void {
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
