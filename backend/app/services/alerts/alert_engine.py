"""
Module 9 — Alert Engine
Evaluates alert rules against latest metrics.
Configurable without redeployment (rules stored in DB).

Deduplication: an OPEN alert for the same rule+db is only created once.
A new alert fires only after the previous one is resolved (status ≠ OPEN).
This prevents infinite email loops when a threshold breach persists across cycles.
"""
import asyncio
from datetime import datetime, timezone
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


# ─────────────────────────────────────────────────────────────────────────────
# HTML email templates
# ─────────────────────────────────────────────────────────────────────────────

def _severity_style(severity: str) -> dict:
    """Return color tokens for each severity level."""
    s = severity.upper()
    if s == "CRITICAL":
        return {"bg": "#fee2e2", "border": "#dc2626", "badge_bg": "#dc2626", "badge_text": "#ffffff", "label": "CRITICAL"}
    if s == "WARNING":
        return {"bg": "#fef9c3", "border": "#d97706", "badge_bg": "#d97706", "badge_text": "#ffffff", "label": "WARNING"}
    return {"bg": "#e0f2fe", "border": "#0891b2", "badge_bg": "#0891b2", "badge_text": "#ffffff", "label": "INFO"}


def _base_template(header_title: str, header_subtitle: str, body_html: str, severity: str = "info") -> str:
    """Wrap content in the standard email layout."""
    st = _severity_style(severity)
    now_utc = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    return f"""<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>DataOps Alert</title>
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

        <!-- HEADER -->
        <tr>
          <td style="background:#09090b;border-radius:12px 12px 0 0;padding:28px 32px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td>
                  <span style="display:inline-block;background:#06b6d4;border-radius:6px;padding:4px 10px;
                               font-size:10px;font-weight:700;letter-spacing:2px;color:#000;text-transform:uppercase;">
                    DataOps Control
                  </span>
                  <h1 style="margin:10px 0 2px;color:#f8fafc;font-size:20px;font-weight:700;letter-spacing:-0.3px;">
                    {header_title}
                  </h1>
                  <p style="margin:0;color:#94a3b8;font-size:13px;">{header_subtitle}</p>
                </td>
                <td align="right" valign="top">
                  <span style="display:inline-block;background:{st['badge_bg']};color:{st['badge_text']};
                               padding:6px 14px;border-radius:20px;font-size:12px;font-weight:700;
                               letter-spacing:1px;text-transform:uppercase;">
                    {st['label']}
                  </span>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- SEVERITY ACCENT BAR -->
        <tr>
          <td style="background:{st['border']};height:3px;font-size:0;line-height:0;">&nbsp;</td>
        </tr>

        <!-- BODY -->
        <tr>
          <td style="background:#ffffff;padding:28px 32px;">
            {body_html}
          </td>
        </tr>

        <!-- FOOTER -->
        <tr>
          <td style="background:#f8fafc;border-top:1px solid #e2e8f0;border-radius:0 0 12px 12px;
                     padding:16px 32px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td>
                  <p style="margin:0;color:#94a3b8;font-size:11px;">
                    Generado el {now_utc} &nbsp;·&nbsp; DataOps Control Center &nbsp;·&nbsp; Module 9 — Alert Engine
                  </p>
                </td>
                <td align="right">
                  <p style="margin:0;color:#cbd5e1;font-size:11px;">Notificación automática</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>"""


def _detail_row(label: str, value: str, highlight: bool = False) -> str:
    val_style = "color:#0f172a;font-weight:600;" if highlight else "color:#334155;"
    return f"""<tr>
      <td style="padding:10px 16px;border-bottom:1px solid #f1f5f9;color:#64748b;
                 font-size:13px;width:40%;vertical-align:top;">{label}</td>
      <td style="padding:10px 16px;border-bottom:1px solid #f1f5f9;font-size:13px;
                 {val_style}vertical-align:top;">{value}</td>
    </tr>"""


