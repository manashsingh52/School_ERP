import { pino, type Logger } from 'pino';
import { RequestContextStore } from '../context/request-context.js';

/**
 * Structured JSON logs (Cloud Logging friendly). Every line carries requestId/schoolId/userId.
 * Never log personal data (names, phones, marks) — ids only (docs/01 §8).
 */
export function createLogger(level: string, pretty: boolean): Logger {
  return pino({
    level,
    base: undefined,
    messageKey: 'message',
    formatters: { level: (label) => ({ severity: label.toUpperCase() }) },
    mixin() {
      const ctx = RequestContextStore.get();
      return ctx ? { requestId: ctx.requestId, schoolId: ctx.schoolId, userId: ctx.userId } : {};
    },
    redact: {
      paths: ['password', '*.password', 'code', '*.code', 'refreshToken', '*.refreshToken', 'authorization'],
      censor: '[redacted]',
    },
    ...(pretty ? { transport: { target: 'pino-pretty', options: { messageKey: 'message' } } } : {}),
  });
}

export const LOGGER = Symbol('LOGGER');
