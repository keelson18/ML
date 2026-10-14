import { describe, expect, it } from 'vitest';
import { autopilotEnrollmentStatus, paperWorkerHealth, paperWorkerState } from './adminOverview';

describe('paper worker health state', () => {
  const base = { enabled: true, schemaOk: true, running: true, lastCycleAt: '2026-10-14T00:00:00.000Z', lastError: null,
    nowMs: Date.parse('2026-10-14T00:00:30.000Z'), maxCycleAgeMs: 60_000 };

  it('distinguishes disabled, schema-blocked, starting, running, degraded, and failed states', () => {
    expect(paperWorkerState({ ...base, enabled: false })).toBe('stopped');
    expect(paperWorkerState({ ...base, schemaOk: false })).toBe('blocked');
    expect(paperWorkerState({ ...base, lastCycleAt: null })).toBe('starting');
    expect(paperWorkerState(base)).toBe('running');
    expect(paperWorkerState({ ...base, lastError: 'account safety pause' })).toBe('degraded');
    expect(paperWorkerState({ ...base, nowMs: Date.parse('2026-10-14T00:01:00.001Z') })).toBe('degraded');
    expect(paperWorkerState({ ...base, lastCycleAt: 'invalid timestamp' })).toBe('degraded');
    expect(paperWorkerState({ ...base, running: false })).toBe('failed');
  });

  it('never reports a scheduler cycle failure as healthy', () => {
    const state = paperWorkerState({ ...base, lastError: 'cycle failed' });
    expect(paperWorkerHealth(state)).toMatchObject({ status: 'degraded' });
  });

  it('degrades autopilot enrollment when every account is paused', () => {
    expect(autopilotEnrollmentStatus(0, 0)).toBe('degraded');
    expect(autopilotEnrollmentStatus(2, 0)).toBe('ok');
    expect(autopilotEnrollmentStatus(2, 2)).toBe('degraded');
  });

  it('reports an intentional stop as degraded and schema failure as down', () => {
    expect(paperWorkerHealth('stopped')).toMatchObject({ status: 'degraded' });
    expect(paperWorkerHealth('blocked')).toMatchObject({ status: 'down' });
  });
});
