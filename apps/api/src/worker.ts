/**
 * Worker entrypoint: same modules as the API, no HTTP. Runs the outbox relay and every job
 * processor (docs/01 §1). Deployed as its own Cloud Run service; in "lean mode" the API runs
 * them instead (RUN_WORKERS=true).
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { loadEnv } from './config/env.js';
import { createLogger } from './core/logger/logger.js';
import { QueueService } from './core/queue/queue.service.js';

const env = loadEnv({ ...process.env, RUN_WORKERS: 'true' });
const logger = createLogger(env.LOG_LEVEL, env.NODE_ENV === 'development');
const app = await NestFactory.createApplicationContext(AppModule.forRoot(env, logger), { logger: false });
app.enableShutdownHooks();
await app.get(QueueService).startWorkers();
logger.info('SchoolOS worker running');
