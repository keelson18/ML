"""Data normalization — cleans and normalizes raw market data."""

import numpy as np
from typing import List, Optional
from ai_engine.common import OHLCV, Timeframe, logger


class DataNormalizer:
    """Normalizes raw OHLCV data: handles gaps, outliers, and formatting."""

    def __init__(self, z_score_threshold: float = 5.0) -> None:
        self.z_score_threshold = z_score_threshold

    def normalize(self, candles: List[OHLCV], timeframe: Timeframe) -> List[OHLCV]:
        """Full normalization pipeline."""
        candles = self._ensure_sorted(candles)
        candles = self._fill_gaps(candles, timeframe)
        candles = self._remove_outliers(candles)
        candles = self._validate_ohlcv(candles)
        return candles

    def _ensure_sorted(self, candles: List[OHLCV]) -> List[OHLCV]:
        """Ensure candles are sorted ascending by time."""
        sorted_candles = sorted(candles, key=lambda c: c["time"])
        if sorted_candles != candles:
            logger.warning("Candles were not sorted — reordered")
        return sorted_candles

    def _fill_gaps(self, candles: List[OHLCV], timeframe: Timeframe) -> List[OHLCV]:
        """Detect and fill missing time intervals."""
        expected_seconds = self._timeframe_seconds(timeframe)
        if expected_seconds <= 0:
            return candles

        filled: List[OHLCV] = []
        for i, candle in enumerate(candles):
            if i > 0:
                gap = candle["time"] - candles[i - 1]["time"]
                if gap > expected_seconds * 2:
                    # Fill missing candles with previous close
                    num_missing = gap // expected_seconds - 1
                    for j in range(1, int(num_missing) + 1):
                        fill_time = candles[i - 1]["time"] + expected_seconds * j
                        prev_close = candles[i - 1]["close"]
                        filled.append(OHCLV(
                            time=fill_time,
                            open=prev_close,
                            high=prev_close,
                            low=prev_close,
                            close=prev_close,
                            volume=0.0,
                        ))
                    logger.debug(f"Filled {int(num_missing)} gap candles at {candle['time']}")
            filled.append(candle)
        return filled

    def _remove_outliers(self, candles: List[OHLCV]) -> List[OHLCV]:
        """Remove candles with price/volume outliers using z-score."""
        if len(candles) < 20:
            return candles

        closes = np.array([c["close"] for c in candles])
        volumes = np.array([c["volume"] for c in candles])

        close_z = np.abs((closes - np.mean(closes)) / (np.std(closes) + 1e-10))
        vol_z = np.abs((volumes - np.mean(volumes)) / (np.std(volumes) + 1e-10))

        valid_indices = (close_z < self.z_score_threshold) & (vol_z < self.z_score_threshold)
        n_removed = len(candles) - int(np.sum(valid_indices))
        if n_removed > 0:
            logger.warning(f"Removed {n_removed} outlier candles")

        return [c for i, c in enumerate(candles) if valid_indices[i]]

    def _validate_ohlcv(self, candles: List[OHLCV]) -> List[OHLCV]:
        """Validate OHLCV consistency (high >= low, open/close within range)."""
        valid: List[OHLCV] = []
        for c in candles:
            if c["high"] < c["low"]:
                continue
            if c["open"] < c["low"] or c["open"] > c["high"]:
                continue
            if c["close"] < c["low"] or c["close"] > c["high"]:
                continue
            if c["volume"] < 0:
                continue
            valid.append(c)

        if len(valid) < len(candles):
            logger.warning(f"Removed {len(candles) - len(valid)} invalid candles")
        return valid

    @staticmethod
    def _timeframe_seconds(tf: Timeframe) -> int:
        mapping = {
            Timeframe.MINUTE_1: 60,
            Timeframe.MINUTE_3: 180,
            Timeframe.MINUTE_5: 300,
            Timeframe.MINUTE_15: 900,
            Timeframe.MINUTE_30: 1800,
            Timeframe.HOUR_1: 3600,
            Timeframe.HOUR_4: 14400,
            Timeframe.DAY_1: 86400,
            Timeframe.WEEK_1: 604800,
            Timeframe.MONTH_1: 2592000,
        }
        return mapping.get(tf, 60)

