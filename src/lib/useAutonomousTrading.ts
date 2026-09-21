import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchKlines, subscribeKlines } from './binance';
import { fetchCachedMLPrediction, fetchMLPrediction } from './mlClient';
import {
  masterDecisionEngine,
  type DecisionEngineContext,
  type TradeDecision,
} from './intelligence/decision-engine';
import { analyzeMarketIntelligence } from './intelligence/orchestrator';
import {
  simulatePaperOrder,
  closePaperPosition,
  type PaperAccountState,
  type PaperOrderResult,
} from './intelligence/paper-execution';
import type { Candle, Timeframe, MLPrediction } from './types';

export interface IntelligenceSnapshot {
  decision: TradeDecision;
  regime: string;
  trendState: string;
  volatilityState: string;
  momentumState: string;
  dataQuality: string;
  strategy: string;
  evidenceCount: number;
  contradictionCount: number;
  engineVersions: Record<string, string>;
  latencyMs: number;
  warnings: string[];
}

export interface AutonomousTradingState {
  symbol: string;
  timeframe: Timeframe;
  candles: Candle[];
  livePrice: number | null;
  loading: boolean;
  wsStatus: 'connecting' | 'open' | 'closed' | 'reconnecting';
  ml: MLPrediction | null;
  mlLoading: boolean;
  intelligence: IntelligenceSnapshot | null;
  computing: boolean;
  account: PaperAccountState;
  lastOrder: PaperOrderResult | null;
  error: string | null;
}

const DEFAULT_RISK = {
  trade: { size: 1, entryPrice: 100, stopLossPrice: 99, takeProfitPrice: 102, portfolioValue: 10000 },
  state: { currentDailyPnL: 0, currentDrawdown: 0, currentExposure: 0, currentLeverage: 0 },
  limits: { maxDailyLoss: -0.05, maxDrawdown: -0.2, maxPortfolioExposure: 0.5, maxLeverage: 1, minRiskReward: 1.5 },
  ruleVersion: 'risk-1',
};

const DEFAULT_PORTFOLIO = {
  value: 10000,
  positions: [],
  proposedTrade: { symbol: 'BTCUSDT', marketType: 'crypto', size: 1, entryPrice: 100 },
  limits: { maxExposureRatio: 0.5, maxConcentrationRisk: 1, maxCorrelationRisk: 1 },
  ruleVersion: 'portfolio-1',
};

function createPaperAccount(): PaperAccountState {
  return { accountId: 'paper-001', cash: 10000, positions: [], trades: [] };
}

