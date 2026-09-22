import { api } from '../../api';
import { DomainError } from '../errors';
import { createCorrelationId, createLogEvent, writeLog } from '../observability';
import type { LearningContext } from './learning-engine';
import type { ResearchContext } from './research-engine';

export async function persistLearningEvent(context: LearningContext, userId: string, correlationId = createCorrelationId()): Promise<string> {
  try {
    const result = await api.post<{ id: string }>('/learning/events', {
      userId,
      sourceType: context.observation.source,
      sourceId: context.observation.id,
      observation: context.observation.facts,
      hypothesis: context.hypothesis,
      status: context.experimentCompleted ? (context.validationPassed ? (context.approved ? 'approved' : 'candidate') : 'rejected') : 'hypothesis',
    });
    writeLog(createLogEvent('info', 'learning.event.persisted', correlationId, { eventId: result.id, userId }));
    return result.id;
  } catch (e) {
    throw new DomainError('DATA_ERROR', `Learning event persistence failed: ${e instanceof Error ? e.message : 'unknown'}`, { resource: 'learning_event' }, correlationId);
  }
}

export async function persistResearchExperiment(context: ResearchContext, userId: string, correlationId = createCorrelationId()): Promise<string> {
  try {
    const result = await api.post<{ id: string }>('/research/experiments', {
      userId,
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
