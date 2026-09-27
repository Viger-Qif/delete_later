"""БД-слой: подключение, сессия, модели."""
from __future__ import annotations

from sqlalchemy import JSON, Boolean, Column, DateTime, Integer, String, Text, create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

from app.core.config import get_settings

Base = declarative_base()


class ScenarioRow(Base):
    __tablename__ = "scenarios"

    id = Column(String, primary_key=True)
    title = Column(String, nullable=False)
    description = Column(Text, default="")
    difficulty = Column(String, default="medium")
    industry = Column(String, default="")
    modes = Column(JSON, default=list)
    goal = Column(String, default="")
    user_role = Column(String, default="Участник переговоров")
    constraints = Column(JSON, default=list)
    opponent = Column(JSON, nullable=False)
    assistant = Column(JSON, nullable=True)
    interest = Column(JSON, default=dict)
    max_adjust = Column(Integer, default=25)
    graph = Column(JSON, nullable=False)
    scenario_type = Column(String, default="curated", index=True)
    tags = Column(JSON, default=list)
    knowledge_refs = Column(JSON, default=list)
    coach_profile = Column(JSON, default=dict)
    # Hidden state for a curated opponent. It is available to the engine, but
    # must never be rendered as learner-facing scenario copy.
    opponent_state = Column(JSON, default=dict)
    schema_version = Column(Integer, default=2)
    published = Column(Boolean, default=False)
    archived = Column(Boolean, default=False)
    owner_id = Column(String, default="system")


class ResultSummaryRow(Base):
    __tablename__ = "result_summaries"
    id=Column(String,primary_key=True); scenario_id=Column(String,index=True); scenario_title=Column(String,default="Сценарий"); user_id=Column(String,index=True,default="guest")
    mode=Column(String); difficulty_mode=Column(String); engine_mode=Column(String); status=Column(String); end_reason=Column(String); interest=Column(Integer); turns=Column(Integer); violation_count=Column(Integer,default=0); score=Column(Integer,nullable=True); analysis=Column(JSON,nullable=True); created_at=Column(DateTime,nullable=False); finished_at=Column(DateTime,nullable=False)


class SessionRow(Base):
    __tablename__ = "sessions"

    id = Column(String, primary_key=True)
    scenario_id = Column(String, nullable=False, index=True)
    user_id = Column(String, default="guest")
    mode = Column(String, default="text")
    difficulty_mode = Column(String, default="medium")
    target_turns = Column(Integer, default=10)
    engine_mode = Column(String, default="auto")
    status = Column(String, default="active")
    current_node_id = Column(String, nullable=False)
    interest = Column(Integer, default=50)
    messages = Column(JSON, default=list)
    analysis = Column(JSON, nullable=True)
    version = Column(Integer, nullable=False, default=0)
    pending_request_id = Column(String, nullable=True)
    pending_since = Column(DateTime, nullable=True)
    last_request_id = Column(String, nullable=True)
    last_response = Column(JSON, nullable=True)
    created_at = Column(DateTime, nullable=False)
    finished_at = Column(DateTime, nullable=True)


class UserRow(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True)
    email = Column(String, unique=True, nullable=False, index=True)
    password_hash = Column(String, nullable=False)
    display_name = Column(String, nullable=False, default="")
    role = Column(String, nullable=False, default="user")
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, nullable=False)
    updated_at = Column(DateTime, nullable=False)


class AuthSessionRow(Base):
    __tablename__ = "auth_sessions"

    id = Column(String, primary_key=True)
    user_id = Column(String, nullable=False, index=True)
    token_hash = Column(String, unique=True, nullable=False, index=True)
    created_at = Column(DateTime, nullable=False)
    last_seen_at = Column(DateTime, nullable=False)
    expires_at = Column(DateTime, nullable=False, index=True)
    revoked_at = Column(DateTime, nullable=True)


class LearningAttemptRow(Base):
    __tablename__ = "learning_attempts"

    id = Column(String, primary_key=True)
    user_id = Column(String, nullable=False, index=True)
    exercise_id = Column(String, nullable=False, index=True)
    method_id = Column(String, nullable=False, index=True)
    answer = Column(Text, nullable=False, default="")
    score = Column(Integer, nullable=False, default=0)
    max_score = Column(Integer, nullable=False, default=0)
    passed = Column(Boolean, nullable=False, default=False)
    feedback = Column(Text, nullable=False, default="")
    evaluation = Column(JSON, nullable=True)
    created_at = Column(DateTime, nullable=False)


class SkillMasteryRow(Base):
    __tablename__ = "skill_mastery"

    id = Column(String, primary_key=True)
    user_id = Column(String, nullable=False, index=True)
    skill_id = Column(String, nullable=False, index=True)
    method_id = Column(String, nullable=False, index=True)
    mastery = Column(Integer, nullable=False, default=0)
    attempts = Column(Integer, nullable=False, default=0)
    successful_attempts = Column(Integer, nullable=False, default=0)
    common_mistakes = Column(JSON, nullable=True)
    last_practiced_at = Column(DateTime, nullable=False)


