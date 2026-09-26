import type { EngineContext, EngineEvidence, EngineResult, IntelligenceEngine } from './contracts';

export type KnowledgeStatus = 'draft' | 'validated' | 'approved' | 'retired';

export interface KnowledgeNode {
  id: string;
  nodeType: 'pattern' | 'strategy' | 'regime' | 'asset' | 'lesson' | 'hypothesis' | 'market_behavior';
  title: string;
  content: string;
  tags: string[];
  confidence: number;
  status: KnowledgeStatus;
  version: string;
}

export interface KnowledgeContext extends EngineContext {
  queryTags: string[];
  knowledgeNodes: KnowledgeNode[];
}

export interface KnowledgeAnalysis {
  matches: KnowledgeNode[];
  approvedOnly: boolean;
}

const ENGINE_NAME = 'knowledge-intelligence';
const ENGINE_VERSION = '1.0.0';

export const knowledgeIntelligenceEngine: IntelligenceEngine<KnowledgeAnalysis> & {
  analyze(context: KnowledgeContext): EngineResult<KnowledgeAnalysis>;
} = {
  name: ENGINE_NAME,
  version: ENGINE_VERSION,

  analyze(context: KnowledgeContext): EngineResult<KnowledgeAnalysis> {
    const startedAt = performance.now();
    const queryTags = new Set(context.queryTags.map((tag) => tag.toLowerCase()));
    const matches = context.knowledgeNodes
      .filter((node) => node.status === 'validated' || node.status === 'approved')
      .map((node) => ({
        node,
        overlap: node.tags.filter((tag) => queryTags.has(tag.toLowerCase())).length,
      }))
      .filter(({ overlap }) => overlap > 0)
      .sort((left, right) => right.overlap - left.overlap || right.node.confidence - left.node.confidence)
      .map(({ node }) => node)
      .slice(0, 20);
    const result: KnowledgeAnalysis = { matches, approvedOnly: true };
    const evidence: EngineEvidence[] = matches.map((node) => ({
      id: `${ENGINE_NAME}:${node.id}:${node.version}`,
      kind: 'historical',
      source: ENGINE_NAME,
      direction: 'neutral',
      score: node.confidence,
      explanation: `${node.title} (${node.nodeType}) retrieved from ${node.status} knowledge version ${node.version}.`,
    }));

    return {
      engineName: ENGINE_NAME,
      engineVersion: ENGINE_VERSION,
      timestamp: new Date().toISOString(),
      inputContextId: context.inputContextId,
      status: 'ok',
      result,
      confidence: matches.length > 0 ? Math.max(...matches.map((node) => node.confidence)) : 0,
      evidence,
      warnings: matches.length === 0 ? ['No validated knowledge matched the supplied tags.'] : [],
      latencyMs: performance.now() - startedAt,
    };
  },
};