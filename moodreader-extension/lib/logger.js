/**
 * MoodReader Structured Logging Module
 * Centralized logging with context and levels
 */

const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3
};

// Current log level (can be changed via settings)
let currentLogLevel = LOG_LEVELS.INFO;

/**
 * Format log message with timestamp and context
 */
function formatMessage(level, context, message) {
  const timestamp = new Date().toISOString().substring(11, 23);
  return `[${timestamp}][MoodReader:${context}][${level}] ${message}`;
}

/**
 * Structured logger with context support
 */
export const Logger = {
  /**
   * Set log level
   * @param {'DEBUG'|'INFO'|'WARN'|'ERROR'} level
   */
  setLevel(level) {
    currentLogLevel = LOG_LEVELS[level] ?? LOG_LEVELS.INFO;
  },

  /**
   * Debug level logging
   */
  debug(context, message, extra = null) {
    if (currentLogLevel <= LOG_LEVELS.DEBUG) {
      const formatted = formatMessage('DEBUG', context, message);
      if (extra) {
        console.debug(formatted, extra);
      } else {
        console.debug(formatted);
      }
    }
  },

  /**
   * Info level logging
   */
  info(context, message, extra = null) {
    if (currentLogLevel <= LOG_LEVELS.INFO) {
      const formatted = formatMessage('INFO', context, message);
      if (extra) {
        console.info(formatted, extra);
      } else {
        console.info(formatted);
      }
    }
  },

  /**
   * Warning level logging
   */
  warn(context, message, extra = null) {
    if (currentLogLevel <= LOG_LEVELS.WARN) {
      const formatted = formatMessage('WARN', context, message);
      if (extra) {
        console.warn(formatted, extra);
      } else {
        console.warn(formatted);
      }
    }
  },

  /**
   * Error level logging
   */
  error(context, message, error = null, extra = null) {
    if (currentLogLevel <= LOG_LEVELS.ERROR) {
      const formatted = formatMessage('ERROR', context, message);
      const errorInfo = error ? {
        message: error.message,
        stack: error.stack,
        ...extra
      } : extra;
      
      if (errorInfo) {
        console.error(formatted, errorInfo);
      } else {
        console.error(formatted);
      }
    }
  },

  /**
   * Create a scoped logger for a specific context
   */
  scope(context) {
    return {
      debug: (msg, extra) => Logger.debug(context, msg, extra),
      info: (msg, extra) => Logger.info(context, msg, extra),
      warn: (msg, extra) => Logger.warn(context, msg, extra),
      error: (msg, err, extra) => Logger.error(context, msg, err, extra)
    };
  }
};

export default Logger;
