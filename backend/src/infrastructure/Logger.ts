/**
 * Logger Infrastructure
 * Structured logging with correlation IDs for auditability
 */

export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
  FATAL = 'fatal',
}

export interface LogContext {
  correlationId?: string;
  userId?: string;
  assetId?: string;
  tradeDecisionId?: string;
  [key: string]: unknown;
}

/**
 * Logger: Structured logging with context
 */
export class Logger {
  private context: LogContext = {};
  private minLevel: LogLevel = LogLevel.INFO;

  constructor(private name: string) {}

  setContext(context: LogContext): void {
    this.context = { ...context };
  }

  addContext(key: string, value: unknown): void {
    this.context[key] = value;
  }

  clearContext(): void {
    this.context = {};
  }

  debug(message: string, data?: Record<string, unknown>): void {
    this.log(LogLevel.DEBUG, message, data);
  }

  info(message: string, data?: Record<string, unknown>): void {
    this.log(LogLevel.INFO, message, data);
  }

  warn(message: string, data?: Record<string, unknown>): void {
    this.log(LogLevel.WARN, message, data);
  }

  error(message: string, error?: Error | Record<string, unknown>, data?: Record<string, unknown>): void {
    const errorData = error instanceof Error
      ? { errorMessage: error.message, errorStack: error.stack }
      : error || {};
    this.log(LogLevel.ERROR, message, { ...errorData, ...data });
  }

  fatal(message: string, error?: Error | Record<string, unknown>): void {
    const errorData = error instanceof Error
      ? { errorMessage: error.message, errorStack: error.stack }
      : error || {};
    this.log(LogLevel.FATAL, message, errorData);
  }

  private log(level: LogLevel, message: string, data?: Record<string, unknown>): void {
    if (!this.shouldLog(level)) return;

    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      logger: this.name,
      message,
      context: this.context,
      ...data,
    };

    // In production, this would write to structured logging service (Datadog, ELK, etc.)
    const output = JSON.stringify(logEntry);
    
    switch (level) {
      case LogLevel.DEBUG:
      case LogLevel.INFO:
        console.log(output);
        break;
      case LogLevel.WARN:
        console.warn(output);
        break;
      case LogLevel.ERROR:
      case LogLevel.FATAL:
        console.error(output);
        break;
    }
  }

  private shouldLog(level: LogLevel): boolean {
    const levels = [LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR, LogLevel.FATAL];
    return levels.indexOf(level) >= levels.indexOf(this.minLevel);
  }
}

/**
 * LoggerFactory: Create named loggers
 */
export class LoggerFactory {
  static create(name: string): Logger {
    return new Logger(name);
  }
}