def build_metric_alert_html(
    rule_name: str,
    conn_name: str,
    metric: str,
    value: float,
    operator: str,
    threshold: float,
    severity: str,
    condition: str,
) -> str:
    st = _severity_style(severity)
    metric_display = metric.replace("_", " ").title()
    unit = "%" if metric in ("cpu", "memory", "disk_usage") else ""
    value_str = f"{value:.2f}{unit}"
    threshold_str = f"{operator} {threshold:.0f}{unit}"

    body = f"""
    <!-- ALERT SUMMARY BOX -->
    <div style="background:{st['bg']};border-left:4px solid {st['border']};border-radius:6px;
                padding:16px 20px;margin-bottom:24px;">
      <p style="margin:0 0 4px;font-size:14px;font-weight:700;color:#0f172a;">
        Umbral superado en <span style="color:{st['border']};">{conn_name}</span>
      </p>
      <p style="margin:0;font-size:13px;color:#475569;">
        La regla <strong>{rule_name}</strong> fue activada porque
        <code style="background:#e2e8f0;padding:1px 5px;border-radius:3px;font-size:12px;">{condition}</code>
      </p>
    </div>

    <!-- METRIC VALUE HIGHLIGHT -->
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      <tr>
        <td align="center" style="background:#0f172a;border-radius:10px;padding:24px;">
          <p style="margin:0 0 4px;font-size:11px;letter-spacing:2px;text-transform:uppercase;
                    color:#64748b;font-weight:600;">{metric_display}</p>
          <p style="margin:0;font-size:48px;font-weight:800;color:{st['border']};
                    font-family:'Courier New',monospace;line-height:1;">{value_str}</p>
          <p style="margin:6px 0 0;font-size:12px;color:#94a3b8;">
            Umbral configurado: <span style="color:#e2e8f0;font-weight:600;">{threshold_str}</span>
          </p>
        </td>
      </tr>
    </table>

    <!-- DETAIL TABLE -->
    <p style="margin:0 0 8px;font-size:12px;font-weight:700;letter-spacing:1px;
              text-transform:uppercase;color:#94a3b8;">Detalles del incidente</p>
    <table width="100%" cellpadding="0" cellspacing="0"
           style="border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;margin-bottom:24px;">
      {_detail_row("Base de datos", conn_name, highlight=True)}
      {_detail_row("Regla activada", rule_name)}
      {_detail_row("Métrica", metric_display)}
      {_detail_row("Valor medido", value_str, highlight=True)}
      {_detail_row("Condición", f"{metric} {operator} {threshold:.0f}{unit}")}
      {_detail_row("Severidad", f'<span style="color:{st["border"]};font-weight:700;">{severity.upper()}</span>')}
    </table>

    <!-- RECOMMENDED ACTION -->
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px 20px;">
      <p style="margin:0 0 6px;font-size:12px;font-weight:700;color:#0f172a;">Accion recomendada</p>
      <p style="margin:0;font-size:13px;color:#475569;line-height:1.6;">
        Revisa el modulo <strong>Health Metrics</strong> en el dashboard para ver el historial
        completo y confirmar si el valor sigue por encima del umbral. Si la alerta persiste,
        verifica los procesos activos en <strong>{conn_name}</strong>.
      </p>
    </div>
    """

    return _base_template(
        header_title=f"Alerta: {rule_name}",
        header_subtitle=f"Base de datos: {conn_name}  ·  Metrica: {metric_display}",
        body_html=body,
        severity=severity,
    )


def build_backup_failure_html(file_name: str, backup_type: str, notes: str, db_id: int) -> str:
    body = f"""
    <!-- ALERT SUMMARY BOX -->
    <div style="background:#fee2e2;border-left:4px solid #dc2626;border-radius:6px;
                padding:16px 20px;margin-bottom:24px;">
      <p style="margin:0 0 4px;font-size:14px;font-weight:700;color:#0f172a;">
        El proceso de backup no pudo completarse
      </p>
      <p style="margin:0;font-size:13px;color:#475569;">
        Se registro un fallo en el archivo
        <code style="background:#fecaca;padding:1px 6px;border-radius:3px;font-size:12px;
                     color:#991b1b;">{file_name}</code>.
        El motor de alertas enviara recordatorios hasta que sea atendido.
      </p>
    </div>

    <!-- ICON + STATUS -->
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      <tr>
        <td align="center" style="background:#0f172a;border-radius:10px;padding:24px;">
          <p style="margin:0 0 6px;font-size:32px;">&#10060;</p>
          <p style="margin:0;font-size:22px;font-weight:800;color:#f87171;">BACKUP FALLIDO</p>
          <p style="margin:6px 0 0;font-size:12px;color:#94a3b8;">
            Tipo: <span style="color:#e2e8f0;font-weight:600;">{backup_type}</span>
          </p>
        </td>
      </tr>
    </table>

    <!-- DETAIL TABLE -->
    <p style="margin:0 0 8px;font-size:12px;font-weight:700;letter-spacing:1px;
              text-transform:uppercase;color:#94a3b8;">Detalles del fallo</p>
    <table width="100%" cellpadding="0" cellspacing="0"
           style="border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;margin-bottom:24px;">
      {_detail_row("Archivo", f'<code style="font-size:12px;color:#dc2626;">{file_name}</code>')}
      {_detail_row("Tipo de backup", backup_type)}
      {_detail_row("DB ID", str(db_id))}
      {_detail_row("Motivo", notes or "Error durante la creacion del archivo de backup")}
      {_detail_row("Severidad", '<span style="color:#dc2626;font-weight:700;">CRITICAL</span>')}
    </table>

    <!-- RECOMMENDED ACTION -->
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px 20px;">
      <p style="margin:0 0 6px;font-size:12px;font-weight:700;color:#0f172a;">Que hacer ahora</p>
      <p style="margin:0;font-size:13px;color:#475569;line-height:1.6;">
        Accede al modulo <strong>Backup &amp; Recovery</strong> para revisar el historial completo.
        Verifica los logs del backend para el motivo exacto del fallo y ejecuta un nuevo
        backup manual si es necesario. Confirma que el SLA de RPO no haya sido comprometido.
      </p>
    </div>
    """

    return _base_template(
        header_title="Backup Fallido",
        header_subtitle=f"Archivo: {file_name}  ·  Tipo: {backup_type}",
        body_html=body,
        severity="critical",
    )


