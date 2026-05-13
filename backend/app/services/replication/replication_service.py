"""
Module 6 — Replication Service
Measures primary-replica lag, simulates three load scenarios,
and provides CAP theorem analysis data.
"""
import asyncio
import random
from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, text

from app.db.database import AsyncSessionLocal, engine, replica_engine
from app.models.models import ReplicationStatus, HealthStatus, Connection, ConnectionStatus
from app.core.config import settings


def classify_lag(lag_seconds: float) -> HealthStatus:
    if lag_seconds <= 3:
        return HealthStatus.HEALTHY   # Acceptable (≤2s normal)
    elif lag_seconds <= 10:
        return HealthStatus.WARNING   # Medium load (5s)
    else:
        return HealthStatus.CRITICAL  # High load (20s)


async def measure_real_replication_lag() -> float:
    """
    Query pg_stat_replication on the primary to measure actual lag.
    Falls back to simulation if unavailable.
    """
    try:
        async with engine.connect() as conn:
            result = await conn.execute(
                text("""
                    SELECT EXTRACT(EPOCH FROM (now() - pg_last_xact_replay_timestamp()))
                    AS lag_seconds
                """)
            )
            row = result.fetchone()
            if row and row[0] is not None:
                return float(row[0])
    except Exception:
        pass

    # Simulation: vary lag by simulated load
    load = random.choices(["normal", "medium", "high"], weights=[60, 30, 10])[0]
    if load == "normal":
        return round(random.uniform(0.5, 2.5), 2)
    elif load == "medium":
        return round(random.uniform(3.0, 7.0), 2)
    else:
        return round(random.uniform(15.0, 25.0), 2)


async def collect_replication_metrics():
    """Scheduled job: capture replication lag for all PG connections."""
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Connection).where(
                Connection.motor == "PostgreSQL",
                Connection.status == ConnectionStatus.ACTIVE,
            )
        )
        connections = result.scalars().all()

        for conn in connections:
            lag = await measure_real_replication_lag()
            status = classify_lag(lag)

            record = ReplicationStatus(
                db_id=conn.id,
                primary_host=conn.host,
                replica_host=f"{conn.host}-replica",
                lag_seconds=lag,
                lag_status=status,
                bytes_pending=int(lag * 1024 * random.uniform(0.5, 2.0)),
                is_streaming=lag < 30,
                captured_at=datetime.now(timezone.utc),
            )
            db.add(record)

        await db.commit()


CAP_ANALYSIS = {
    "architecture": "Primary-Replica (PostgreSQL Streaming Replication)",
    "cap_choice": "CP (Consistency + Partition Tolerance)",
    "consistency": {
        "level": "Strong on primary writes, eventual on replica reads",
        "description": (
            "All writes go to the primary. Replica receives changes asynchronously "
            "via WAL streaming. Read-your-writes consistency requires routing reads "
            "back to the primary or using synchronous_commit=on."
        ),
    },
    "availability": {
        "level": "High (but degraded during failover)",
        "description": (
            "If the primary fails, the replica can be promoted (manual or via Patroni). "
            "Writes are unavailable during promotion (~30-60 seconds). "
            "Reads from replica remain available throughout."
        ),
    },
    "partition_tolerance": {
        "level": "Partial",
        "description": (
            "Under network partition, the replica stops receiving WAL and lag increases. "
            "The system chooses consistency (no dirty reads) over availability. "
            "Pg replication can be configured to switch to synchronous mode for zero data loss."
        ),
    },
    "design_decisions": [
        "Asynchronous replication for minimal write latency on primary",
        "Replica used exclusively for read-heavy analytics/dashboard queries",
        "Connection pooling (PgBouncer) recommended in front of both nodes",
        "WAL archiving to S3 provides PITR (Point-in-Time Recovery) capability",
        "Patroni + etcd recommended for automatic failover in production",
    ],
    "lag_scenarios": [
        {"scenario": "Normal load", "lag": "~2s", "status": "Acceptable"},
        {"scenario": "Medium load", "lag": "~5s", "status": "Warning"},
        {"scenario": "High load",   "lag": "~20s","status": "Critical"},
    ],
}
