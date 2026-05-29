"""Module 6 — Replication routes."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from app.db.database import get_db
from app.models.models import ReplicationStatus
from app.services.replication.replication_service import (
    CAP_ANALYSIS,
    collect_replication_metrics,
    simulate_load_scenario,
    measure_real_replication_lag,
    classify_lag,
)

router = APIRouter()


@router.get("/status")
async def replication_status(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(ReplicationStatus).order_by(desc(ReplicationStatus.captured_at)).limit(30)
    )
    records = result.scalars().all()
    return [
        {
            "id": r.id, "db_id": r.db_id,
            "primary_host": r.primary_host, "replica_host": r.replica_host,
            "lag_seconds": r.lag_seconds, "lag_status": r.lag_status.value,
            "bytes_pending": r.bytes_pending, "is_streaming": r.is_streaming,
            "captured_at": r.captured_at,
        }
        for r in records
    ]


@router.get("/current-lag")
async def current_lag():
    """Real-time lag reading directly from the replica."""
    lag = await measure_real_replication_lag()
    return {
        "lag_seconds": lag,
        "lag_status": classify_lag(lag).value,
        "source": "replica pg_last_xact_replay_timestamp",
    }


@router.post("/simulate/{scenario}")
async def simulate_scenario(scenario: str):
    """
    Simulate replication lag under different load scenarios.
    scenario: normal | medium | high
    """
    if scenario not in ("normal", "medium", "high"):
        raise HTTPException(status_code=400, detail="scenario must be: normal, medium, or high")
    result = await simulate_load_scenario(scenario)
    return result


@router.get("/cap-analysis")
async def cap_analysis():
    return CAP_ANALYSIS


@router.post("/trigger-check")
async def trigger_check():
    await collect_replication_metrics()
    return {"message": "Replication metrics collected"}
