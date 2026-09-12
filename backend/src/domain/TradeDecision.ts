/**
 * Trading Decision Domain
 * Core output of the Master Decision Engine
 * Every decision is immutable and fully auditable
 */

export type DecisionType = 'BUY' | 'SELL' | 'HOLD' | 'WATCH' | 'NO_TRADE';
export type DecisionStatus = 'pending' | 'approved' | 'rejected' | 'executed' | 'canceled';

export interface EvidenceItem {
  source: string; // e.g., 'pattern-engine', 'ml-model', 'risk-engine'
  engineVersion: string;
  signal: string;
  weight: number; // 0..1
  confidence: number; // 0..1
  reasoning: string;
  timestamp: Date;
}

export interface ContradictionItem {
  source: string;
  engineVersion: string;
  signal: string;
  confidence: number;
  reasoning: string;
  timestamp: Date;
}

export interface InvalidationCondition {
  description: string;
  price?: number;
  timeframe?: string;
  type: 'price-level' | 'time-based' | 'indicator-based' | 'rule-based';
}

export interface TradeTargets {
  tp1?: { price: number; quantity_pct: number };
  tp2?: { price: number; quantity_pct: number };
  tp3?: { price: number; quantity_pct: number };
}

/**
 * TradeDecision: Immutable decision record
 * Every decision must be reproducible and explainable
 */
export class TradeDecision {
  readonly id: string;
  readonly assetId: string;
  readonly timeframe: string;
  readonly decisionType: DecisionType;
  readonly decisionStatus: DecisionStatus;
  readonly confidence: number; // 0..1
  readonly riskScore: number; // 0..1
  readonly timestamp: Date;
  readonly expiresAt?: Date;

  // Execution context
  readonly entryZone?: { min: number; max: number };
  readonly stopLoss?: number;
  readonly takeProfit?: number;
  readonly targets?: TradeTargets;
  readonly positionSize?: number;
  readonly riskRewardRatio?: number;

  // Evidence & Reasoning
  readonly supportingEvidence: EvidenceItem[];
  readonly contradictingEvidence: ContradictionItem[];
  readonly invalidationConditions: InvalidationCondition[];
  readonly strategy?: string;
  readonly marketRegime?: string;
  readonly reasoning: string;

  // Versioning & Auditability
  readonly decisionEngineVersion: string;
  readonly strategyVersions: string[];
  readonly modelVersions: string[];
  readonly contextSnapshotId?: string;

  // Meta
  readonly correlationId: string;
  readonly createdBy?: string;

  constructor(params: {
    id: string;
    assetId: string;
    timeframe: string;
    decisionType: DecisionType;
    confidence: number;
    riskScore: number;
    reasoning: string;
    decisionEngineVersion: string;
    correlationId: string;
    entryZone?: { min: number; max: number };
    stopLoss?: number;
    takeProfit?: number;
    targets?: TradeTargets;
    positionSize?: number;
    riskRewardRatio?: number;
    supportingEvidence?: EvidenceItem[];
    contradictingEvidence?: ContradictionItem[];
    invalidationConditions?: InvalidationCondition[];
    strategy?: string;
    marketRegime?: string;
    strategyVersions?: string[];
    modelVersions?: string[];
    contextSnapshotId?: string;
    timestamp?: Date;
    expiresAt?: Date;
    decisionStatus?: DecisionStatus;
    createdBy?: string;
  }) {
    this.id = params.id;
    this.assetId = params.assetId;
    this.timeframe = params.timeframe;
    this.decisionType = params.decisionType;
    this.confidence = Math.max(0, Math.min(1, params.confidence));
    this.riskScore = Math.max(0, Math.min(1, params.riskScore));
    this.reasoning = params.reasoning;
    this.decisionEngineVersion = params.decisionEngineVersion;
    this.correlationId = params.correlationId;
    this.timestamp = params.timestamp || new Date();
    this.expiresAt = params.expiresAt;
    this.decisionStatus = params.decisionStatus || 'pending';
    this.createdBy = params.createdBy;

    this.entryZone = params.entryZone;
    this.stopLoss = params.stopLoss;
    this.takeProfit = params.takeProfit;
    this.targets = params.targets;
    this.positionSize = params.positionSize;
    this.riskRewardRatio = params.riskRewardRatio;

    this.supportingEvidence = params.supportingEvidence || [];
    this.contradictingEvidence = params.contradictingEvidence || [];
    this.invalidationConditions = params.invalidationConditions || [];
    this.strategy = params.strategy;
    this.marketRegime = params.marketRegime;
    this.strategyVersions = params.strategyVersions || [];
    this.modelVersions = params.modelVersions || [];
    this.contextSnapshotId = params.contextSnapshotId;

    this.validate();
  }

  private validate(): void {
    if (this.confidence < 0 || this.confidence > 1) {
      throw new Error('Confidence must be between 0 and 1');
    }
    if (this.riskScore < 0 || this.riskScore > 1) {
      throw new Error('Risk score must be between 0 and 1');
    }
    if (!this.reasoning || this.reasoning.trim().length === 0) {
      throw new Error('Decision must have reasoning');
    }
  }

  isRejected(): boolean {
    return this.decisionStatus === 'rejected';
  }

  isExecuted(): boolean {
    return this.decisionStatus === 'executed';
  }

  isExpired(): boolean {
    return this.expiresAt ? new Date() > this.expiresAt : false;
  }

  getRiskLevel(): 'low' | 'medium' | 'high' | 'critical' {
    if (this.riskScore < 0.3) return 'low';
    if (this.riskScore < 0.6) return 'medium';
    if (this.riskScore < 0.85) return 'high';
    return 'critical';
  }

  toJSON() {
    return {
      id: this.id,
      assetId: this.assetId,
      timeframe: this.timeframe,
      decisionType: this.decisionType,
      decisionStatus: this.decisionStatus,
      confidence: this.confidence,
      riskScore: this.riskScore,
      riskLevel: this.getRiskLevel(),
      timestamp: this.timestamp.toISOString(),
      expiresAt: this.expiresAt?.toISOString(),
      entryZone: this.entryZone,
      stopLoss: this.stopLoss,
      takeProfit: this.takeProfit,
      targets: this.targets,
      positionSize: this.positionSize,
      riskRewardRatio: this.riskRewardRatio,
      supportingEvidenceCount: this.supportingEvidence.length,
      contradictingEvidenceCount: this.contradictingEvidence.length,
      strategy: this.strategy,
      marketRegime: this.marketRegime,
      reasoning: this.reasoning,
      decisionEngineVersion: this.decisionEngineVersion,
      correlationId: this.correlationId,
    };
  }
}
