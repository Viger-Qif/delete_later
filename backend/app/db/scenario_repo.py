"""Репозиторий сценариев: CRUD поверх SQLAlchemy."""
from __future__ import annotations

from sqlalchemy.orm import Session

from app.db.database import ScenarioRow
from app.models.scenario import Difficulty, Graph, Interest, Persona, Scenario


def row_to_scenario(row: ScenarioRow) -> Scenario:
    return Scenario(
        id=row.id,
        title=row.title,
        description=row.description or "",
        difficulty=Difficulty(row.difficulty),
        industry=row.industry or "",
        modes=row.modes or ["text"],
        goal=row.goal or "",
        user_role=getattr(row, "user_role", None) or "Участник переговоров",
        constraints=row.constraints or [],
        opponent=Persona(**row.opponent),
        assistant=Persona(**row.assistant) if row.assistant else None,
        interest=Interest(**row.interest) if row.interest else Interest(),
        max_adjust=row.max_adjust or 25,
        graph=Graph(**row.graph),
        scenario_type=getattr(row, "scenario_type", None) or "curated",
        tags=getattr(row, "tags", None) or [],
        knowledge_refs=getattr(row, "knowledge_refs", None) or [],
        coach_profile=getattr(row, "coach_profile", None) or {},
        opponent_state=getattr(row, "opponent_state", None) or {},
        schema_version=getattr(row, "schema_version", None) or 2,
        published=row.published,
        archived=row.archived,
        owner_id=row.owner_id or "system",
    )


def scenario_to_row(sc: Scenario, row: ScenarioRow | None = None) -> ScenarioRow:
    if row is None:
        row = ScenarioRow(id=sc.id)
    row.title = sc.title
    row.description = sc.description
    row.difficulty = sc.difficulty.value
    row.industry = sc.industry
    row.modes = sc.modes
    row.goal = sc.goal
    row.user_role = sc.user_role
    row.constraints = sc.constraints
    row.opponent = sc.opponent.model_dump()
    row.assistant = sc.assistant.model_dump() if sc.assistant else None
    row.interest = sc.interest.model_dump()
    row.max_adjust = sc.max_adjust
    row.graph = sc.graph.model_dump(by_alias=True)
    row.scenario_type = sc.scenario_type
    row.tags = sc.tags
    row.knowledge_refs = sc.knowledge_refs
    row.coach_profile = sc.coach_profile
    row.opponent_state = sc.opponent_state
    row.schema_version = sc.schema_version
    row.published = sc.published
    row.archived = sc.archived
    row.owner_id = sc.owner_id
    return row


def get_scenario(db: Session, scenario_id: str) -> Scenario | None:
    row = db.get(ScenarioRow, scenario_id)
    return row_to_scenario(row) if row else None


def list_scenarios(
    db: Session,
    difficulty: str | None = None,
    industry: str | None = None,
    mode: str | None = None,
    published_only: bool = True,
    include_archived: bool = False,
    owner_id: str | None = None,
) -> list[Scenario]:
    q = db.query(ScenarioRow)
    if published_only:
        q = q.filter(ScenarioRow.published == True)  # noqa: E712
    if not include_archived:
        q = q.filter(ScenarioRow.archived == False)  # noqa: E712
    if owner_id is not None:
        q = q.filter(ScenarioRow.owner_id == owner_id)
    if difficulty:
        q = q.filter(ScenarioRow.difficulty == difficulty)
    if industry:
        q = q.filter(ScenarioRow.industry == industry)
    rows = q.all()
    if mode:
        rows = [r for r in rows if mode in (r.modes or [])]
    return [row_to_scenario(r) for r in rows]


def create_scenario(db: Session, sc: Scenario) -> Scenario:
    db.add(scenario_to_row(sc))
    db.commit()
    return sc


def update_scenario(db: Session, sc: Scenario) -> Scenario | None:
    row = db.get(ScenarioRow, sc.id)
    if row is None:
        return None
    scenario_to_row(sc, row)
    db.commit()
    return sc


def delete_scenario(db: Session, scenario_id: str, hard: bool = False) -> bool:
    row = db.get(ScenarioRow, scenario_id)
    if row is None:
        return False
    if hard:
        db.delete(row)
    else:
        row.archived = True
    db.commit()
    return True


def set_published(db: Session, scenario_id: str, published: bool) -> bool:
    row = db.get(ScenarioRow, scenario_id)
    if row is None:
        return False
    row.published = published
    db.commit()
    return True
