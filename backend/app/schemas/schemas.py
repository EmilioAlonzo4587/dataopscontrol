"""Pydantic schemas for request/response validation."""
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, EmailStr

from app.models.models import (
    DBEngine, ConnectionStatus, HealthStatus, QueryCategory,
    LockType, BackupType, BackupStatus, AlertSeverity, AlertStatus
)


# ─── AUTH ─────────────────────────────────────────────────────

class UserCreate(BaseModel):
    username: str
    email: EmailStr
    password: str


class UserOut(BaseModel):
    id: int
    username: str
    email: str
    is_active: bool
    is_admin: bool
    class Config: from_attributes = True


class Token(BaseModel):
    access_token: str
    token_type: str


# ─── CONNECTIONS ──────────────────────────────────────────────

class ConnectionCreate(BaseModel):
    nombre: str
    motor: DBEngine
    host: str
    port: int
    database_name: str
    user_name: str
    password: str  # plain text in request, encrypted before storage


class ConnectionUpdate(BaseModel):
    nombre: str
    motor: DBEngine
    host: str
    port: int
    database_name: str
    user_name: str
    password: Optional[str] = None  # blank = keep existing encrypted password


class ConnectionTest(BaseModel):
    connection_id: int


class ConnectionOut(BaseModel):
    id: int
    nombre: str
    motor: DBEngine
    host: str
    port: int
    database_name: str
    user_name: str
    status: ConnectionStatus
    created_at: datetime
    last_checked: Optional[datetime]
    class Config: from_attributes = True


# ─── METRICS ─────────────────────────────────────────────────

class DBMetricOut(BaseModel):
    id: int
    db_id: int
    cpu: float
    memory: float
    connections: int
    locks: int
    deadlocks: int
    disk_usage: float
    health_status: HealthStatus
    capture_time: datetime
    class Config: from_attributes = True


# ─── QUERY LOG ────────────────────────────────────────────────

class QueryLogCreate(BaseModel):
    db_id: int
    query_text: str
    duration_ms: float
    rows_returned: int = 0
    index_used: Optional[str] = None
    execution_plan: Optional[str] = None


class QueryLogOut(BaseModel):
    id: int
    db_id: int
    query_text: str
    duration_ms: float
    rows_returned: int
    index_used: Optional[str]
    category: QueryCategory
    optimized_query: Optional[str]
    created_at: datetime
    class Config: from_attributes = True


# ─── BACKUP ──────────────────────────────────────────────────

class BackupHistoryOut(BaseModel):
    id: int
    db_id: int
    backup_type: BackupType
    status: BackupStatus
    file_name: str
    file_size_mb: float
    duration_secs: float
    restore_point: Optional[str]
    s3_url: Optional[str]
    checksum_md5: Optional[str]
    sla_met: Optional[bool]
    rpo_minutes: Optional[float]
    rto_minutes: Optional[float]
    created_at: datetime
    class Config: from_attributes = True


# ─── ALERTS ──────────────────────────────────────────────────

class AlertRuleCreate(BaseModel):
    name: str
    condition: str
    metric: str
    threshold: float
    operator: str = ">"
    severity: AlertSeverity = AlertSeverity.WARNING
    action: str = "email"
    enabled: bool = True


class AlertRuleOut(BaseModel):
    id: int
    name: str
    condition: str
    metric: str
    threshold: float
    operator: str
    severity: AlertSeverity
    action: str
    enabled: bool
    created_at: datetime
    class Config: from_attributes = True


class AlertLogOut(BaseModel):
    id: int
    db_id: Optional[int]
    condition: str
    metric_value: float
    severity: AlertSeverity
    status: AlertStatus
    message: str
    resolved_at: Optional[datetime]
    created_at: datetime
    class Config: from_attributes = True
