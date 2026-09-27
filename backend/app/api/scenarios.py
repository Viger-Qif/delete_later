from __future__ import annotations

import json
import time
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.api.schemas import PublishRequest, ScenarioCreate, ScenarioGenerateRequest, ScenarioRefineRequest
from app.auth import current_user
from app.core.config import get_settings
from app.db import scenario_repo
from app.db.database import get_db, get_sessionmaker
from app.engine.generator import ScenarioSafetyError, diagnose_graph, generate_scenario, refine_scenario, semantic_quality
from app.knowledge import get_retriever
from app.llm import get_llm_for_mode, runtime_info
from app.llm.base import LLMError
from app.models.scenario import (
    Difficulty,
    Edge,
    Graph,
    Interest,
    Node,
    NodeType,
    Persona,
    Scenario,
    Trigger,
)

router = APIRouter(prefix="/api/scenarios", tags=["scenarios"])


def _public_payload(sc: Scenario) -> dict:
    """Keep private opponent state in the engine, never in learner responses."""
    data = sc.model_dump(by_alias=True)
    data.pop("opponent_state", None)
    return data


def _current_user(request: Request, db: Session = Depends(get_db)):
    return current_user(request, db)


def _build_scenario(payload: ScenarioCreate, owner_id: str = "guest") -> Scenario:
    try:
        nodes = [Node(**n) for n in payload.graph.get("nodes", [])]
        edges = [Edge(**e) for e in payload.graph.get("edges", [])]
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=422, detail=f"Некорректный граф: {exc}") from exc

    graph = Graph(nodes=nodes, edges=edges)

    node_ids = {n.id for n in nodes}
    if not nodes:
        raise HTTPException(status_code=422, detail="Граф должен содержать хотя бы один узел")
    if len(node_ids) != len(nodes):
        raise HTTPException(status_code=422, detail="ID узлов должны быть уникальными")
    if len([n for n in nodes if n.type == NodeType.start]) != 1:
        raise HTTPException(status_code=422, detail="Граф должен содержать ровно один стартовый узел")
    if not any(n.type == NodeType.end for n in nodes):
        raise HTTPException(status_code=422, detail="В графе нет финального узла (type=end)")
    for e in edges:
        if e.from_ not in node_ids or e.to not in node_ids:
            raise HTTPException(
                status_code=422,
                detail=f"Ребро ссылается на несуществующий узел: {e.from_} -> {e.to}",
            )

    report = diagnose_graph(graph)
    if not report["valid"]:
        raise HTTPException(status_code=422, detail="; ".join(report["errors"]))

    try:
        opponent = Persona(**payload.opponent)
        assistant = Persona(**payload.assistant) if payload.assistant else None
        interest = Interest(**(payload.interest or {}))
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=422, detail=f"Некорректные данные: {exc}") from exc

    stored_description = payload.description
    if payload.scenario_type in {"user", "generated"} and not get_settings().persist_user_scenario_context:
        stored_description = f"Пользовательский сценарий «{payload.title}»"
    return Scenario(
        id=f"sc_{uuid.uuid4().hex[:12]}",
        title=payload.title,
        description=stored_description,
        difficulty=payload.difficulty,
        industry=payload.industry,
        modes=payload.modes,
        goal=payload.goal,
        user_role=payload.user_role,
        constraints=payload.constraints,
        opponent=opponent,
        assistant=assistant,
        interest=interest,
        max_adjust=payload.max_adjust,
        graph=graph,
        scenario_type=payload.scenario_type,
        tags=payload.tags,
        knowledge_refs=payload.knowledge_refs,
        coach_profile=payload.coach_profile,
        opponent_state=payload.opponent_state,
        schema_version=payload.schema_version,
        published=False,
        owner_id=owner_id,
    )


@router.get("")
def list_scenarios(
    request: Request,
    difficulty: str | None = Query(None),
    industry: str | None = Query(None),
    mode: str | None = Query(None),
    include_unpublished: bool = Query(False),
    include_archived: bool = Query(False),
):
    if difficulty and difficulty not in {d.value for d in Difficulty}:
        raise HTTPException(status_code=422, detail="Некорректная сложность")
    db: Session = get_sessionmaker()()
    try:
        owner_id = current_user(request, db).id if include_unpublished else None
        items = scenario_repo.list_scenarios(
            db,
            difficulty=difficulty,
            industry=industry,
            mode=mode,
            published_only=not include_unpublished,
            include_archived=include_archived,
            owner_id=owner_id,
        )
        return {"items": [_public_payload(s) for s in items]}
    finally:
        db.close()


@router.get("/{scenario_id}")
def get_scenario(scenario_id: str, user=Depends(_current_user)):
    db: Session = get_sessionmaker()()
    try:
        sc = scenario_repo.get_scenario(db, scenario_id)
        if sc is None or (not sc.published and sc.owner_id != user.id):
            raise HTTPException(status_code=404, detail="Сценарий не найден")
        return _public_payload(sc)
    finally:
        db.close()


