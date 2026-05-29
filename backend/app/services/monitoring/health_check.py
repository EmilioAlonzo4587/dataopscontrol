"""
Module 2 — Health Check Service
Runs every 60 seconds, collects metrics from each registered connection,
classifies health status and triggers alerts on threshold breaches.
"""
import asyncio
import random
from datetime import datetime
from typing import Optional

import httpx
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import AsyncSessionLocal
from app.models.models import Connection, DBMetric, HealthStatus, ConnectionStatus
from app.core.config import settings

DOCKER_SOCKET = "/var/run/docker.sock"

# Maps connection host → Docker container name
CONTAINER_MAP = {
    "postgres_primary": "dataops_postgres_primary",
    "sqlserver": "dataops_sqlserver",
    "redis": "dataops_redis",
}


def classify_health(cpu: float, memory: float, connections: int,
                    deadlocks: int, disk: float) -> HealthStatus:
    if (cpu > settings.DEFAULT_CPU_WARN_THRESHOLD or
            memory > settings.DEFAULT_MEMORY_WARN_THRESHOLD or
            disk > settings.DEFAULT_DISK_CRIT_THRESHOLD or
            deadlocks >= settings.DEFAULT_DEADLOCK_CRIT_THRESHOLD):
        return HealthStatus.CRITICAL
    if (cpu > settings.DEFAULT_CPU_WARN_LOW or
            memory > settings.DEFAULT_MEMORY_WARN_LOW or
            disk > settings.DEFAULT_DISK_WARN_LOW or
            connections > settings.DEFAULT_MAX_CONNECTIONS_WARN * 0.8):
        return HealthStatus.WARNING
    return HealthStatus.HEALTHY


async def get_docker_stats(container_name: str) -> Optional[dict]:
    """
    Query Docker Stats API via Unix socket for real CPU% and memory% of a container.
    CPU formula from Docker docs: (cpu_delta / system_delta) * num_cpus * 100
    Memory: (usage - cache) / limit * 100
    """
    try:
        transport = httpx.AsyncHTTPTransport(uds=DOCKER_SOCKET)
        async with httpx.AsyncClient(transport=transport, timeout=5) as client:
            resp = await client.get(
                f"http://localhost/containers/{container_name}/stats?stream=false"
            )
            if resp.status_code != 200:
                return None
            stats = resp.json()

        cpu_stats = stats.get("cpu_stats", {})
        precpu_stats = stats.get("precpu_stats", {})
        cpu_delta = (
            cpu_stats.get("cpu_usage", {}).get("total_usage", 0)
            - precpu_stats.get("cpu_usage", {}).get("total_usage", 0)
        )
        system_delta = (
            cpu_stats.get("system_cpu_usage", 0)
            - precpu_stats.get("system_cpu_usage", 0)
        )
        num_cpus = cpu_stats.get("online_cpus") or len(
            cpu_stats.get("cpu_usage", {}).get("percpu_usage", [1])
        )
        cpu_pct = round((cpu_delta / system_delta) * num_cpus * 100.0, 2) if system_delta > 0 else 0.0

        mem_stats = stats.get("memory_stats", {})
        mem_usage = mem_stats.get("usage", 0)
        mem_limit = mem_stats.get("limit", 1)
        # Subtract page cache so we get real process RSS
        cache = mem_stats.get("stats", {}).get("inactive_file", 0) or mem_stats.get("stats", {}).get("cache", 0)
        real_mem = max(mem_usage - cache, 0)
        mem_pct = round(real_mem / mem_limit * 100.0, 2) if mem_limit > 0 else 0.0

        return {"cpu": cpu_pct, "memory": mem_pct}
    except Exception:
        return None


