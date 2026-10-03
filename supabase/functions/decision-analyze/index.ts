import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey, X-Correlation-Id",
};

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface DecisionRequest {
  symbol: string;
  timeframe: string;
  candles: Candle[];
}

function sma(values: number[], period: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) { out.push(NaN); continue; }
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += values[j];
    out.push(sum / period);
  }
  return out;
}

function rsi(closes: number[], period = 14): number {
  if (closes.length < period + 1) return 50;
  let gains = 0, losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff; else losses -= diff;
  }
  const rs = losses === 0 ? 100 : gains / losses;
  return 100 - 100 / (1 + rs);
}

function analyzeDecision(req: DecisionRequest) {
  const { symbol, timeframe, candles } = req;
  const closes = candles.map((c) => c.close);
  const fastSMA = sma(closes, 9);
  const slowSMA = sma(closes, 21);
  const lastIdx = closes.length - 1;
  const rsiVal = rsi(closes);

  const fast = fastSMA[lastIdx];
  const slow = slowSMA[lastIdx];
  const prevFast = fastSMA[lastIdx - 1];
  const prevSlow = slowSMA[lastIdx - 1];

  const bullishCross = prevFast <= prevSlow && fast > slow;
  const bearishCross = prevFast >= prevSlow && fast < slow;
  const price = closes[lastIdx];

  let decision: "BUY" | "SELL" | "HOLD" | "WATCH" | "NO_TRADE" = "HOLD";
  let confidence = 0.5;
  const evidence: { source: string; explanation: string; score?: number }[] = [];
  const contradictions: string[] = [];

  if (bullishCross && rsiVal < 70) {
    decision = "BUY";
    confidence = 0.65 + (rsiVal < 50 ? 0.1 : 0);
    evidence.push({ source: "SMA Crossover", explanation: `Fast SMA crossed above slow SMA at ${price.toFixed(2)}`, score: 0.7 });
    evidence.push({ source: "RSI", explanation: `RSI at ${rsiVal.toFixed(1)} — not overbought`, score: 0.6 });
  } else if (bearishCross && rsiVal > 30) {
    decision = "SELL";
    confidence = 0.65 + (rsiVal > 50 ? 0.1 : 0);
    evidence.push({ source: "SMA Crossover", explanation: `Fast SMA crossed below slow SMA at ${price.toFixed(2)}`, score: 0.7 });
    evidence.push({ source: "RSI", explanation: `RSI at ${rsiVal.toFixed(1)} — not oversold`, score: 0.6 });
  } else {
    decision = fast > slow ? "WATCH" : "NO_TRADE";
    confidence = 0.35;
    evidence.push({ source: "Trend", explanation: `SMA spread: ${fast > slow ? "bullish" : "bearish"} but no fresh cross`, score: 0.4 });
    evidence.push({ source: "RSI", explanation: `RSI at ${rsiVal.toFixed(1)}`, score: 0.3 });
  }

  if (rsiVal > 70 && decision === "BUY") contradictions.push("RSI overbought — entry risk elevated");
  if (rsiVal < 30 && decision === "SELL") contradictions.push("RSI oversold — short risk elevated");

  const result = {
    decision,
    confidence,
    strategy: "SMA Crossover + RSI Filter",
    supportingEvidence: evidence,
    contradictions,
    reasoning: `${symbol} ${timeframe}: ${decision} signal from ${evidence.length} indicators with ${(confidence * 100).toFixed(0)}% confidence`,
    explanation: `${decision} signal on ${symbol} (${timeframe}). SMA(9/21) trend ${fast > slow ? "bullish" : "bearish"}, RSI ${rsiVal.toFixed(1)}.`,
    timestamp: new Date().toISOString(),
  };

  return { result };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return response({ error: "Method not allowed" }, 405);

  try {
    const payload: unknown = await req.json();
    if (!payload || typeof payload !== "object") return response({ error: "Invalid request" }, 400);
    const reqData = payload as DecisionRequest;
    if (!reqData.symbol || !reqData.timeframe || !Array.isArray(reqData.candles) || reqData.candles.length < 30) {
      return response({ error: "Need symbol, timeframe, and at least 30 candles" }, 400);
    }

    const decision = analyzeDecision(reqData);
    return response({ decision });
  } catch (error) {
    return response({ error: "Analysis failed" }, 500);
  }
});
