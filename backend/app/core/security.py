"""Security utilities: JWT token generation and password hashing."""
from datetime import datetime, timedelta, timezone
from typing import Optional
from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer

from app.core.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

ALGORITHM = "HS256"


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=ALGORITHM)


def decode_token(token: str) -> dict:
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )


def encrypt_credential(value: str) -> str:
    """Simple XOR-based obfuscation for connection credentials stored in DB.
    In production, replace with AES-256 encryption using a KMS key."""
    import base64
    key = settings.SECRET_KEY[:16].encode()
    encrypted = bytes(
        c ^ key[i % len(key)] for i, c in enumerate(value.encode())
    )
    return base64.b64encode(encrypted).decode()


def decrypt_credential(value: str) -> str:
    """Reverse of encrypt_credential."""
    import base64
    key = settings.SECRET_KEY[:16].encode()
    data = base64.b64decode(value.encode())
    decrypted = bytes(
        c ^ key[i % len(key)] for i, c in enumerate(data)
    )
    return decrypted.decode()
