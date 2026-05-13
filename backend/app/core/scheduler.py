"""Background job scheduler using APScheduler."""
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger

scheduler = AsyncIOScheduler()


async def start_scheduler():
    from app.services.monitoring.health_check import run_health_check
    from app.services.replication.replication_service import collect_replication_metrics
    from app.services.backup.backup_service import enforce_retention_policy
    from app.services.alerts.alert_engine import seed_default_rules
    from app.db.database import AsyncSessionLocal

    # Seed default alert rules
    async with AsyncSessionLocal() as db:
        await seed_default_rules(db)

    # Health check every 60 seconds
    scheduler.add_job(run_health_check, IntervalTrigger(seconds=60), id="health_check", replace_existing=True)

    # Replication lag every 30 seconds
    scheduler.add_job(collect_replication_metrics, IntervalTrigger(seconds=30), id="replication_check", replace_existing=True)

    # Retention policy daily
    scheduler.add_job(
        lambda: __import__('asyncio').get_event_loop().run_until_complete(
            __import__('app.db.database', fromlist=['AsyncSessionLocal']).AsyncSessionLocal().__aenter__()
        ),
        IntervalTrigger(hours=24),
        id="retention_policy",
        replace_existing=True,
    )

    scheduler.start()
    print("[Scheduler] Started: health_check (60s), replication_check (30s)")


async def stop_scheduler():
    if scheduler.running:
        scheduler.shutdown(wait=False)
        print("[Scheduler] Stopped")
