"""Репозиторий сессий."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from sqlalchemy import and_, or_, update
from sqlalchemy.orm import Session

from app.db.database import SessionRow
from app.models.scenario import SessionStatus
from app.models.session import Message, Session as SessionModel


def row_to_session(row: SessionRow) -> SessionModel:
    return SessionModel(
        id=row.id,
        scenario_id=row.scenario_id,
        user_id=row.user_id or "guest",
        mode=row.mode,
        difficulty_mode=row.difficulty_mode or "medium",
        target_turns=row.target_turns or 10,
        engine_mode=getattr(row, "engine_mode", None) or "auto",
        status=SessionStatus(row.status),
        current_node_id=row.current_node_id,
        interest=row.interest,
        messages=[Message(**m) for m in (row.messages or [])],
        analysis=row.analysis,
        version=row.version or 0,
        last_request_id=row.last_request_id,
        last_response=row.last_response,
        created_at=row.created_at,
        finished_at=row.finished_at,
    )


def session_to_row(s: SessionModel, row: SessionRow | None = None) -> SessionRow:
    if row is None:
        row = SessionRow(id=s.id)
    row.scenario_id = s.scenario_id
    row.user_id = s.user_id
    row.mode = s.mode
    row.difficulty_mode = s.difficulty_mode
    row.target_turns = s.target_turns
    row.engine_mode = s.engine_mode
    row.status = s.status.value
    row.current_node_id = s.current_node_id
    row.interest = s.interest
    row.messages = [m.model_dump(mode="json") for m in s.messages]
    row.analysis = s.analysis
    row.version = s.version
    row.last_request_id = s.last_request_id
    row.last_response = s.last_response
    row.created_at = s.created_at
    row.finished_at = s.finished_at
    return row


def get_session(db: Session, session_id: str) -> SessionModel | None:
    row = db.get(SessionRow, session_id)
    return row_to_session(row) if row else None


def create_session(db: Session, s: SessionModel) -> SessionModel:
    db.add(session_to_row(s))
    db.commit()
    return s


def save_session(db: Session, s: SessionModel) -> SessionModel:
    row = db.get(SessionRow, s.id)
    session_to_row(s, row)
    db.commit()
    return s


def list_sessions(db: Session, user_id: str = "guest") -> list[SessionModel]:
    # Finished sessions are intentionally ephemeral: the result is shown immediately,
    # while only active chats stay in the sidebar and database.
    rows = db.query(SessionRow).filter(
        SessionRow.user_id == user_id,
        SessionRow.status == SessionStatus.active.value,
    ).order_by(SessionRow.created_at.desc()).all()
    return [row_to_session(r) for r in rows]


def delete_session(db: Session, session_id: str) -> bool:
    row = db.get(SessionRow, session_id)
    if row is None:
        return False
    db.delete(row)
    db.commit()
    return True


def purge_completed_sessions(db: Session, user_id: str = "guest") -> int:
    rows = db.query(SessionRow).filter(
        SessionRow.user_id == user_id,
        SessionRow.status != SessionStatus.active.value,
    ).all()
    for row in rows:
        db.delete(row)
    if rows:
        db.commit()
    return len(rows)


def minimize_sensitive_data(db: Session, session_id: str) -> None:
    """Remove dialogue text and generated prose once the browser has received it."""
    db.execute(
        update(SessionRow)
        .where(SessionRow.id == session_id)
        .values(
            messages=[],
            analysis=None,
            last_response=None,
            pending_request_id=None,
            pending_since=None,
        )
    )
    db.commit()


def purge_expired_sensitive_data(db: Session) -> int:
    """Fallback cleanup: completed payloads live <=1h, abandoned active drafts <=24h."""
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    completed = db.execute(
        update(SessionRow)
        .where(
            SessionRow.status != SessionStatus.active.value,
            SessionRow.finished_at < now - timedelta(hours=1),
        )
        .values(messages=[], analysis=None, last_response=None)
    ).rowcount
    stale_active = db.execute(
        update(SessionRow)
        .where(
            SessionRow.status == SessionStatus.active.value,
            SessionRow.created_at < now - timedelta(hours=24),
        )
        .values(
            status=SessionStatus.abandoned.value,
            finished_at=now,
            messages=[],
            analysis=None,
            last_response=None,
            pending_request_id=None,
            pending_since=None,
        )
    ).rowcount
    if completed or stale_active:
        db.commit()
    return completed + stale_active


def claim_turn(db: Session, session_id: str, version: int, request_id: str) -> bool:
    """Atomic cross-process claim; an interrupted worker's lease expires after 3 minutes."""
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    result = db.execute(update(SessionRow).where(
        SessionRow.id == session_id, SessionRow.version == version,
        SessionRow.status == SessionStatus.active.value,
        or_(SessionRow.pending_request_id.is_(None), SessionRow.pending_since < now - timedelta(minutes=3)),
    ).values(pending_request_id=request_id, pending_since=now))
    db.commit()
    return result.rowcount == 1


def complete_turn(db: Session, s: SessionModel, request_id: str, response: dict) -> bool:
    values = {"current_node_id": s.current_node_id, "interest": s.interest,
              "messages": [m.model_dump(mode="json") for m in s.messages], "analysis": s.analysis,
              "status": s.status.value, "finished_at": s.finished_at,
              "version": s.version + 1, "pending_request_id": None, "pending_since": None,
              "last_request_id": request_id, "last_response": response}
    result = db.execute(update(SessionRow).where(SessionRow.id == s.id,
        SessionRow.version == s.version, SessionRow.pending_request_id == request_id).values(**values))
    db.commit()
    return result.rowcount == 1


def release_turn(db: Session, session_id: str, request_id: str) -> None:
    db.execute(update(SessionRow).where(SessionRow.id == session_id,
        SessionRow.pending_request_id == request_id).values(pending_request_id=None, pending_since=None))
    db.commit()
