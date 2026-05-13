"""
SQLAlchemy ORM models for all DataOps platform tables.
Covers: CONNECTIONS, DB_METRICS, QUERY_LOG, TX_LOG,
        BACKUP_HISTORY, ALERT_LOG, REPLICATION_STATUS,
        CACHE_METRICS, USERS, ALERT_RULES
"""
from datetime import datetime
from sqlalchemy import (
    Integer, String, Float, Boolean, DateTime, Text,
    ForeignKey, Enum as SAEnum, func
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
import enum

from app.db.database import Base


# ─── ENUMS ────────────────────────────────────────────────────

class DBEngine(str, enum.Enum):
    POSTGRESQL = "PostgreSQL"
    SQLSERVER  = "SQL Server"
    ORACLE     = "Oracle"

class ConnectionStatus(str, enum.Enum):
    ACTIVE   = "ACTIVE"
    INACTIVE = "INACTIVE"
    ERROR    = "ERROR"

class HealthStatus(str, enum.Enum):
    HEALTHY  = "Healthy"
    WARNING  = "Warning"
    CRITICAL = "Critical"

class QueryCategory(str, enum.Enum):
    FAST     = "Fast"
    MEDIUM   = "Medium"
    SLOW     = "Slow"
    CRITICAL = "Critical"

class LockType(str, enum.Enum):
    SHARED    = "SHARED"
    EXCLUSIVE = "EXCLUSIVE"
    DEADLOCK  = "DEADLOCK"
    TIMEOUT   = "TIMEOUT"

class BackupType(str, enum.Enum):
    FULL         = "FULL"
    DIFFERENTIAL = "DIFF"
    INCREMENTAL  = "INC"
    SNAPSHOT     = "SNAPSHOT"

class BackupStatus(str, enum.Enum):
    SUCCESS = "SUCCESS"
    FAILED  = "FAILED"
    RUNNING = "RUNNING"

class AlertSeverity(str, enum.Enum):
    WARNING  = "Warning"
    CRITICAL = "Critical"
    INFO     = "Info"

class AlertStatus(str, enum.Enum):
    OPEN     = "OPEN"
    RESOLVED = "RESOLVED"
    IGNORED  = "IGNORED"


# ─── MODULE 1: CONNECTIONS ────────────────────────────────────

class Connection(Base):
    __tablename__ = "connections"

    id:            Mapped[int]              = mapped_column(Integer, primary_key=True, index=True)
    nombre:        Mapped[str]              = mapped_column(String(100), nullable=False)
    motor:         Mapped[DBEngine]         = mapped_column(SAEnum(DBEngine), nullable=False)
    host:          Mapped[str]              = mapped_column(String(255), nullable=False)
    port:          Mapped[int]              = mapped_column(Integer, nullable=False)
    database_name: Mapped[str]              = mapped_column(String(100), nullable=False)
    user_name:     Mapped[str]              = mapped_column(String(100), nullable=False)
    password_enc:  Mapped[str]              = mapped_column(Text, nullable=False)   # never plaintext
    status:        Mapped[ConnectionStatus] = mapped_column(SAEnum(ConnectionStatus), default=ConnectionStatus.INACTIVE)
    created_at:    Mapped[datetime]         = mapped_column(DateTime, server_default=func.now())
    last_checked:  Mapped[datetime | None]  = mapped_column(DateTime, nullable=True)

    metrics:    list["DBMetric"]          = relationship("DBMetric", back_populates="connection", cascade="all, delete-orphan")
    backups:    list["BackupHistory"]     = relationship("BackupHistory", back_populates="connection")
    alerts:     list["AlertLog"]          = relationship("AlertLog", back_populates="connection")
    replication:list["ReplicationStatus"] = relationship("ReplicationStatus", back_populates="connection")


# ─── MODULE 2: DB_METRICS ─────────────────────────────────────

class DBMetric(Base):
    __tablename__ = "db_metrics"

    id:           Mapped[int]          = mapped_column(Integer, primary_key=True, index=True)
    db_id:        Mapped[int]          = mapped_column(ForeignKey("connections.id"), index=True)
    cpu:          Mapped[float]        = mapped_column(Float, default=0.0)
    memory:       Mapped[float]        = mapped_column(Float, default=0.0)
    connections:  Mapped[int]          = mapped_column(Integer, default=0)
    locks:        Mapped[int]          = mapped_column(Integer, default=0)
    deadlocks:    Mapped[int]          = mapped_column(Integer, default=0)
    disk_usage:   Mapped[float]        = mapped_column(Float, default=0.0)
    health_status:Mapped[HealthStatus] = mapped_column(SAEnum(HealthStatus), default=HealthStatus.HEALTHY)
    capture_time: Mapped[datetime]     = mapped_column(DateTime, server_default=func.now(), index=True)

    connection: "Connection" = relationship("Connection", back_populates="metrics")


# ─── MODULE 3: QUERY_LOG ──────────────────────────────────────

class QueryLog(Base):
    __tablename__ = "query_log"

    id:             Mapped[int]           = mapped_column(Integer, primary_key=True, index=True)
    db_id:          Mapped[int]           = mapped_column(ForeignKey("connections.id"), index=True)
    query_text:     Mapped[str]           = mapped_column(Text, nullable=False)
    duration_ms:    Mapped[float]         = mapped_column(Float, nullable=False)
    rows_returned:  Mapped[int]           = mapped_column(Integer, default=0)
    index_used:     Mapped[str | None]    = mapped_column(String(200), nullable=True)
    execution_plan: Mapped[str | None]    = mapped_column(Text, nullable=True)
    category:       Mapped[QueryCategory] = mapped_column(SAEnum(QueryCategory), default=QueryCategory.FAST)
    optimized_query:Mapped[str | None]    = mapped_column(Text, nullable=True)
    created_at:     Mapped[datetime]      = mapped_column(DateTime, server_default=func.now(), index=True)


# ─── MODULE 4: TX_LOG (Concurrency) ──────────────────────────

class TxLog(Base):
    __tablename__ = "tx_log"

    id:        Mapped[int]      = mapped_column(Integer, primary_key=True, index=True)
    db_id:     Mapped[int]      = mapped_column(ForeignKey("connections.id"), index=True)
    session:   Mapped[str]      = mapped_column(String(100), nullable=False)
    operacion: Mapped[str]      = mapped_column(SAEnum("INSERT", "UPDATE", "DELETE", "SELECT", name="tx_op"), nullable=False)
    inicio:    Mapped[datetime] = mapped_column(DateTime, nullable=False)
    fin:       Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    wait_time: Mapped[float]    = mapped_column(Float, default=0.0)
    lock_type: Mapped[LockType] = mapped_column(SAEnum(LockType), default=LockType.SHARED)
    resolved:  Mapped[bool]     = mapped_column(Boolean, default=False)


# ─── MODULE 5: BACKUP_HISTORY ────────────────────────────────

class BackupHistory(Base):
    __tablename__ = "backup_history"

    id:             Mapped[int]          = mapped_column(Integer, primary_key=True, index=True)
    db_id:          Mapped[int]          = mapped_column(ForeignKey("connections.id"), index=True)
    backup_type:    Mapped[BackupType]   = mapped_column(SAEnum(BackupType), nullable=False)
    status:         Mapped[BackupStatus] = mapped_column(SAEnum(BackupStatus), default=BackupStatus.RUNNING)
    file_name:      Mapped[str]          = mapped_column(String(255), nullable=False)
    file_size_mb:   Mapped[float]        = mapped_column(Float, default=0.0)
    duration_secs:  Mapped[float]        = mapped_column(Float, default=0.0)
    restore_point:  Mapped[str | None]   = mapped_column(String(100), nullable=True)
    parent_id:      Mapped[int | None]   = mapped_column(ForeignKey("backup_history.id"), nullable=True)
    s3_url:         Mapped[str | None]   = mapped_column(Text, nullable=True)
    checksum_md5:   Mapped[str | None]   = mapped_column(String(32), nullable=True)
    checksum_sha256:Mapped[str | None]   = mapped_column(String(64), nullable=True)
    sla_met:        Mapped[bool | None]  = mapped_column(Boolean, nullable=True)
    rpo_minutes:    Mapped[float | None] = mapped_column(Float, nullable=True)
    rto_minutes:    Mapped[float | None] = mapped_column(Float, nullable=True)
    notes:          Mapped[str | None]   = mapped_column(Text, nullable=True)
    created_at:     Mapped[datetime]     = mapped_column(DateTime, server_default=func.now(), index=True)

    connection: "Connection" = relationship("Connection", back_populates="backups")


# ─── MODULE 6: REPLICATION_STATUS ────────────────────────────

class ReplicationStatus(Base):
    __tablename__ = "replication_status"

    id:           Mapped[int]          = mapped_column(Integer, primary_key=True, index=True)
    db_id:        Mapped[int]          = mapped_column(ForeignKey("connections.id"), index=True)
    primary_host: Mapped[str]          = mapped_column(String(255))
    replica_host: Mapped[str]          = mapped_column(String(255))
    lag_seconds:  Mapped[float]        = mapped_column(Float, default=0.0)
    lag_status:   Mapped[HealthStatus] = mapped_column(SAEnum(HealthStatus), default=HealthStatus.HEALTHY)
    bytes_pending:Mapped[int]          = mapped_column(Integer, default=0)
    is_streaming: Mapped[bool]         = mapped_column(Boolean, default=True)
    captured_at:  Mapped[datetime]     = mapped_column(DateTime, server_default=func.now(), index=True)

    connection: "Connection" = relationship("Connection", back_populates="replication")


# ─── MODULE 7: CACHE_METRICS ─────────────────────────────────

class CacheMetric(Base):
    __tablename__ = "cache_metrics"

    id:              Mapped[int]      = mapped_column(Integer, primary_key=True, index=True)
    cache_key:       Mapped[str]      = mapped_column(String(500), nullable=False)
    hit:             Mapped[bool]     = mapped_column(Boolean, nullable=False)
    response_ms:     Mapped[float]    = mapped_column(Float, default=0.0)
    db_response_ms:  Mapped[float]    = mapped_column(Float, default=0.0)
    ttl_seconds:     Mapped[int]      = mapped_column(Integer, default=300)
    captured_at:     Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), index=True)


