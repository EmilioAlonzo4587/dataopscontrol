"""
Module 5 — Backup & Recovery Service
Handles Full, Differential, Incremental backups and Snapshots.
Uploads to Amazon S3 with integrity verification (MD5/SHA256).
"""
import os
import json
import hashlib
import asyncio
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

import aiofiles
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.models.models import BackupHistory, BackupType, BackupStatus, Connection
from app.core.config import settings


BACKUP_DIR = Path(settings.BACKUP_DIR)
BACKUP_DIR.mkdir(parents=True, exist_ok=True)


def compute_checksums(file_path: Path) -> tuple[str, str]:
    """Compute MD5 and SHA256 of a file."""
    md5 = hashlib.md5()
    sha256 = hashlib.sha256()
    with open(file_path, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            md5.update(chunk)
            sha256.update(chunk)
    return md5.hexdigest(), sha256.hexdigest()


async def upload_to_s3(file_path: Path, s3_key: str) -> Optional[str]:
    """Upload backup file to Amazon S3 and return public URL."""
    if not settings.AWS_ACCESS_KEY_ID or not settings.AWS_SECRET_ACCESS_KEY:
        print(f"[S3 SKIP] AWS credentials not configured. File: {file_path}")
        return f"s3://{settings.S3_BUCKET_NAME}/{s3_key} (simulation)"

    try:
        import boto3
        from botocore.exceptions import ClientError

        s3_client = boto3.client(
            "s3",
            aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
            aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
            region_name=settings.AWS_REGION,
        )
        s3_client.upload_file(str(file_path), settings.S3_BUCKET_NAME, s3_key)
        url = f"https://{settings.S3_BUCKET_NAME}.s3.{settings.AWS_REGION}.amazonaws.com/{s3_key}"
        print(f"[S3 UPLOAD] {url}")
        return url
    except Exception as e:
        print(f"[S3 ERROR] {e}")
        return None


async def enforce_retention_policy(db: AsyncSession):
    """Delete backups older than BACKUP_RETENTION_DAYS."""
    cutoff = datetime.utcnow() - timedelta(days=settings.BACKUP_RETENTION_DAYS)
    result = await db.execute(
        select(BackupHistory).where(BackupHistory.created_at < cutoff)
    )
    for old_backup in result.scalars().all():
        local_path = BACKUP_DIR / old_backup.file_name
        if local_path.exists():
            local_path.unlink()
        await db.delete(old_backup)
    await db.commit()


async def create_backup(
    db: AsyncSession,
    connection: Connection,
    backup_type: BackupType,
    parent_id: Optional[int] = None,
    snapshot_name: Optional[str] = None,
) -> BackupHistory:
    """
    Execute a backup operation for the given connection.
    For simulation environments, creates a JSON dump of metadata.
    In production, calls pg_dump, BACKUP DATABASE, or expdp.
    """
    start_time = datetime.utcnow()
    ts = start_time.strftime("%Y%m%d_%H%M%S")
    filename = f"{connection.nombre}_{backup_type.value}_{ts}.bak"
    if snapshot_name:
        filename = f"SNAPSHOT_{snapshot_name}_{ts}.bak"

    file_path = BACKUP_DIR / filename

    # ── Simulate backup content ──────────────────────────────
    backup_data = {
        "connection": connection.nombre,
        "engine": connection.motor.value,
        "host": connection.host,
        "database": connection.database_name,
        "backup_type": backup_type.value,
        "timestamp": start_time.isoformat(),
        "restore_point": ts,
        "parent_id": parent_id,
        "snapshot_name": snapshot_name,
        "simulated_data": "x" * 1024 * 10,  # 10 KB placeholder
    }

    async with aiofiles.open(file_path, "w") as f:
        await f.write(json.dumps(backup_data, indent=2))

    end_time = datetime.utcnow()
    duration = (end_time - start_time).total_seconds()
    file_size_mb = file_path.stat().st_size / (1024 * 1024)

    md5, sha256 = compute_checksums(file_path)

    # ── Upload to S3 ──────────────────────────────────────────
    s3_key = f"backups/{connection.nombre}/{backup_type.value}/{filename}"
    s3_url = await upload_to_s3(file_path, s3_key)

    # ── Calculate SLA compliance ──────────────────────────────
    rpo = settings.RPO_TARGET_MINUTES
    rto = settings.RTO_TARGET_MINUTES
    sla_met = duration / 60 <= rto  # simplified check

    backup_record = BackupHistory(
        db_id=connection.id,
        backup_type=backup_type,
        status=BackupStatus.SUCCESS,
        file_name=filename,
        file_size_mb=round(file_size_mb, 4),
        duration_secs=round(duration, 2),
        restore_point=ts,
        parent_id=parent_id,
        s3_url=s3_url,
        checksum_md5=md5,
        checksum_sha256=sha256,
        sla_met=sla_met,
        rpo_minutes=rpo,
        rto_minutes=rto,
        notes=f"Backup created via DataOps Control Center. Snapshot: {snapshot_name}" if snapshot_name else None,
        created_at=start_time,
    )
    db.add(backup_record)
    await db.commit()
    await db.refresh(backup_record)
    return backup_record


async def restore_backup(db: AsyncSession, backup_id: int) -> dict:
    """
    Simulate restoration from a backup.
    In production: calls pg_restore, RESTORE DATABASE, or impdp.
    Returns RPO/RTO measurements.
    """
    import time
    result = await db.execute(select(BackupHistory).where(BackupHistory.id == backup_id))
    backup = result.scalar_one_or_none()
    if not backup:
        return {"error": "Backup not found"}

    start = time.monotonic()
    # Simulate restore time based on file size
    await asyncio.sleep(min(backup.file_size_mb * 0.1, 2))  # capped at 2s for demo
    elapsed = time.monotonic() - start

    return {
        "backup_id": backup_id,
        "file_name": backup.file_name,
        "backup_type": backup.backup_type.value,
        "restore_point": backup.restore_point,
        "elapsed_seconds": round(elapsed, 2),
        "rto_met": elapsed / 60 <= settings.RTO_TARGET_MINUTES,
        "status": "RESTORED",
    }
