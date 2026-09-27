"""Доменные модели сценария переговоров.

Центральный контракт проекта: одна структура на БД, API, движок и ИИ-генерацию.
"""
from __future__ import annotations

from enum import Enum
from typing import Literal

from pydantic import BaseModel, Field


class Difficulty(str, Enum):
    easy = "easy"
    medium = "medium"
    hard = "hard"


class NodeType(str, Enum):
    start = "start"
    phase = "phase"
    end = "end"


class TriggerType(str, Enum):
    intent = "intent"
    keyword = "keyword"


class EndOutcome(str, Enum):
    success = "success"
    failure = "failure"
    neutral = "neutral"


class SessionStatus(str, Enum):
    active = "active"
    success = "success"
    failure = "failure"
    abandoned = "abandoned"


class Persona(BaseModel):
    role: str
    style: str
    tone: str = "формальный"


class Interest(BaseModel):
    start: int = 50
    min: int = 0
    max: int = 100


class Trigger(BaseModel):
    type: TriggerType
    value: str | list[str]


class Node(BaseModel):
    id: str
    type: NodeType
    label: str
    description: str = ""
    interest_delta: int = 0
    prompt_hint: str = ""
    outcome: EndOutcome | None = None
    # Служебный слой обучения: не показывается оппоненту, но используется
    # коучем, анализом и будущей малой моделью маршрутизации подсказок.
    knowledge_refs: list[str] = Field(default_factory=list)
    coach_hint: str = ""
    coach_focus: list[str] = Field(default_factory=list)
    watch_for: list[str] = Field(default_factory=list)
    avoid: list[str] = Field(default_factory=list)
    why_needed: str = ""
    rationale_source: Literal["user_context", "method", "manual", "model"] = "model"


class Edge(BaseModel):
    from_: str = Field(alias="from")
    to: str
    trigger: Trigger

    model_config = {"populate_by_name": True}


class Graph(BaseModel):
    nodes: list[Node]
    edges: list[Edge]


class Scenario(BaseModel):
    id: str
    title: str
    description: str = ""
    difficulty: Difficulty = Difficulty.medium
    industry: str = ""
    modes: list[Literal["text", "voice"]] = Field(default_factory=lambda: ["text"])
    goal: str = ""
    user_role: str = "Участник переговоров"
    constraints: list[str] = Field(default_factory=list)
    opponent: Persona
    assistant: Persona | None = None
    interest: Interest = Field(default_factory=Interest)
    max_adjust: int = 25
    graph: Graph
    scenario_type: Literal["curated", "user", "generated"] = "curated"
    tags: list[str] = Field(default_factory=list)
    knowledge_refs: list[str] = Field(default_factory=list)
    coach_profile: dict = Field(default_factory=dict)
    # Private, structured state used to keep a curated opponent consistent.
    # It is never part of learner-facing copy or coach output.
    opponent_state: dict = Field(default_factory=dict)
    schema_version: int = 2
    published: bool = False
    archived: bool = False
    owner_id: str = "system"

    # helpers
    def start_node_id(self) -> str:
        for n in self.graph.nodes:
            if n.type == NodeType.start:
                return n.id
        return self.graph.nodes[0].id

    def node_by_id(self, node_id: str) -> Node | None:
        return next((n for n in self.graph.nodes if n.id == node_id), None)

    def edges_from(self, node_id: str) -> list[Edge]:
        return [e for e in self.graph.edges if e.from_ == node_id]
