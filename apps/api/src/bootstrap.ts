import 'reflect-metadata';
import type { LoggerService } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import express from 'express';
import helmet from 'helmet';
import type { Logger } from 'pino';
import { AppModule } from './app.module.js';
import type { Env } from './config/env.js';
import { API_PREFIX, UNPREFIXED_CONTROLLERS } from './config/routes.js';
import { RequestContextMiddleware } from './core/context/context.middleware.js';
import { createLogger } from './core/logger/logger.js';

/** Routes Nest's own framework logs into pino. */
class PinoNestLogger implements LoggerService {
  constructor(private readonly logger: Logger) {}
  log(message: unknown, context?: string) {
    this.logger.debug({ context }, String(message));
  }
  error(message: unknown, trace?: string, context?: string) {
    this.logger.error({ context, trace }, String(message));
  }
  warn(message: unknown, context?: string) {
    this.logger.warn({ context }, String(message));
  }
}

/** Builds the HTTP app. Shared by main.ts and the e2e tests so both run the exact same stack. */
export async function createApp(env: Env, logger?: Logger): Promise<NestExpressApplication> {
  const log = logger ?? createLogger(env.LOG_LEVEL, env.NODE_ENV === 'development');
  const app = await NestFactory.create<NestExpressApplication>(AppModule.forRoot(env, log), {
    logger: new PinoNestLogger(log),
    rawBody: true, // payment webhooks verify signatures over the raw body
  });

  app.set('trust proxy', 1); // behind Google LB / Cloudflare: req.ip = client IP
  app.disable('x-powered-by');
  app.use(helmet({ contentSecurityPolicy: false })); // JSON API; the web app sets its own CSP
  // Local-storage uploads arrive as raw bytes (development driver only); everything else is JSON.
  app.use(`/${API_PREFIX}/files/local`, express.raw({ type: () => true, limit: '25mb' }));
  app.useBodyParser('json', { limit: '1mb' });

  const contextMiddleware = app.get(RequestContextMiddleware);
  app.use(contextMiddleware.use.bind(contextMiddleware));

  app.setGlobalPrefix(API_PREFIX, { exclude: UNPREFIXED_CONTROLLERS });
  app.enableShutdownHooks();
  return app;
}
