"""Common utilities and base types for the AI trading engine."""

from datetime import datetime
from enum import Enum
from typing import Optional, TypedDict
import logging

# Configure module-level logger
logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] %(name)s: %(message)s')
logger = logging.getLogger("ai_engine")


class Timeframe(str, Enum):
    MINUTE_1 = "1m"
    MINUTE_3 = "3m"
    MINUTE_5 = "5m"
    MINUTE_15 = "15m"
    MINUTE_30 = "30m"
    HOUR_1 = "1h"
    HOUR_4 = "4h"
    DAY_1 = "1d"
    WEEK_1 = "1w"
    MONTH_1 = "1M"


class Side(str, Enum):
    BUY = "buy"
    SELL = "sell"
    NEUTRAL = "neutral"


class OrderType(str, Enum):
    MARKET = "market"
    LIMIT = "limit"
    STOP = "stop"
    STOP_LIMIT = "stop_limit"


class MarketType(str, Enum):
    FOREX = "forex"
    CRYPTO = "crypto"
    STOCK = "stock"
    INDEX = "index"
    COMMODITY = "commodity"


class OHLCV(TypedDict):
    time: int  # Unix seconds
    open: float
    high: float
    low: float
    close: float
    volume: float


class SignalResult(TypedDict):
    side: Side
    confidence: float  # 0..1
    reason: str


class PatternResult(TypedDict):
    pattern_name: str
    confidence_score: float
    bullish_probability: float
    bearish_probability: float
    historical_success_rate: float

