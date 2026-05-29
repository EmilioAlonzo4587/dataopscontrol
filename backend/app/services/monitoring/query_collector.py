"""
Module 3 — Multi-engine slow query collector.
Runs every 5 minutes.
  · PostgreSQL:  pg_stat_statements (top 20 by mean_exec_time)
  · SQL Server:  sys.dm_exec_query_stats (top 20 by avg elapsed ms)
  · Oracle:      not yet implemented (no open async driver)
"""
import asyncio
import asyncpg
from datetime import datetime

from app.core.config import settings
from app.db.database import AsyncSessionLocal
from app.models.models import QueryLog, QueryCategory, Connection, ConnectionStatus


def _categorize(duration_ms: float) -> QueryCategory:
    if duration_ms < 100:
        return QueryCategory.FAST
    elif duration_ms < 500:
        return QueryCategory.MEDIUM
    elif duration_ms < 2000:
        return QueryCategory.SLOW
    return QueryCategory.CRITICAL


_SUGGESTIONS = {
    "SELECT *":   "Specify only needed columns instead of SELECT *",
    "WHERE":      "Ensure indexed columns are used in WHERE clauses",
    "JOIN":       "Verify JOIN columns have indexes on both sides",
    "ORDER BY":   "Consider adding a composite index for ORDER BY + WHERE",
    "LIKE '%":    "Leading wildcard prevents index use; consider full-text search",
    "GROUP BY":   "Consider a covering index for GROUP BY columns",
}


def _suggest(query_text: str) -> str | None:
    upper = query_text.upper()
    for pattern, tip in _SUGGESTIONS.items():
        if pattern.upper() in upper:
            return tip
    return None


# ─── PostgreSQL ───────────────────────────────────────────────────────────────

async def _collect_postgres(db_id: int) -> list:
    raw_dsn = settings.DATABASE_URL.replace("postgresql+asyncpg://", "postgresql://")
    try:
        conn = await asyncpg.connect(raw_dsn)
    except Exception as e:
        print(f"[QueryCollector] PostgreSQL connect error: {e}")
        return []

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
        print(f"[QueryCollector] pg_stat_statements error: {e}")
        await conn.close()
        return []

    await conn.close()

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
            category=category,
            optimized_query=suggestion,
            created_at=datetime.utcnow(),
        ))
    return entries


# ─── SQL Server ───────────────────────────────────────────────────────────────

def _fetch_sqlserver_queries(conn_str: str) -> list[dict]:
    import pyodbc
    results = []
    try:
        with pyodbc.connect(conn_str, timeout=5) as c:
            cur = c.cursor()
            cur.execute("""
                SELECT TOP 20
                    SUBSTRING(
                        qt.text,
                        (qs.statement_start_offset / 2) + 1,
                        ((CASE qs.statement_end_offset
                            WHEN -1 THEN DATALENGTH(qt.text)
                            ELSE qs.statement_end_offset
                        END - qs.statement_start_offset) / 2) + 1
                    )                                          AS query_text,
                    qs.execution_count,
                    qs.total_elapsed_time / qs.execution_count / 1000.0 AS avg_ms,
                    qs.total_rows / qs.execution_count         AS avg_rows
                FROM sys.dm_exec_query_stats qs
                CROSS APPLY sys.dm_exec_sql_text(qs.sql_handle) qt
                WHERE qs.execution_count > 0
                  AND qt.text NOT LIKE '%sys.dm_exec%'
                  AND DATALENGTH(qt.text) > 20
                ORDER BY avg_ms DESC
            """)
            for row in cur.fetchall():
                results.append({
                    "query":    str(row[0]).strip(),
                    "avg_ms":   float(row[2]),
                    "avg_rows": int(row[3]) if row[3] is not None else 0,
                })
    except Exception as e:
        print(f"[QueryCollector] SQL Server query error: {e}")
    return results


async def _collect_sqlserver(conn_obj: Connection) -> list:
    try:
        from app.core.security import decrypt_credential

        password = decrypt_credential(conn_obj.password_enc)
        conn_str = (
            f"DRIVER={{ODBC Driver 18 for SQL Server}};"
            f"SERVER={conn_obj.host},{conn_obj.port};"
            f"DATABASE={conn_obj.database_name};"
            f"UID={conn_obj.user_name};"
            f"PWD={password};"
            f"TrustServerCertificate=yes;"
            f"Connection Timeout=5;"
        )
        loop = asyncio.get_event_loop()
        raw_rows = await loop.run_in_executor(None, _fetch_sqlserver_queries, conn_str)
    except Exception as e:
        print(f"[QueryCollector] SQL Server collect error ({conn_obj.nombre}): {e}")
        return []

    entries = []
    for row in raw_rows:
        duration = round(row["avg_ms"], 2)
        category = _categorize(duration)
        suggestion = _suggest(row["query"]) if category != QueryCategory.FAST else None
        entries.append(QueryLog(
            db_id=conn_obj.id,
            query_text=row["query"][:2000],
            duration_ms=duration,
            rows_returned=row["avg_rows"],
            category=category,
            optimized_query=suggestion,
            created_at=datetime.utcnow(),
        ))
    return entries


# ─── Main scheduled job ───────────────────────────────────────────────────────

async def collect_real_slow_queries():
    """
    Collect top-20 slowest queries from every registered active connection.
    PostgreSQL: pg_stat_statements
    SQL Server: sys.dm_exec_query_stats
    Oracle:     skipped (no async open-source driver)
    """
    from sqlalchemy import select

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Connection).where(Connection.status == ConnectionStatus.ACTIVE)
        )
        all_connections = result.scalars().all()

        # PostgreSQL: use the primary engine DSN (shared pg_stat_statements)
        pg_connections = [c for c in all_connections if c.motor.value == "PostgreSQL"]
        ss_connections = [c for c in all_connections if c.motor.value == "SQL Server"]

        entries = []

        # Collect once from PostgreSQL primary, attribute to first PG connection
        if pg_connections:
            pg_entries = await _collect_postgres(pg_connections[0].id)
            entries.extend(pg_entries)
            print(f"[QueryCollector] PostgreSQL: {len(pg_entries)} queries from {pg_connections[0].nombre}")

        # Collect per SQL Server connection (each may have different queries)
        for conn_obj in ss_connections:
            ss_entries = await _collect_sqlserver(conn_obj)
            entries.extend(ss_entries)
            print(f"[QueryCollector] SQL Server: {len(ss_entries)} queries from {conn_obj.nombre}")

        if entries:
            db.add_all(entries)
            await db.commit()
            print(f"[QueryCollector] Saved {len(entries)} queries total across {len(pg_connections) + len(ss_connections)} engines")
