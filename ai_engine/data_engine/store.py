"""Data store — manages in-memory and persistent data caches."""

from typing import Dict, Optional, List
from datetime import datetime, timedelta
import asyncio
from ai_engine.common import Timeframe, OHLCV, logger
from .models import MarketData, MultiTimeframeData, Instrument


class DataStore:
    """Multi-level data store with TTL-based caching."""

    def __init__(self, cache_ttl_seconds: int = 300) -> None:
        self._cache: Dict[str, MarketData] = {}
        self._multi_cache: Dict[str, MultiTimeframeData] = {}
        self._instruments: Dict[str, Instrument] = {}
        self._cache_ttl = timedelta(seconds=cache_ttl_seconds)
        self._cache_times: Dict[str, datetime] = {}
        self._lock = asyncio.Lock()

    async def get_cached(
        self, symbol: str, timeframe: Timeframe
    ) -> Optional[MarketData]:
        """Get cached market data if not expired."""
        key = f"{symbol}:{timeframe.value}"
        async with self._lock:
            data = self._cache.get(key)
            fetch_time = self._cache_times.get(key)
            if data and fetch_time and datetime.utcnow() - fetch_time < self._cache_ttl:
                return data
            if data:
                logger.debug(f"Cache expired for {key}")
                del self._cache[key]
                del self._cache_times[key]
            return None

    async def set_cached(self, data: MarketData) -> None:
        """Cache market data with current timestamp."""
        key = f"{data.symbol}:{data.timeframe.value}"
        async with self._lock:
            self._cache[key] = data
            self._cache_times[key] = datetime.utcnow()

    async def get_multi_timeframe(
        self, symbol: str
    ) -> Optional[MultiTimeframeData]:
        """Get multi-timeframe data for a symbol."""
        async with self._lock:
            return self._multi_cache.get(symbol)

    async def set_multi_timeframe(self, data: MultiTimeframeData) -> None:
        """Cache multi-timeframe data."""
        async with self._lock:
            self._multi_cache[data.symbol] = data

    async def register_instrument(self, instrument: Instrument) -> None:
        """Register an instrument."""
        async with self._lock:
            self._instruments[instrument.symbol] = instrument

    def get_instrument(self, symbol: str) -> Optional[Instrument]:
        return self._instruments.get(symbol)

    def get_all_instruments(self) -> List[Instrument]:
        return list(self._instruments.values())

    async def clear_expired(self) -> int:
        """Clear expired cache entries. Returns count of cleared entries."""
        now = datetime.utcnow()
        expired = 0
        async with self._lock:
            keys = list(self._cache_times.keys())
            for key in keys:
                if now - self._cache_times[key] > self._cache_ttl:
                    del self._cache[key]
                    del self._cache_times[key]
                    expired += 1
        if expired:
            logger.debug(f"Cleared {expired} expired cache entries")
        return expired

