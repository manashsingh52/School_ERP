import { createApp } from './bootstrap.js';
import { loadEnv } from './config/env.js';

const env = loadEnv();
const app = await createApp(env);
await app.listen(env.PORT);
console.log(`SchoolOS API listening on http://localhost:${env.PORT} (${env.NODE_ENV})`);
