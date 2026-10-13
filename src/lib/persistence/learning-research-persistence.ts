import { api } from '../../api';
import { DomainError } from '../errors';
import { createCorrelationId, createLogEvent, writeLog } from '../observability';
import type { LearningContext } from '../../../backend/src/engines/learning-engine';
import type { ResearchContext } from '../../../backend/src/engines/research-engine';

export async function persistLearningEvent(context: LearningContext, userId: string, correlationId = createCorrelationId()): Promise<string> {
  try {
    const result = await api.post<{ id: string }>('/api/v1/learning/events', {
      sourceType: context.observation.source,
      sourceId: /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(context.observation.id)
        ? context.observation.id : null,
      observation: { observationId: context.observation.id, facts: context.observation.facts },
      hypothesis: context.hypothesis,
    });
    writeLog(createLogEvent('info', 'learning.event.persisted', correlationId, { eventId: result.id, userId }));
    return result.id;
  } catch (e) {
    throw new DomainError('DATA_ERROR', `Learning event persistence failed: ${e instanceof Error ? e.message : 'unknown'}`, { resource: 'learning_event' }, correlationId);
  }
}

export async function persistResearchExperiment(context: ResearchContext, userId: string, correlationId = createCorrelationId()): Promise<string> {
  try {
    const result = await api.post<{ id: string }>('/api/v1/research/experiments', {
      name: context.experimentVersion,
      hypothesis: `Research experiment ${context.experimentVersion}`,
      datasetId: context.datasetId,
      parameters: {
        trainingEndIndex: context.trainingEndIndex,
        testStartIndex: context.testStartIndex,
        transactionCostRate: context.transactionCostRate,
        slippageRate: context.slippageRate,
      },
      status: 'draft',
    });
    writeLog(createLogEvent('info', 'research.experiment.persisted', correlationId, { experimentId: result.id, userId }));
    return result.id;
  } catch (e) {
    throw new DomainError('DATA_ERROR', `Research experiment persistence failed: ${e instanceof Error ? e.message : 'unknown'}`, { resource: 'research_experiment' }, correlationId);
  }
}
