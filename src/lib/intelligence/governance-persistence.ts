import { supabase } from '../supabase';
import { DomainError } from '../errors';
import { createCorrelationId, createLogEvent, writeLog } from '../observability';
import type { KnowledgeNode } from './knowledge-engine';

export interface CreateKnowledgeInput {
  node: KnowledgeNode;
  createdBy: string;
  correlationId?: string;
}

export interface RegisterModelInput {
  name: string;
  description?: string;
  createdBy: string;
  version: {
    version: string;
    artifactReference?: string;
    trainingDataset: string;
    featureSet: string;
    algorithm: string;
    metrics: Record<string, unknown>;
  };
  correlationId?: string;
}

export async function createDraftKnowledge(input: CreateKnowledgeInput): Promise<string> {
  const correlationId = input.correlationId ?? createCorrelationId();
  const { data, error } = await supabase
    .from('knowledge_nodes')
    .insert({
      id: input.node.id,
      node_type: input.node.nodeType,
      title: input.node.title,
      content: input.node.content,
      tags: input.node.tags,
      confidence: input.node.confidence,
      status: 'draft',
      version: input.node.version,
      created_by: input.createdBy,
    })
    .select('id')
    .single();

  if (error) throw new DomainError('DATA_ERROR', `Knowledge persistence failed: ${error.message}`, { resource: 'knowledge_node' }, correlationId);
  const row = data as { id: string } | null;
  if (!row?.id) throw new DomainError('DATA_ERROR', 'Knowledge persistence failed: database returned no node ID.', { resource: 'knowledge_node' }, correlationId);
  writeLog(createLogEvent('info', 'knowledge.node.persisted', correlationId, { nodeId: row.id, createdBy: input.createdBy }));
  return row.id;
}

export async function registerResearchModel(input: RegisterModelInput): Promise<{ modelId: string; versionId: string }> {
  const correlationId = input.correlationId ?? createCorrelationId();
  const { data: modelData, error: modelError } = await supabase
    .from('models')
    .insert({ name: input.name, description: input.description, created_by: input.createdBy })
    .select('id')
    .single();
  if (modelError) throw new DomainError('DATA_ERROR', `Model persistence failed: ${modelError.message}`, { resource: 'model' }, correlationId);
  const model = modelData as { id: string } | null;
  if (!model?.id) throw new DomainError('DATA_ERROR', 'Model persistence failed: database returned no model ID.', { resource: 'model' }, correlationId);

  const { data: versionData, error: versionError } = await supabase
    .from('model_versions')
    .insert({
      model_id: model.id,
      version: input.version.version,
      artifact_reference: input.version.artifactReference,
      training_dataset: input.version.trainingDataset,
      feature_set: input.version.featureSet,
      algorithm: input.version.algorithm,
      metrics: input.version.metrics,
      status: 'research',
      created_by: input.createdBy,
    })
    .select('id')
    .single();
  if (versionError) throw new DomainError('DATA_ERROR', `Model version persistence failed: ${versionError.message}`, { resource: 'model_version' }, correlationId);
  const version = versionData as { id: string } | null;
  if (!version?.id) throw new DomainError('DATA_ERROR', 'Model version persistence failed: database returned no version ID.', { resource: 'model_version' }, correlationId);
  writeLog(createLogEvent('info', 'model.version.persisted', correlationId, { modelId: model.id, versionId: version.id }));
  return { modelId: model.id, versionId: version.id };
}