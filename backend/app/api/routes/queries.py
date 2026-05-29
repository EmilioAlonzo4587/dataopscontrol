"""Module 3 — Slow Query Analyzer API routes."""
import random
from typing import List
from datetime import datetime
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc

from app.db.database import get_db
from app.models.models import QueryLog, QueryCategory
from app.schemas.schemas import QueryLogCreate, QueryLogOut

router = APIRouter()


def categorize_query(duration_ms: float) -> QueryCategory:
    if duration_ms < 100:
        return QueryCategory.FAST
    elif duration_ms < 500:
        return QueryCategory.MEDIUM
    elif duration_ms < 2000:
        return QueryCategory.SLOW
    else:
        return QueryCategory.CRITICAL


QUERY_SUGGESTIONS = {
    "SELECT * FROM": "Specify only needed columns instead of SELECT *",
    "WHERE": "Ensure indexed columns are used in WHERE clauses",
    "JOIN": "Verify JOIN columns have indexes on both sides",
    "ORDER BY": "Consider adding a composite index for ORDER BY + WHERE",
    "LIKE '%": "Leading wildcard prevents index use; consider full-text search",
}


def suggest_optimization(query_text: str) -> str:
    for pattern, suggestion in QUERY_SUGGESTIONS.items():
        if pattern.upper() in query_text.upper():
            return suggestion
    return "Review execution plan for index opportunities"


@router.post("/log", response_model=QueryLogOut, status_code=201)
async def log_query(payload: QueryLogCreate, db: AsyncSession = Depends(get_db)):
    category = categorize_query(payload.duration_ms)
    optimized = suggest_optimization(payload.query_text) if category in [QueryCategory.SLOW, QueryCategory.CRITICAL] else None
    entry = QueryLog(
        db_id=payload.db_id,
        query_text=payload.query_text,
        duration_ms=payload.duration_ms,
        rows_returned=payload.rows_returned,
        index_used=payload.index_used,
        execution_plan=payload.execution_plan,
        category=category,
        optimized_query=optimized,
        created_at=datetime.utcnow(),
    )
    db.add(entry)
    await db.commit()
    await db.refresh(entry)
    return entry


@router.get("/top-slow", response_model=List[QueryLogOut])
async def top_slow_queries(
    limit: int = Query(10, le=50),
    db: AsyncSession = Depends(get_db),
):
    """Top slowest queries by average duration — for BI dashboard."""
    result = await db.execute(
        select(QueryLog)
        .order_by(desc(QueryLog.duration_ms))
        .limit(limit)
    )
    return result.scalars().all()


@router.get("/stats")
async def query_stats(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(QueryLog.category, func.count().label("count"), func.avg(QueryLog.duration_ms).label("avg_ms"))
        .group_by(QueryLog.category)
    )
    rows = result.all()
    return [
        {"category": r.category.value, "count": r.count, "avg_ms": round(r.avg_ms or 0, 2)}
        for r in rows
    ]


@router.post("/collect-real")
async def collect_real_queries():
    """Trigger immediate collection from pg_stat_statements (Module 3)."""
    from app.services.monitoring.query_collector import collect_real_slow_queries
    await collect_real_slow_queries()
    return {"message": "Real query collection completed"}


@router.post("/seed-demo")
async def seed_demo_queries(db: AsyncSession = Depends(get_db)):
    """Seed demo query data for testing purposes."""
    from sqlalchemy import select as sa_select
    from app.models.models import Connection
    conn_result = await db.execute(sa_select(Connection).limit(1))
    first_conn = conn_result.scalar_one_or_none()
    real_db_id = first_conn.id if first_conn else 1

    sample_queries = [
        ("SELECT * FROM orders WHERE customer_id = 1", 45),
        ("SELECT o.*, c.name FROM orders o JOIN customers c ON o.customer_id = c.id", 230),
        ("SELECT * FROM products WHERE name LIKE '%gadget%'", 1500),
        ("SELECT COUNT(*) FROM transactions WHERE created_at > '2024-01-01'", 3200),
        ("SELECT id, name FROM customers WHERE email = 'test@test.com'", 12),
        ("UPDATE inventory SET stock = stock - 1 WHERE product_id = 42", 780),
        ("DELETE FROM sessions WHERE expires_at < NOW()", 95),
        ("SELECT AVG(price) FROM products GROUP BY category", 2800),
    ]
    entries = []
    for query_text, base_ms in sample_queries:
        duration = base_ms * random.uniform(0.8, 1.3)
        entries.append(QueryLog(
            db_id=real_db_id,
            query_text=query_text,
            duration_ms=round(duration, 2),
            rows_returned=random.randint(1, 5000),
            index_used=None if duration > 500 else "idx_primary",
            category=categorize_query(duration),
            optimized_query=suggest_optimization(query_text) if duration > 500 else None,
            created_at=datetime.utcnow(),
        ))
    db.add_all(entries)
    await db.commit()
    return {"seeded": len(entries)}
