"""
Module 7 — Redis Cache Service
Implements cache-aside pattern with hit/miss tracking.
Supports TTL-based and manual event-driven invalidation.

Fallback: if Redis is unavailable, all operations degrade gracefully to
direct DB queries — the endpoint never returns 500 due to Redis failure.
"""
import json
import time
from typing import Any, Optional, Callable

import redis.asyncio as redis

from app.core.config import settings


_redis_client: Optional[redis.Redis] = None


async def get_redis() -> Optional[redis.Redis]:
    """Return a verified Redis client, or None if the server is unreachable."""
    global _redis_client
    if _redis_client is None:
        try:
            client = redis.from_url(
                settings.REDIS_URL,
                encoding="utf-8",
                decode_responses=True,
                socket_connect_timeout=2,
                socket_timeout=2,
            )
            await client.ping()
            _redis_client = client
        except Exception:
            return None
    return _redis_client


def _reset_client():
    """Reset the singleton so the next call retries the connection."""
    global _redis_client
    _redis_client = None


async def cache_get(key: str) -> Optional[Any]:
    """Retrieve value from cache. Returns None on miss or Redis failure."""
    r = await get_redis()
    if r is None:
        return None
    try:
        raw = await r.get(key)
        if raw is None:
            return None
        return json.loads(raw)
    except Exception:
        _reset_client()
        return None


async def cache_set(key: str, value: Any, ttl: int = None) -> bool:
    """Store value in cache with optional TTL. No-op if Redis is unavailable."""
    r = await get_redis()
    if r is None:
        return False
    try:
        ttl = ttl or settings.CACHE_TTL_SECONDS
        serialized = json.dumps(value, default=str)
        return await r.setex(key, ttl, serialized)
    except Exception:
        _reset_client()
        return False


async def cache_delete(key: str) -> int:
    """Invalidate a specific cache key."""
    r = await get_redis()
    if r is None:
        return 0
    try:
        return await r.delete(key)
    except Exception:
        _reset_client()
        return 0


async def cache_delete_pattern(pattern: str) -> int:
    """Invalidate all keys matching a pattern (e.g. 'metrics:*')."""
    r = await get_redis()
    if r is None:
        return 0
    try:
        keys = await r.keys(pattern)
        if keys:
            return await r.delete(*keys)
        return 0
    except Exception:
        _reset_client()
        return 0


async def get_cache_stats() -> dict:
    """Return Redis INFO stats. Raises if Redis is truly unavailable."""
    r = await get_redis()
    if r is None:
        return {"hits": 0, "misses": 0, "hit_ratio_pct": 0.0, "total_keys": 0, "connected": False}

    try:
        info     = await r.info("stats")
        keyspace = await r.info("keyspace")
    except Exception:
        _reset_client()
        return {"hits": 0, "misses": 0, "hit_ratio_pct": 0.0, "total_keys": 0, "connected": False}

    hits   = int(info.get("keyspace_hits",   0))
    misses = int(info.get("keyspace_misses", 0))
    total  = hits + misses
    hit_ratio = round(hits / total * 100, 2) if total > 0 else 0.0

    total_keys = sum(
        int(v.split(",")[0].split("=")[1])
        for v in keyspace.values()
        if isinstance(v, str) and "keys=" in v
    )

    return {
        "hits":          hits,
        "misses":        misses,
        "hit_ratio_pct": hit_ratio,
        "total_keys":    total_keys,
        "connected":     True,
    }


async def cached_query(
    cache_key: str,
    db_query_fn: Callable,
    ttl: int = None,
    db_session=None,
) -> dict:
    """
    Cache-aside pattern implementation.
    Falls back to a direct DB call if Redis is unavailable — never raises 500.
    """
    ttl = ttl or settings.CACHE_TTL_SECONDS

    # Try cache first
    t0 = time.monotonic()
    cached = await cache_get(cache_key)  # returns None on Redis failure
    cache_ms = (time.monotonic() - t0) * 1000

    if cached is not None:
        return {
            "data":          cached,
            "cache_hit":     True,
            "response_ms":   round(cache_ms, 2),
            "db_response_ms": 0.0,
            "cache_key":     cache_key,
        }

    # Cache miss (or Redis down) — query database
    t1 = time.monotonic()
    result = await db_query_fn(db_session) if db_session else await db_query_fn()
    db_ms = (time.monotonic() - t1) * 1000

    # Populate cache (non-fatal if Redis is still down)
    await cache_set(cache_key, result, ttl)

    return {
        "data":          result,
        "cache_hit":     False,
        "response_ms":   round(cache_ms + db_ms, 2),
        "db_response_ms": round(db_ms, 2),
        "cache_key":     cache_key,
    }
