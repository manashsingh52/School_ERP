import { createApp } from './bootstrap.js';
import { loadEnv } from './config/env.js';
import { QueueService } from './core/queue/queue.service.js';
import { SchedulerService } from './core/queue/scheduler.service.js';

const env = loadEnv();
const app = await createApp(env);
await app.listen(env.PORT);
// Lean mode (docs/10 §0): the API also runs the outbox relay and job processors.
if (env.RUN_WORKERS) {
  await app.get(QueueService).startWorkers();
  app.get(SchedulerService).start();
}
console.log(`Bastaa API listening on http://localhost:${env.PORT} (${env.NODE_ENV})`);
