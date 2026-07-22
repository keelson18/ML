// Risk Limits: Daily loss, drawdown, exposure limits

export interface RiskLimits {
  maxDailyLoss: number;
  maxDrawdown: number;
  maxPortfolioExposure: number;
  maxLeverage: number;
  minRiskReward: number;
}

export interface RiskState {
  currentDailyPnL: number;
  currentDrawdown: number;
  currentExposure: number;
  currentLeverage: number;
}

export interface RiskCheckResult {
  allowed: boolean;
  reasons: string[];
}

const DEFAULT_LIMITS: RiskLimits = {
  maxDailyLoss: -0.05,       // -5% max daily loss
  maxDrawdown: -0.20,        // -20% max drawdown
  maxPortfolioExposure: 0.5, // 50% max portfolio exposure
  maxLeverage: 1,            // No leverage for paper trading
  minRiskReward: 1.5,        // Minimum 1:1.5 risk/reward
};

// Check if a new trade is within risk limits
export function checkRiskLimits(
  trade: {
    size: number;
    entryPrice: number;
    stopLossPrice: number;
    takeProfitPrice: number;
    portfolioValue: number;
  },
  state: RiskState,
  limits: RiskLimits = DEFAULT_LIMITS,
): RiskCheckResult {
  const reasons: string[] = [];
  let allowed = true;

  // Check daily loss limit
  if (state.currentDailyPnL <= limits.maxDailyLoss) {
    reasons.push('Daily loss limit reached');
    allowed = false;
  }

  // Check drawdown limit
  if (state.currentDrawdown <= limits.maxDrawdown) {
    reasons.push('Maximum drawdown reached');
    allowed = false;
  }

  // Check portfolio exposure
  const tradeExposure = (trade.size * trade.entryPrice) / trade.portfolioValue;
  const newExposure = state.currentExposure + tradeExposure;
  if (newExposure > limits.maxPortfolioExposure) {
    reasons.push(`Portfolio exposure would exceed ${(limits.maxPortfolioExposure * 100).toFixed(0)}% limit`);
    allowed = false;
  }

  // Check risk/reward ratio
  const risk = Math.abs(trade.entryPrice - trade.stopLossPrice);
  const reward = Math.abs(trade.takeProfitPrice - trade.entryPrice);
  const rr = risk > 0 ? reward / risk : 0;
  if (rr < limits.minRiskReward) {
    reasons.push(`Risk/reward ratio ${rr.toFixed(2)} below minimum ${limits.minRiskReward}`);
    allowed = false;
  }

  return { allowed, reasons };
}