class ReviewQueueRow(Base):
    __tablename__ = "learning_review_queue"

    id = Column(String, primary_key=True)
    user_id = Column(String, nullable=False, index=True)
    exercise_id = Column(String, nullable=False, index=True)
    method_id = Column(String, nullable=False, index=True)
    reason = Column(Text, nullable=False, default="")
    due_at = Column(DateTime, nullable=False, index=True)
    status = Column(String, nullable=False, default="open", index=True)
    streak = Column(Integer, nullable=False, default=0)
    last_score = Column(Integer, nullable=False, default=0)
    last_max_score = Column(Integer, nullable=False, default=0)
    last_attempt_id = Column(String, nullable=True)
    created_at = Column(DateTime, nullable=False)
    updated_at = Column(DateTime, nullable=False)


class LearningReflectionRow(Base):
    __tablename__ = "learning_reflections"

    id = Column(String, primary_key=True)
    user_id = Column(String, nullable=False, index=True)
    source_type = Column(String, nullable=False, default="dialogue")
    source_id = Column(String, nullable=False, index=True)
    answers = Column(JSON, nullable=False, default=dict)
    created_at = Column(DateTime, nullable=False)


_engine = None
_SessionLocal = None


def init_db() -> None:
    global _engine, _SessionLocal
    settings = get_settings()
    _engine = create_engine(
        settings.database_url,
        connect_args={"check_same_thread": False}
        if settings.database_url.startswith("sqlite")
        else {},
    )
    Base.metadata.create_all(_engine)
    if settings.database_url.startswith("sqlite"):
        with _engine.begin() as connection:
            columns = {row[1] for row in connection.exec_driver_sql("PRAGMA table_info(sessions)")}
            if "difficulty_mode" not in columns:
                connection.exec_driver_sql("ALTER TABLE sessions ADD COLUMN difficulty_mode VARCHAR DEFAULT 'medium'")
            if "target_turns" not in columns:
                connection.exec_driver_sql("ALTER TABLE sessions ADD COLUMN target_turns INTEGER DEFAULT 10")
            if "engine_mode" not in columns:
                connection.exec_driver_sql("ALTER TABLE sessions ADD COLUMN engine_mode VARCHAR DEFAULT 'auto'")
            scenario_columns = {row[1] for row in connection.exec_driver_sql("PRAGMA table_info(scenarios)")}
            if "user_role" not in scenario_columns:
                connection.exec_driver_sql("ALTER TABLE scenarios ADD COLUMN user_role VARCHAR DEFAULT 'Участник переговоров'")
            if "scenario_type" not in scenario_columns:
                connection.exec_driver_sql("ALTER TABLE scenarios ADD COLUMN scenario_type VARCHAR DEFAULT 'curated'")
            if "tags" not in scenario_columns:
                connection.exec_driver_sql("ALTER TABLE scenarios ADD COLUMN tags JSON")
            if "knowledge_refs" not in scenario_columns:
                connection.exec_driver_sql("ALTER TABLE scenarios ADD COLUMN knowledge_refs JSON")
            if "coach_profile" not in scenario_columns:
                connection.exec_driver_sql("ALTER TABLE scenarios ADD COLUMN coach_profile JSON")
            if "opponent_state" not in scenario_columns:
                connection.exec_driver_sql("ALTER TABLE scenarios ADD COLUMN opponent_state JSON")
            if "schema_version" not in scenario_columns:
                connection.exec_driver_sql("ALTER TABLE scenarios ADD COLUMN schema_version INTEGER DEFAULT 2")
    # Additive migrations for installations upgraded from earlier releases.
    from sqlalchemy import inspect
    existing = {col["name"] for col in inspect(_engine).get_columns("sessions")}
    with _engine.begin() as connection:
        for name, ddl in {"version": "INTEGER NOT NULL DEFAULT 0", "pending_request_id": "VARCHAR",
                          "pending_since": "TIMESTAMP", "last_request_id": "VARCHAR", "last_response": "JSON"}.items():
            if name not in existing:
                connection.exec_driver_sql(f"ALTER TABLE sessions ADD COLUMN {name} {ddl}")
    if not settings.database_url.startswith("sqlite"):
        # create_all does not add columns to existing PostgreSQL tables.
        additive = {
            "sessions": {"difficulty_mode": "VARCHAR DEFAULT 'medium'", "target_turns": "INTEGER DEFAULT 10", "engine_mode": "VARCHAR DEFAULT 'auto'"},
            "scenarios": {"user_role": "VARCHAR DEFAULT 'Участник переговоров'", "scenario_type": "VARCHAR DEFAULT 'curated'", "tags": "JSON", "knowledge_refs": "JSON", "coach_profile": "JSON", "opponent_state": "JSON", "schema_version": "INTEGER DEFAULT 2"},
        }
        with _engine.begin() as connection:
            for table, columns in additive.items():
                existing_columns = {c["name"] for c in inspect(_engine).get_columns(table)}
                for name, ddl in columns.items():
                    if name not in existing_columns:
                        connection.exec_driver_sql(f"ALTER TABLE {table} ADD COLUMN {name} {ddl}")
    # Request middleware may resolve an anonymous principal before opening the
    # endpoint's DB session. Keep its already-loaded scalar attributes usable.
    _SessionLocal = sessionmaker(bind=_engine, autoflush=False, autocommit=False, expire_on_commit=False)


def get_sessionmaker():
    if _SessionLocal is None:
        init_db()
    return _SessionLocal


def get_db():
    db = get_sessionmaker()()
    try:
        yield db
    finally:
        db.close()
