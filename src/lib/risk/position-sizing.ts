// Dynamic Position Sizing: Kelly, Fixed %, Volatility-adjusted

export interface PositionSizeResult {
  size: number;        // Position size in units
  riskAmount: number;  // Amount at risk in quote currency
  riskPct: number;     // Risk as percentage of portfolio
}

// Kelly Criterion: f* = (bp - q) / b
// where b = odds (net odds received), p = win probability, q = loss probability
export function kellyCriterion(
  winProb: number,
  winLossRatio: number, // average win / average loss
): number {
  // Guard against division by zero or invalid ratio
  if (winLossRatio <= 0) return 0;
  const q = 1 - winProb;
  const kelly = (winLossRatio * winProb - q) / winLossRatio;
  // Use fractional Kelly (25%) for safety
  return Math.max(0, Math.min(0.25, kelly * 0.25));
}

// Volatility-adjusted position sizing
export function volatilityAdjustedSize(
  baseSize: number,
  currentAtr: number,
  averageAtr: number,
): number {
  if (averageAtr === 0) return baseSize;
  const ratio = averageAtr / currentAtr;
  // Scale down when volatility is high, scale up when low
  return baseSize * Math.min(2, Math.max(0.5, ratio));
}

// Fixed percentage risk per trade
export function fixedPercentageRisk(
  portfolioValue: number,
  riskPerTrade: number, // 0.01 = 1%
  entryPrice: number,
  stopLossPrice: number,
): PositionSizeResult {
  const riskAmount = portfolioValue * riskPerTrade;
  const priceRisk = Math.abs(entryPrice - stopLossPrice);
  const size = priceRisk > 0 ? riskAmount / priceRisk : 0;

  return {
    size: Math.floor(size * 100) / 100, // Round to 2 decimals
    riskAmount,
    riskPct: riskPerTrade,
  };
}

// Comprehensive position sizing
export function calculatePositionSize(params: {
  portfolioValue: number;
  entryPrice: number;
  stopLossPrice: number;
  winProbability: number;
  winLossRatio: number;
  currentAtr: number;
  averageAtr: number;
  maxRiskPct: number;
}): PositionSizeResult {
  // Kelly fraction
  const kellyPct = kellyCriterion(params.winProbability, params.winLossRatio);

  // Use min of Kelly and max risk
  const riskPct = Math.min(kellyPct, params.maxRiskPct);

  // Base size from fixed percentage
  const base = fixedPercentageRisk(params.portfolioValue, riskPct, params.entryPrice, params.stopLossPrice);

  // Adjust for volatility
  const adjustedSize = volatilityAdjustedSize(base.size, params.currentAtr, params.averageAtr);

  // BUGFIX: Recompute riskAmount and riskPct from the adjusted size, since
  // volatilityAdjustedSize may have scaled the base size up or down. The
  // pre-adjustment base values understate/overstate real risk.
  const priceRisk = Math.abs(params.entryPrice - params.stopLossPrice);
  const adjRiskAmount = adjustedSize * priceRisk;
  const adjRiskPct = params.portfolioValue > 0 ? adjRiskAmount / params.portfolioValue : 0;

  return {
    size: adjustedSize,
    riskAmount: adjRiskAmount,
    riskPct: adjRiskPct,
  };
}

