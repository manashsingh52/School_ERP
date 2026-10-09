// Writes openapi.json (checked in; CI fails if it is stale). The document itself is built by
// buildOpenApi() in src/openapi.ts — the same function the API serves at /v1/openapi.json.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ENDPOINTS, buildOpenApi } from '../dist/index.js';

const out = fileURLToPath(new URL('../openapi.json', import.meta.url));
writeFileSync(out, `${JSON.stringify(buildOpenApi(), null, 2)}\n`);
console.log(`openapi.json: ${Object.keys(ENDPOINTS).length} operations`);
