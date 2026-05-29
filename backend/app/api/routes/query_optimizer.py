"""
Module 3 — Query Optimization Lab
Runs EXPLAIN ANALYZE before/after applying optimizations.
Provides real comparative evidence of execution time improvements.
"""
import asyncpg
from fastapi import APIRouter

from app.core.config import settings

router = APIRouter()

SCENARIOS = [
    {
        "id": 1,
        "title": "Full Table Scan vs Index Scan",
        "description": "SELECT por customer_id sin índice obliga un seq scan sobre 100K filas. Al crear el índice, cae a index scan.",
        "slow_query": "SELECT id, amount, status FROM demo_orders WHERE customer_id = 1234",
        "optimization": "CREATE INDEX IF NOT EXISTS idx_demo_orders_customer ON demo_orders(customer_id)",
        "undo": "DROP INDEX IF EXISTS idx_demo_orders_customer",
        "optimized_query": "SELECT id, amount, status FROM demo_orders WHERE customer_id = 1234",
    },
    {
        "id": 2,
        "title": "Leading Wildcard vs Full-Text Search",
        "description": "LIKE '%palabra%' no puede usar un índice B-tree. Al cambiar a LIKE 'palabra%' (sin leading wildcard) sí lo usa.",
        "slow_query": "SELECT id, description FROM demo_products WHERE description LIKE '%premium%'",
        "optimization": "CREATE INDEX IF NOT EXISTS idx_demo_products_desc ON demo_products(description varchar_pattern_ops)",
        "undo": "DROP INDEX IF EXISTS idx_demo_products_desc",
        "optimized_query": "SELECT id, description FROM demo_products WHERE description LIKE 'premium%'",
    },
    {
        "id": 3,
        "title": "Unindexed Date Range Filter",
        "description": "Filtrar por rango de fechas sin índice en created_at requiere scan completo. El índice permite Index Range Scan.",
        "slow_query": "SELECT id, customer_id, amount FROM demo_orders WHERE created_at > '2024-06-01'",
        "optimization": "CREATE INDEX IF NOT EXISTS idx_demo_orders_date ON demo_orders(created_at)",
        "undo": "DROP INDEX IF EXISTS idx_demo_orders_date",
        "optimized_query": "SELECT id, customer_id, amount FROM demo_orders WHERE created_at > '2024-06-01'",
    },
]


def _get_dsn() -> str:
    return settings.DATABASE_URL.replace("postgresql+asyncpg://", "postgresql://")


async def _ensure_demo_tables(conn: asyncpg.Connection):
    """Create demo tables with 100K rows if they don't exist."""
    exists = await conn.fetchval(
        "SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name='demo_orders')"
    )
    if not exists:
        await conn.execute("""
            CREATE TABLE demo_orders (
                id SERIAL PRIMARY KEY,
                customer_id INT,
                product_id INT,
                amount DECIMAL(10,2),
                status VARCHAR(20),
                description VARCHAR(100),
                created_at TIMESTAMP
            )
        """)
        await conn.execute("""
            INSERT INTO demo_orders (customer_id, product_id, amount, status, description, created_at)
            SELECT
                (random() * 9999 + 1)::int,
                (random() * 999 + 1)::int,
                round((random() * 999 + 1)::numeric, 2),
                CASE (random()*3)::int WHEN 0 THEN 'pending' WHEN 1 THEN 'completed' WHEN 2 THEN 'cancelled' ELSE 'refunded' END,
                'Order item ' || (random()*1000)::int,
                NOW() - (random() * 730)::int * INTERVAL '1 day'
            FROM generate_series(1, 100000)
        """)

    exists2 = await conn.fetchval(
        "SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name='demo_products')"
    )
    if not exists2:
        await conn.execute("""
            CREATE TABLE demo_products (
                id SERIAL PRIMARY KEY,
                name VARCHAR(100),
                description VARCHAR(200),
                price DECIMAL(10,2),
                category VARCHAR(50)
            )
        """)
        await conn.execute("""
            INSERT INTO demo_products (name, description, price, category)
            SELECT
                'Product ' || i,
                CASE (i % 4)
                    WHEN 0 THEN 'premium quality item number ' || i
                    WHEN 1 THEN 'standard item ' || i
                    WHEN 2 THEN 'budget product ' || i
                    ELSE 'basic item number ' || i
                END,
                round((random() * 999 + 1)::numeric, 2),
                CASE (i % 5) WHEN 0 THEN 'Electronics' WHEN 1 THEN 'Clothing' WHEN 2 THEN 'Food' WHEN 3 THEN 'Books' ELSE 'Tools' END
            FROM generate_series(1, 50000) i
        """)


