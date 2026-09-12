import { supabase } from '../supabase';
import { DomainError } from '../errors';
import { createCorrelationId, createLogEvent, writeLog } from '../observability';
import type { LearningContext } from './learning-engine';
import type { ResearchContext } from './research-engine';

export async function persistLearningEvent(context: LearningContext, userId: string, correlationId = createCorrelationId()): Promise<string> {
  const { data, error } = await supabase
    .from('learning_events')
    .insert({
      user_id: userId,
      source_type: context.observation.source,
      source_id: context.observation.id,
      observation: context.observation.facts,
      hypothesis: context.hypothesis,
      status: context.experimentCompleted ? context.validationPassed ? context.approved ? 'approved' : 'candidate' : 'rejected' : 'hypothesis',
    })
    .select('id')
    .single();
  if (error) throw new DomainError('DATA_ERROR', `Learning event persistence failed: ${error.message}`, { resource: 'learning_event' }, correlationId);
  const row = data as { id: string } | null;
  if (!row?.id) throw new DomainError('DATA_ERROR', 'Learning event persistence failed: database returned no ID.', { resource: 'learning_event' }, correlationId);
  writeLog(createLogEvent('info', 'learning.event.persisted', correlationId, { eventId: row.id, userId }));
  return row.id;
}

export async function persistResearchExperiment(context: ResearchContext, userId: string, correlationId = createCorrelationId()): Promise<string> {
  const { data, error } = await supabase
    .from('research_experiments')
    .insert({
      user_id: userId,
      name: context.experimentVersion,
      hypothesis: `Research experiment ${context.experimentVersion}`,
      dataset_id: context.datasetId,
      parameters: {
        trainingEndIndex: context.trainingEndIndex,
        testStartIndex: context.testStartIndex,
        transactionCostRate: context.transactionCostRate,
        slippageRate: context.slippageRate,
      },
      status: 'draft',
    })
    .select('id')
    .single();
  if (error) throw new DomainError('DATA_ERROR', `Research experiment persistence failed: ${error.message}`, { resource: 'research_experiment' }, correlationId);
  const row = data as { id: string } | null;
  if (!row?.id) throw new DomainError('DATA_ERROR', 'Research experiment persistence failed: database returned no ID.', { resource: 'research_experiment' }, correlationId);
  writeLog(createLogEvent('info', 'research.experiment.persisted', correlationId, { experimentId: row.id, userId }));
  return row.id;
}