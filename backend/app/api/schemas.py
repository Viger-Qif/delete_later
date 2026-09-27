from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, field_validator

from app.models.scenario import Difficulty, SessionStatus
from app.models.session import Message


class RegisterRequest(BaseModel):
    email: str = Field(min_length=3, max_length=200)
    password: str = Field(min_length=8, max_length=200)
    display_name: str = Field(default="", max_length=120)


class LoginRequest(BaseModel):
    email: str = Field(min_length=3, max_length=200)
    password: str = Field(min_length=1, max_length=200)


class ScenarioCreate(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    description: str = Field(default="", max_length=3000)
    difficulty: Difficulty = Difficulty.medium
    industry: str = Field(default="", max_length=200)
    modes: list[Literal["text", "voice"]] = Field(default_factory=lambda: ["text"])
    goal: str = Field(default="", max_length=200)
    user_role: str = Field(default="Участник переговоров", max_length=200)
    constraints: list[str] = Field(default_factory=list)
    opponent: dict
    assistant: dict | None = None
    interest: dict = Field(default_factory=lambda: {"start": 50, "min": 0, "max": 100})
    max_adjust: int = 25
    graph: dict
    scenario_type: Literal["curated", "user", "generated"] = "user"
    tags: list[str] = Field(default_factory=list)
    knowledge_refs: list[str] = Field(default_factory=list)
    coach_profile: dict = Field(default_factory=dict)
    opponent_state: dict = Field(default_factory=dict)
    schema_version: int = 2

    @field_validator("constraints")
    @classmethod
    def validate_constraints(cls, values: list[str]) -> list[str]:
        if len(values) > 20 or any(len(item) > 200 for item in values) or sum(map(len, values)) > 2000:
            raise ValueError("Ограничения: не более 20 строк, 200 символов в строке и 2000 символов всего.")
        return values

    @field_validator("opponent", "assistant")
    @classmethod
    def validate_persona(cls, value: dict | None) -> dict | None:
        if value is not None and any(len(str(item)) > 200 for item in value.values()):
            raise ValueError("Поля роли, стиля и тона не должны превышать 200 символов.")
        return value

    @field_validator("tags", "knowledge_refs")
    @classmethod
    def validate_short_lists(cls, values: list[str]) -> list[str]:
        if len(values) > 30 or any(len(item) > 120 for item in values):
            raise ValueError("Слишком много элементов или один из элементов длиннее 120 символов.")
        return values

    @field_validator("coach_profile", "opponent_state")
    @classmethod
    def validate_structured_size(cls, value: dict) -> dict:
        import json
        if len(json.dumps(value, ensure_ascii=False)) > 5000:
            raise ValueError("Расширенные настройки не должны превышать 5000 символов.")
        return value

    @field_validator("graph")
    @classmethod
    def validate_graph_size(cls, value: dict) -> dict:
        import json
        if len(json.dumps(value, ensure_ascii=False)) > 50000:
            raise ValueError("Граф не должен превышать 50000 символов.")
        return value


class ScenarioGenerateRequest(BaseModel):
    engine_mode: Literal["auto", "cloud", "expert"] = "auto"
    description: str = Field(min_length=10, max_length=7000, description="Описание и ограниченные поля сценария")


class ScenarioRefineRequest(BaseModel):
    engine_mode: Literal["auto", "cloud", "expert"] = "auto"
    instruction: str = Field(min_length=3, max_length=1000)
    scenario: ScenarioCreate


class PublishRequest(BaseModel):
    published: bool


class SessionCreate(BaseModel):
    scenario_id: str
    mode: Literal["text", "voice"] = "text"
    difficulty_mode: Literal["easy", "medium", "hard"] = "medium"
    target_turns: int = Field(default=10, ge=4, le=20)
    engine_mode: Literal["auto", "cloud", "expert"] = "auto"


class TurnRequest(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
    version: int = Field(ge=0)
    request_id: str = Field(min_length=8, max_length=100)


class HintRequest(BaseModel):
    question: str = Field(default="", max_length=200)


class LearningAttemptRequest(BaseModel):
    exercise_id: str = Field(min_length=3, max_length=120)
    answer: str = Field(min_length=1, max_length=2000)


class LearningDialogueAttemptRequest(BaseModel):
    step_index: int = Field(ge=0, le=10)
    answer: str = Field(min_length=1, max_length=2000)


class LearningReplayRequest(BaseModel):
    message_index: int = Field(ge=0, le=200)
    message: str = Field(min_length=1, max_length=2000)


class LocalReplayRequest(BaseModel):
    scenario_id: str = Field(min_length=1, max_length=120)
    message_index: int = Field(ge=0, le=200)
    original: str = Field(min_length=1, max_length=2000)
    message: str = Field(min_length=1, max_length=2000)
    node_id: str = Field(default="", max_length=120)
    interest_before: int = Field(default=50, ge=0, le=100)
    exercise_id: str = Field(default="drill-spin-02", max_length=120)
    prefix: list[dict] = Field(default_factory=list, max_length=20)

    @field_validator("prefix")
    @classmethod
    def validate_prefix(cls, value: list[dict]) -> list[dict]:
        clean = []
        for item in value:
            if item.get("role") not in {"user", "opponent"}:
                continue
            clean.append({
                "role": item["role"],
                "content": str(item.get("content", ""))[:2000],
                "node_id": str(item.get("node_id", ""))[:120] or None,
                "interest_after": item.get("interest_after"),
                "created_at": str(item.get("created_at", ""))[:80] or None,
            })
        return clean[-20:]


class LearningReflectionRequest(BaseModel):
    source_type: Literal["dialogue", "exercise", "replay"] = "dialogue"
    source_id: str = Field(min_length=1, max_length=120)
    answers: dict[str, str] = Field(default_factory=dict)

    @field_validator("answers")
    @classmethod
    def validate_answers(cls, value: dict[str, str]) -> dict[str, str]:
        if len(value) > 10 or any(len(str(item)) > 1200 for item in value.values()):
            raise ValueError("Каждый ответ рефлексии должен быть короче 1200 символов.")
        return value


class LearningCoachRequest(BaseModel):
    exercise_id: str = Field(min_length=3, max_length=120)
    answer: str = Field(min_length=1, max_length=2000)


class MessageOut(BaseModel):
    role: str
    content: str
    node_id: str | None = None
    interest_after: int | None = None
    created_at: str


class TurnOut(BaseModel):
    reply: str
    node_id: str
    interest: int
    interest_adjust: int
    status: SessionStatus
    ended: bool


class SessionOut(BaseModel):
    id: str
    scenario_id: str
    mode: str
    difficulty_mode: str
    status: SessionStatus
    current_node_id: str
    interest: int
    messages: list[MessageOut]
    analysis: dict | None = None
    created_at: str
    finished_at: str | None = None
