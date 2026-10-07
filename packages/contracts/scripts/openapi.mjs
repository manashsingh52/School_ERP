// Builds openapi.json from ENDPOINTS + the Zod schemas (Zod 4 native JSON Schema export).
// Request bodies and query parameters are fully typed; response schemas come later (Phase 7,
// before generating the Flutter client).
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { ENDPOINTS } from '../dist/index.js';

const json = (schema) => {
  const out = z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' });
  delete out.$schema;
  return out;
};

const errorResponse = { $ref: '#/components/responses/Error' };
const paths = {};

for (const [key, def] of Object.entries(ENDPOINTS)) {
  const [method, rawPath] = key.split(' ');
  const path = rawPath.replace(/:(\w+)/g, '{$1}');
  const params = [...rawPath.matchAll(/:(\w+)/g)].map(([, name]) => ({
    name,
    in: 'path',
    required: true,
    schema: { type: 'string' },
  }));
  if (def.query) {
    const schema = json(def.query);
    for (const [name, prop] of Object.entries(schema.properties ?? {})) {
      params.push({ name, in: 'query', required: (schema.required ?? []).includes(name), schema: prop });
    }
  }
  if (def.idempotent) {
    params.push({ name: 'Idempotency-Key', in: 'header', required: false, schema: { type: 'string', minLength: 8, maxLength: 100 } });
  }
  paths[path] ??= {};
  paths[path][method.toLowerCase()] = {
    summary: def.summary,
    tags: [def.tag],
    'x-access': def.access,
    ...(def.access === 'public' ? { security: [] } : {}),
    ...(params.length ? { parameters: params } : {}),
    ...(def.body ? { requestBody: { required: true, content: { 'application/json': { schema: json(def.body) } } } } : {}),
    responses: {
      200: { description: 'Success' },
      400: errorResponse,
      401: errorResponse,
      403: errorResponse,
      404: errorResponse,
      409: errorResponse,
      422: errorResponse,
      429: errorResponse,
    },
  };
}

const doc = {
  openapi: '3.1.0',
  info: { title: 'SchoolOS API', version: '1.0.0', description: 'Generated from packages/contracts. Do not edit by hand.' },
  servers: [{ url: 'https://api.schoolos.in' }, { url: 'http://localhost:4000' }],
  security: [{ bearer: [] }],
  paths,
  components: {
    securitySchemes: { bearer: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
    responses: {
      Error: {
        description: 'Error (docs/05 §3)',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                error: {
                  type: 'object',
                  required: ['code', 'message'],
                  properties: {
                    code: { type: 'string' },
                    message: { type: 'string' },
                    details: { type: 'array', items: { type: 'object', properties: { field: { type: 'string' }, message: { type: 'string' } } } },
                    requestId: { type: 'string' },
                    supportRef: { type: 'string' },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
};

const out = fileURLToPath(new URL('../openapi.json', import.meta.url));
writeFileSync(out, `${JSON.stringify(doc, null, 2)}\n`);
console.log(`openapi.json: ${Object.keys(ENDPOINTS).length} operations`);
