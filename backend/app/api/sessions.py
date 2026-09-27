from __future__ import annotations

import time
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.api.schemas import HintRequest, SessionCreate, TurnRequest
from app.auth import current_user
from app.db import result_repo, scenario_repo, session_repo
from app.db.database import get_db, get_sessionmaker
from app.engine.analysis import analyze
from app.engine.dialogue import DialogueEngine
from app.llm import LLMQuotaError, get_llm_for_mode, runtime_info
from app.llm.base import LLMError
from app.models.scenario import SessionStatus
from app.models.session import Message, Session as SessionModel

router = APIRouter(prefix="/api/sessions", tags=["sessions"])

def _current_user(request: Request, db: Session = Depends(get_db)):
    return current_user(request, db)


def _load(db: Session, session_id: str, user_id: str) -> SessionModel:
    s = session_repo.get_session(db, session_id)
    if s is None:
        raise HTTPException(status_code=404, detail="Сессия не найдена")
    if s.user_id != user_id:
        # Do not reveal whether a guessed foreign identifier exists.
        raise HTTPException(status_code=404, detail="Сессия не найдена")
    if any(message.role == "assistant" for message in s.messages):
        s.messages = [message for message in s.messages if message.role != "assistant"]
        session_repo.save_session(db, s)
    return s


@router.post("", status_code=201)
def create_session(payload: SessionCreate, user=Depends(_current_user)):
    db: Session = get_sessionmaker()()
    try:
        session_repo.purge_expired_sensitive_data(db)
        sc = scenario_repo.get_scenario(db, payload.scenario_id)
        if sc is None:
            raise HTTPException(status_code=404, detail="Сценарий не найден")
        # A private user scenario must not become playable merely because
        # somebody guessed its ID.  Public curated scenarios remain available
        # to everyone, while drafts are limited to their owner.
        if not sc.published and sc.owner_id != user.id:
            raise HTTPException(status_code=404, detail="Сценарий не найден")
        if payload.mode not in sc.modes:
            raise HTTPException(status_code=422, detail=f"Сценарий не поддерживает режим {payload.mode}")

        try: get_llm_for_mode(payload.engine_mode)
        except LLMError as exc: raise HTTPException(status_code=503,detail=str(exc)) from exc
        start_node = sc.node_by_id(sc.start_node_id())
        # Session creation must be instant and independent of model latency.
        greeting = (start_node.prompt_hint if start_node else "") or (
            "Добрый день. Обозначьте, пожалуйста, тему и желаемый результат разговора."
        )

        s = SessionModel(
            id=f"ses_{uuid.uuid4().hex[:12]}",
            scenario_id=sc.id,
            user_id=user.id,
            mode=payload.mode,
            difficulty_mode=payload.difficulty_mode,
            target_turns=payload.target_turns,
            engine_mode=payload.engine_mode,
            status=SessionStatus.active,
            current_node_id=sc.start_node_id(),
            interest=sc.interest.start,
            messages=[
                Message(role="opponent",content=greeting,node_id=sc.start_node_id(),interest_after=sc.interest.start,responder="scripted",model="scenario-start",latency_ms=0)
            ],
        )
        session_repo.create_session(db, s)
        return _session_out(s, sc.title)
    finally:
        db.close()


@router.get("")
def list_sessions(user=Depends(_current_user)):
    db: Session = get_sessionmaker()()
    try:
        session_repo.purge_expired_sensitive_data(db)
        items = session_repo.list_sessions(db, user.id)
        out = []
        for s in items:
            sc = scenario_repo.get_scenario(db, s.scenario_id)
            out.append(_session_out(s, sc.title if sc else s.scenario_id, brief=True))
        return {"items": out}
    finally:
        db.close()


@router.get("/results")
def list_results(user=Depends(_current_user)):
 db=get_sessionmaker()()
 try:
  session_repo.purge_expired_sensitive_data(db)
  return {"items":result_repo.list_all(db,user.id)}
 finally:db.close()


