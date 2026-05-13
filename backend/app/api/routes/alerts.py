"""Module 9 — Alert Engine API routes."""
from typing import List, Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc, update
from datetime import datetime, timezone

from app.db.database import get_db
from app.models.models import AlertLog, AlertRule, AlertStatus
from app.schemas.schemas import AlertRuleCreate, AlertRuleOut, AlertLogOut

router = APIRouter()


@router.get("/rules", response_model=List[AlertRuleOut])
async def list_rules(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(AlertRule).order_by(AlertRule.id))
    return result.scalars().all()


@router.post("/rules", response_model=AlertRuleOut, status_code=201)
async def create_rule(payload: AlertRuleCreate, db: AsyncSession = Depends(get_db)):
    """Create a new alert rule — no redeployment needed."""
    rule = AlertRule(**payload.model_dump())
    db.add(rule)
    await db.commit()
    await db.refresh(rule)
    return rule


@router.put("/rules/{rule_id}", response_model=AlertRuleOut)
async def update_rule(rule_id: int, payload: AlertRuleCreate, db: AsyncSession = Depends(get_db)):
    await db.execute(
        update(AlertRule).where(AlertRule.id == rule_id).values(**payload.model_dump())
    )
    await db.commit()
    result = await db.execute(select(AlertRule).where(AlertRule.id == rule_id))
    return result.scalar_one()


@router.delete("/rules/{rule_id}", status_code=204)
async def delete_rule(rule_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(AlertRule).where(AlertRule.id == rule_id))
    rule = result.scalar_one_or_none()
    if rule:
        await db.delete(rule)
        await db.commit()


@router.get("/log", response_model=List[AlertLogOut])
async def alert_log(
    severity: Optional[str] = None,
    status: Optional[str] = None,
    limit: int = Query(50, le=200),
    db: AsyncSession = Depends(get_db),
):
    q = select(AlertLog).order_by(desc(AlertLog.created_at)).limit(limit)
    if severity:
        q = q.where(AlertLog.severity == severity)
    if status:
        q = q.where(AlertLog.status == status)
    result = await db.execute(q)
    return result.scalars().all()


@router.post("/log/{alert_id}/resolve")
async def resolve_alert(alert_id: int, db: AsyncSession = Depends(get_db)):
    await db.execute(
        update(AlertLog)
        .where(AlertLog.id == alert_id)
        .values(status=AlertStatus.RESOLVED, resolved_at=datetime.now(timezone.utc))
    )
    await db.commit()
    return {"message": "Alert resolved"}


@router.get("/log/summary")
async def alert_summary(db: AsyncSession = Depends(get_db)):
    from sqlalchemy import func
    result = await db.execute(
        select(AlertLog.severity, AlertLog.status, func.count().label("count"))
        .group_by(AlertLog.severity, AlertLog.status)
    )
    rows = result.all()
    return [{"severity": r.severity.value, "status": r.status.value, "count": r.count} for r in rows]
