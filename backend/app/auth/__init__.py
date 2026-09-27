"""Минимальная cookie-аутентификация для локального MVP."""
from __future__ import annotations

import hashlib
import hmac
import secrets
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, Request
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db.database import AuthSessionRow, UserRow


def now() -> datetime:
    # DateTime columns are timezone-naive in both SQLite and PostgreSQL.
    return datetime.now(timezone.utc).replace(tzinfo=None)


def normalize_email(email: str) -> str:
    return (email or "").strip().lower()


def hash_password(password: str) -> str:
    if len(password) < 8:
        raise ValueError("Пароль должен содержать минимум 8 символов")
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode("utf-8"), salt=salt, n=2**14, r=8, p=1)
    return f"scrypt$16384$8$1${salt.hex()}${digest.hex()}"


def verify_password(password: str, encoded: str) -> bool:
    try:
        scheme, n, r, p, salt_hex, digest_hex = encoded.split("$", 5)
        if scheme != "scrypt":
            return False
        digest = hashlib.scrypt(
            password.encode("utf-8"),
            salt=bytes.fromhex(salt_hex),
            n=int(n),
            r=int(r),
            p=int(p),
        )
        return hmac.compare_digest(digest.hex(), digest_hex)
    except (TypeError, ValueError):
        return False


def ensure_guest(db: Session) -> UserRow:
    settings = get_settings()
    user = db.get(UserRow, settings.guest_user_id)
    if user:
        return user
    timestamp = now()
    user = UserRow(
        id=settings.guest_user_id,
        email="guest@local.invalid",
        password_hash="!guest",
        display_name="Гость",
        role="user",
        is_active=True,
        created_at=timestamp,
        updated_at=timestamp,
    )
    db.add(user)
    db.commit()
    return user


def create_anonymous_user(db: Session) -> UserRow:
    """Create an isolated anonymous principal instead of a shared guest."""
    timestamp = now()
    suffix = uuid.uuid4().hex
    user = UserRow(
        id=f"anon_{suffix[:20]}",
        email=f"anon-{suffix}@local.invalid",
        password_hash="!anonymous",
        display_name="Гость",
        role="guest",
        is_active=True,
        created_at=timestamp,
        updated_at=timestamp,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def create_user(db: Session, email: str, password: str, display_name: str = "") -> UserRow:
    email = normalize_email(email)
    if not email or "@" not in email:
        raise ValueError("Укажите корректный email")
    if db.query(UserRow).filter(UserRow.email == email).first():
        raise ValueError("Пользователь с таким email уже существует")
    timestamp = now()
    user = UserRow(
        id=f"usr_{uuid.uuid4().hex[:16]}",
        email=email,
        password_hash=hash_password(password),
        display_name=(display_name or email.split("@", 1)[0]).strip()[:120],
        role="user",
        is_active=True,
        created_at=timestamp,
        updated_at=timestamp,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def public_user(user: UserRow) -> dict:
    return {
        "id": user.id,
        "email": user.email,
        "display_name": user.display_name,
        "role": user.role,
        "created_at": user.created_at.isoformat(),
    }


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def create_auth_session(db: Session, user: UserRow) -> str:
    token = secrets.token_urlsafe(32)
    timestamp = now()
    db.add(
        AuthSessionRow(
            id=f"ats_{uuid.uuid4().hex[:16]}",
            user_id=user.id,
            token_hash=_token_hash(token),
            created_at=timestamp,
            last_seen_at=timestamp,
            expires_at=timestamp + timedelta(days=get_settings().auth_session_days),
        )
    )
    db.commit()
    return token


def user_from_request(request: Request, db: Session) -> UserRow | None:
    token = request.cookies.get(get_settings().auth_cookie_name)
    if not token:
        return None
    row = db.query(AuthSessionRow).filter(
        AuthSessionRow.token_hash == _token_hash(token),
        AuthSessionRow.revoked_at.is_(None),
    ).first()
    if not row or row.expires_at <= now():
        return None
    user = db.get(UserRow, row.user_id)
    if not user or not user.is_active:
        return None
    row.last_seen_at = now()
    db.commit()
    return user


def current_user(request: Request, db: Session) -> UserRow:
    state_user = getattr(request.state, "current_user", None)
    if state_user is not None:
        return state_user
    user = user_from_request(request, db)
    if user:
        return user
    if get_settings().auth_required:
        raise HTTPException(status_code=401, detail="Требуется войти в аккаунт")
    # Normally anonymous principals are installed by the HTTP middleware.
    # Keep a per-request fallback for direct ASGI/dependency use.
    user = create_anonymous_user(db)
    request.state.current_user = user
    return user


def revoke_request_session(request: Request, db: Session) -> None:
    token = request.cookies.get(get_settings().auth_cookie_name)
    if not token:
        return
    row = db.query(AuthSessionRow).filter(AuthSessionRow.token_hash == _token_hash(token)).first()
    if row:
        row.revoked_at = now()
        db.commit()