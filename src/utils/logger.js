/**
 * Structured Logging Utility
 * Provides structured logging with request context and severity levels
 * Replaces console.log/warn/error with structured logging
 */

/**
 * Log levels
 */
export const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
};

/**
 * Logger class for structured logging
 */
export class Logger {
  /**
   * @param {string} requestId - Request correlation ID
   * @param {string} context - Context name (service, handler, etc.)
   * @param {number} level - Minimum log level (default: INFO)
   */
  constructor(requestId = null, context = 'app', level = LOG_LEVELS.INFO) {
    this.requestId = requestId || `req-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    this.context = context;
    this.level = level;
  }

  /**
   * Create structured log entry
   * @param {number} level - Log level
   * @param {string} message - Log message
   * @param {Object} metadata - Additional metadata
   */
  _log(level, message, metadata = {}) {
    if (level < this.level) return;

    const logEntry = {
      timestamp: new Date().toISOString(),
      level: Object.keys(LOG_LEVELS)[level],
      requestId: this.requestId,
      context: this.context,
      message,
      ...metadata,
    };

    // Output based on level
    switch (level) {
      case LOG_LEVELS.DEBUG:
        console.debug(JSON.stringify(logEntry));
        break;
      case LOG_LEVELS.INFO:
        console.info(JSON.stringify(logEntry));
        break;
      case LOG_LEVELS.WARN:
        console.warn(JSON.stringify(logEntry));
        break;
      case LOG_LEVELS.ERROR:
        console.error(JSON.stringify(logEntry));
        break;
      default:
        console.log(JSON.stringify(logEntry));
    }

    return logEntry;
  }

  /**
   * Debug log
   * @param {string} message - Log message
   * @param {Object} metadata - Additional metadata
   */
  debug(message, metadata = {}) {
    return this._log(LOG_LEVELS.DEBUG, message, metadata);
  }

  /**
   * Info log
   * @param {string} message - Log message
   * @param {Object} metadata - Additional metadata
   */
  info(message, metadata = {}) {
    return this._log(LOG_LEVELS.INFO, message, metadata);
  }

  /**
   * Warning log
   * @param {string} message - Log message
   * @param {Object} metadata - Additional metadata
   */
  warn(message, metadata = {}) {
    return this._log(LOG_LEVELS.WARN, message, metadata);
  }

  /**
   * Error log
   * @param {string} message - Log message
   * @param {Error|Object} error - Error object or metadata
   * @param {Object} metadata - Additional metadata
   */
  error(message, error = null, metadata = {}) {
    const errorMetadata = error instanceof Error
      ? {
          error: error.message,
          stack: error.stack,
          name: error.name,
          ...metadata,
        }
      : { error, ...metadata };

    return this._log(LOG_LEVELS.ERROR, message, errorMetadata);
  }
}

/**
 * Create logger instance
 * @param {string} requestId - Request correlation ID
 * @param {string} context - Context name
 * @param {number} level - Minimum log level
 * @returns {Logger} Logger instance
 */
export function createLogger(requestId = null, context = 'app', level = LOG_LEVELS.INFO) {
  return new Logger(requestId, context, level);
}

/**
 * Replace console.log with structured logging (for backwards compatibility)
 * Use this for gradual migration
 */
export function logStructured(level, message, metadata = {}) {
  const logger = new Logger(null, 'legacy', LOG_LEVELS.INFO);
  return logger._log(level, message, metadata);
}
