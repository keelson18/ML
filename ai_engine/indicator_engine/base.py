"""Base indicator calculator with numpy-optimized operations."""

from abc import ABC, abstractmethod
from typing import Dict, Any
import numpy as np
from ai_engine.common import logger


class IndicatorResult:
    """Container for indicator calculation results."""

    def __init__(self, name: str, values: np.ndarray, metadata: Dict[str, Any] = None):
        self.name = name
        self.values = values
        self.metadata = metadata or {}

    @property
    def latest(self) -> float:
        if len(self.values) == 0:
            return 0.0
        return float(self.values[-1])

    @property
    def array(self) -> np.ndarray:
        return self.values

    def __repr__(self) -> str:
        return f"IndicatorResult({self.name}, shape={self.values.shape})"


class BaseIndicator(ABC):
    """Abstract base for all indicator calculators."""

    def __init__(self, period: int = 14):
        self.period = period
        self._name = self.__class__.__name__

    @abstractmethod
    def calculate(self, data: np.ndarray) -> IndicatorResult:
        """Calculate indicator values from input data."""
        ...

    def __call__(self, data: np.ndarray) -> IndicatorResult:
        if len(data) < self.period + 1:
            logger.warning(f"{self._name}: insufficient data ({len(data)} < {self.period + 1})")
            return IndicatorResult(self._name, np.array([]))
        return self.calculate(data)


def normalize(values: np.ndarray) -> np.ndarray:
    """Min-max normalize to [0, 1]."""
    mn, mx = np.nanmin(values), np.nanmax(values)
    if mx == mn:
        return np.zeros_like(values)
    return (values - mn) / (mx - mn)


def rolling_window(a: np.ndarray, window: int) -> np.ndarray:
    """Create rolling window view of array."""
    shape = a.shape[:-1] + (a.shape[-1] - window + 1, window)
    strides = a.strides + (a.strides[-1],)
    return np.lib.stride_tricks.as_strided(a, shape=shape, strides=strides)
