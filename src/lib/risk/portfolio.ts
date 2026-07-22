// Portfolio-level risk aggregation and correlation management

export interface PortfolioPosition {
  symbol: string;
  marketType: string;
  size: number;
  entryPrice: number;
  currentPrice: number;
  pnl: number;
  pnlPct: number;
  weight: number; // % of portfolio
}

export interface PortfolioRisk {
  totalExposure: number;
  totalPnl: number;
  totalPnlPct: number;
  correlationRisk: number; // 0-1, higher = more correlated
  concentrationRisk: number; // 0-1, higher = more concentrated
  volatility: number;
}

// Calculate Herfindahl-Hirschman Index for concentration
function hhi(weights: number[]): number {
  return weights.reduce((sum, w) => sum + w * w, 0);
}

// Estimate portfolio correlation risk
export function estimateCorrelationRisk(positions: PortfolioPosition[]): number {
  if (positions.length <= 1) return 0;

  // Count positions in same market type as proxy for correlation
  const typeCounts = new Map<string, number>();
  for (const p of positions) {
    typeCounts.set(p.marketType, (typeCounts.get(p.marketType) ?? 0) + 1);
  }

  let maxInType = 0;
  for (const count of typeCounts.values()) {
    maxInType = Math.max(maxInType, count);
  }

  return maxInType / positions.length;
}

// Analyze portfolio risk
export function analyzePortfolioRisk(positions: PortfolioPosition[]): PortfolioRisk {
  if (positions.length === 0) {
    return { totalExposure: 0, totalPnl: 0, totalPnlPct: 0, correlationRisk: 0, concentrationRisk: 0, volatility: 0 };
  }

  const totalValue = positions.reduce((s, p) => s + p.size * p.currentPrice, 0);
  const totalCost = positions.reduce((s, p) => s + p.size * p.entryPrice, 0);
  const totalPnl = positions.reduce((s, p) => s + p.pnl, 0);
  const totalPnlPct = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0;

  // Calculate weights
  const weights = positions.map((p) => (p.size * p.currentPrice) / totalValue);

  return {
    totalExposure: totalValue,
    totalPnl,
    totalPnlPct,
    correlationRisk: estimateCorrelationRisk(positions),
    concentrationRisk: Math.min(1, hhi(weights)),
    volatility: positions.reduce((s, p) => s + Math.abs(p.pnlPct), 0) / positions.length,
  };
}

