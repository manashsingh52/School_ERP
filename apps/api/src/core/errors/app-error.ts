import type { ErrorDetail } from '@schoolos/contracts';

/**
 * A business error that is safe to show to the user. `message` must be plain language —
 * it is returned to the client as-is (docs/05-api-conventions.md §3).
 */
export class AppError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    message: string,
    public readonly details?: ErrorDetail[],
  ) {
    super(message);
    this.name = 'AppError';
  }

  static notFound(what = 'record'): AppError {
    return new AppError('NOT_FOUND', 404, `We couldn't find that ${what}.`);
  }

  static forbidden(message = "You don't have permission to do this."): AppError {
    return new AppError('FORBIDDEN', 403, message);
  }

  static unauthenticated(message = 'Please sign in again.', code = 'UNAUTHENTICATED'): AppError {
    return new AppError(code, 401, message);
  }

  static invalidReference(field: string, what: string): AppError {
    return new AppError('INVALID_REFERENCE', 422, `The selected ${what} doesn't exist.`, [
      { field, message: `Unknown ${what}` },
    ]);
  }
}
