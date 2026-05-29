"""Module 7 — Redis Cache API routes."""
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc, text
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
    First call: ~400ms (real DB query with pg_sleep). Subsequent calls: ~40ms (cache hit).
    Timing is measured with time.monotonic() at service layer — genuine round-trip latency.
    """
    cache_key = "demo:metrics:latest"

    async def fetch_from_db(session: AsyncSession = None):
        # Real DB query: pg_sleep(0.35) simulates a heavy production query on a large dataset
        # combined with an actual aggregation — timing comes from the database, not Python.
        result = await db.execute(text("""
            SELECT
                pg_sleep(0.35),
                m.db_id,
                COUNT(*)            AS total_samples,
                ROUND(AVG(m.cpu)::numeric, 2)    AS avg_cpu,
                ROUND(AVG(m.memory)::numeric, 2) AS avg_memory,
                ROUND(MAX(m.cpu)::numeric, 2)    AS peak_cpu,
                MAX(m.capture_time)              AS last_seen
            FROM db_metrics m
            GROUP BY m.db_id
            ORDER BY avg_cpu DESC
        """))
        rows = result.fetchall()
        return [
            {
                "db_id": r.db_id,
                "total_samples": r.total_samples,
                "avg_cpu": float(r.avg_cpu or 0),
                "avg_memory": float(r.avg_memory or 0),
                "peak_cpu": float(r.peak_cpu or 0),
                "last_seen": str(r.last_seen),
            }
            for r in rows
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
