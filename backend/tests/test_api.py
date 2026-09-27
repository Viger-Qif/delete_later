import app.llm as llm_provider
from app.llm.base import MockLLM
from fastapi.testclient import TestClient

from app.main import app


def test_core_api_cycle():
    llm_provider._provider = MockLLM(
        reply="Ответ оппонента",
        json_spec={"intent": "other", "adjust": 1, "off_topic": False},
    )
    with TestClient(app) as client:
        scenarios = client.get("/api/scenarios")
        assert scenarios.status_code == 200
        scenario_id = scenarios.json()["items"][0]["id"]

        created = client.post(
            "/api/sessions", json={"scenario_id": scenario_id, "mode": "text"}
        )
        assert created.status_code == 201
        session_id = created.json()["id"]

        empty_hint = client.post(f"/api/sessions/{session_id}/hint")
        assert empty_hint.status_code == 409
        assert "первой реплики" in empty_hint.json()["detail"]

        turn = client.post(
            f"/api/sessions/{session_id}/turn",
            json={"message": "Предлагаю обсудить потребности", "version": 0, "request_id": "request-core-api-1"},
        )
        assert turn.status_code == 200
        assert turn.json()["reply"] == "Ответ оппонента"
        assert turn.json()["responder"] == "test_double"

        hint = client.post(f"/api/sessions/{session_id}/hint")
        assert hint.status_code == 200
        hint_payload = hint.json()
        assert hint_payload["hint"]
        assert "rag" not in hint_payload["coach"]
        assert "knowledge_cards" not in hint_payload["coach"]
        assert "knowledge_refs" not in hint_payload["coach"]
        assert "spin-" not in hint_payload["hint"]

        persisted = client.get(f"/api/sessions/{session_id}")
        assert persisted.status_code == 200
        assert len(persisted.json()["messages"]) == 3
        assert all(message["role"] != "assistant" for message in persisted.json()["messages"])


def test_knowledge_status_and_search():
    with TestClient(app) as client:
        status = client.get("/api/knowledge/status")
        assert status.status_code == 200
        assert status.json()["enabled"] is True
        assert status.json()["chunks"] >= 10

        search = client.get("/api/knowledge/search", params={"q": "нет бюджета, предложить варианты", "scenario_id": "sc_salary_complete_v3"})
        assert search.status_code == 200
        assert search.json()["items"]
        assert search.json()["items"][0]["id"].startswith("spin-")


def test_streamed_scenario_generation():
    import json
    from app.llm.base import ExpertLLM

    llm_provider._provider = ExpertLLM()
    with TestClient(app) as client:
        response = client.post(
            "/api/scenarios/generate-stream",
            json={"description": "Переговоры руководителя проекта с заказчиком о сроках и бюджете"},
        )
        assert response.status_code == 200
        events = [json.loads(line) for line in response.text.splitlines() if line.strip()]
        assert [event["stage"] for event in events if event["event"] == "status"] == ["rag", "model"]
        nodes = [event for event in events if event["event"] == "node"]
        complete = next(event for event in events if event["event"] == "complete")
        assert len(nodes) == len(complete["scenario"]["graph"]["nodes"])
        assert complete["scenario"]["modes"] == ["text", "voice"]
        assert complete["diagnostics"]["valid"] is True
        assert complete["diagnostics"]["stats"]["launchable"] is True
        assert complete["runtime"]["responder"] == "expert_system"
        scenario_id = complete["scenario"]["id"]
        assert client.get(f"/api/scenarios/{scenario_id}").status_code == 200
        assert client.delete(f"/api/scenarios/{scenario_id}?hard=true").status_code == 200


def test_models_status_and_explicit_expert_session():
    with TestClient(app) as client:
        status=client.get("/api/models/status?probe=false")
        assert status.status_code==200 and status.json()["expert"]["available"] is True
        sid=client.get("/api/scenarios").json()["items"][0]["id"]
        created=client.post("/api/sessions",json={"scenario_id":sid,"mode":"text","engine_mode":"expert"})
        assert created.status_code==201 and created.json()["engine_mode"]=="expert"
        turn=client.post(f"/api/sessions/{created.json()['id']}/turn",json={"message":"Хочу обсудить результаты и KPI", "version":0, "request_id":"request-expert-api-1"})
        assert turn.status_code==200 and turn.json()["responder"]=="expert_system"


def test_anonymous_visitors_are_isolated():
    with TestClient(app) as first, TestClient(app) as second:
        first_id = first.get("/api/auth/current").json()["user"]["id"]
        second_id = second.get("/api/auth/current").json()["user"]["id"]
        assert first_id.startswith("anon_")
        assert second_id.startswith("anon_")
        assert first_id != second_id
        scenario_id = first.get("/api/scenarios").json()["items"][0]["id"]
        created = first.post("/api/sessions", json={"scenario_id": scenario_id, "mode": "text"})
        assert created.status_code == 201
        assert second.get(f"/api/sessions/{created.json()['id']}").status_code == 404


def test_direct_registration_cookie_wins_over_provisional_guest_and_account_can_be_deleted():
    import uuid
    with TestClient(app) as client:
        email = f"privacy-{uuid.uuid4().hex}@example.test"
        registered = client.post("/api/auth/register", json={
            "email": email, "password": "safe-password-123", "display_name": "Privacy Test",
        })
        assert registered.status_code == 201
        me = client.get("/api/auth/me")
        assert me.json()["authenticated"] is True
        assert me.json()["user"]["email"] == email
        deleted = client.delete("/api/auth/account")
        assert deleted.status_code == 200
        assert client.get("/api/auth/me").json()["authenticated"] is False
