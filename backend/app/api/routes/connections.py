"""Module 1 — Connection Registry API routes."""
from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.db.database import get_db
from app.models.models import Connection, ConnectionStatus
from app.core.security import encrypt_credential, decrypt_credential
from app.schemas.schemas import ConnectionCreate, ConnectionOut, ConnectionTest

router = APIRouter()


@router.get("/", response_model=List[ConnectionOut])
async def list_connections(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Connection).order_by(Connection.created_at.desc()))
    return result.scalars().all()


@router.get("/{conn_id}", response_model=ConnectionOut)
async def get_connection(conn_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Connection).where(Connection.id == conn_id))
    conn = result.scalar_one_or_none()
    if not conn:
        raise HTTPException(status_code=404, detail="Connection not found")
    return conn


@router.post("/", response_model=ConnectionOut, status_code=201)
async def create_connection(payload: ConnectionCreate, db: AsyncSession = Depends(get_db)):
    # Encrypt credentials — never stored in plaintext
    conn = Connection(
        nombre=payload.nombre,
        motor=payload.motor,
        host=payload.host,
        port=payload.port,
        database_name=payload.database_name,
        user_name=payload.user_name,
        password_enc=encrypt_credential(payload.password),
        status=ConnectionStatus.INACTIVE,
    )
    db.add(conn)
    await db.commit()
    await db.refresh(conn)

    # Validate connectivity immediately after registration
    test_result = await test_connection_internal(conn)
    conn.status = ConnectionStatus.ACTIVE if test_result["success"] else ConnectionStatus.ERROR
    await db.commit()
    return conn


@router.delete("/{conn_id}", status_code=204)
async def delete_connection(conn_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Connection).where(Connection.id == conn_id))
    conn = result.scalar_one_or_none()
    if not conn:
        raise HTTPException(status_code=404, detail="Connection not found")
    await db.delete(conn)
    await db.commit()


@router.post("/{conn_id}/test")
async def test_connection(conn_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Connection).where(Connection.id == conn_id))
    conn = result.scalar_one_or_none()
    if not conn:
        raise HTTPException(status_code=404, detail="Connection not found")
    return await test_connection_internal(conn)


async def test_connection_internal(conn: Connection) -> dict:
    """Attempt a live connection test against the registered engine."""
    import asyncio
    from app.core.security import decrypt_credential

    try:
        if conn.motor.value == "PostgreSQL":
            import asyncpg
            pg_conn = await asyncpg.connect(
                host=conn.host, port=conn.port,
                database=conn.database_name,
                user=conn.user_name,
                password=decrypt_credential(conn.password_enc),
                timeout=5,
            )
            await pg_conn.close()
            return {"success": True, "message": "PostgreSQL connection successful"}

        elif conn.motor.value == "SQL Server":
            import pyodbc
            password = decrypt_credential(conn.password_enc)
            conn_str = (
                f"DRIVER={{ODBC Driver 18 for SQL Server}};"
                f"SERVER={conn.host},{conn.port};"
                f"DATABASE={conn.database_name};"
                f"UID={conn.user_name};"
                f"PWD={password};"
                f"TrustServerCertificate=yes;"
                f"Connection Timeout=5;"
            )

            def _connect_sqlserver():
                c = pyodbc.connect(conn_str, timeout=5)
                c.close()

            loop = asyncio.get_running_loop()
            await loop.run_in_executor(None, _connect_sqlserver)
            return {"success": True, "message": "SQL Server connection successful"}

        elif conn.motor.value == "Oracle":
            import oracledb
            password = decrypt_credential(conn.password_enc)

            def _connect_oracle():
                c = oracledb.connect(
                    user=conn.user_name,
                    password=password,
                    dsn=f"{conn.host}:{conn.port}/{conn.database_name}",
                )
                c.close()

            loop = asyncio.get_running_loop()
            await loop.run_in_executor(None, _connect_oracle)
            return {"success": True, "message": "Oracle connection successful"}

        return {"success": False, "message": "Unknown engine"}

    except Exception as e:
        return {"success": False, "message": str(e)}
