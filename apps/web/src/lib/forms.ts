'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import type { FieldValues, Resolver } from 'react-hook-form';
import type { z } from 'zod';

/** Blank inputs mean "not provided": '' → undefined, recursively (so optional() schemas accept them). */
export function stripEmpty<T>(value: T): T {
  if (value === '') return undefined as T;
  if (Array.isArray(value)) return value.map(stripEmpty) as T;
  if (value && typeof value === 'object' && !(value instanceof Date) && !(value instanceof File)) {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, stripEmpty(v)])) as T;
  }
  return value;
}

/**
 * React Hook Form resolver for a schema from @schoolos/contracts — the same rules the API
 * enforces — with blank fields treated as missing.
 */
export function contractResolver<S extends z.ZodType<unknown, FieldValues>>(schema: S): Resolver<z.input<S> & FieldValues, unknown, z.output<S>> {
  const inner = zodResolver(schema as never) as unknown as Resolver<z.input<S> & FieldValues, unknown, z.output<S>>;
  return (values, context, options) => inner(stripEmpty(values), context, options);
}
