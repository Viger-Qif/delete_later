"""Репозиторий сценариев: CRUD поверх SQLAlchemy."""
from __future__ import annotations

import logging

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db.database import ScenarioRow
from app.models.scenario import Difficulty, Graph, Interest, Persona, Scenario

logger = logging.getLogger(__name__)

TC_SUFFIX = "_tc"  # детерминированный суффикс инвертированного сценария (см. Scenario.inverted)


def get_scenario(db: Session, scenario_id: str) -> Scenario | None:
    row = db.get(ScenarioRow, scenario_id)
    if row is not None:
        return row_to_scenario(row)
    # Самоисцеление режима «Два стула»: id вида <base>_tc детерминированно
    # выводится из базового сценария через inverted(). Если инвертированный
    # сценарий пропал (перезапуск сервера, пересозданная БД), молча
    # воссоздаём его из базового и кэшируем. 404 остаётся только для
    # реально несуществующих базовых id.
    #
    # ВАЖНО (баг, из-за которого восстановление не срабатывало): восстановленный
    # сценарий создавался с published=False (см. Scenario.inverted) и owner_id
    # "guest". GET /api/scenarios/{id} отклоняет неопубликованный сценарий,
    # если его owner != текущий пользователь, — то есть строка в БД появлялась,
    # но эндпоинт всё равно отдавал 404. Теперь восстановленная копия наследует
    # published/owner_id базового сценария.
    if scenario_id and scenario_id.endswith(TC_SUFFIX):
        base_id = scenario_id[: -len(TC_SUFFIX)]
        base_row = db.get(ScenarioRow, base_id)
        print(f"[two-chairs] get_scenario({scenario_id!r}): строки нет в БД; "
              f"базовый {base_id!r} {'найден' if base_row is not None else 'НЕ найден'} — "
              f"пробуем восстановить через inverted()", flush=True)
        if base_row is not None:
            try:
                inverted = row_to_scenario(base_row).inverted()
                # Инвертированный сценарий служебный: наследует владельца и
                # флаг публикации базового, иначе GET /api/scenarios/{id}
                # отфильтрует его как чужой/неопубликованный и вернёт 404,
                # даже после успешного восстановления строки.
                inverted.owner_id = base_row.owner_id or "system"
                inverted.published = bool(base_row.published)
                create_scenario(db, inverted)
                print(f"[two-chairs] восстановлен инвертированный сценарий "
                      f"{scenario_id!r} из {base_id!r} (owner={inverted.owner_id}, "
                      f"published={inverted.published})", flush=True)
                logger.info("two-chairs: восстановлен инвертированный сценарий %s из %s", scenario_id, base_id)
                return inverted
            except IntegrityError:
                # гонка двух параллельных запросов — забираем существующую строку
                db.rollback()
                row = db.get(ScenarioRow, scenario_id)
                if row is not None:
                    print(f"[two-chairs] гонка: {scenario_id!r} уже создан параллельным запросом", flush=True)
                    return row_to_scenario(row)
            except Exception:  # не роняем обычный 404 из-за сбоя восстановления
                db.rollback()
                print(f"[two-chairs] СБОЙ восстановления {scenario_id!r}", flush=True)
                logger.exception("two-chairs: не удалось восстановить инвертированный сценарий %s", scenario_id)
    return None


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
        two_chairs_pair=getattr(row, "two_chairs_pair", None),
        inverted_of=getattr(row, "inverted_of", None),
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
    row.two_chairs_pair = sc.two_chairs_pair
    row.inverted_of = sc.inverted_of
    return row


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
