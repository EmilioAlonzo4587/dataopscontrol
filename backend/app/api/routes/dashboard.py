"""Module 8 — Business Intelligence Dashboard API routes."""
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc
from datetime import datetime, timezone, timedelta

from app.db.database import get_db
from app.models.models import (
    DBMetric, QueryLog, BackupHistory, AlertLog, Connection,
    HealthStatus, BackupStatus, AlertSeverity, ReplicationStatus
)

router = APIRouter()


@router.get("/overview")
async def dashboard_overview(db: AsyncSession = Depends(get_db)):
    """Master KPI overview for the main dashboard."""

    # Total connections
    conn_count = await db.execute(select(func.count()).select_from(Connection))

    # Health distribution
    subq = (
        select(DBMetric.db_id, func.max(DBMetric.capture_time).label("latest"))
        .group_by(DBMetric.db_id).subquery()
    )
    health_result = await db.execute(
        select(DBMetric.health_status, func.count().label("cnt"))
        .join(subq, (DBMetric.db_id == subq.c.db_id) & (DBMetric.capture_time == subq.c.latest))
        .group_by(DBMetric.health_status)
    )
    health_dist = {r.health_status.value: r.cnt for r in health_result.all()}

    # Backup SLA
    sla_result = await db.execute(
        select(func.count().label("total"),
               func.sum((BackupHistory.sla_met == True).cast("int")).label("met"))
    )
    sla = sla_result.one()
    total_bk = sla.total or 0
    met_bk = int(sla.met or 0)

    # Open critical alerts
    crit_result = await db.execute(
        select(func.count()).select_from(AlertLog)
        .where(AlertLog.severity == AlertSeverity.CRITICAL, AlertLog.status == "OPEN")
    )
    critical_alerts = crit_result.scalar()

    # Average replication lag
    lag_result = await db.execute(
        select(func.avg(ReplicationStatus.lag_seconds))
        .where(ReplicationStatus.captured_at > datetime.now(timezone.utc) - timedelta(minutes=5))
    )
    avg_lag = lag_result.scalar() or 0

    # Availability (pct time in Healthy state last 24h)
    total_24h = await db.execute(
        select(func.count()).select_from(DBMetric)
        .where(DBMetric.capture_time > datetime.now(timezone.utc) - timedelta(hours=24))
    )
    healthy_24h = await db.execute(
        select(func.count()).select_from(DBMetric)
        .where(DBMetric.health_status == HealthStatus.HEALTHY,
               DBMetric.capture_time > datetime.now(timezone.utc) - timedelta(hours=24))
    )
    total_n = total_24h.scalar() or 1
    healthy_n = healthy_24h.scalar() or 0
    availability = round(healthy_n / total_n * 100, 2)

    return {
        "total_connections": conn_count.scalar(),
        "health_distribution": health_dist,
        "backup_sla_pct": round(met_bk / total_bk * 100, 1) if total_bk > 0 else 100.0,
        "critical_alerts_open": critical_alerts,
        "avg_replication_lag_sec": round(avg_lag, 2),
        "availability_24h_pct": availability,
        "availability_target_pct": 99.9,
    }


@router.get("/availability")
async def availability_by_db(db: AsyncSession = Depends(get_db)):
    """Per-database availability percentage for BI dashboard."""
    result = await db.execute(
        select(
            Connection.id, Connection.nombre, Connection.motor,
            func.count(DBMetric.id).label("total_checks"),
            func.sum((DBMetric.health_status == HealthStatus.HEALTHY).cast("int")).label("healthy_checks"),
        )
        .join(DBMetric, Connection.id == DBMetric.db_id)
        .group_by(Connection.id, Connection.nombre, Connection.motor)
    )
    rows = result.all()
    return [
        {
            "db_id": r.id,
            "nombre": r.nombre,
            "motor": r.motor.value,
            "availability_pct": round(r.healthy_checks / r.total_checks * 100, 2) if r.total_checks > 0 else 0,
            "total_checks": r.total_checks,
        }
        for r in rows
    ]


@router.get("/heatmap")
async def activity_heatmap(db: AsyncSession = Depends(get_db)):
    """Operation density by hour and weekday."""
    from sqlalchemy import extract
    result = await db.execute(
        select(
            extract("dow", DBMetric.capture_time).label("dow"),
            extract("hour", DBMetric.capture_time).label("hour"),
            func.count().label("count"),
            func.avg(DBMetric.connections).label("avg_conn"),
        )
        .group_by("dow", "hour")
        .order_by("dow", "hour")
    )
    rows = result.all()
    return [
        {"day_of_week": int(r.dow), "hour": int(r.hour),
         "count": r.count, "avg_connections": round(r.avg_conn or 0, 1)}
        for r in rows
    ]
