"""
Module 7 — Redis Cache Service
Implements cache-aside pattern with hit/miss tracking.
Supports TTL-based and manual event-driven invalidation.
"""
import json
import time
from typing import Any, Optional, Callable
from functools import wraps

import redis.asyncio as redis

from app.core.config import settings


_redis_client: Optional[redis.Redis] = None


async def get_redis() -> redis.Redis:
    global _redis_client
    if _redis_client is None:
        _redis_client = redis.from_url(
            settings.REDIS_URL,
            encoding="utf-8",
            decode_responses=True,
        )
    return _redis_client


async def cache_get(key: str) -> Optional[Any]:
    """Retrieve value from cache. Returns None on miss."""
    r = await get_redis()
    raw = await r.get(key)
    if raw is None:
        return None
    try:
        return json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return raw


async def cache_set(key: str, value: Any, ttl: int = None) -> bool:
    """Store value in cache with optional TTL."""
    r = await get_redis()
    ttl = ttl or settings.CACHE_TTL_SECONDS
    serialized = json.dumps(value, default=str)
    return await r.setex(key, ttl, serialized)


async def cache_delete(key: str) -> int:
    """Invalidate a specific cache key."""
    r = await get_redis()
    return await r.delete(key)


async def cache_delete_pattern(pattern: str) -> int:
    """Invalidate all keys matching a pattern (e.g. 'metrics:*')."""
    r = await get_redis()
    keys = await r.keys(pattern)
    if keys:
        return await r.delete(*keys)
    return 0


async def get_cache_stats() -> dict:
    """Return Redis INFO stats for dashboard display."""
    r = await get_redis()
    info = await r.info("stats")
    keyspace = await r.info("keyspace")

    hits = int(info.get("keyspace_hits", 0))
    misses = int(info.get("keyspace_misses", 0))
    total = hits + misses
    hit_ratio = round(hits / total * 100, 2) if total > 0 else 0.0

    # Count total keys
    total_keys = sum(
        int(v.split(",")[0].split("=")[1])
        for v in keyspace.values()
        if isinstance(v, str) and "keys=" in v
    )

    return {
        "hits": hits,
        "misses": misses,
        "hit_ratio_pct": hit_ratio,
        "total_keys": total_keys,
        "connected": True,
    }


async def cached_query(
    cache_key: str,
    db_query_fn: Callable,
    ttl: int = None,
    db_session=None,
) -> dict:
    """
    Cache-aside pattern implementation.
    Returns (result, hit, response_ms, db_ms)
    """
    ttl = ttl or settings.CACHE_TTL_SECONDS

    # Try cache first
    t0 = time.monotonic()
    cached = await cache_get(cache_key)
    cache_ms = (time.monotonic() - t0) * 1000

    if cached is not None:
        return {
            "data": cached,
            "cache_hit": True,
            "response_ms": round(cache_ms, 2),
            "db_response_ms": 0.0,
            "cache_key": cache_key,
        }

    # Cache miss — query database
    t1 = time.monotonic()
    if db_session:
        result = await db_query_fn(db_session)
    else:
        result = await db_query_fn()
    db_ms = (time.monotonic() - t1) * 1000

    # Populate cache
    await cache_set(cache_key, result, ttl)

    total_ms = cache_ms + db_ms
    return {
        "data": result,
        "cache_hit": False,
        "response_ms": round(total_ms, 2),
        "db_response_ms": round(db_ms, 2),
        "cache_key": cache_key,
    }
