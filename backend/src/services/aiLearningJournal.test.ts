import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.hoisted(() => vi.fn());
vi.mock('../db', () => ({ getSupabaseClient: () => ({ rpc }) }));

import { appendAiLearningJournalEvent } from './aiLearningJournal';

describe('AI Learning journal persistence', () => {
  beforeEach(() => {
    rpc.mockReset().mockResolvedValue({ data: 'journal-event-id', error: null });
  });

  it('writes structured operation events through the service-only database function', async () => {
    await expect(appendAiLearningJournalEvent({
      eventKey: 'analysis:req-1',
      userId: 'user-id',
      eventType: 'trade_analysis_completed',
      title: 'Analysis completed',
      detail: 'Approved findings were attached as supplementary context.',
      symbol: 'BTCUSD',
      timeframe: '1h',
      sourceService: 'decision-api',
      correlationId: 'req-1',
      relatedRecords: { includedKnowledgeIds: ['knowledge-id'] },
      evidence: { provider: 'provider', datasetId: 'dataset-v1', riskGatesUnchanged: true },
    })).resolves.toBe('journal-event-id');
    expect(rpc).toHaveBeenCalledWith('append_ai_learning_journal_event', {
      p_event: expect.objectContaining({
        event_key: 'analysis:req-1',
        event_type: 'trade_analysis_completed',
        user_id: 'user-id',
        related_records: { includedKnowledgeIds: ['knowledge-id'] },
      }),
    });
  });

  it('rejects sensitive material and surfaces persistence errors', async () => {
    await expect(appendAiLearningJournalEvent({
      eventKey: 'analysis:req-2',
      userId: 'user-id',
      eventType: 'trade_analysis_completed',
      title: 'Analysis completed',
      detail: 'Do not store secrets.',
      sourceService: 'decision-api',
      evidence: { apiKey: 'not-allowed' },
    })).rejects.toThrow(/sensitive field/);
    expect(rpc).not.toHaveBeenCalled();

    rpc.mockResolvedValueOnce({ data: null, error: { code: '42501' } });
    await expect(appendAiLearningJournalEvent({
      eventKey: 'analysis:req-3',
      userId: 'user-id',
      eventType: 'trade_analysis_completed',
      title: 'Analysis completed',
      detail: 'Journal service unavailable.',
      sourceService: 'decision-api',
    })).rejects.toThrow(/persistence failed/);
  });
});
