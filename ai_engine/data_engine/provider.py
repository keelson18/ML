"""Data provider abstraction for multi-source market data."""

from abc import ABC, abstractmethod
from typing import List, Optional, AsyncIterator
from datetime import datetime
from ai_engine.common import Timeframe, OHLCV, logger
from .models import Instrument, MarketData


class DataProvider(ABC):
    """Abstract base for market data providers."""

    @abstractmethod
    async def fetch_ohlcv(
        self,
        symbol: str,
        timeframe: Timeframe,
        start: Optional[datetime] = None,
        end: Optional[datetime] = None,
        limit: int = 1000,
    ) -> List[OHLCV]:
        """Fetch historical OHLCV data."""
        ...

    @abstractmethod
    async def stream_ohlcv(
        self,
        symbol: str,
        timeframe: Timeframe,
    ) -> AsyncIterator[OHLCV]:
        """Stream real-time OHLCV updates."""
        ...

    @abstractmethod
    async def get_instruments(self, market_type: Optional[str] = None) -> List[Instrument]:
        """Get available instruments."""
        ...


class DataProviderRegistry:
    """Registry for data providers by market type."""

    def __init__(self) -> None:
        self._providers: dict[str, DataProvider] = {}

    def register(self, market_type: str, provider: DataProvider) -> None:
        self._providers[market_type] = provider
        logger.info(f"Registered provider for {market_type}: {provider.__class__.__name__}")

    def get(self, market_type: str) -> Optional[DataProvider]:
        return self._providers.get(market_type)

    def get_all(self) -> dict[str, DataProvider]:
        return dict(self._providers)

