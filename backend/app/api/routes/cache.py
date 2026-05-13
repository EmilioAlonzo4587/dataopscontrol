"""Module 7 — Redis Cache API routes."""
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc
from app.db.database import get_db
from app.models.models import DBMetric, CacheMetric
from app.services.cache.redis_service import (
    cache_get, cache_set, cache_delete, cache_delete_pattern,
    get_cache_stats, cached_query
)

router = APIRouter()


@router.get("/stats")
async def redis_stats():
    """Redis hit ratio, key count and performance metrics."""
    try:
        return await get_cache_stats()
    except Exception as e:
        return {"error": str(e), "connected": False}


@router.get("/demo-query")
async def demo_cached_query(db: AsyncSession = Depends(get_db)):
    """
    Demonstrates cache-aside pattern.
    First call: ~400ms (DB query). Subsequent calls: ~40ms (cache hit).
    """
    cache_key = "demo:metrics:latest"

    async def fetch_from_db(session: AsyncSession = None):
        import asyncio
        await asyncio.sleep(0.4)  # Simulate 400ms DB query
        result = await db.execute(
            select(DBMetric).order_by(desc(DBMetric.capture_time)).limit(10)
        )
        metrics = result.scalars().all()
        return [
            {"id": m.id, "db_id": m.db_id, "cpu": m.cpu, "memory": m.memory,
             "health": m.health_status.value, "capture_time": str(m.capture_time)}
            for m in metrics
        ]

    result = await cached_query(cache_key, fetch_from_db, ttl=60)

    # Log cache metric
    metric = CacheMetric(
        cache_key=cache_key,
        hit=result["cache_hit"],
        response_ms=result["response_ms"],
        db_response_ms=result["db_response_ms"],
        ttl_seconds=60,
    )
    db.add(metric)
    await db.commit()

    return result


@router.delete("/invalidate/{pattern}")
async def invalidate_cache(pattern: str):
    """Manual cache invalidation by key pattern."""
    deleted = await cache_delete_pattern(f"{pattern}*")
    return {"deleted_keys": deleted, "pattern": pattern}


@router.get("/metrics/history")
async def cache_metrics_history(limit: int = 100, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(CacheMetric).order_by(desc(CacheMetric.captured_at)).limit(limit)
    )
    rows = result.scalars().all()
    total = len(rows)
    hits = sum(1 for r in rows if r.hit)
    return {
        "history": [
            {"hit": r.hit, "response_ms": r.response_ms,
             "db_response_ms": r.db_response_ms, "captured_at": r.captured_at}
            for r in rows
        ],
        "hit_ratio_pct": round(hits / total * 100, 1) if total > 0 else 0,
        "avg_cached_ms": round(
            sum(r.response_ms for r in rows if r.hit) / max(hits, 1), 2
        ),
        "avg_db_ms": round(
            sum(r.db_response_ms for r in rows if not r.hit) / max(total - hits, 1), 2
        ),
    }
