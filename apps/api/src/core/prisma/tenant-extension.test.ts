import { describe, expect, it } from 'vitest';
import { scopeArgs } from './tenant-extension.js';

const A = '00000000-0000-0000-0000-00000000000a';
const B = '00000000-0000-0000-0000-00000000000b';

describe('scopeArgs (layer 2 auto-scoping)', () => {
  it('adds schoolId to reads', () => {
    expect(scopeArgs('Student', 'findMany', { where: { status: 'ACTIVE' } }, A)).toEqual({
      where: { status: 'ACTIVE', schoolId: A },
    });
    expect(scopeArgs('Student', 'findUnique', { where: { id: 'x' } }, A)).toEqual({ where: { id: 'x', schoolId: A } });
    expect(scopeArgs('Student', 'count', undefined, A)).toEqual({ where: { schoolId: A } });
  });

  it('adds schoolId to creates, including createMany', () => {
    expect(scopeArgs('Student', 'create', { data: { firstName: 'R' } }, A)).toEqual({
      data: { firstName: 'R', schoolId: A },
    });
    expect(scopeArgs('Student', 'createMany', { data: [{ firstName: 'R' }, { firstName: 'S' }] }, A)).toEqual({
      data: [
        { firstName: 'R', schoolId: A },
        { firstName: 'S', schoolId: A },
      ],
    });
  });

  it('scopes updates and deletes by where', () => {
    expect(scopeArgs('Student', 'update', { where: { id: 'x' }, data: { firstName: 'R' } }, A)).toEqual({
      where: { id: 'x', schoolId: A },
      data: { firstName: 'R' },
    });
    expect(scopeArgs('Student', 'deleteMany', { where: {} }, A)).toEqual({ where: { schoolId: A } });
  });

  it('scopes upserts on both sides', () => {
    expect(scopeArgs('Student', 'upsert', { where: { id: 'x' }, create: { firstName: 'R' }, update: {} }, A)).toEqual({
      where: { id: 'x', schoolId: A },
      create: { firstName: 'R', schoolId: A },
      update: {},
    });
  });

  it('refuses explicit cross-tenant values', () => {
    expect(() => scopeArgs('Student', 'findMany', { where: { schoolId: B } }, A)).toThrow(/Cross-tenant/);
    expect(() => scopeArgs('Student', 'create', { data: { schoolId: B } }, A)).toThrow(/Cross-tenant/);
    expect(() => scopeArgs('Student', 'update', { where: { id: 'x' }, data: { schoolId: B } }, A)).toThrow(
      /Cross-tenant/,
    );
    expect(() => scopeArgs('Student', 'create', { data: { school: { connect: { id: B } } } }, A)).toThrow(
      /Cross-tenant/,
    );
  });
});