async def _explain_analyze(conn: asyncpg.Connection, query: str) -> dict:
    """Run EXPLAIN ANALYZE and return actual execution time + plan summary."""
    rows = await conn.fetch(f"EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT) {query}")
    plan_lines = [r[0] for r in rows]
    plan_text = "\n".join(plan_lines)

    exec_time = 0.0
    scan_type = "Unknown"
    for line in plan_lines:
        if "Execution Time:" in line:
            try:
                exec_time = float(line.split("Execution Time:")[1].strip().replace(" ms", ""))
            except Exception:
                pass
        if "Seq Scan" in line:
            scan_type = "Sequential Scan (full table)"
        elif "Index Scan" in line and scan_type == "Unknown":
            scan_type = "Index Scan"
        elif "Index Only Scan" in line:
            scan_type = "Index Only Scan"
        elif "Bitmap Heap Scan" in line:
            scan_type = "Bitmap Index Scan"

    return {"execution_ms": round(exec_time, 3), "scan_type": scan_type, "plan": plan_text}


@router.get("/scenarios")
async def list_scenarios():
    return SCENARIOS


@router.post("/scenarios/{scenario_id}/run")
async def run_optimization_scenario(scenario_id: int):
    """
    Execute before/after EXPLAIN ANALYZE for a given optimization scenario.
    Returns real comparative execution times.
    """
    scenario = next((s for s in SCENARIOS if s["id"] == scenario_id), None)
    if not scenario:
        return {"error": "Scenario not found"}

    conn = await asyncpg.connect(_get_dsn())
    try:
        await _ensure_demo_tables(conn)

        # Drop index first to ensure clean "before" state
        await conn.execute(scenario["undo"])

        # BEFORE: run slow query with no optimization
        before = await _explain_analyze(conn, scenario["slow_query"])

        # Apply optimization
        await conn.execute(scenario["optimization"])

        # AFTER: run optimized query
        after = await _explain_analyze(conn, scenario["optimized_query"])

        improvement = 0.0
        if before["execution_ms"] > 0:
            improvement = round((1 - after["execution_ms"] / before["execution_ms"]) * 100, 1)

        return {
            "scenario_id": scenario_id,
            "title": scenario["title"],
            "description": scenario["description"],
            "slow_query": scenario["slow_query"],
            "optimized_query": scenario["optimized_query"],
            "optimization_applied": scenario["optimization"],
            "before": before,
            "after": after,
            "improvement_pct": improvement,
        }
    finally:
        await conn.close()


@router.post("/seed-demo-tables")
async def seed_demo_tables():
    """Force recreate demo tables with fresh 100K rows."""
    conn = await asyncpg.connect(_get_dsn())
    try:
        await conn.execute("DROP TABLE IF EXISTS demo_orders CASCADE")
        await conn.execute("DROP TABLE IF EXISTS demo_products CASCADE")
        await _ensure_demo_tables(conn)
        count = await conn.fetchval("SELECT COUNT(*) FROM demo_orders")
        return {"demo_orders": count, "message": "Demo tables ready"}
    finally:
        await conn.close()
