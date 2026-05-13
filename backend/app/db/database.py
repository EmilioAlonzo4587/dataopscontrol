"""Database connection setup with SQLAlchemy async engine."""
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from app.core.config import settings

# Primary (read-write)
engine = create_async_engine(
    settings.DATABASE_URL,
    echo=False,
    pool_size=20,
    max_overflow=10,
    pool_pre_ping=True,
)

# Replica (read-only)
replica_engine = create_async_engine(
    settings.DATABASE_URL_REPLICA,
    echo=False,
    pool_size=10,
    max_overflow=5,
    pool_pre_ping=True,
)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
)

AsyncSessionReplica = async_sessionmaker(
    bind=replica_engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


class Base(DeclarativeBase):
    pass


async def create_tables():
    """Create all tables on startup."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def get_db() -> AsyncSession:
    """Dependency: primary DB session."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def get_replica_db() -> AsyncSession:
    """Dependency: replica DB session (read-only)."""
    async with AsyncSessionReplica() as session:
        try:
            yield session
        except Exception:
            raise
        finally:
            await session.close()
