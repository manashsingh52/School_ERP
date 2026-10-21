import { randomBytes } from 'node:crypto';
import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException, Inject } from '@nestjs/common';
import type { Request, Response } from 'express';
import type { Logger } from 'pino';
import { ZodError } from 'zod';
import type { ErrorBody } from '@schoolos/contracts';
import { Prisma } from '../../generated/prisma/client.js';
import { RequestContextStore } from '../context/request-context.js';
import { LOGGER } from '../logger/logger.js';
import { AppError } from './app-error.js';
import { ErrorReporter } from './error-reporter.js';

/** Short code a school can read out to support, e.g. "ERR-7KQ2M9". Maps to the log line. */
function supportRef(): string {
  return `ERR-${randomBytes(4).toString('base64url').toUpperCase().slice(0, 6)}`;
}

/** Translate known errors to safe responses. Unknown errors never leak details (docs/05 §3). */
export function toAppError(error: unknown): AppError | null {
  if (error instanceof AppError) return error;

  if (error instanceof ZodError) {
    return new AppError(
      'VALIDATION_FAILED',
      422,
      'Some fields need attention.',
      error.issues.map((i) => ({ field: i.path.join('.') || undefined, message: i.message })),
    );
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    switch (error.code) {
      case 'P2002': {
        const target = (error.meta?.target as string[] | string | undefined) ?? [];
        const fields = (Array.isArray(target) ? target : [target]).filter((f) => f !== 'school_id');
        return new AppError(
          'CONFLICT',
          409,
          'This record already exists.',
          fields.map((field) => ({ field, message: 'Already in use' })),
        );
      }
      case 'P2025':
        return AppError.notFound();
      case 'P2003':
        return new AppError('INVALID_REFERENCE', 422, 'A selected item no longer exists.');
      default:
        return null;
    }
  }

  if (error instanceof HttpException) {
    const status = error.getStatus();
    if (status === 404) return new AppError('NOT_FOUND', 404, "We couldn't find that page.");
    if (status === 413) return new AppError('PAYLOAD_TOO_LARGE', 413, 'The request is too large.');
    if (status === 400) return new AppError('BAD_REQUEST', 400, 'The request was not understood.');
    if (status < 500) return new AppError('HTTP_ERROR', status, 'The request could not be completed.');
  }

  return null;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(
    @Inject(LOGGER) private readonly logger: Logger,
    private readonly reporter: ErrorReporter,
  ) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    const req = host.switchToHttp().getRequest<Request>();
    const requestId = RequestContextStore.get()?.requestId;
    const known = toAppError(exception);

    let body: ErrorBody;
    let status: number;
    if (known) {
      status = known.status;
      body = { error: { code: known.code, message: known.message, details: known.details, requestId } };
      if (status >= 500) {
        this.logger.error({ err: exception, path: req.path }, known.message);
        this.reporter.report(exception, { requestId, route: req.route?.path, method: req.method });
      }
    } else {
      status = 500;
      const ref = supportRef();
      this.logger.error({ err: exception, supportRef: ref, path: req.path, method: req.method }, 'Unhandled error');
      // The route pattern (/v1/students/:id), never the path with ids in it.
      this.reporter.report(exception, { supportRef: ref, requestId, route: req.route?.path, method: req.method, schoolId: RequestContextStore.get()?.schoolId });
      body = {
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Something went wrong on our side. Please try again.',
          requestId,
          supportRef: ref,
        },
      };
    }

    if (!res.headersSent) res.status(status).json(body);
  }
}
