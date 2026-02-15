/**
 * Structured JSON logger with AsyncLocalStorage request context.
 *
 * Usage:
 *   import { getLog } from './logger.mjs';
 *   const log = getLog();           // returns child logger with {reqId, ip} from context
 *   log.info({ url }, 'request');   // {"level":30,"reqId":"abc12345","url":"...","msg":"request"}
 *
 * Context is set once per request via withRequestContext() middleware in server.mjs.
 * All downstream code — convert, extractor, browser-pool, etc. — just calls getLog().
 */
import pino from 'pino';
import { AsyncLocalStorage } from 'node:async_hooks';

const store = new AsyncLocalStorage();

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
});

/** Get logger with request context (reqId, ip) injected automatically */
export function getLog() {
  const ctx = store.getStore();
  return ctx ? logger.child(ctx) : logger;
}

/** Run async function with request context */
export function withRequestContext(ctx, fn) {
  return store.run(ctx, fn);
}

export default logger;
