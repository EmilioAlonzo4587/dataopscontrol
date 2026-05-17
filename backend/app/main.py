"""
DataOps Control Center — FastAPI Application Entry Point
"""
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from prometheus_client import make_asgi_app
import os

from app.core.config import settings
from app.core.scheduler import start_scheduler, stop_scheduler
from app.db.database import create_tables
from app.api.routes import (
    auth,
    connections,
    metrics,
    queries,
    transactions,
    backup,
    replication,
    cache,
    alerts,
    dashboard,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan: startup and shutdown logic."""
    # Startup
    await create_tables()
    await start_scheduler()
    yield
    # Shutdown
    await stop_scheduler()


app = FastAPI(
    title="DataOps Control Center API",
    description="Plataforma centralizada de monitoreo, gestión y recuperación de bases de datos empresariales.",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
)

# ─── Middleware ───────────────────────────────────────────────
frontend_url = os.getenv("API_URL_FRONTEND", "http://localhost:3000")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[frontend_url, "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(GZipMiddleware, minimum_size=1000)

# ─── Prometheus metrics endpoint ─────────────────────────────
metrics_app = make_asgi_app()
app.mount("/metrics", metrics_app)

# ─── Routers ─────────────────────────────────────────────────
app.include_router(auth.router,        prefix="/api/auth",        tags=["Authentication"])
app.include_router(connections.router, prefix="/api/connections", tags=["Connections"])
app.include_router(metrics.router,     prefix="/api/metrics",     tags=["Metrics"])
app.include_router(queries.router,     prefix="/api/queries",     tags=["Query Analyzer"])
app.include_router(transactions.router,prefix="/api/transactions",tags=["Concurrency"])
app.include_router(backup.router,      prefix="/api/backup",      tags=["Backup & Recovery"])
app.include_router(replication.router, prefix="/api/replication", tags=["Replication"])
app.include_router(cache.router,       prefix="/api/cache",       tags=["Redis Cache"])
app.include_router(alerts.router,      prefix="/api/alerts",      tags=["Alert Engine"])
app.include_router(dashboard.router,   prefix="/api/dashboard",   tags=["Dashboard BI"])


@app.get("/api/health", tags=["Health"])
async def health_check():
    return {"status": "healthy", "service": "DataOps Control Center", "version": "1.0.0"}
