"""Module 6 — Replication routes."""
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from app.db.database import get_db
from app.models.models import ReplicationStatus
from app.services.replication.replication_service import CAP_ANALYSIS, collect_replication_metrics

router = APIRouter()


@router.get("/status")
async def replication_status(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(ReplicationStatus).order_by(desc(ReplicationStatus.captured_at)).limit(20)
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


@router.get("/cap-analysis")
async def cap_analysis():
    return CAP_ANALYSIS


@router.post("/trigger-check")
async def trigger_check():
    await collect_replication_metrics()
    return {"message": "Replication metrics collected"}
