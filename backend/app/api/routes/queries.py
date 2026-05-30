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
    """Seed demo query data for testing purposes. Clears previous seed entries first."""
    from sqlalchemy import select as sa_select, delete as sa_delete
    from app.models.models import Connection

    # Clear existing seeded entries to avoid duplicates in Top 10
    await db.execute(sa_delete(QueryLog))
    await db.commit()

    conn_result = await db.execute(sa_select(Connection).limit(1))
    first_conn = conn_result.scalar_one_or_none()
    real_db_id = first_conn.id if first_conn else 1

    # (query_text, fixed_duration_ms, index_used, execution_plan)
    sample_queries = [
        # ── CRITICAL (>2000ms) ──────────────────────────────────────
        ("SELECT AVG(price) FROM products GROUP BY category", 2801, None,
         "HashAggregate (cost=22750.00..22750.05 rows=5 width=40) (actual time=2795.3..2795.4 rows=5 loops=1)\n  Group Key: category\n  -> Seq Scan on products (cost=0.00..17750.00 rows=1000000 width=20)\nPlanning Time: 0.3 ms\nExecution Time: 2801.7 ms"),
        ("SELECT COUNT(*) FROM transactions WHERE created_at > '2024-01-01'", 3216, None,
         "Aggregate (cost=18320.00..18320.01 rows=1 width=8) (actual time=3210.5..3210.5 rows=1 loops=1)\n  -> Seq Scan on transactions (cost=0.00..16820.00 rows=600000 width=0)\n       Filter: (created_at > '2024-01-01 00:00:00'::timestamp)\n       Rows Removed by Filter: 12453\nPlanning Time: 0.3 ms\nExecution Time: 3215.8 ms"),
        ("SELECT * FROM orders o JOIN order_items i ON o.id = i.order_id WHERE o.status = 'pending'", 4120, None,
         "Hash Join (cost=35000.00..98000.00 rows=500000 width=240) (actual time=1820.3..4115.8 rows=482341 loops=1)\n  Hash Cond: (i.order_id = o.id)\n  -> Seq Scan on order_items i (cost=0.00..28000.00 rows=2000000 width=60)\n  -> Hash (cost=18000.00..18000.00 rows=1000000 width=80)\n       -> Seq Scan on orders o  Filter: (status = 'pending')\nPlanning Time: 0.8 ms\nExecution Time: 4121.2 ms"),
        # ── SLOW (500–2000ms) ───────────────────────────────────────
        ("SELECT * FROM products WHERE name LIKE '%gadget%'", 1524, None,
         "Seq Scan on products (cost=0.00..2450.00 rows=50000 width=120) (actual time=0.042..1520.1 rows=48 loops=1)\n  Filter: ((name)::text ~~ '%gadget%'::text)\n  Rows Removed by Filter: 49952\nPlanning Time: 0.2 ms\nExecution Time: 1523.4 ms"),
        ("UPDATE inventory SET stock = stock - 1 WHERE product_id = 42", 782, None,
         "Update on inventory (cost=0.00..12430.00 rows=1 width=60) (actual time=775.2..775.3 rows=0 loops=1)\n  -> Seq Scan on inventory (cost=0.00..12430.00 rows=1 width=60)\n       Filter: (product_id = 42)\n       Rows Removed by Filter: 99999\nPlanning Time: 0.2 ms\nExecution Time: 782.1 ms"),
        ("SELECT id, amount FROM sales WHERE region = 'NORTH' ORDER BY amount DESC", 950, None,
         "Sort (cost=14500.00..14750.00 rows=100000 width=16) (actual time=945.2..948.3 rows=100000 loops=1)\n  Sort Key: amount DESC\n  Sort Method: external merge  Disk: 2304kB\n  -> Seq Scan on sales (cost=0.00..8500.00 rows=100000 width=16)\n       Filter: (region = 'NORTH')\nPlanning Time: 0.4 ms\nExecution Time: 950.7 ms"),
        # ── MEDIUM (100–500ms) ──────────────────────────────────────
        ("SELECT o.*, c.name FROM orders o JOIN customers c ON o.customer_id = c.id", 245, "idx_customers_pkey",
         "Hash Join (cost=18.50..52.30 rows=200 width=180)\n  Hash Cond: (o.customer_id = c.id)\n  -> Seq Scan on orders o\n  -> Hash on customers\nExecution Time: 245.3 ms"),
        ("SELECT DISTINCT customer_id FROM orders WHERE status = 'completed'", 310, None,
         "HashAggregate (cost=5200.00..5350.00 rows=15000 width=4) (actual time=305.2..308.9 rows=14832 loops=1)\n  -> Seq Scan on orders  Filter: (status = 'completed')\nExecution Time: 310.4 ms"),
        ("SELECT p.name, SUM(oi.quantity) FROM products p JOIN order_items oi ON p.id = oi.product_id GROUP BY p.name", 420, None,
         "HashAggregate (cost=9800.00..10200.00 rows=40000 width=50)\n  -> Hash Join\n       Hash Cond: (oi.product_id = p.id)\n       -> Seq Scan on order_items\n       -> Hash on products\nExecution Time: 422.1 ms"),
        ("SELECT * FROM audit_log WHERE user_id = 99 AND action = 'LOGIN' ORDER BY created_at DESC LIMIT 20", 185, None,
         "Limit (cost=9200.00..9200.05 rows=20 width=80) (actual time=183.1..183.2 rows=20 loops=1)\n  -> Sort  Sort Key: created_at DESC\n       -> Seq Scan on audit_log  Filter: (user_id=99 AND action='LOGIN')\nExecution Time: 185.4 ms"),
        # ── FAST (<100ms) ───────────────────────────────────────────
        ("SELECT id, name FROM customers WHERE email = 'test@test.com'", 22, "idx_customers_email",
         "Index Scan using idx_customers_email on customers (cost=0.28..8.29 rows=1 width=40)\nExecution Time: 0.022 ms"),
        ("SELECT * FROM orders WHERE customer_id = 1", 46, "idx_orders_customer_id",
         "Index Scan using idx_orders_customer_id (cost=0.29..8.31 rows=1 width=120)\nExecution Time: 0.062 ms"),
        ("DELETE FROM sessions WHERE expires_at < NOW()", 98, "idx_sessions_expires",
         "Delete on sessions\n  -> Index Scan using idx_sessions_expires on sessions\nExecution Time: 0.098 ms"),
        ("SELECT COUNT(*) FROM users WHERE is_active = true", 35, "idx_users_active",
         "Aggregate\n  -> Index Only Scan using idx_users_active on users\nExecution Time: 0.041 ms"),
        ("SELECT id, username FROM users WHERE id = 42", 8, "users_pkey",
         "Index Scan using users_pkey on users (cost=0.28..8.30 rows=1 width=40)\nExecution Time: 0.009 ms"),
        ("UPDATE users SET last_login = NOW() WHERE id = 7", 15, "users_pkey",
         "Update on users\n  -> Index Scan using users_pkey on users (cost=0.28..8.30)\nExecution Time: 0.018 ms"),
        ("SELECT id, amount FROM payments WHERE id = 1001", 11, "payments_pkey",
         "Index Scan using payments_pkey on payments (cost=0.29..8.31 rows=1 width=16)\nExecution Time: 0.012 ms"),
        ("SELECT name, email FROM customers WHERE id = 500", 9, "customers_pkey",
         "Index Scan using customers_pkey on customers (cost=0.28..8.29 rows=1 width=60)\nExecution Time: 0.010 ms"),
    ]
    entries = []
    for query_text, fixed_ms, idx, plan in sample_queries:
        duration = round(fixed_ms * random.uniform(0.95, 1.05), 2)  # ±5% variation only
        category = categorize_query(duration)
        entries.append(QueryLog(
            db_id=real_db_id,
            query_text=query_text,
            duration_ms=duration,
            rows_returned=random.randint(1, 5000),
            index_used=idx,
            execution_plan=plan,
            category=category,
            optimized_query=suggest_optimization(query_text) if duration > 500 else None,
            created_at=datetime.utcnow(),
        ))
    db.add_all(entries)
    await db.commit()
    return {"seeded": len(entries)}
