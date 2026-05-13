"""Application configuration using Pydantic Settings."""
from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    # App
    APP_NAME: str = "DataOps Control Center"
    ENVIRONMENT: str = "development"
    SECRET_KEY: str = "supersecretkey_change_in_prod"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # 24 hours

    # PostgreSQL
    DATABASE_URL: str = "postgresql+asyncpg://dataops:dataops123@localhost:5432/dataops_primary"
    DATABASE_URL_REPLICA: str = "postgresql+asyncpg://dataops:dataops123@localhost:5433/dataops_primary"

    # SQL Server
    MSSQL_URL: str = "mssql+pyodbc://sa:DataOps123!@localhost:1433/master?driver=ODBC+Driver+18+for+SQL+Server&TrustServerCertificate=yes"

    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"
    CACHE_TTL_SECONDS: int = 300  # 5 minutes default TTL

    # AWS S3
    AWS_ACCESS_KEY_ID: Optional[str] = None
    AWS_SECRET_ACCESS_KEY: Optional[str] = None
    AWS_REGION: str = "us-east-1"
    S3_BUCKET_NAME: str = "dataops-backups"

    # SMTP
    SMTP_HOST: str = "smtp.gmail.com"
    SMTP_PORT: int = 587
    SMTP_USER: Optional[str] = None
    SMTP_PASSWORD: Optional[str] = None
    ALERT_EMAIL_TO: str = "admin@dataops.com"

    # Alert thresholds (configurable without redeployment via DB)
    DEFAULT_CPU_WARN_THRESHOLD: float = 85.0
    DEFAULT_MEMORY_WARN_THRESHOLD: float = 85.0
    DEFAULT_DISK_CRIT_THRESHOLD: float = 90.0
    DEFAULT_DEADLOCK_CRIT_THRESHOLD: int = 3
    DEFAULT_REPLICATION_LAG_WARN: float = 10.0
    DEFAULT_MAX_CONNECTIONS_WARN: int = 100

    # Backup
    BACKUP_DIR: str = "/app/backups"
    BACKUP_RETENTION_DAYS: int = 30
    RPO_TARGET_MINUTES: int = 15
    RTO_TARGET_MINUTES: int = 45

    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()
