import type { Candle } from '../types';

// Volume Profile: Volume at price levels
// Calculates High Volume Nodes (HVN) and Low Volume Nodes (LVN)

export interface VolumeNode {
  priceLow: number;
  priceHigh: number;
  volume: number;
  isHighVolume: boolean;
  valueArea: boolean; // within 70% of total volume
}

export interface VolumeProfile {
  nodes: VolumeNode[];
  poc: number; // Point of Control (highest volume price level)
  pocVolume: number;
  totalVolume: number;
  valueAreaHigh: number;
  valueAreaLow: number;
}

export function calculateVolumeProfile(candles: Candle[], numBins = 20): VolumeProfile {
  if (candles.length === 0) {
    return { nodes: [], poc: 0, pocVolume: 0, totalVolume: 0, valueAreaHigh: 0, valueAreaLow: 0 };
  }

  const high = Math.max(...candles.map((c) => c.high));
  const low = Math.min(...candles.map((c) => c.low));
  const range = high - low;
  const binSize = range / numBins;

  // Initialize bins
  const bins: Map<number, number> = new Map();
  for (let i = 0; i < numBins; i++) {
    bins.set(i, 0);
  }

  // Distribute volume across price bins
  let totalVolume = 0;
  for (const c of candles) {
    const binIndex = Math.min(numBins - 1, Math.floor((c.close - low) / binSize));
    const vol = c.volume;
    bins.set(binIndex, (bins.get(binIndex) ?? 0) + vol);
    totalVolume += vol;
  }

  // Find Point of Control (POC)
  let poc = low;
  let pocVolume = 0;
  let maxVol = 0;

  const nodes: VolumeNode[] = [];
  let cumulativeVol = 0;
  const sortedBins = Array.from(bins.entries()).sort((a, b) => a[0] - b[0]);

  for (const [binIndex, vol] of sortedBins) {
    const priceLow = low + binIndex * binSize;
    const priceHigh = priceLow + binSize;
    const isHighVolume = vol > totalVolume / numBins * 1.5;

    if (vol > maxVol) {
      maxVol = vol;
      poc = priceLow;
      pocVolume = vol;
    }

    cumulativeVol += vol;
    nodes.push({
      priceLow,
      priceHigh,
      volume: vol,
      isHighVolume,
      valueArea: false, // computed below
    });
  }

  // Value Area: price levels containing 70% of total volume around POC
  const valueAreaTarget = totalVolume * 0.7;
  let valueAreaVol = 0;
  let pocIndex = nodes.findIndex((n) => n.priceLow <= poc && n.priceHigh >= poc);
  if (pocIndex === -1) pocIndex = Math.floor(numBins / 2);

  let leftIdx = pocIndex;
  let rightIdx = pocIndex;
  valueAreaVol += nodes[pocIndex].volume;
  nodes[pocIndex].valueArea = true;

  while (valueAreaVol < valueAreaTarget) {
    const leftVol = leftIdx > 0 ? nodes[leftIdx - 1].volume : 0;
    const rightVol = rightIdx < numBins - 1 ? nodes[rightIdx + 1].volume : 0;

    if (leftVol >= rightVol && leftIdx > 0) {
      leftIdx--;
      valueAreaVol += nodes[leftIdx].volume;
      nodes[leftIdx].valueArea = true;
    } else if (rightIdx < numBins - 1) {
      rightIdx++;
      valueAreaVol += nodes[rightIdx].volume;
      nodes[rightIdx].valueArea = true;
    } else {
      break;
    }
  }

  return {
    nodes,
    poc,
    pocVolume,
    totalVolume,
    valueAreaHigh: nodes[rightIdx]?.priceHigh ?? high,
    valueAreaLow: nodes[leftIdx]?.priceLow ?? low,
  };
}

