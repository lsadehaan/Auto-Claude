/**
 * electron-log stub for web environment
 *
 * Provides a console-based implementation of electron-log API
 * for web server context where electron-log is not available.
 */

// Main logger object
const logger = {
  info: (...args: any[]) => console.log('[INFO]', ...args),
  error: (...args: any[]) => console.error('[ERROR]', ...args),
  warn: (...args: any[]) => console.warn('[WARN]', ...args),
  debug: (...args: any[]) => console.debug('[DEBUG]', ...args),
  verbose: (...args: any[]) => console.log('[VERBOSE]', ...args),
  log: (...args: any[]) => console.log(...args),
  silly: (...args: any[]) => console.log('[SILLY]', ...args),
};

// Export default (most common import style)
export default logger;

// Named exports for different import styles
export const info = logger.info;
export const error = logger.error;
export const warn = logger.warn;
export const debug = logger.debug;
export const verbose = logger.verbose;
export const log = logger.log;
export const silly = logger.silly;

// Transport stubs (electron-log has multiple transports)
export const transports = {
  file: { level: 'info' },
  console: { level: 'info' },
};

// Scope function stub
export function scope(name: string) {
  return logger;
}