def build_test_email_html() -> str:
    now_utc = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    body = f"""
    <div style="background:#ecfdf5;border-left:4px solid #10b981;border-radius:6px;
                padding:16px 20px;margin-bottom:24px;">
      <p style="margin:0 0 4px;font-size:14px;font-weight:700;color:#0f172a;">
        Configuracion SMTP verificada correctamente
      </p>
      <p style="margin:0;font-size:13px;color:#475569;">
        Este es un correo de prueba generado manualmente desde el Alert Engine.
        Si lo recibes, el sistema de notificaciones esta funcionando.
      </p>
    </div>

    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      <tr>
        <td align="center" style="background:#0f172a;border-radius:10px;padding:28px;">
          <p style="margin:0 0 4px;font-size:36px;">&#10003;</p>
          <p style="margin:0;font-size:20px;font-weight:800;color:#34d399;">SMTP Operativo</p>
          <p style="margin:6px 0 0;font-size:12px;color:#94a3b8;">Verificado el {now_utc}</p>
        </td>
      </tr>
    </table>

    <p style="margin:0 0 8px;font-size:12px;font-weight:700;letter-spacing:1px;
              text-transform:uppercase;color:#94a3b8;">Informacion del sistema</p>
    <table width="100%" cellpadding="0" cellspacing="0"
           style="border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;margin-bottom:24px;">
      {_detail_row("Servidor SMTP", settings.SMTP_HOST)}
      {_detail_row("Puerto", str(settings.SMTP_PORT))}
      {_detail_row("Remitente", settings.SMTP_USER)}
      {_detail_row("Destinatario", settings.ALERT_EMAIL_TO)}
      {_detail_row("Estado", '<span style="color:#10b981;font-weight:700;">Conectado y funcionando</span>')}
    </table>

    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px 20px;">
      <p style="margin:0;font-size:13px;color:#475569;line-height:1.6;">
        Las alertas reales se enviaran automaticamente cuando una regla del
        <strong>Alert Engine</strong> detecte un umbral superado en tus bases de datos monitoreadas.
        Puedes configurar las reglas desde el modulo <strong>Alert Engine</strong> en el dashboard.
      </p>
    </div>
    """

    return _base_template(
        header_title="Correo de Prueba",
        header_subtitle="Verificacion de conectividad SMTP",
        body_html=body,
        severity="info",
    )


# ─────────────────────────────────────────────────────────────────────────────
# Email sender
# ─────────────────────────────────────────────────────────────────────────────

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


# ─────────────────────────────────────────────────────────────────────────────
# Alert logging
# ─────────────────────────────────────────────────────────────────────────────

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


# ─────────────────────────────────────────────────────────────────────────────
# Alert evaluation
# ─────────────────────────────────────────────────────────────────────────────

