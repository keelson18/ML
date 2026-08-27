"""Data models for market data."""

from dataclasses import dataclass, field
from datetime import datetime
from typing import List, Optional
import numpy as np
from ai_engine.common import Timeframe, MarketType, OHLCV


@dataclass
class Instrument:
    """Represents a tradable instrument."""
    symbol: str
    market_type: MarketType
    exchange: str
    base_asset: str
    quote_asset: str
    label: str
    is_active: bool = True
    min_volume: Optional[float] = None
    tick_size: Optional[float] = None
    lot_size: Optional[float] = None


@dataclass
class MarketData:
    """Container for OHLCV market data with metadata."""
    symbol: str
    timeframe: Timeframe
    candles: List[OHLCV]
    instrument: Optional[Instrument] = None
    fetched_at: datetime = field(default_factory=datetime.utcnow)

    @property
    def close_array(self) -> np.ndarray:
        return np.array([c["close"] for c in self.candles], dtype=np.float64)

    @property
    def high_array(self) -> np.ndarray:
        return np.array([c["high"] for c in self.candles], dtype=np.float64)

    @property
    def low_array(self) -> np.ndarray:
        return np.array([c["low"] for c in self.candles], dtype=np.float64)

    @property
    def open_array(self) -> np.ndarray:
        return np.array([c["open"] for c in self.candles], dtype=np.float64)

    @property
    def volume_array(self) -> np.ndarray:
        return np.array([c["volume"] for c in self.candles], dtype=np.float64)

    @property
    def time_array(self) -> np.ndarray:
        return np.array([c["time"] for c in self.candles], dtype=np.int64)

    @property
    def ohlcv_array(self) -> np.ndarray:
        return np.column_stack([
            self.open_array, self.high_array, self.low_array,
            self.close_array, self.volume_array
        ])

    def __len__(self) -> int:
        return len(self.candles)


@dataclass
class MultiTimeframeData:
    """Container for multi-timeframe market data."""
    symbol: str
    data: dict[Timeframe, MarketData] = field(default_factory=dict)

    def add(self, data: MarketData) -> None:
        self.data[data.timeframe] = data

    def get(self, tf: Timeframe) -> Optional[MarketData]:
        return self.data.get(tf)

    @property
    def timeframes(self) -> List[Timeframe]:
        return list(self.data.keys())

    def __len__(self) -> int:
        return len(self.data)

