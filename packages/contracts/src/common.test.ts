import { describe, expect, it } from 'vitest';
import { identifierSchema, normalizePhone } from './common.js';

describe('normalizePhone', () => {
  it.each([
    ['9876543210', '+919876543210'],
    ['09876543210', '+919876543210'],
    ['919876543210', '+919876543210'],
    ['+91 98765 43210', '+919876543210'],
    ['+91-98765-43210', '+919876543210'],
    ['+14155552671', '+14155552671'],
  ])('%s → %s', (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });

  it.each(['12345', '5876543210', '+9112345', 'abc'])('rejects %s', (input) => {
    expect(normalizePhone(input)).toBeNull();
  });
});

describe('identifierSchema', () => {
  it('detects email and lower-cases it', () => {
    expect(identifierSchema.parse(' Admin@School.IN ')).toEqual({ kind: 'email', value: 'admin@school.in' });
  });
  it('detects phone', () => {
    expect(identifierSchema.parse('98765 43210')).toEqual({ kind: 'phone', value: '+919876543210' });
  });
  it('rejects junk', () => {
    expect(identifierSchema.safeParse('hello').success).toBe(false);
  });
});

describe('error messages', () => {
  it('uses plain language for missing fields', async () => {
    const { createStudentSchema } = await import('./students.js');
    const result = createStudentSchema.safeParse({ firstName: 'A' });
    expect(result.success).toBe(false);
    const admission = result.error?.issues.find((i) => i.path[0] === 'admissionNo');
    expect(admission?.message).toBe('This field is required');
  });
});
