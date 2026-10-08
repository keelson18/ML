import { describe, expect, it } from 'vitest';
import { evaluateEventEntryGate, type EventRiskStatus } from './event-risk';

const eventRisk: EventRiskStatus = {
  healthy: true,
  activeEvents: [
    { id: 'high-1', title: 'Policy decision', impact: 'high', asset_classes: ['crypto'], starts_at: '', ends_at: '', active: true },
    { id: 'low-1', title: 'Minor release', impact: 'low', asset_classes: ['crypto'], starts_at: '', ends_at: '', active: true },
  ],
};

describe('event entry risk gate', () => {
  it('fails safe when event data is unhealthy', () => {
    expect(evaluateEventEntryGate({ healthy: false, activeEvents: [] }, 'high')).toMatchObject({
      approved: false,
      reason: 'Event risk data is unavailable; new entries are blocked.',
      activeEventIds: [],
    });
  });

  it('blocks only events at or above the configured impact threshold and returns their IDs', () => {
    expect(evaluateEventEntryGate(eventRisk, 'high')).toMatchObject({
      approved: false,
      reason: 'Entry blocked by active event blackout: Policy decision.',
      activeEventIds: ['high-1'],
    });
    expect(evaluateEventEntryGate(eventRisk, 'low').activeEventIds).toEqual(['high-1', 'low-1']);
  });

  it('allows entries when no active event meets the configured impact threshold', () => {
    expect(evaluateEventEntryGate({ ...eventRisk, activeEvents: [eventRisk.activeEvents[1]] }, 'medium'))
      .toEqual({ approved: true, activeEventIds: [] });
  });
});