@router.post("", status_code=201)
def create_scenario(payload: ScenarioCreate, user=Depends(_current_user)):
    sc = _build_scenario(payload, owner_id=user.id)
    db: Session = get_sessionmaker()()
    try:
        if not get_settings().persist_user_scenario_context:
            sc.description = f"Пользовательский сценарий «{sc.title}»"
        scenario_repo.create_scenario(db, sc)
        return _public_payload(sc)
    finally:
        db.close()


@router.post("/generate", status_code=201)
def generate(payload: ScenarioGenerateRequest, user=Depends(_current_user)):
    try:
        llm=get_llm_for_mode(payload.engine_mode);sc=generate_scenario(payload.description,llm,owner_id=user.id,allow_expert_repair=payload.engine_mode!="cloud")
    except ScenarioSafetyError as exc: raise HTTPException(status_code=422,detail=str(exc)) from exc
    except LLMError as exc: raise HTTPException(status_code=502,detail=f"Не удалось сгенерировать сценарий: {exc}") from exc
    db: Session = get_sessionmaker()()
    try:
        if not get_settings().persist_user_scenario_context:
            sc.description = f"Пользовательский сценарий «{sc.title}»"
        scenario_repo.create_scenario(db, sc)
        return _public_payload(sc)
    finally:
        db.close()


@router.post("/generate-preview")
def generate_preview(payload: ScenarioGenerateRequest, user=Depends(_current_user)):
    """Generate an editable draft without creating an orphan database row."""
    try:
        provider = get_llm_for_mode(payload.engine_mode)
        scenario = generate_scenario(
            payload.description,
            provider,
            owner_id=user.id,
            allow_expert_repair=payload.engine_mode != "cloud",
        )
        result = _public_payload(scenario)
        result["semantic_quality"] = semantic_quality(payload.description, scenario)
        return result
    except ScenarioSafetyError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except LLMError as exc:
        raise HTTPException(status_code=502, detail=f"Не удалось сгенерировать сценарий: {exc}") from exc


@router.post("/refine-preview")
def refine_preview(payload: ScenarioRefineRequest, user=Depends(_current_user)):
    """Refine the current editable graph without persisting an intermediate copy."""
    try:
        provider = get_llm_for_mode(payload.engine_mode)
        current = _build_scenario(payload.scenario, owner_id=user.id)
        scenario = refine_scenario(
            current,
            payload.instruction,
            provider,
            owner_id=user.id,
            allow_expert_repair=payload.engine_mode != "cloud",
        )
        return _public_payload(scenario)
    except ScenarioSafetyError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except LLMError as exc:
        raise HTTPException(status_code=502, detail=f"Не удалось изменить сценарий: {exc}") from exc


@router.post("/generate-stream")
def generate_stream(payload: ScenarioGenerateRequest, user=Depends(_current_user)):
    """NDJSON progress stream. Model generation is atomic; graph elements then arrive one by one."""
    def line(event: str, **data) -> bytes:
        return (json.dumps({"event": event, **data}, ensure_ascii=False) + "\n").encode("utf-8")

    def stream():
        yield line("status",stage="rag",text="Ищу релевантные методики и типовые возражения…")
        try:
            hits=get_retriever().search(payload.description,limit=6);provider=get_llm_for_mode(payload.engine_mode);label={"auto":"ИИ с экспертным резервом","cloud":"только облачный ИИ","expert":"экспертная система"}[payload.engine_mode]
            yield line("status",stage="model",text=f"{label} проектирует роли, этапы и развилки…",rag_chunks=len(hits),provider=payload.engine_mode)
            started=time.perf_counter();scenario=generate_scenario(payload.description,provider,owner_id=user.id,allow_expert_repair=payload.engine_mode!="cloud");generation_runtime=runtime_info(provider,round((time.perf_counter()-started)*1000));report=diagnose_graph(scenario.graph);report["semantic_quality"]=semantic_quality(payload.description,scenario)
            yield line("meta", id=scenario.id, title=scenario.title, description=scenario.description,
                       goal=scenario.goal, node_count=len(scenario.graph.nodes), edge_count=len(scenario.graph.edges),
                       diagnostics=report, runtime=generation_runtime)
            for index, node in enumerate(scenario.graph.nodes):
                yield line("node", index=index, total=len(scenario.graph.nodes), node=node.model_dump(mode="json"))
                time.sleep(0.07)
            for index, edge in enumerate(scenario.graph.edges):
                yield line("edge", index=index, total=len(scenario.graph.edges), edge=edge.model_dump(by_alias=True, mode="json"))
                time.sleep(0.025)
            db: Session = get_sessionmaker()()
            try:
                if not get_settings().persist_user_scenario_context:
                    scenario.description = f"Пользовательский сценарий «{scenario.title}»"
                scenario_repo.create_scenario(db, scenario)
            finally:
                db.close()
            yield line("complete", scenario=_public_payload(scenario), diagnostics=report, runtime=generation_runtime)
        except Exception as exc:
            yield line("error", detail=f"Не удалось построить сценарий: {exc}")

    return StreamingResponse(
        stream(),
        media_type="application/x-ndjson",
        headers={"Cache-Control": "no-store", "X-Accel-Buffering": "no"},
    )


