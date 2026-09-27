"""Модели переговорной сессии и сообщений."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Literal

from pydantic import BaseModel, Field

from app.models.scenario import SessionStatus


class Message(BaseModel):
    role: Literal["user", "opponent", "assistant", "system"]
    content: str
    node_id: str | None = None
    interest_after: int | None = None
    violation: bool = False
    responder: str = ""
    model: str = ""
    latency_ms: int = 0
    fallback_used: bool = False
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class Session(BaseModel):
    id: str
    scenario_id: str
    user_id: str = "guest"
    mode: Literal["text", "voice"] = "text"
    difficulty_mode: Literal["easy", "medium", "hard"] = "medium"
    target_turns: int = 10
    engine_mode: Literal["auto", "cloud", "expert"] = "auto"
    status: SessionStatus = SessionStatus.active
    current_node_id: str
    interest: int
    messages: list[Message] = Field(default_factory=list)
    analysis: dict | None = None
    version: int = 0
    last_request_id: str | None = None
    last_response: dict | None = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    finished_at: datetime | None = None


class TurnResult(BaseModel):
    """Результат одного хода диалога."""
    reply: str
    node_id: str
    interest: int
    interest_adjust: int
    status: SessionStatus
    ended: bool
    violation: bool = False


class AnalysisResult(BaseModel):
    """Итоговый разбор переговоров."""
    praise: list[str]
    improvements: list[str]
    summary: str
    score: int
    skills: dict[str, int] = Field(default_factory=dict)
    analysis_id: str = ""
    turns_analyzed: int = 0
    source: str = ""
    knowledge_refs: list[str] = Field(default_factory=list)
    evidence: list[dict] = Field(default_factory=list)