@router.post("/results/{session_id}/analyze")
def analyze_result(session_id: str, user=Depends(_current_user)):
    db = get_sessionmaker()()
    try:
        s = _load(db, session_id, user.id)
        if s.status == SessionStatus.active:
            raise HTTPException(status_code=409, detail="Сессия ещё активна")
        if not s.messages:
            raise HTTPException(status_code=410, detail="Полный диалог уже удалён с сервера. Разбор доступен только в исходном браузере.")
        if s.analysis:
            return s.analysis
        sc = scenario_repo.get_scenario(db, s.scenario_id)
        if not sc:
            raise HTTPException(status_code=404, detail="Сценарий не найден")
        try:
            provider = get_llm_for_mode(s.engine_mode)
            started = time.perf_counter()
            analysis = analyze(sc, s.messages, s.status, s.interest, provider).model_dump()
            analysis["runtime"] = runtime_info(provider, round((time.perf_counter() - started) * 1000))
        except LLMError as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc
        # The full report is returned once to the browser.  The database keeps
        # only aggregate metrics; transcript, quotes and generated prose are removed.
        s.analysis = analysis
        existing = result_repo.list_all(db, user.id)
        reason = next((item["end_reason"] for item in existing if item["id"] == session_id), "")
        result_repo.save(db, s, sc.title, reason)
        session_repo.minimize_sensitive_data(db, session_id)
        return analysis
    finally:
        db.close()


@router.get("/results/{session_id}")
def get_result(session_id: str, user=Depends(_current_user)):
    db = get_sessionmaker()()
    try:
        from app.db.database import ResultSummaryRow
        row = db.get(ResultSummaryRow, session_id)
        if row is None or row.user_id != user.id:
            raise HTTPException(status_code=404, detail="Результат пока не готов")
        return result_repo.out(row)
    finally:
        db.close()


@router.get("/{session_id}")
def get_session(session_id: str, user=Depends(_current_user)):
    db: Session = get_sessionmaker()()
    try:
        s = _load(db, session_id, user.id)
        sc = scenario_repo.get_scenario(db, s.scenario_id)
        return _session_out(s, sc.title if sc else s.scenario_id)
    finally:
        db.close()


@router.post("/{session_id}/turn")
def take_turn(session_id: str, payload: TurnRequest, user=Depends(_current_user)):
    db: Session = get_sessionmaker()()
    claimed = False
    try:
        s = _load(db, session_id, user.id)
        if s.last_request_id == payload.request_id and s.last_response is not None:
            return s.last_response
        if s.status != SessionStatus.active:
            raise HTTPException(status_code=409, detail="Сессия уже завершена")
        if s.version != payload.version or not session_repo.claim_turn(db, s.id, s.version, payload.request_id):
            raise HTTPException(status_code=409, detail="Сессия изменилась или предыдущий ход ещё выполняется. Обновите диалог.")
        claimed = True

        sc = scenario_repo.get_scenario(db, s.scenario_id)
        if sc is None:
            raise HTTPException(status_code=404, detail="Сценарий сессии не найден")

        try: provider=get_llm_for_mode(s.engine_mode)
        except LLMError as exc: raise HTTPException(status_code=503,detail=str(exc)) from exc
        engine=DialogueEngine(sc,provider,difficulty_mode=s.difficulty_mode);s.messages.append(Message(role="user",content=payload.message,node_id=s.current_node_id));started=time.perf_counter()
        try:
            result = engine.step(s.messages, s.current_node_id, s.interest, payload.message, max_user_turns=s.target_turns)
        except LLMQuotaError as exc:
            raise HTTPException(status_code=503, detail=str(exc), headers={"X-LLM-Error": "quota"}) from exc
        except LLMError as exc:
            raise HTTPException(status_code=503, detail=f"ИИ временно недоступен: {exc}") from exc

        answer_runtime=runtime_info(provider,round((time.perf_counter()-started)*1000));s.messages[-1].violation=result.violation
        s.messages.append(Message(role="opponent",content=result.reply,node_id=result.node_id,interest_after=result.interest,responder=answer_runtime["responder"],model=answer_runtime["model"],latency_ms=answer_runtime["latency_ms"],fallback_used=answer_runtime["fallback_used"]))
        s.current_node_id = result.node_id
        s.interest = result.interest

        if result.ended:
            s.status = result.status
            s.finished_at = datetime.now(timezone.utc)
            # Analysis runs on /results/{id}/analyze, after the turn has committed.

        response = {
            "reply": result.reply,
            "version": s.version + 1,
            "request_id": payload.request_id,
            "node_id": result.node_id,
            "interest": result.interest,
            "interest_adjust": result.interest_adjust,
            "status": s.status.value,
            "ended": result.ended,
            "violation": result.violation,
            "analysis": s.analysis,
            "end_reason": ("misconduct" if result.ended and result.violation else "agreement" if result.ended and s.status == SessionStatus.success else "no_agreement" if result.ended else None),
            **answer_runtime,
        }
        if not session_repo.complete_turn(db, s, payload.request_id, response):
            raise HTTPException(status_code=409, detail="Состояние сессии изменилось во время хода.")
        claimed = False
        if result.ended:
            result_repo.save(db,s,sc.title,response["end_reason"])
        return response
    finally:
        if claimed:
            db.rollback()
            session_repo.release_turn(db, session_id, payload.request_id)
        db.close()


