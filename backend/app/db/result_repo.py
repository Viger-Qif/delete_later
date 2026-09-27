from app.db.database import ResultSummaryRow


def _safe_analysis(analysis):
    """Keep aggregate learning signals only: never quotes or generated prose."""
    if not analysis:
        return None
    return {
        "score": analysis.get("score"),
        "skills": analysis.get("skills") or {},
        "knowledge_refs": analysis.get("knowledge_refs") or [],
        "turns_analyzed": analysis.get("turns_analyzed"),
        "source": analysis.get("source"),
    }


def save(db, s, title, reason):
    analysis = s.analysis or {}
    row = db.get(ResultSummaryRow, s.id) or ResultSummaryRow(id=s.id)
    row.scenario_id = s.scenario_id
    row.scenario_title = title
    row.user_id = s.user_id
    row.mode = s.mode
    row.difficulty_mode = s.difficulty_mode
    row.engine_mode = s.engine_mode
    row.status = s.status.value
    row.end_reason = reason
    row.interest = s.interest
    row.turns = sum(m.role == "user" for m in s.messages)
    row.violation_count = sum(m.role == "user" and m.violation for m in s.messages)
    row.score = analysis.get("score")
    row.analysis = _safe_analysis(analysis)
    row.created_at = s.created_at
    row.finished_at = s.finished_at
    db.add(row)
    db.commit()


def out(row):
    return {
        "id": row.id, "scenario_id": row.scenario_id, "scenario_title": row.scenario_title,
        "mode": row.mode, "difficulty_mode": row.difficulty_mode, "engine_mode": row.engine_mode,
        "status": row.status, "end_reason": row.end_reason, "interest": row.interest,
        "turns": row.turns, "violation_count": row.violation_count, "score": row.score,
        "analysis": row.analysis, "created_at": row.created_at.isoformat(),
        "finished_at": row.finished_at.isoformat(),
    }


def list_all(db, user="guest"):
    rows = (
        db.query(ResultSummaryRow)
        .filter(ResultSummaryRow.user_id == user)
        .order_by(ResultSummaryRow.finished_at.desc())
        .limit(50)
        .all()
    )
    changed = False
    for row in rows:
        safe = _safe_analysis(row.analysis)
        if row.analysis != safe:
            row.analysis = safe
            changed = True
    if changed:
        db.commit()
    return [out(row) for row in rows]
