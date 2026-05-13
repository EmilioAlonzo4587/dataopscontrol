"""Module 2 — Metrics API routes."""
from typing import List, Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc

from app.db.database import get_db
from app.models.models import DBMetric, Connection
from app.schemas.schemas import DBMetricOut

router = APIRouter()


@router.get("/latest", response_model=List[DBMetricOut])
async def get_latest_metrics(db: AsyncSession = Depends(get_db)):
    """Return most recent metric per connection."""
    subq = (
        select(DBMetric.db_id, func.max(DBMetric.capture_time).label("latest"))
        .group_by(DBMetric.db_id)
        .subquery()
    )
    result = await db.execute(
        select(DBMetric)
        .join(subq, (DBMetric.db_id == subq.c.db_id) & (DBMetric.capture_time == subq.c.latest))
        .order_by(DBMetric.db_id)
    )
    return result.scalars().all()


@router.get("/{db_id}/history")
async def get_metric_history(
    db_id: int,
    limit: int = Query(60, le=1440),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(DBMetric)
        .where(DBMetric.db_id == db_id)
        .order_by(desc(DBMetric.capture_time))
        .limit(limit)
    )
    metrics = result.scalars().all()
    return [
        {
            "capture_time": m.capture_time,
            "cpu": m.cpu,
            "memory": m.memory,
            "connections": m.connections,
            "locks": m.locks,
            "deadlocks": m.deadlocks,
            "disk_usage": m.disk_usage,
            "health_status": m.health_status.value,
        }
        for m in reversed(metrics)
    ]


@router.get("/summary/all")
async def get_metrics_summary(db: AsyncSession = Depends(get_db)):
    """Aggregate stats for BI dashboard."""
    result = await db.execute(
        select(
            Connection.nombre,
            Connection.motor,
            func.avg(DBMetric.cpu).label("avg_cpu"),
            func.avg(DBMetric.memory).label("avg_memory"),
            func.max(DBMetric.deadlocks).label("max_deadlocks"),
            func.avg(DBMetric.connections).label("avg_connections"),
        )
        .join(Connection, DBMetric.db_id == Connection.id)
        .group_by(Connection.id, Connection.nombre, Connection.motor)
    )
    rows = result.all()
    return [
        {
            "nombre": r.nombre,
            "motor": r.motor.value,
            "avg_cpu": round(r.avg_cpu or 0, 2),
            "avg_memory": round(r.avg_memory or 0, 2),
            "max_deadlocks": r.max_deadlocks or 0,
            "avg_connections": round(r.avg_connections or 0, 1),
        }
        for r in rows
    ]