@router.post("/{session_id}/hint")
def get_hint(session_id: str, payload: HintRequest | None = None, user=Depends(_current_user)):
    db: Session = get_sessionmaker()()
    try:
        s = _load(db, session_id, user.id)
        if s.status != SessionStatus.active:
            raise HTTPException(status_code=409, detail="Сессия уже завершена")
        if s.difficulty_mode == "hard":
            raise HTTPException(status_code=403, detail="В сложном режиме советник отключён")
        if not any(message.role == "user" for message in s.messages):
            raise HTTPException(
                status_code=409,
                detail="Фиделина сможет разобрать ситуацию после вашей первой реплики.",
            )
        sc = scenario_repo.get_scenario(db, s.scenario_id)
        if sc is None:
            raise HTTPException(status_code=404, detail="Сценарий не найден")
        try: provider=get_llm_for_mode(s.engine_mode)
        except LLMError as exc: raise HTTPException(status_code=503,detail=str(exc)) from exc
        engine=DialogueEngine(sc,provider,difficulty_mode=s.difficulty_mode);started=time.perf_counter()
        try:
            hint = engine.get_assistant_hint(s.current_node_id, s.messages, payload.question if payload else "")
        except LLMQuotaError as exc:
            raise HTTPException(status_code=503, detail=str(exc), headers={"X-LLM-Error": "quota"}) from exc
        except LLMError as exc:
            raise HTTPException(status_code=503, detail=f"ИИ временно недоступен: {exc}") from exc
        return {"hint":hint,"coach":engine.coach_metadata(s.current_node_id),**runtime_info(provider,round((time.perf_counter()-started)*1000))}
    finally:
        db.close()


@router.post("/{session_id}/abandon")
def abandon_session(session_id: str, user=Depends(_current_user)):
    db: Session = get_sessionmaker()()
    claim_id = f"abandon-{uuid.uuid4().hex}"
    claimed = False
    try:
        s = _load(db, session_id, user.id)
        if s.status != SessionStatus.active:
            raise HTTPException(status_code=409, detail="Сессия уже завершена")
        sc = scenario_repo.get_scenario(db, s.scenario_id)
        if not session_repo.claim_turn(db, s.id, s.version, claim_id):
            raise HTTPException(status_code=409, detail="Предыдущий ход ещё выполняется. Повторите позже.")
        claimed = True
        s.status = SessionStatus.abandoned
        s.finished_at = datetime.now(timezone.utc)
        response = {"ok": True, "status": s.status.value, "analysis": s.analysis, "end_reason": "abandoned"}
        session_repo.save_session(db, s)
        session_repo.release_turn(db, s.id, claim_id)
        claimed = False
        result_repo.save(db,s,sc.title if sc else s.scenario_id,"abandoned")
        session_repo.minimize_sensitive_data(db, s.id)
        return response
    finally:
        if claimed:
            db.rollback()
            session_repo.release_turn(db, session_id, claim_id)
        db.close()


def _session_out(s: SessionModel, scenario_title: str, brief: bool = False) -> dict:
    data = {
        "id": s.id,
        "scenario_id": s.scenario_id,
        "scenario_title": scenario_title,
        "mode": s.mode,
        "difficulty_mode": s.difficulty_mode,
        "target_turns": s.target_turns,
        "engine_mode": s.engine_mode,
        "status": s.status.value,
        "current_node_id": s.current_node_id,
        "interest": s.interest,
        "version": s.version,
        "turns": sum(m.role == "user" for m in s.messages),
        "created_at": s.created_at.isoformat(),
        "finished_at": s.finished_at.isoformat() if s.finished_at else None,
    }
    if not brief:
        data["messages"] = [
            {
                "role": m.role,
                "content": m.content,
                "node_id": m.node_id,
                "interest_after": m.interest_after,
                "violation":m.violation,"responder":m.responder,"model":m.model,"latency_ms":m.latency_ms,"fallback_used":m.fallback_used,
                "created_at": m.created_at.isoformat(),
            }
            for m in s.messages if m.role != "assistant"
        ]
        data["analysis"] = s.analysis
    return data
