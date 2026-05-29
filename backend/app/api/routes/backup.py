"""Module 5 — Backup, Recovery & Cloud Replication API routes."""
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc

from app.db.database import get_db
from app.models.models import BackupHistory, BackupType, BackupStatus, Connection
from app.services.backup.backup_service import create_backup, restore_backup
from app.schemas.schemas import BackupHistoryOut

router = APIRouter()


@router.post("/run", response_model=BackupHistoryOut, status_code=201)
async def run_backup(
    db_id: int,
    backup_type: BackupType,
    parent_id: Optional[int] = None,
    snapshot_name: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
):
    """Execute a backup: FULL, DIFF, INC, or SNAPSHOT."""
    result = await db.execute(select(Connection).where(Connection.id == db_id))
    conn = result.scalar_one_or_none()
    if not conn:
        raise HTTPException(status_code=404, detail="Connection not found")

    backup = await create_backup(db, conn, backup_type, parent_id, snapshot_name)
    return backup


@router.get("/history", response_model=List[BackupHistoryOut])
async def list_backups(
    db_id: Optional[int] = None,
    backup_type: Optional[BackupType] = None,
    limit: int = Query(50, le=200),
    db: AsyncSession = Depends(get_db),
):
    q = select(BackupHistory).order_by(desc(BackupHistory.created_at)).limit(limit)
    if db_id:
        q = q.where(BackupHistory.db_id == db_id)
    if backup_type:
        q = q.where(BackupHistory.backup_type == backup_type)
    result = await db.execute(q)
    return result.scalars().all()


@router.post("/restore/{backup_id}")
async def restore(backup_id: int, db: AsyncSession = Depends(get_db)):
    """Simulate restore from a backup with RPO/RTO measurement."""
    return await restore_backup(db, backup_id)


@router.post("/snapshot")
async def create_snapshot(
    db_id: int,
    name: str = Query(..., description="Snapshot name: PRE_DEPLOY, PRE_TEST, PRE_IMPORT"),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Connection).where(Connection.id == db_id))
    conn = result.scalar_one_or_none()
    if not conn:
        raise HTTPException(status_code=404, detail="Connection not found")
    snapshot = await create_backup(db, conn, BackupType.SNAPSHOT, snapshot_name=name)
    return snapshot


@router.post("/simulate-disaster")
async def simulate_disaster(
    db_id: int,
    snapshot_backup_id: int,
    db: AsyncSession = Depends(get_db),
):
    """
    Simulate DROP TABLE disaster and restore from snapshot.
    Demonstrates RPO and RTO calculation.
    """
    result = await restore_backup(db, snapshot_backup_id)
    result["disaster_simulated"] = "DROP TABLE orders (simulated)"
    result["message"] = "Table restored successfully from snapshot"
    return result


@router.post("/simulate-failure", response_model=BackupHistoryOut, status_code=201)
async def simulate_backup_failure(
    db_id: int,
    db: AsyncSession = Depends(get_db),
):
    """
    Insert a FAILED backup record directly — simulates a real backup failure.
    The alert engine detects it on the next cycle (or /api/alerts/evaluate) and sends email.
    """
    from datetime import datetime
    result = await db.execute(select(Connection).where(Connection.id == db_id))
    conn = result.scalar_one_or_none()
    if not conn:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Connection not found")

    ts = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    record = BackupHistory(
        db_id=db_id,
        backup_type=BackupType.FULL,
        status=BackupStatus.FAILED,
        file_name=f"{conn.nombre}_FULL_{ts}_SIMULATED_FAILURE.bak",
        file_size_mb=0.0,
        duration_secs=0.0,
        restore_point=ts,
        sla_met=False,
        rpo_minutes=15,
        rto_minutes=45,
        notes="Simulated failure triggered manually for alert testing",
        created_at=datetime.utcnow(),
    )
    db.add(record)
    await db.commit()
    await db.refresh(record)
    return record


@router.get("/sla-report")
async def sla_report(db: AsyncSession = Depends(get_db)):
    """SLA compliance report for BI dashboard."""
    from sqlalchemy import func, case
    result = await db.execute(
        select(
            func.count().label("total"),
            func.sum(case((BackupHistory.sla_met == True, 1), else_=0)).label("met"),
            func.avg(BackupHistory.duration_secs).label("avg_duration"),
            func.avg(BackupHistory.file_size_mb).label("avg_size_mb"),
        )
    )
    row = result.one()
    total = row.total or 0
    met = int(row.met or 0)
    return {
        "total_backups": total,
        "sla_met": met,
        "sla_compliance_pct": round(met / total * 100, 1) if total > 0 else 0,
        "avg_duration_secs": round(row.avg_duration or 0, 2),
        "avg_size_mb": round(row.avg_size_mb or 0, 4),
        "rpo_target_minutes": 15,
        "rto_target_minutes": 45,
    }
