import { describe, expect, it, vi } from 'vitest';
import { DomainError, isDomainError } from './errors';
import { createCorrelationId, createLogEvent, writeLog } from './observability';

describe('observability', () => {
  it('creates correlation IDs and redacts sensitive metadata', () => {
    const correlationId = createCorrelationId();
    const event = createLogEvent('info', 'test.event', correlationId, {
      userId: 'user-1',
      apiKey: 'do-not-log',
      nested: { authorization: 'Bearer secret' },
    });

    expect(correlationId).toMatch(/^corr-/);
    expect(event.metadata.apiKey).toBe('[REDACTED]');
    expect((event.metadata.nested as Record<string, unknown>).authorization).toBe('[REDACTED]');
  });

  it('writes structured JSON logs at the requested level', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    writeLog(createLogEvent('info', 'test.event', 'corr-test'));

    expect(info).toHaveBeenCalledTimes(1);
    expect(JSON.parse(info.mock.calls[0][0] as string).event).toBe('test.event');
    info.mockRestore();
  });
});

describe('DomainError', () => {
  it('preserves an explicit error category and correlation ID', () => {
    const error = new DomainError('RISK_ERROR', 'Risk gate rejected trade.', { rule: 'daily-loss' }, 'corr-risk');

    expect(isDomainError(error)).toBe(true);
    expect(error.code).toBe('RISK_ERROR');
    expect(error.correlationId).toBe('corr-risk');
  });
});