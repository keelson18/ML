export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEvent {
  timestamp: string;
  level: LogLevel;
  event: string;
  correlationId: string;
  metadata: Record<string, unknown>;
}

const SECRET_KEY = /(password|secret|token|api[-_]?key|service[-_]?role|authorization)/i;

function sanitize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, SECRET_KEY.test(key) ? '[REDACTED]' : sanitize(item)]));
  }
  return value;
}

export function createCorrelationId(): string {
  const random = Math.random().toString(36).slice(2);
  return `corr-${Date.now().toString(36)}-${random}`;
}

export function createLogEvent(
  level: LogLevel,
  event: string,
  correlationId: string,
  metadata: Record<string, unknown> = {},
): LogEvent {
  return {
    timestamp: new Date().toISOString(),
    level,
    event,
    correlationId,
    metadata: sanitize(metadata) as Record<string, unknown>,
  };
}

export function writeLog(logEvent: LogEvent): void {
  const serialized = JSON.stringify(logEvent);
  if (logEvent.level === 'error') console.error(serialized);
  else if (logEvent.level === 'warn') console.warn(serialized);
  else console.info(serialized);
}