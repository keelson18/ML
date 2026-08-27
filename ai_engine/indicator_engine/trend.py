"""Trend indicators: SMA, EMA, WMA, HMA, VWMA."""

import numpy as np
from typing import Dict, Any
from .base import BaseIndicator, IndicatorResult


class SMA(BaseIndicator):
    """Simple Moving Average."""

    def __init__(self, period: int = 20):
        super().__init__(period)

    def calculate(self, data: np.ndarray) -> IndicatorResult:
        arr = np.full_like(data, np.nan)
        cumsum = np.cumsum(data, dtype=np.float64)
