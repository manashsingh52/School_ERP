import { z } from 'zod';
import { ENDPOINTS } from './endpoints.js';

type Json = Record<string, unknown>;

/** JSON Schema of what a client sends (inputs: defaults optional, coercions accepted). */
const input = (schema: z.ZodType): Json => {
  try {
    const { $schema: _drop, ...rest } = z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' }) as Json;
    return rest;
  } catch {
    return {}; // refinements Zod can't express still validate on the server
  }
};

/**
 * OpenAPI 3.1 from the endpoint registry (docs/05 §1): paths, access, request bodies and query
 * parameters. Responses are `{ data: … }` envelopes documented in packages/contracts types.
 */
export function buildOpenApi(version = '1.0.0'): Json {
  const paths: Record<string, Record<string, Json>> = {};
  for (const [key, def] of Object.entries(ENDPOINTS)) {
    const [method, rawPath] = key.split(' ') as [string, string];
    const path = rawPath.replace(/:(\w+)/g, '{$1}');
    const params: Json[] = [...rawPath.matchAll(/:(\w+)/g)].map((m) => ({ name: m[1], in: 'path', required: true, schema: { type: 'string' } }));
    if (def.query) {
      const q = input(def.query) as { properties?: Record<string, Json>; required?: string[] };
      for (const [name, schema] of Object.entries(q.properties ?? {})) params.push({ name, in: 'query', required: q.required?.includes(name) ?? false, schema });
    }
    if (def.idempotent) params.push({ name: 'Idempotency-Key', in: 'header', required: true, schema: { type: 'string', minLength: 8 } });
    paths[path] ??= {};
    paths[path][method.toLowerCase()] = {
      summary: def.summary,
      tags: [def.tag],
      'x-access': def.access,
      ...(def.access === 'public' ? { security: [] } : {}),
      ...(params.length ? { parameters: params } : {}),
      ...(def.body ? { requestBody: { required: true, content: { 'application/json': { schema: input(def.body) } } } } : {}),
      responses: { '200': { description: 'OK — `{ data }`' }, default: { description: 'Error — `{ error: { code, message, details?, requestId } }`' } },
    };
  }
  return {
    openapi: '3.1.0',
    info: { title: 'SchoolOS API', version },
    servers: [{ url: '/' }],
    components: { securitySchemes: { bearer: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } } },
    security: [{ bearer: [] }],
    paths,
  };
}
