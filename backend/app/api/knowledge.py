from fastapi import APIRouter, HTTPException, Query

from app.knowledge import get_drills, get_retriever

router = APIRouter(prefix="/api/knowledge", tags=["knowledge"])


@router.get("/status")
def knowledge_status():
    status = get_retriever().status()
    status["drills"] = len(get_drills())
    return status


@router.get("/search")
def knowledge_search(
    q: str = Query(min_length=2, max_length=500),
    scenario_id: str | None = None,
    stage: str = "",
    limit: int = Query(default=5, ge=1, le=10),
):
    hits = get_retriever().search(q, scenario_id=scenario_id, stage=stage, limit=limit)
    return {"query": q, "items": [hit.as_dict() for hit in hits]}


@router.get("/methods")
def knowledge_methods(
    q: str = Query(default="", max_length=200),
    kind: str | None = Query(default=None),
    method_id: str | None = Query(default=None, max_length=80),
    level: str | None = Query(default=None, max_length=40),
    stage: str | None = Query(default=None, max_length=120),
):
    """Lightweight handbook index for the reference UI and future vector ingestion."""
    chunks = get_retriever().list_chunks(query=q, kind=kind)
    if method_id:
        chunks = [chunk for chunk in chunks if chunk.method_id == method_id]
    if level:
        chunks = [chunk for chunk in chunks if chunk.level == level]
    if stage:
        chunks = [chunk for chunk in chunks if stage.lower() in chunk.stage.lower()]
    return {
        "items": [
            {
                "id": chunk.id,
                "title": chunk.title,
                "kind": chunk.kind,
                "source": chunk.source,
                "tags": list(chunk.tags),
                "text": chunk.text,
                "method_id": chunk.method_id,
                "summary": chunk.summary,
                "steps": list(chunk.steps),
                "phrases": list(chunk.phrases),
                "antipatterns": list(chunk.antipatterns),
                "checks": list(chunk.checks),
                "stage": chunk.stage,
                "level": chunk.level,
                "related_ids": list(chunk.related_ids),
                "source_ref": chunk.source_ref,
                "lang": chunk.lang,
                "version": chunk.version,
            }
            for chunk in chunks
        ],
        "count": len(chunks),
    }


@router.get("/entry/{entry_id}")
def knowledge_entry(entry_id: str):
    chunk = get_retriever().get(entry_id)
    if chunk is None:
        raise HTTPException(status_code=404, detail="Карточка справочника не найдена")
    return {
        "id": chunk.id,
        "title": chunk.title,
        "kind": chunk.kind,
        "source": chunk.source,
        "tags": list(chunk.tags),
        "text": chunk.text,
        "method_id": chunk.method_id,
        "summary": chunk.summary,
        "steps": list(chunk.steps),
        "phrases": list(chunk.phrases),
        "antipatterns": list(chunk.antipatterns),
        "checks": list(chunk.checks),
        "stage": chunk.stage,
        "level": chunk.level,
        "related_ids": list(chunk.related_ids),
        "source_ref": chunk.source_ref,
        "lang": chunk.lang,
        "version": chunk.version,
    }


@router.get("/drills")
def knowledge_drills(
    method_id: str | None = Query(default=None, max_length=80),
    level: str | None = Query(default=None, max_length=40),
):
    rows = get_drills()
    if method_id:
        rows = [row for row in rows if row.get("method_id") == method_id]
    if level:
        rows = [row for row in rows if row.get("level") == level]
    return {"items": rows, "count": len(rows)}
