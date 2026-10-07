import { createHash } from 'node:crypto';
import {
  applyDecorators,
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
  SetMetadata,
  UseInterceptors,
} from '@nestjs/common';
import { HTTP_CODE_METADATA } from '@nestjs/common/constants.js';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { catchError, from, mergeMap, of, type Observable } from 'rxjs';
import type { ErrorBody } from '@schoolos/contracts';
import { Prisma } from '../../generated/prisma/client.js';
import { RequestContextStore } from '../context/request-context.js';
import { AppError } from '../errors/app-error.js';
import { toAppError } from '../errors/error.filter.js';
import { PrismaService } from '../prisma/prisma.service.js';

const IDEMPOTENT = 'schoolos:idempotent';
const KEY_PATTERN = /^[A-Za-z0-9_-]{8,100}$/;
const TTL_MS = 24 * 3600 * 1000;

/**
 * `Idempotency-Key` support (docs/05 §4): the same key + same request returns the first result
 * instead of doing the work twice (double clicks, mobile retries on bad networks).
 * `required: true` for anything that moves money.
 */
export const Idempotent = (opts: { required?: boolean } = {}) =>
  applyDecorators(SetMetadata(IDEMPOTENT, { required: opts.required ?? true }), UseInterceptors(IdempotencyInterceptor));

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const { required } = this.reflector.get<{ required: boolean }>(IDEMPOTENT, context.getHandler());
    const req = context.switchToHttp().getRequest<Request>();
    const key = req.header('idempotency-key')?.trim();
    if (!key) {
      if (required) throw new AppError('IDEMPOTENCY_KEY_REQUIRED', 400, 'This request needs an Idempotency-Key header.');
      return next.handle();
    }
    if (!KEY_PATTERN.test(key)) throw new AppError('BAD_REQUEST', 400, 'Idempotency-Key must be 8–100 letters, digits, - or _.');

    const { membershipId } = RequestContextStore.tenant();
    const route = `${req.method} ${req.route?.path ?? req.path}`;
    const requestHash = createHash('sha256')
      .update(JSON.stringify([route, req.params ?? {}, req.body ?? {}]))
      .digest('hex');
    const successStatus =
      this.reflector.get<number | undefined>(HTTP_CODE_METADATA, context.getHandler()) ?? (req.method === 'POST' ? 201 : 200);

    const where = { membershipId_key: { membershipId, key } };
    const existing = await this.prisma.db.idempotencyKey.findUnique({ where });
    if (existing && existing.expiresAt.getTime() > Date.now()) {
      if (existing.requestHash !== requestHash) {
        throw new AppError('IDEMPOTENCY_KEY_REUSED', 409, 'This request key was already used for a different request.');
      }
      if (existing.statusCode === null) {
        throw new AppError('REQUEST_IN_PROGRESS', 409, 'This request is already being processed. Please wait.');
      }
      if (existing.statusCode >= 400) {
        const err = (existing.responseBody as unknown as ErrorBody).error;
        throw new AppError(err.code, existing.statusCode, err.message, err.details);
      }
      return of(existing.responseBody);
    }
    if (existing) await this.prisma.db.idempotencyKey.delete({ where });

    try {
      await this.prisma.db.idempotencyKey.create({
        data: { membershipId, key, route, requestHash, expiresAt: new Date(Date.now() + TTL_MS) } as never,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new AppError('REQUEST_IN_PROGRESS', 409, 'This request is already being processed. Please wait.');
      }
      throw error;
    }

    const save = (statusCode: number, responseBody: unknown) =>
      this.prisma.db.idempotencyKey.update({
        where,
        data: { statusCode, responseBody: responseBody as Prisma.InputJsonValue },
      });

    return next.handle().pipe(
      mergeMap((body) => from(save(successStatus, body ?? null).then(() => body))),
      catchError((error: unknown) =>
        from(
          (async () => {
            const known = toAppError(error);
            // Business errors are final — replay them. Server errors may succeed on retry.
            if (known && known.status < 500) {
              await save(known.status, { error: { code: known.code, message: known.message, details: known.details } });
            } else {
              await this.prisma.db.idempotencyKey.delete({ where }).catch(() => null);
            }
            throw error;
          })(),
        ),
      ),
    );
  }
}
