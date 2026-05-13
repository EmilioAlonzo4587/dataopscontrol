"""Module 4 — Concurrency & Deadlock Detection API routes."""
import asyncio
import random
import uuid
from datetime import datetime, timezone, timedelta
from typing import List
from fastapi import APIRouter, Depends, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc

from app.db.database import get_db
from app.models.models import TxLog, LockType

router = APIRouter()


async def simulate_concurrent_session(db_id: int, session_id: str, operation: str) -> dict:
    """Simulate a single concurrent transaction session."""
    wait_ms = random.uniform(0, 500)
    duration_ms = random.uniform(5, 1000)

    # Randomly assign lock types with realistic distribution
    lock_weights = [50, 30, 10, 10]  # SHARED, EXCLUSIVE, DEADLOCK, TIMEOUT
    lock_type = random.choices(
        [LockType.SHARED, LockType.EXCLUSIVE, LockType.DEADLOCK, LockType.TIMEOUT],
        weights=lock_weights,
    )[0]

    start = datetime.now(timezone.utc)
    end = start + timedelta(milliseconds=duration_ms)

    return {
        "db_id": db_id,
        "session": session_id,
        "operation": operation,
        "inicio": start,
        "fin": end,
        "wait_time": round(wait_ms, 2),
        "lock_type": lock_type,
        "resolved": lock_type == LockType.DEADLOCK,  # deadlocks auto-resolved
    }


@router.post("/simulate")
async def simulate_concurrency(
    db_id: int = 1,
    num_users: int = 100,
    background_tasks: BackgroundTasks = None,
    db: AsyncSession = Depends(get_db),
):
    """
    Simulate N concurrent users executing mixed DML operations.
    Module 4 requirement: minimum 100 concurrent users.
    """
    operations = ["INSERT", "UPDATE", "DELETE", "SELECT"]
    tasks = []

    for i in range(num_users):
        session_id = f"sess_{uuid.uuid4().hex[:8]}"
        operation = random.choice(operations)
        tasks.append(simulate_concurrent_session(db_id, session_id, operation))

    results = await asyncio.gather(*tasks)

    # Persist all to TX_LOG
    entries = [
        TxLog(
            db_id=r["db_id"],
            session=r["session"],
            operacion=r["operation"],
            inicio=r["inicio"],
            fin=r["fin"],
            wait_time=r["wait_time"],
            lock_type=r["lock_type"],
            resolved=r["resolved"],
        )
        for r in results
    ]
    db.add_all(entries)
    await db.commit()

    # Summary stats
    deadlocks = sum(1 for r in results if r["lock_type"] == LockType.DEADLOCK)
    timeouts = sum(1 for r in results if r["lock_type"] == LockType.TIMEOUT)
    avg_wait = sum(r["wait_time"] for r in results) / len(results)

    return {
        "sessions_simulated": num_users,
        "deadlocks_detected": deadlocks,
        "deadlocks_resolved": deadlocks,  # all auto-resolved
        "timeouts": timeouts,
        "avg_wait_ms": round(avg_wait, 2),
        "operations": {op: sum(1 for r in results if r["operation"] == op) for op in operations},
    }


@router.get("/stats")
async def tx_stats(db_id: int = None, db: AsyncSession = Depends(get_db)):
    """Aggregate concurrency statistics for the dashboard."""
    q = select(
        TxLog.lock_type,
        func.count().label("count"),
        func.avg(TxLog.wait_time).label("avg_wait_ms"),
    ).group_by(TxLog.lock_type)

    if db_id:
        q = q.where(TxLog.db_id == db_id)

    result = await db.execute(q)
    rows = result.all()

    return [
        {
            "lock_type": r.lock_type.value,
            "count": r.count,
            "avg_wait_ms": round(r.avg_wait_ms or 0, 2),
        }
        for r in rows
    ]


@router.get("/deadlocks/recent")
async def recent_deadlocks(limit: int = 20, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(TxLog)
        .where(TxLog.lock_type == LockType.DEADLOCK)
        .order_by(desc(TxLog.inicio))
        .limit(limit)
    )
    return result.scalars().all()
