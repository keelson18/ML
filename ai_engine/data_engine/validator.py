"""Data validation — ensures data quality and integrity."""

from typing import List, Tuple
from ai_engine.common import OHLCV, logger


class ValidationResult:
    """Result of data validation."""

    def __init__(self) -> None:
        self.is_valid: bool = True
        self.errors: List[str] = []
        self.warnings: List[str] = []

    def add_error(self, msg: str) -> None:
        self.is_valid = False
        self.errors.append(msg)

    def add_warning(self, msg: str) -> None:
        self.warnings.append(msg)

    def __repr__(self) -> str:
        status = "VALID" if self.is_valid else "INVALID"
        return f"ValidationResult({status}, errors={len(self.errors)}, warnings={len(self.warnings)})"


class DataValidator:
    """Validates market data quality and integrity."""

    def __init__(
        self,
        min_candles: int = 50,
        max_gap_ratio: float = 0.1,
        min_volume_ratio: float = 0.01,
    ) -> None:
        self.min_candles = min_candles
        self.max_gap_ratio = max_gap_ratio
        self.min_volume_ratio = min_volume_ratio

    def validate(self, candles: List[OHLCV]) -> ValidationResult:
        """Run all validation checks."""
        result = ValidationResult()

        self._check_minimum_length(candles, result)
        if not result.is_valid:
            return result

        self._check_gaps(candles, result)
        self._check_price_consistency(candles, result)
        self._check_volume(candles, result)
        self._check_duplicates(candles, result)
        self._check_flat_market(candles, result)

        return result

    def _check_minimum_length(self, candles: List[OHLCV], result: ValidationResult) -> None:
        if len(candles) < self.min_candles:
            result.add_error(
                f"Insufficient data: {len(candles)} candles, need at least {self.min_candles}"
            )

    def _check_gaps(self, candles: List[OHLCV], result: ValidationResult) -> None:
        if len(candles) < 3:
            return
        times = [c["time"] for c in candles]
        gaps = [times[i+1] - times[i] for i in range(len(times) - 1)]
        median_gap = sorted(gaps)[len(gaps) // 2] if gaps else 0
        if median_gap <= 0:
            return
        large_gaps = sum(1 for g in gaps if g > median_gap * 3)
        gap_ratio = large_gaps / len(gaps)
        if gap_ratio > self.max_gap_ratio:
            result.add_warning(
                f"Large gap ratio: {gap_ratio:.1%} ({large_gaps}/{len(gaps)} intervals)"
            )

    def _check_price_consistency(self, candles: List[OHLCV], result: ValidationResult) -> None:
        inconsistent = 0
        for c in candles:
            if c["high"] < c["low"] or c["open"] > c["high"] or c["open"] < c["low"]:
                inconsistent += 1
            elif c["close"] > c["high"] or c["close"] < c["low"]:
                inconsistent += 1
        if inconsistent > 0:
            result.add_error(f"{inconsistent} candles have inconsistent OHLC values")

    def _check_volume(self, candles: List[OHLCV], result: ValidationResult) -> None:
        zero_vol = sum(1 for c in candles if c["volume"] <= 0)
        vol_ratio = zero_vol / len(candles)
        if vol_ratio > self.min_volume_ratio:
            result.add_warning(
                f"High ratio of zero-volume candles: {vol_ratio:.1%}"
            )

    def _check_duplicates(self, candles: List[OHLCV], result: ValidationResult) -> None:
        times = [c["time"] for c in candles]
        dups = len(times) - len(set(times))
        if dups > 0:
            result.add_warning(f"Found {dups} duplicate timestamps")

    def _check_flat_market(self, candles: List[OHLCV], result: ValidationResult) -> None:
        if len(candles) < 10:
            return
        closes = [c["close"] for c in candles[-50:]]
        hi = max(closes)
        lo = min(closes)
        if hi == lo:
            result.add_warning("Flat market detected — all prices identical")
        elif hi > 0 and (hi - lo) / hi < 0.001:
            result.add_warning("Extremely low price variance detected")

