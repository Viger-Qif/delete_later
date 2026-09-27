from datetime import datetime, timezone

from fastapi.testclient import TestClient

from app.db.database import LearningAttemptRow, LearningReflectionRow, SessionRow, get_sessionmaker
from app.main import app
from app.db import scenario_repo
from app.api.learning import _exercise_map, _visible_learning_text


def test_machine_learning_ids_are_not_learner_facing():
    text = _visible_learning_text(
        "Упражнение drill-spin-01 опирается на spin-problem-questions.",
        _exercise_map(),
    )
    assert "drill-spin-01" not in text
    assert "spin-problem-questions" not in text
    assert "материал SPIN" in text


def test_learning_catalog_attempt_and_progress():
    with TestClient(app) as client:
        catalog = client.get("/api/learning/catalog")
        assert catalog.status_code == 200
        payload = catalog.json()
        assert len(payload["exercises"]) >= 18
        assert payload["content_version"] == "1.2.0"
        assert payload["mini_dialogues"]

        progress_before = client.get("/api/learning/progress")
        assert progress_before.status_code == 200

        attempt = client.post(
            "/api/learning/attempt",
            json={
                "exercise_id": "drill-spin-01",
                "answer": "Где текущая схема всё же требует ручного вмешательства?",
            },
        )
        assert attempt.status_code == 200
        assert attempt.json()["passed"] is True

        dialogue = client.post(
            "/api/learning/dialogues/spin-salary-discovery-01/step",
            json={
                "step_index": 0,
                "answer": "Какая часть текущей системы роста не позволяет понять следующий уровень?",
            },
        )
        assert dialogue.status_code == 200
        assert dialogue.json()["next_step"]["index"] == 1

        progress_after = client.get("/api/learning/progress")
        assert progress_after.json()["attempts"] >= progress_before.json()["attempts"] + 2
        assert progress_after.json()["skills"]
        assert "next_exercise" in progress_after.json()
        assert "due_count" in progress_after.json()


def test_learning_review_and_reflection_are_persisted():
    with TestClient(app) as client:
        failed = client.post(
            "/api/learning/attempt",
            json={"exercise_id": "drill-spin-07", "answer": "Мы покажем вам продукт."},
        )
        assert failed.status_code == 200
        assert failed.json()["passed"] is False
        next_item = client.get("/api/learning/next")
        assert next_item.status_code == 200
        assert next_item.json()["item"]["kind"] == "review"
        reflection = client.post(
            "/api/learning/reflection",
            json={
                "source_type": "dialogue",
                "source_id": "spin-salary-discovery-01",
                "answers": {"tried": "Задал вопрос", "next": "Сначала исследую проблему"},
            },
        )
        assert reflection.status_code == 200
        assert reflection.json()["saved"] is True
        db = get_sessionmaker()()
        try:
            attempt_row = db.query(LearningAttemptRow).order_by(LearningAttemptRow.created_at.desc()).first()
            reflection_row = db.query(LearningReflectionRow).order_by(LearningReflectionRow.created_at.desc()).first()
            assert attempt_row.answer == ""
            assert attempt_row.feedback == ""
            assert "improved_answer" not in (attempt_row.evaluation or {})
            assert reflection_row.answers == {"answer_count": 2, "stored_locally": True}
        finally:
            db.close()


def test_learning_replay_requires_existing_session():
    with TestClient(app) as client:
        response = client.get("/api/learning/replay/not-a-session")
        assert response.status_code == 404


def test_learning_replay_runs_against_pre_turn_state():
    session_id = "learning-replay-test-session"
    with TestClient(app) as client:
        user_id = client.get("/api/auth/current").json()["user"]["id"]
        db = get_sessionmaker()()
        try:
            scenario = scenario_repo.get_scenario(db, "sc_salary_complete_v3")
            db.query(SessionRow).filter(SessionRow.id == session_id).delete()
            db.add(SessionRow(
                id=session_id,
                scenario_id=scenario.id,
                user_id=user_id,
                mode="text",
                difficulty_mode="medium",
                target_turns=10,
                engine_mode="expert",
                status="success",
                current_node_id=scenario.start_node_id(),
                interest=50,
                created_at=datetime.now(timezone.utc).replace(tzinfo=None),
                messages=[
                    {
                        "role": "user",
                        "content": "Я хочу повышение на 15% уже в этом месяце.",
                        "node_id": scenario.start_node_id(),
                        "created_at": "2026-01-01T00:00:00Z",
                    },
                    {
                        "role": "opponent",
                        "content": "Расскажите подробнее.",
                        "node_id": scenario.start_node_id(),
                        "interest_after": 50,
                        "created_at": "2026-01-01T00:00:01Z",
                    },
                ],
                analysis={
                    "skills": {"questions": 40, "value": 55},
                    "evidence": [{
                        "turn_index": 1,
                        "quote": "Я хочу повышение на 15% уже в этом месяце.",
                        "skill_id": "spin.problem",
                    }],
                },
            ))
            db.commit()
        finally:
            db.close()

        info = client.get(f"/api/learning/replay/{session_id}")
        assert info.status_code == 200
        assert info.json()["message_index"] == 0

        replay = client.post(
            f"/api/learning/replay/{session_id}/turn",
            json={
                "message_index": 0,
                "message": "Какие критерии определяют следующий уровень ответственности?",
            },
        )
        assert replay.status_code == 200
        assert replay.json()["replay"] is True
        assert replay.json()["original"].startswith("Я хочу повышение")
        assert replay.json()["replacement"].startswith("Какие критерии")


def test_local_replay_uses_transient_context_only():
    with TestClient(app) as client:
        response = client.post(
            "/api/learning/local-replay/turn",
            json={
                "scenario_id": "sc_salary_complete_v3",
                "message_index": 0,
                "original": "Я хочу повышение.",
                "message": "Какие критерии определяют следующий уровень ответственности?",
                "node_id": "start",
                "interest_before": 50,
                "exercise_id": "drill-spin-01",
                "prefix": [],
            },
        )
        assert response.status_code == 200
        assert response.json()["local"] is True
        db = get_sessionmaker()()
        try:
            latest = db.query(LearningAttemptRow).order_by(LearningAttemptRow.created_at.desc()).first()
            assert latest.answer == ""
            assert "Я хочу повышение" not in str(latest.evaluation)
        finally:
            db.close()