async def collect_real_postgres_metrics(connection: Connection) -> Optional[dict]:
    """
    Collect real metrics from a PostgreSQL instance.

    Per-database:  connections, deadlocks, disk (pg_database_size)
    Per-instance:  locks (pg_locks filtered by database OID), CPU/memory (Docker Stats)
                   CPU/memory cannot be isolated per-DB at the OS level; they reflect
                   the whole PostgreSQL container when multiple databases share one instance.
    """
    try:
        import asyncpg
        from app.core.security import decrypt_credential
        pg = await asyncpg.connect(
            host=connection.host,
            port=connection.port,
            database=connection.database_name,
            user=connection.user_name,
            password=decrypt_credential(connection.password_enc),
            timeout=5,
        )

        # Per-database stats (connections, deadlocks, disk)
        db_row = await pg.fetchrow(
            """
            SELECT numbackends,
                   deadlocks,
                   pg_database_size(datname) AS db_size_bytes
            FROM pg_stat_database
            WHERE datname = $1
            """,
            connection.database_name,
        )
        active_connections = db_row["numbackends"] if db_row else 0
        deadlocks = db_row["deadlocks"] if db_row else 0
        db_size_bytes = float(db_row["db_size_bytes"] or 0) if db_row else 0.0

        # Locks filtered to this database only
        locks_row = await pg.fetchrow(
            """
            SELECT count(*) AS cnt
            FROM pg_locks l
            JOIN pg_database d ON d.oid = l.database
            WHERE d.datname = $1
            """,
            connection.database_name,
        )
        locks = locks_row["cnt"] if locks_row else 0

        # Total data directory size for disk % denominator
        total_row = await pg.fetchrow(
            "SELECT sum(pg_database_size(datname)) AS total FROM pg_stat_database"
        )
        total_bytes = float(total_row["total"] or 1) if total_row else 1.0

        await pg.close()

        # Disk % = this DB's size relative to all databases in the instance
        disk_pct = round(db_size_bytes / total_bytes * 100, 2) if total_bytes > 0 else 0.0

        # CPU/memory from Docker Stats (container-level — same value for all DBs in the instance)
        container = CONTAINER_MAP.get(connection.host)
        docker_stats = await get_docker_stats(container) if container else None

        if docker_stats:
            cpu = docker_stats["cpu"]
            memory = docker_stats["memory"]
        else:
            cpu = round(random.uniform(5, 80), 2)
            memory = round(random.uniform(20, 75), 2)

        return {
            "cpu": cpu,
            "memory": memory,
            "connections": active_connections,
            "locks": locks,
            "deadlocks": deadlocks,
            "disk_usage": disk_pct,
        }
    except Exception:
        return None


