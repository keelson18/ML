import { api } from '../../api';
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
  try {
    const result = await api.post<{ id: string }>('/knowledge/nodes', {
      id: input.node.id,
      nodeType: input.node.nodeType,
      title: input.node.title,
      content: input.node.content,
      tags: input.node.tags,
      confidence: input.node.confidence,
      version: input.node.version,
      createdBy: input.createdBy,
    });
    writeLog(createLogEvent('info', 'knowledge.node.persisted', correlationId, { nodeId: result.id, createdBy: input.createdBy }));
    return result.id;
  } catch (e) {
    throw new DomainError('DATA_ERROR', `Knowledge persistence failed: ${e instanceof Error ? e.message : 'unknown'}`, { resource: 'knowledge_node' }, correlationId);
  }
}

export async function registerResearchModel(input: RegisterModelInput): Promise<{ modelId: string; versionId: string }> {
  const correlationId = input.correlationId ?? createCorrelationId();
  try {
    const result = await api.post<{ modelId: string; versionId: string }>('/knowledge/models', {
      name: input.name,
      description: input.description,
      createdBy: input.createdBy,
      version: input.version,
    });
    writeLog(createLogEvent('info', 'model.version.persisted', correlationId, { modelId: result.modelId, versionId: result.versionId }));
    return result;
  } catch (e) {
    throw new DomainError('DATA_ERROR', `Model persistence failed: ${e instanceof Error ? e.message : 'unknown'}`, { resource: 'model' }, correlationId);
  }
}