# ─── MODULE 9: ALERT_RULES ───────────────────────────────────

class AlertRule(Base):
    __tablename__ = "alert_rules"

    id:          Mapped[int]           = mapped_column(Integer, primary_key=True, index=True)
    name:        Mapped[str]           = mapped_column(String(100), nullable=False, unique=True)
    condition:   Mapped[str]           = mapped_column(String(200), nullable=False)  # e.g. "cpu > 85"
    metric:      Mapped[str]           = mapped_column(String(50), nullable=False)
    threshold:   Mapped[float]         = mapped_column(Float, nullable=False)
    operator:    Mapped[str]           = mapped_column(String(5), default=">")
    severity:    Mapped[AlertSeverity] = mapped_column(SAEnum(AlertSeverity), default=AlertSeverity.WARNING)
    action:      Mapped[str]           = mapped_column(String(100), default="email")  # email|dashboard|both
    enabled:     Mapped[bool]          = mapped_column(Boolean, default=True)
    created_at:  Mapped[datetime]      = mapped_column(DateTime, server_default=func.now())
    updated_at:  Mapped[datetime]      = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())


# ─── MODULE 9: ALERT_LOG ─────────────────────────────────────

class AlertLog(Base):
    __tablename__ = "alert_log"

    id:          Mapped[int]           = mapped_column(Integer, primary_key=True, index=True)
    db_id:       Mapped[int | None]    = mapped_column(ForeignKey("connections.id"), nullable=True, index=True)
    rule_id:     Mapped[int | None]    = mapped_column(ForeignKey("alert_rules.id"), nullable=True)
    condition:   Mapped[str]           = mapped_column(String(200), nullable=False)
    metric_value:Mapped[float]         = mapped_column(Float, nullable=False)
    severity:    Mapped[AlertSeverity] = mapped_column(SAEnum(AlertSeverity), default=AlertSeverity.WARNING)
    status:      Mapped[AlertStatus]   = mapped_column(SAEnum(AlertStatus), default=AlertStatus.OPEN)
    message:     Mapped[str]           = mapped_column(Text, nullable=False)
    resolved_at: Mapped[datetime|None] = mapped_column(DateTime, nullable=True)
    created_at:  Mapped[datetime]      = mapped_column(DateTime, server_default=func.now(), index=True)

    connection: "Connection" = relationship("Connection", back_populates="alerts")


# ─── AUTH: USERS ─────────────────────────────────────────────

class User(Base):
    __tablename__ = "users"

    id:           Mapped[int]      = mapped_column(Integer, primary_key=True, index=True)
    username:     Mapped[str]      = mapped_column(String(100), unique=True, nullable=False)
    email:        Mapped[str]      = mapped_column(String(200), unique=True, nullable=False)
    password_hash:Mapped[str]      = mapped_column(String(200), nullable=False)
    is_active:    Mapped[bool]     = mapped_column(Boolean, default=True)
    is_admin:     Mapped[bool]     = mapped_column(Boolean, default=False)
    created_at:   Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