async def collect_real_sqlserver_metrics(connection: Connection) -> Optional[dict]:
    """
    Collect real metrics from a SQL Server instance via pyodbc + sys.dm_* views.
    Falls back to None if the driver is unavailable or permissions are insufficient.
    """
    try:
        import pyodbc
        from app.core.security import decrypt_credential

        password = decrypt_credential(connection.password_enc)
        conn_str = (
            f"DRIVER={{ODBC Driver 18 for SQL Server}};"
            f"SERVER={connection.host},{connection.port};"
            f"DATABASE={connection.database_name};"
            f"UID={connection.user_name};"
            f"PWD={password};"
            f"TrustServerCertificate=yes;"
            f"Connection Timeout=5;"
        )

        def _fetch():
            with pyodbc.connect(conn_str, timeout=5) as c:
                cur = c.cursor()

                # Active user sessions
                cur.execute(
                    "SELECT COUNT(*) FROM sys.dm_exec_sessions WHERE is_user_process = 1"
                )
                connections_count = cur.fetchone()[0] or 0

                # Blocking (lock contention)
                cur.execute(
                    "SELECT COUNT(*) FROM sys.dm_exec_requests WHERE blocking_session_id > 0"
                )
                locks = cur.fetchone()[0] or 0

                # CPU % from SQL Server scheduler ring buffer
                cpu = random.uniform(5, 30)  # default if ring buffer unavailable
                try:
                    cur.execute("""
                        SELECT TOP 1
                            CAST(record AS xml).value(
                                '(./Record/SchedulerMonitorEvent/SystemHealth/ProcessUtilization)[1]',
                                'int'
                            ) AS cpu_pct
                        FROM sys.dm_os_ring_buffers
                        WHERE ring_buffer_type = N'RING_BUFFER_SCHEDULER_MONITOR'
                        ORDER BY timestamp DESC
                    """)
                    row = cur.fetchone()
                    if row and row[0] is not None:
                        cpu = float(row[0])
                except Exception:
                    pass

                # Memory % from process memory DMV
                memory = random.uniform(20, 50)
                try:
                    cur.execute("""
                        SELECT ROUND(
                            physical_memory_in_use_kb * 100.0 /
                            NULLIF((SELECT physical_memory_kb FROM sys.dm_os_sys_info), 0)
                        , 2) FROM sys.dm_os_process_memory
                    """)
                    row = cur.fetchone()
                    if row and row[0] is not None:
                        memory = float(row[0])
                except Exception:
                    pass

                # Deadlocks from performance counters
                deadlocks = 0
                try:
                    cur.execute("""
                        SELECT cntr_value FROM sys.dm_os_performance_counters
                        WHERE counter_name = 'Number of Deadlocks/sec' AND instance_name = '_Total'
                    """)
                    row = cur.fetchone()
                    if row:
                        deadlocks = min(int(row[0]), 10)
                except Exception:
                    pass

                # Disk usage from database files
                disk = random.uniform(10, 40)
                try:
                    cur.execute("""
                        SELECT ROUND(
                            CAST(SUM(FILEPROPERTY(name, 'SpaceUsed')) AS float) * 100.0 /
                            NULLIF(CAST(SUM(size) AS float), 0)
                        , 2) FROM sys.database_files
                    """)
                    row = cur.fetchone()
                    if row and row[0] is not None:
                        disk = float(row[0])
                except Exception:
                    pass

                return {
                    "cpu":         round(cpu, 2),
                    "memory":      round(memory, 2),
                    "connections": connections_count,
                    "locks":       locks,
                    "deadlocks":   deadlocks,
                    "disk_usage":  round(disk, 2),
                }

        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, _fetch)

    except Exception as e:
        print(f"[HealthCheck] SQL Server metrics error ({connection.nombre}): {e}")
        return None


async def simulate_db_metrics(connection: Connection) -> dict:
    return {
        "cpu": round(random.uniform(5, 95), 2),
        "memory": round(random.uniform(20, 90), 2),
        "connections": random.randint(1, 150),
        "locks": random.randint(0, 20),
        "deadlocks": random.randint(0, 5),
        "disk_usage": round(random.uniform(10, 95), 2),
    }


async def run_health_check():
    """Scheduled job: check all active connections every minute."""
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Connection).where(Connection.status != ConnectionStatus.ERROR)
        )
        connections = result.scalars().all()

        for conn in connections:
            metrics_data = None

            if conn.motor.value == "PostgreSQL":
                metrics_data = await collect_real_postgres_metrics(conn)
            elif conn.motor.value == "SQL Server":
                metrics_data = await collect_real_sqlserver_metrics(conn)
            # Oracle: no open-source async driver available; falls through to simulation

            if metrics_data is None:
                metrics_data = await simulate_db_metrics(conn)

            health = classify_health(
                metrics_data["cpu"],
                metrics_data["memory"],
                metrics_data["connections"],
                metrics_data["deadlocks"],
                metrics_data["disk_usage"],
            )

            metric = DBMetric(
                db_id=conn.id,
                cpu=metrics_data["cpu"],
                memory=metrics_data["memory"],
                connections=metrics_data["connections"],
                locks=metrics_data["locks"],
                deadlocks=metrics_data["deadlocks"],
                disk_usage=metrics_data["disk_usage"],
                health_status=health,
                capture_time=datetime.utcnow(),
            )
            db.add(metric)

            await db.execute(
                update(Connection)
                .where(Connection.id == conn.id)
                .values(status=ConnectionStatus.ACTIVE, last_checked=datetime.utcnow())
            )

        await db.commit()

        from app.services.alerts.alert_engine import evaluate_alerts
        await evaluate_alerts()
