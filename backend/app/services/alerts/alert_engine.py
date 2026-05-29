"""
Module 9 — Alert Engine
Evaluates alert rules against latest metrics.
Configurable without redeployment (rules stored in DB).
Sends email and/or dashboard notifications.
"""
import asyncio
from datetime import datetime
from typing import Optional

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import AsyncSessionLocal
from app.models.models import (
    AlertRule, AlertLog, AlertSeverity, AlertStatus,
    DBMetric, Connection, BackupHistory, BackupStatus,
    ReplicationStatus, HealthStatus
)
from app.core.config import settings


async def send_alert_email(subject: str, body: str):
    """Send alert notification via SMTP."""
    if not settings.SMTP_USER or not settings.SMTP_PASSWORD:
        print(f"[ALERT EMAIL - no SMTP configured] {subject}: {body}")
        return
    try:
        import aiosmtplib
        from email.mime.text import MIMEText
        msg = MIMEText(body, "html")
        msg["Subject"] = f"[DataOps Alert] {subject}"
        msg["From"] = settings.SMTP_USER
        msg["To"] = settings.ALERT_EMAIL_TO

        await aiosmtplib.send(
            msg,
            hostname=settings.SMTP_HOST,
            port=settings.SMTP_PORT,
            username=settings.SMTP_USER,
            password=settings.SMTP_PASSWORD,
            start_tls=True,
        )
        print(f"[ALERT EMAIL SENT] {subject} → {settings.ALERT_EMAIL_TO}")
    except Exception as e:
        print(f"[ALERT EMAIL ERROR] {e}")


async def log_alert(
    db: AsyncSession,
    condition: str,
    metric_value: float,
    severity: AlertSeverity,
    message: str,
    db_id: Optional[int] = None,
    rule_id: Optional[int] = None,
):
    """Persist alert to ALERT_LOG table."""
    alert = AlertLog(
        db_id=db_id,
        rule_id=rule_id,
        condition=condition,
        metric_value=metric_value,
        severity=severity,
        status=AlertStatus.OPEN,
        message=message,
        created_at=datetime.utcnow(),
    )
    db.add(alert)
    await db.flush()
    return alert


async def evaluate_alerts():
    """
    Evaluate all enabled alert rules against the latest metrics.
    This runs after every health check cycle.
    """
    async with AsyncSessionLocal() as db:
        # Load all enabled rules
        rules_result = await db.execute(
            select(AlertRule).where(AlertRule.enabled == True)
        )
        rules = rules_result.scalars().all()

        # Get latest metrics per connection
        subq = (
            select(DBMetric.db_id, func.max(DBMetric.capture_time).label("latest"))
            .group_by(DBMetric.db_id)
            .subquery()
        )
        metrics_result = await db.execute(
            select(DBMetric, Connection.nombre)
            .join(subq, (DBMetric.db_id == subq.c.db_id) & (DBMetric.capture_time == subq.c.latest))
            .join(Connection, DBMetric.db_id == Connection.id)
        )
        metrics = metrics_result.all()

        for metric, conn_name in metrics:
            metric_map = {
                "cpu": metric.cpu,
                "memory": metric.memory,
                "connections": float(metric.connections),
                "locks": float(metric.locks),
                "deadlocks": float(metric.deadlocks),
                "disk_usage": metric.disk_usage,
            }

            for rule in rules:
                value = metric_map.get(rule.metric)
                if value is None:
                    continue

                triggered = False
                if rule.operator == ">" and value > rule.threshold:
                    triggered = True
                elif rule.operator == ">=" and value >= rule.threshold:
                    triggered = True
                elif rule.operator == "<" and value < rule.threshold:
                    triggered = True

                if triggered:
                    msg = (
                        f"<b>{conn_name}</b> — Rule <b>{rule.name}</b> triggered. "
                        f"<b>{rule.metric}</b> = {value:.2f} (threshold: {rule.operator} {rule.threshold})"
                    )
                    await log_alert(
                        db,
                        condition=rule.condition,
                        metric_value=value,
                        severity=rule.severity,
                        message=msg,
                        db_id=metric.db_id,
                        rule_id=rule.id,
                    )
                    if "email" in rule.action:
                        await send_alert_email(
                            subject=f"{rule.severity.value}: {rule.name} on {conn_name}",
                            body=msg,
                        )

        # Check for failed backups
        failed_result = await db.execute(
            select(BackupHistory)
            .where(BackupHistory.status == BackupStatus.FAILED)
            .order_by(BackupHistory.created_at.desc())
            .limit(5)
        )
        for bk in failed_result.scalars().all():
            await log_alert(
                db,
                condition="backup_failed",
                metric_value=1.0,
                severity=AlertSeverity.CRITICAL,
                message=f"Backup FAILED: {bk.file_name} (type: {bk.backup_type.value})",
                db_id=bk.db_id,
            )

        await db.commit()


async def seed_default_rules(db: AsyncSession):
    """Insert default alert rules if table is empty."""
    count = await db.execute(select(func.count()).select_from(AlertRule))
    if count.scalar() > 0:
        return

    default_rules = [
        AlertRule(name="CPU Warning",      metric="cpu",         operator=">", threshold=85.0,  severity=AlertSeverity.WARNING,  action="email",     condition="cpu > 85"),
        AlertRule(name="Deadlock Critical",metric="deadlocks",   operator=">", threshold=3.0,   severity=AlertSeverity.CRITICAL, action="dashboard", condition="deadlocks > 3"),
        AlertRule(name="Disk Critical",    metric="disk_usage",  operator=">", threshold=90.0,  severity=AlertSeverity.CRITICAL, action="email",     condition="disk_usage > 90"),
        AlertRule(name="Memory Warning",   metric="memory",      operator=">", threshold=85.0,  severity=AlertSeverity.WARNING,  action="email",     condition="memory > 85"),
        AlertRule(name="Connections Warn", metric="connections", operator=">", threshold=100.0, severity=AlertSeverity.WARNING,  action="dashboard", condition="connections > 100"),
        AlertRule(name="Locks Warning",    metric="locks",       operator=">", threshold=15.0,  severity=AlertSeverity.WARNING,  action="dashboard", condition="locks > 15"),
    ]
    db.add_all(default_rules)
    await db.commit()