export function useAutonomousTrading(symbol: string, timeframe: Timeframe) {
  const [candles, setCandles] = useState<Candle[]>([]);
  const [loading, setLoading] = useState(true);
  const [wsStatus, setWsStatus] = useState<'connecting' | 'open' | 'closed' | 'reconnecting'>('connecting');
  const [livePrice, setLivePrice] = useState<number | null>(null);
  const [ml, setMl] = useState<MLPrediction | null>(null);
  const [mlLoading, setMlLoading] = useState(false);
  const [intelligence, setIntelligence] = useState<IntelligenceSnapshot | null>(null);
  const [computing, setComputing] = useState(false);
  const [account, setAccount] = useState<PaperAccountState>(createPaperAccount);
  const [lastOrder, setLastOrder] = useState<PaperOrderResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const accountRef = useRef(account);
  accountRef.current = account;

  // Load candles + subscribe to live stream
  useEffect(() => {
    let disposed = false;
    setLoading(true);
    setCandles([]);
    setMl(null);
    setIntelligence(null);

    (async () => {
      try {
        const data = await fetchKlines(symbol, timeframe, 1000);
        if (disposed) return;
        setCandles(data);
        setLivePrice(data.length ? data[data.length - 1].close : null);
      } catch {
        if (!disposed) setCandles([]);
      } finally {
        if (!disposed) setLoading(false);
      }
    })();

    const unsub = subscribeKlines(symbol, timeframe, (candle) => {
      setCandles((prev) => {
        const arr = [...prev];
        const last = arr[arr.length - 1];
        if (last && last.time === candle.time) {
          arr[arr.length - 1] = candle;
        } else if (!last || candle.time > last.time) {
          arr.push(candle);
          if (arr.length > 1500) arr.shift();
        }
        return arr;
      });
      setLivePrice(candle.close);
    }, (status) => setWsStatus(status));

    return () => { disposed = true; unsub(); };
  }, [symbol, timeframe]);

  // Fetch cached ML prediction
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const cached = await fetchCachedMLPrediction(symbol, timeframe);
      if (!cancelled && cached) setMl(cached);
    })();
    return () => { cancelled = true; };
  }, [symbol, timeframe]);

  // Run intelligence pipeline
  const runAnalysis = useCallback(async () => {
    if (candles.length < 60) return;
    setComputing(true);
    setError(null);
    try {
      const entryPrice = candles[candles.length - 1].close;
      const risk = {
        ...DEFAULT_RISK,
        trade: { ...DEFAULT_RISK.trade, entryPrice, portfolioValue: accountRef.current.cash },
      };
      const portfolio = {
        ...DEFAULT_PORTFOLIO,
        value: accountRef.current.cash,
        proposedTrade: { symbol, marketType: 'crypto', size: 1, entryPrice },
      };
      const context: DecisionEngineContext = {
        inputContextId: `auto-${Date.now()}`,
        symbol,
        timeframe,
        candles,
        observedAt: Math.floor(Date.now() / 1000),
        risk,
        portfolio,
        ...(ml ? { ml: { prediction: ml, featureSnapshot: { rsi: 50, atr: 0.02 }, datasetId: 'live' } } : {}),
      };
      const snapshot = analyzeMarketIntelligence(context);
      const result = masterDecisionEngine.analyze(context);
      setIntelligence({
        decision: result.result,
        regime: snapshot.regime.result.regime,
        trendState: snapshot.context.result.trendState,
        volatilityState: snapshot.context.result.volatilityState,
        momentumState: snapshot.context.result.momentumState,
        dataQuality: snapshot.dataQuality.status,
        strategy: snapshot.strategy.result.selectedStrategy.name,
        evidenceCount: result.evidence.length,
        contradictionCount: result.result.contradictions.length,
        engineVersions: result.result.engineVersions,
        latencyMs: Math.round(result.latencyMs),
        warnings: result.warnings.slice(0, 5),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Analysis failed');
    } finally {
      setComputing(false);
    }
  }, [candles, symbol, timeframe, ml]);

  // Auto-run analysis when candles update significantly
  useEffect(() => {
    if (candles.length >= 60 && !loading) {
      runAnalysis();
    }
  }, [candles.length, loading, runAnalysis]);

  const refreshML = async () => {
    setMlLoading(true);
    const pred = await fetchMLPrediction(symbol, timeframe);
    if (pred) setMl(pred);
    setMlLoading(false);
  };

  // Execute paper trade from current decision
  const executePaperTrade = useCallback(() => {
    if (!intelligence || !livePrice) return;
    const decision = intelligence.decision;
    if (decision.decision !== 'BUY' && decision.decision !== 'SELL') return;
    const entryPrice = decision.entry ?? livePrice;
    const portfolioValue = accountRef.current.cash;
    const quantity = Math.min(1, portfolioValue / (entryPrice * 10));
    const result = simulatePaperOrder(accountRef.current, {
      orderId: `order-${Date.now()}`,
      positionId: `pos-${Date.now()}`,
      decisionId: `decision-${Date.now()}`,
      assetId: symbol,
      symbol,
      decision,
      riskApproved: true,
      portfolioApproved: true,
      quantity,
      requestedPrice: entryPrice,
      feeRate: 0.001,
      slippageRate: 0.001,
      stopLoss: decision.invalidation,
      takeProfit: decision.targets?.[0]?.price,
      executionVersion: 'paper-1',
    });
    setLastOrder(result);
    if (result.accepted) setAccount(result.account);
  }, [intelligence, livePrice, symbol]);

  // Close a position at current price
  const closePosition = useCallback((posSymbol: string) => {
    if (!livePrice) return;
    const result = closePaperPosition(
      accountRef.current,
      posSymbol,
      livePrice,
      0.001,
      'paper-1',
      `trade-${Date.now()}`,
    );
    if ('trade' in result) {
      setAccount(result.account);
    }
  }, [livePrice]);

  // Reset account
  const resetAccount = useCallback(() => {
    setAccount(createPaperAccount());
    setLastOrder(null);
  }, []);

  const stats = useMemo(() => {
    const openPositions = account.positions.filter((p) => p.status === 'open');
    const closedTrades = account.trades;
    const totalPnl = closedTrades.reduce((s, t) => s + t.realizedPnl, 0);
    const wins = closedTrades.filter((t) => t.realizedPnl > 0);
    const winRate = closedTrades.length > 0 ? wins.length / closedTrades.length : 0;
    const unrealizedPnl = openPositions.reduce((s, p) => {
      if (!livePrice) return s;
      const diff = p.side === 'buy' ? livePrice - p.entryPrice : p.entryPrice - livePrice;
      return s + diff * p.quantity;
    }, 0);
    return {
      cash: account.cash,
      totalValue: account.cash + unrealizedPnl,
      openPositions: openPositions.length,
      totalTrades: closedTrades.length,
      totalPnl,
      winRate,
      unrealizedPnl,
    };
  }, [account, livePrice]);

  return {
    symbol,
    timeframe,
    candles,
    livePrice,
    loading,
    wsStatus,
    ml,
    mlLoading,
    intelligence,
    computing,
    account,
    lastOrder,
    error,
    stats,
    runAnalysis,
    refreshML,
    executePaperTrade,
    closePosition,
    resetAccount,
  };
}