async def evaluate_alerts():
    """
    Evaluate all enabled alert rules against the latest metrics.
    Runs after every health-check cycle (every 60 s).
    """
    print("[AlertEngine] evaluate_alerts() starting...")
    async with AsyncSessionLocal() as db:
        # ── Metric rules ──────────────────────────────────────────────────────
        rules_result = await db.execute(
            select(AlertRule).where(AlertRule.enabled == True)
        )
        rules = rules_result.scalars().all()

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

        for metric, conn_name in metrics_result.all():
            metric_map = {
                "cpu":         metric.cpu,
                "memory":      metric.memory,
                "connections": float(metric.connections),
                "locks":       float(metric.locks),
                "deadlocks":   float(metric.deadlocks),
                "disk_usage":  metric.disk_usage,
            }

            for rule in rules:
                value = metric_map.get(rule.metric)
                if value is None:
                    continue

                triggered = (
                    (rule.operator == ">"  and value >  rule.threshold) or
                    (rule.operator == ">=" and value >= rule.threshold) or
                    (rule.operator == "<"  and value <  rule.threshold)
                )
                if not triggered:
                    continue

                existing = await db.execute(
                    select(AlertLog).where(
                        AlertLog.rule_id == rule.id,
                        AlertLog.db_id   == metric.db_id,
                        AlertLog.status  == AlertStatus.OPEN,
                    ).limit(1)
                )
                if existing.scalar_one_or_none():
                    print(f"[AlertEngine] SKIP (dedup): rule={rule.name!r} db_id={metric.db_id} — already OPEN")
                    continue

                print(f"[AlertEngine] TRIGGER: rule={rule.name!r} db_id={metric.db_id} value={value:.2f} threshold={rule.operator}{rule.threshold}")

                plain_msg = (
                    f"{conn_name} — Rule {rule.name} triggered. "
                    f"{rule.metric} = {value:.2f} "
                    f"(threshold: {rule.operator} {rule.threshold})"
                )
                await log_alert(
                    db,
                    condition=rule.condition,
                    metric_value=value,
                    severity=rule.severity,
                    message=plain_msg,
                    db_id=metric.db_id,
                    rule_id=rule.id,
                )
                if "email" in rule.action:
                    html = build_metric_alert_html(
                        rule_name=rule.name,
                        conn_name=conn_name,
                        metric=rule.metric,
                        value=value,
                        operator=rule.operator,
                        threshold=rule.threshold,
                        severity=rule.severity.value,
                        condition=rule.condition,
                    )
                    await send_alert_email(
                        subject=f"{rule.severity.value.upper()}: {rule.name} — {conn_name} ({rule.metric} = {value:.2f})",
                        body=html,
                    )

        print(f"[AlertEngine] Metric evaluation complete.")

        # ── Failed backup alerts ───────────────────────────────────────────────
        failed_result = await db.execute(
            select(BackupHistory)
            .where(BackupHistory.status == BackupStatus.FAILED)
            .order_by(BackupHistory.created_at.desc())
            .limit(5)
        )
        for bk in failed_result.scalars().all():
            unique_condition = f"backup_failed:{bk.id}"

            dup = await db.execute(
                select(AlertLog).where(
                    AlertLog.condition == unique_condition
                ).limit(1)
            )
            if dup.scalar_one_or_none():
                print(f"[AlertEngine] SKIP (dedup): backup_failed:{bk.id} already logged")
                continue

            print(f"[AlertEngine] TRIGGER: backup FAILED id={bk.id} file={bk.file_name}")
            plain_msg = (
                f"Backup FAILED: {bk.file_name} "
                f"(tipo: {bk.backup_type.value}, "
                f"motivo: {bk.notes or 'error durante creacion'})"
            )
            await log_alert(
                db,
                condition=unique_condition,
                metric_value=float(bk.id),
                severity=AlertSeverity.CRITICAL,
                message=plain_msg,
                db_id=bk.db_id,
            )
            html = build_backup_failure_html(
                file_name=bk.file_name,
                backup_type=bk.backup_type.value,
                notes=bk.notes or "",
                db_id=bk.db_id,
            )
            await send_alert_email(
                subject=f"CRITICAL: Backup Fallido — {bk.file_name}",
                body=html,
            )

        await db.commit()


async def seed_default_rules(db: AsyncSession):
    """Insert default alert rules if table is empty."""
    count = await db.execute(select(func.count()).select_from(AlertRule))
    if count.scalar() > 0:
        return

    default_rules = [
        AlertRule(name="CPU Critical",      metric="cpu",         operator=">",  threshold=85.0,  severity=AlertSeverity.WARNING,  action="email",     condition="cpu > 85"),
        AlertRule(name="Deadlock Critical", metric="deadlocks",   operator=">",  threshold=3.0,   severity=AlertSeverity.CRITICAL, action="dashboard", condition="deadlocks > 3"),
        AlertRule(name="Disk Critical",     metric="disk_usage",  operator=">",  threshold=90.0,  severity=AlertSeverity.CRITICAL, action="email",     condition="disk_usage > 90"),
        AlertRule(name="Memory Warning",    metric="memory",      operator=">",  threshold=85.0,  severity=AlertSeverity.WARNING,  action="email",     condition="memory > 85"),
        AlertRule(name="Connections Warn",  metric="connections", operator=">",  threshold=100.0, severity=AlertSeverity.WARNING,  action="dashboard", condition="connections > 100"),
        AlertRule(name="Locks Warning",     metric="locks",       operator=">",  threshold=15.0,  severity=AlertSeverity.WARNING,  action="dashboard", condition="locks > 15"),
    ]
    db.add_all(default_rules)
    await db.commit()