@router.post("/validate")
def validate_scenario(payload: ScenarioCreate):
    scenario = _build_scenario(payload)
    report = diagnose_graph(scenario.graph)
    report["semantic_quality"] = semantic_quality(payload.description, scenario)
    if not report["semantic_quality"]["valid"]:
        report["warnings"].append("Граф слабо отражает пользовательский контекст или содержит меньше двух содержательных развилок.")
    return report


@router.put("/{scenario_id}")
def update_scenario(scenario_id: str, payload: ScenarioCreate, user=Depends(_current_user)):
    db: Session = get_sessionmaker()()
    try:
        existing = scenario_repo.get_scenario(db, scenario_id)
        if existing is None:
            raise HTTPException(status_code=404, detail="Сценарий не найден")
        if existing.owner_id != user.id:
            raise HTTPException(status_code=403, detail="Нельзя изменять чужой сценарий")
        updated = _build_scenario(payload, owner_id=existing.owner_id)
        updated.id = scenario_id
        updated.published = existing.published
        updated.archived = existing.archived
        scenario_repo.update_scenario(db, updated)
        return _public_payload(updated)
    finally:
        db.close()


@router.delete("/{scenario_id}")
def delete_scenario(scenario_id: str, hard: bool = Query(False), user=Depends(_current_user)):
    db: Session = get_sessionmaker()()
    try:
        existing = scenario_repo.get_scenario(db, scenario_id)
        if existing is None:
            raise HTTPException(status_code=404, detail="Сценарий не найден")
        if existing.owner_id != user.id:
            raise HTTPException(status_code=403, detail="Нельзя удалять чужой сценарий")
        scenario_repo.delete_scenario(db, scenario_id, hard=hard)
        return {"ok": True, "archived": not hard}
    finally:
        db.close()


@router.post("/{scenario_id}/publish")
def publish_scenario(scenario_id: str, payload: PublishRequest, user=Depends(_current_user)):
    db: Session = get_sessionmaker()()
    try:
        existing = scenario_repo.get_scenario(db, scenario_id)
        if existing is None:
            raise HTTPException(status_code=404, detail="Сценарий не найден")
        if existing.owner_id != user.id:
            raise HTTPException(status_code=403, detail="Нельзя публиковать чужой сценарий")
        if payload.published:
            report = diagnose_graph(existing.graph)
            if not report["valid"]:
                raise HTTPException(status_code=422, detail="; ".join(report["errors"]))
            quality = semantic_quality(existing.description, existing)
            if not quality["valid"]:
                raise HTTPException(status_code=422, detail="Перед публикацией усильте связь этапов с контекстом и добавьте минимум две содержательные развилки.")
        scenario_repo.set_published(db, scenario_id, payload.published)
        return {"ok": True, "published": payload.published}
    finally:
        db.close()


@router.post("/{scenario_id}/two-chairs", status_code=201)
def create_two_chairs_pair(scenario_id: str, user=Depends(_current_user)):
    """Режим «Два стула»: создать (или вернуть) перевёрнутого партнёра сценария.

    Диалог 2 проходит по тому же графу переговоров, но пользователь играет
    роль оппонента, а ИИ — исходную роль пользователя. Пара связывается
    полями inverted_of / two_chairs_pair; повторный вызов идемпотентен.
    """
    db: Session = get_sessionmaker()()
    try:
        sc = scenario_repo.get_scenario(db, scenario_id)
        if sc is None or (not sc.published and sc.owner_id != user.id):
            raise HTTPException(status_code=404, detail="Сценарий не найден")
        # Уже существующая пара возвращается без пересоздания.
        if sc.two_chairs_pair:
            partner = scenario_repo.get_scenario(db, sc.two_chairs_pair)
            if partner is not None:
                return {"scenario": _public_payload(sc), "inverted": _public_payload(partner), "created": False}
        existing_inverted = scenario_repo.get_scenario(db, f"{sc.id}_tc")
        if existing_inverted is not None and existing_inverted.inverted_of == sc.id:
            scenario_repo.update_scenario(db, sc.model_copy(update={"two_chairs_pair": existing_inverted.id}))
            return {"scenario": _public_payload(sc), "inverted": _public_payload(existing_inverted), "created": False}

        inverted = sc.inverted()
        inverted.owner_id = user.id if user.id != "system" else sc.owner_id
        sc_paired = sc.model_copy(update={"two_chairs_pair": inverted.id})
        try:
            scenario_repo.create_scenario(db, inverted)
        except Exception:  # гонка двух параллельных запросов — забираем существующего партнёра
            db.rollback()
            partner = scenario_repo.get_scenario(db, inverted.id)
            if partner is None:
                raise HTTPException(status_code=500, detail="Не удалось создать перевёрнутый сценарий")
            return {"scenario": _public_payload(sc), "inverted": _public_payload(partner), "created": False}
        scenario_repo.update_scenario(db, sc_paired)
        return {"scenario": _public_payload(sc_paired), "inverted": _public_payload(inverted), "created": True}
    finally:
        db.close()
