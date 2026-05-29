"""
Module 3 — Real slow query collection from pg_stat_statements.
Runs every 5 minutes, captures the top 20 slowest queries into query_log.
"""
import asyncpg
from datetime import datetime

from app.core.config import settings
from app.db.database import AsyncSessionLocal
from app.models.models import QueryLog, QueryCategory, Connection


def _categorize(duration_ms: float) -> QueryCategory:
    if duration_ms < 100:
        return QueryCategory.FAST
    elif duration_ms < 500:
        return QueryCategory.MEDIUM
    elif duration_ms < 2000:
        return QueryCategory.SLOW
    return QueryCategory.CRITICAL


_SUGGESTIONS = {
    "SELECT *": "Specify only needed columns instead of SELECT *",
    "WHERE": "Ensure indexed columns are used in WHERE clauses",
    "JOIN": "Verify JOIN columns have indexes on both sides",
    "ORDER BY": "Consider adding a composite index for ORDER BY + WHERE",
    "LIKE '%": "Leading wildcard prevents index use; consider full-text search",
    "GROUP BY": "Consider a covering index for GROUP BY columns",
}


def _suggest(query_text: str) -> str | None:
    upper = query_text.upper()
    for pattern, tip in _SUGGESTIONS.items():
        if pattern.upper() in upper:
            return tip
    return None


async def collect_real_slow_queries():
    """Read top-20 slowest queries from pg_stat_statements and persist to query_log."""
    # Build a raw asyncpg DSN from the SQLAlchemy URL
    raw_dsn = (
        settings.DATABASE_URL
        .replace("postgresql+asyncpg://", "postgresql://")
    )

    try:
        conn = await asyncpg.connect(raw_dsn)
    except Exception as e:
        print(f"[QueryCollector] DB connect error: {e}")
        return

    try:
        rows = await conn.fetch(
            """
            SELECT
                query,
                calls,
                mean_exec_time,
                rows
            FROM pg_stat_statements
            WHERE dbid = (SELECT oid FROM pg_database WHERE datname = current_database())
              AND calls > 0
              AND query NOT LIKE '%pg_stat_statements%'
              AND query NOT LIKE '%pg_stat_%'
              AND query NOT LIKE '%pg_catalog%'
              AND query NOT LIKE '%information_schema%'
              AND query NOT ILIKE '%BEGIN%'
              AND query NOT ILIKE 'COMMIT'
              AND query NOT ILIKE 'ROLLBACK'
              AND length(query) > 20
            ORDER BY mean_exec_time DESC
            LIMIT 20
            """
        )
    except Exception as e:
        print(f"[QueryCollector] pg_stat_statements query error: {e}")
        await conn.close()
        return

    await conn.close()

    if not rows:
        return

    async with AsyncSessionLocal() as db:
        # Get a real db_id from connections table
        from sqlalchemy import select
        result = await db.execute(select(Connection).limit(1))
        first = result.scalar_one_or_none()
        db_id = first.id if first else 1

        entries = []
        for row in rows:
            duration = round(float(row["mean_exec_time"]), 2)
            category = _categorize(duration)
            suggestion = _suggest(row["query"]) if category != QueryCategory.FAST else None
            entries.append(QueryLog(
                db_id=db_id,
                query_text=row["query"][:2000],
                duration_ms=duration,
                rows_returned=int(row["rows"] / max(row["calls"], 1)),
                index_used=None,
                category=category,
                optimized_query=suggestion,
                created_at=datetime.utcnow(),
            ))

        db.add_all(entries)
        await db.commit()
        print(f"[QueryCollector] Collected {len(entries)} real queries from pg_stat_statements")
