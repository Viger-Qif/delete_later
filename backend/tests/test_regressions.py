"""Regressions for deadlocks, idempotency, graph validation and transcript persistence."""
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import json
import re
from unittest.mock import patch

from fastapi.testclient import TestClient

from app.llm import registry
from app.main import app
from app.api.schemas import ScenarioCreate, TurnRequest
from pydantic import ValidationError
import pytest


def test_fidelina_stays_attached_to_the_viewport_while_scrolling():
    frontend = Path(__file__).resolve().parents[2] / "frontend" / "css"
    secretary_css = (frontend / "secretary.css").read_text(encoding="utf-8")
    base_css = (frontend / "base.css").read_text(encoding="utf-8")
    widget_rule = re.search(r"\.secretary-widget\s*\{([^}]+)\}", secretary_css, re.S)
    page_enter = re.search(r"@keyframes page-enter\s*\{(.*?)\n\}", base_css, re.S)
    leaving_rule = re.search(r"body\.is-leaving\s*\{([^}]+)\}", base_css, re.S)

    assert widget_rule and "position: fixed" in widget_rule.group(1)
    assert widget_rule and "bottom:" in widget_rule.group(1)
    # A transformed body becomes the containing block for fixed descendants,
    # making Fidelina scroll with the document instead of the camera.
    assert page_enter and "transform:" not in page_enter.group(1)
    assert leaving_rule and "transform:" not in leaving_rule.group(1)


def test_home_has_direct_custom_scenario_entry():
    index = (
        Path(__file__).resolve().parents[2] / "frontend" / "index.html"
    ).read_text(encoding="utf-8")

    assert 'href="scenario-studio.html"' in index
    assert "Создать свой сценарий" in index


def test_navigation_and_fidelina_can_be_restored():
    root = Path(__file__).resolve().parents[2] / "frontend"
    home_js = (root / "js" / "home.js").read_text(encoding="utf-8")
    secretary_js = (root / "js" / "secretary.js").read_text(encoding="utf-8")
    index = (root / "index.html").read_text(encoding="utf-8")
    session_js = (root / "js" / "session.js").read_text(encoding="utf-8")

    for page in root.glob("*.html"):
        content = page.read_text(encoding="utf-8")
        assert "page-head__back" not in content
    assert 'id="exit-btn"' in (root / "session.html").read_text(encoding="utf-8")
    assert 'id="exit-btn"' in (root / "session-audio.html").read_text(encoding="utf-8")
    assert "data-exit-action=\"home\"" in session_js
    assert "data-exit-action=\"resume\"" in session_js
    assert 'id="restart-intro-visible"' in index
    assert 'data-secretary-launcher' in index
    assert "restartIntro" in home_js
    assert "data-secretary-launcher" in secretary_js


def test_package_a_hides_diagnostics_and_localizes_profile_statuses():
    root = Path(__file__).resolve().parents[2] / "frontend"
    index = (root / "index.html").read_text(encoding="utf-8")
    session = (root / "session.html").read_text(encoding="utf-8")
    app_js = (root / "js" / "app.js").read_text(encoding="utf-8")
    profile_js = (root / "js" / "profile.js").read_text(encoding="utf-8")
    results_js = (root / "js" / "results.js").read_text(encoding="utf-8")

    assert re.search(r'<div[^>]*(?:id="model-status"[^>]*hidden|hidden[^>]*id="model-status")', index)
    assert re.search(r'<div[^>]*(?:id="session-model"[^>]*hidden|hidden[^>]*id="session-model")', session)
    assert "Закрыть подсказку" in index and "Убрать Фиделину" in index
    assert "Команда «Случайно залетевшие»" in app_js
    assert "mailto:dima.aleksytkin@gmail.com" in app_js
    assert "abandoned: 'прервано'" in profile_js
    assert "analysis-runtime" not in results_js


def test_method_checklist_persists_and_sources_are_expanded_and_collapsed():
    root = Path(__file__).resolve().parents[2] / "frontend"
    method_js = (root / "js" / "method.js").read_text(encoding="utf-8")
    handbook_css = (root / "css" / "handbook.css").read_text(encoding="utf-8")

    assert 'type="checkbox"' in method_js
    assert "localStorage.setItem(storageKey" in method_js
    assert "method-sources-details" in method_js
    assert ".method-sources-details" in handbook_css
    for path in (root / "content" / "methods").glob("*.json"):
        data = json.loads(path.read_text(encoding="utf-8"))
        assert len(data.get("sources", [])) >= 2
        assert all(len(source) >= 70 for source in data["sources"])
        assert all("http://" not in source and "https://" not in source for source in data["sources"])


def test_package_c_required_fields_counters_and_balanced_limits():
    root = Path(__file__).resolve().parents[2]
    studio_html = (root / "frontend" / "scenario-studio.html").read_text(encoding="utf-8")
    studio_js = (root / "frontend" / "js" / "studio.js").read_text(encoding="utf-8")
    session_html = (root / "frontend" / "session.html").read_text(encoding="utf-8")
    schemas = (root / "backend" / "app" / "api" / "schemas.py").read_text(encoding="utf-8")

    for field_id in ("ai-context", "goal", "user-role", "opponent-role"):
        assert f'id="{field_id}"' in studio_html
    assert studio_html.count('data-required-field=""') == 4
    assert 'maxlength="3000"' in studio_html
    assert 'maxlength="2000"' in studio_html
    assert 'id="required-errors"' in studio_html
    assert "scrollIntoView({ behavior: 'smooth', block: 'center' })" in studio_js
    assert "setupCounters()" in studio_js
    assert 'id="chat-input" maxlength="2000"' in session_html
    assert "message: str = Field(min_length=1, max_length=2000)" in schemas

    with pytest.raises(ValidationError):
        TurnRequest(message="я" * 2001, version=0, request_id="request-001")
    with pytest.raises(ValidationError):
        ScenarioCreate(
            title="С" * 121,
            opponent={"role": "Собеседник", "style": "деловой", "tone": "спокойный"},
            graph={"nodes": [], "edges": []},
        )


def test_package_d_visual_editor_and_preview_generation_do_not_create_orphans():
    root = Path(__file__).resolve().parents[2]
    studio_html = (root / "frontend" / "scenario-studio.html").read_text(encoding="utf-8")
    studio_js = (root / "frontend" / "js" / "studio.js").read_text(encoding="utf-8")

    for element_id in ("graph-editor", "graph-canvas", "node-editor", "edge-editor", "refine-instruction", "undo-graph", "cancel-generation", "generation-progress"):
        assert f'id="{element_id}"' in studio_html
    assert "data-node-field" in studio_js
    assert "data-edge-field" in studio_js
    assert "beforeunload" in studio_js
    assert "NTData.refineScenario" in studio_js
    assert "data-connect-from" in studio_js
    assert "data-edge-end" in studio_js
    assert "Подтвердить пересборку" in studio_js
    assert "graphDiff" in studio_js

    with TestClient(app) as client:
        before = client.get("/api/scenarios?include_unpublished=true").json()["items"]
        response = client.post("/api/scenarios/generate-preview", json={
            "description": (
                "Название: Тестовый возврат\nТема: возврат товара\n"
                "Я покупатель. Собеседник — администратор магазина. "
                "Хочу вернуть деньги за просроченный товар и показать чек."
            ),
            "engine_mode": "expert",
        })
        assert response.status_code == 200
        assert response.json()["graph"]["nodes"]
        after = client.get("/api/scenarios?include_unpublished=true").json()["items"]
        assert len(after) == len(before)


def test_probe_reentry_without_deadlock():
    with patch.object(registry, "_probe_one", return_value={"available": True, "latency_ms": 1, "error": None}):
        with ThreadPoolExecutor(max_workers=1) as pool:
            pool.submit(registry.probe, True).result(timeout=3)
            assert pool.submit(registry.probe, False).result(timeout=3)["checked_at"]


def test_turn_retry_conflict_and_completed_transcript_is_minimized():
    with TestClient(app) as client:
        sc = client.get('/api/scenarios').json()['items'][0]['id']
        created = client.post('/api/sessions', json={'scenario_id': sc, 'engine_mode': 'expert'}).json()
        sid = created['id']
        request = {'message': 'Я автоматизировал отчётность на Python и сократил затраты', 'version': 0, 'request_id': 'retry-test-001'}
        first = client.post(f'/api/sessions/{sid}/turn', json=request)
        assert first.status_code == 200
        assert not first.json()['violation']
        assert client.post(f'/api/sessions/{sid}/turn', json=request).json() == first.json()
        stale = client.post(f'/api/sessions/{sid}/turn', json={**request, 'request_id': 'retry-test-002'})
        assert stale.status_code == 409
        assert client.get(f'/api/sessions/{sid}').json()['turns'] == 1
        abandon = client.post(f'/api/sessions/{sid}/abandon')
        assert abandon.status_code == 200
        result = client.get(f'/api/sessions/results/{sid}').json()
        assert result['turns'] == 1
        assert 'messages' not in result
        assert client.post(f'/api/sessions/results/{sid}/analyze').status_code == 410


def test_session_can_be_abandoned_before_first_user_message():
    with TestClient(app) as client:
        sc = client.get('/api/scenarios').json()['items'][0]['id']
        created = client.post('/api/sessions', json={'scenario_id': sc, 'engine_mode': 'expert'}).json()
        assert created['turns'] == 0
        abandoned = client.post(f"/api/sessions/{created['id']}/abandon")
        assert abandoned.status_code == 200
        assert abandoned.json()['status'] == 'abandoned'
        result = client.get(f"/api/sessions/results/{created['id']}")
        assert result.status_code == 200
        assert result.json()['turns'] == 0


def test_home_stats_and_learning_have_fidelina_tours():
    root = Path(__file__).resolve().parents[2] / "frontend"
    index = (root / "index.html").read_text(encoding="utf-8")
    home = (root / "js" / "home.js").read_text(encoding="utf-8")
    tours = (root / "js" / "page-tours.js").read_text(encoding="utf-8")
    learning = (root / "learning.html").read_text(encoding="utf-8")
    assert "/static/css/tour.css" in index and "/static/js/tour.js" in index
    for title in ("Сценарии и тренировка", "Создать свой сценарий", "Статистика", "Справочник методик", "Учебный режим"):
        assert title in home
    assert "'stats.html'" in tours and "'learning.html'" in tours
    assert "Один шаг за раз" in learning
    assert "Короткая теория: что такое SPIN" in learning
    assert 'id="show-all-exercises"' in learning
    assert 'id="learning-tour-restart"' in learning


def test_page_tours_retry_dynamic_targets_and_use_fresh_assets():
    root = Path(__file__).resolve().parents[2] / "frontend"
    tours = (root / "js" / "page-tours.js").read_text(encoding="utf-8")
    assert "function launch(force = false, attempt = 0)" in tours
    assert "attempt < 12" in tours
    assert "nt_page_tour_${config.id}_v3" in tours
    for name in ("catalog.html", "handbook.html", "scenario-studio.html", "profile.html", "stats.html", "learning.html"):
        html = (root / name).read_text(encoding="utf-8")
        assert "/static/js/tour.js?v=6" in html
        assert "/static/js/page-tours.js?v=4" in html


def test_tour_start_does_not_emit_a_false_close_and_storage_is_safe():
    root = Path(__file__).resolve().parents[2] / "frontend"
    tour = (root / "js" / "tour.js").read_text(encoding="utf-8")
    home = (root / "js" / "home.js").read_text(encoding="utf-8")
    assert "function storageGet" in tour and "function storageSet" in tour
    assert "function teardown()" in tour
    assert "nt_home_tour_v6" in home
    assert "function launchIntro(attempt = 0)" in home


def test_learning_defaults_to_one_unit_and_dead_frontend_wrappers_are_removed():
    root = Path(__file__).resolve().parents[2] / "frontend"
    learning = (root / "js" / "learning.js").read_text(encoding="utf-8")
    data = (root / "js" / "data.js").read_text(encoding="utf-8")
    assert "state.showAll" in learning
    assert "item.unit_id === suggested.unit_id" in learning
    assert "show-all-exercises" in learning
    for dead_name in ("generateScenarioStream", "getRawScenario", "archiveScenario", "knowledgeSearch"):
        assert dead_name not in data


def test_launchers_support_python_312_313_and_repair_missing_pip():
    root = Path(__file__).resolve().parents[2]
    windows = (root / "start.bat").read_text(encoding="utf-8")
    shell = (root / "start-demo.sh").read_text(encoding="utf-8")
    assert "py -3.13" in windows and "py -3.12" in windows
    assert ":bootstrap_pip" in windows
    assert "-m ensurepip --upgrade" in windows
    assert "https://bootstrap.pypa.io/get-pip.py" in windows
    assert "rmdir /S /Q" in windows
    assert "python3.13 python3.12 python3" in shell
    assert "-m pip --version" in shell
    assert "-m ensurepip --upgrade" in shell


def test_windows_batch_files_use_crlf_and_all_targets_exist():
    """CMD subroutine lookup can lose later labels in LF-only batch files."""
    root = Path(__file__).resolve().parents[2]
    for path in root.glob("*.bat"):
        raw = path.read_bytes()
        assert raw.count(b"\r\n") == raw.count(b"\n"), f"{path.name} must use CRLF"
        text = raw.decode("utf-8")
        labels = {
            match.group(1).lower()
            for match in re.finditer(r"(?im)^:([a-z0-9_-]+)\s*$", text)
        }
        targets = {
            match.group(1).lower()
            for match in re.finditer(r"(?i)\b(?:call\s+:|goto\s+:?)([a-z0-9_-]+)", text)
            if match.group(1).lower() not in {"eof"}
        }
        assert targets <= labels, f"{path.name} missing labels: {sorted(targets - labels)}"


def test_privacy_ui_keeps_transcripts_in_browser_storage():
    root = Path(__file__).resolve().parents[2] / "frontend"
    data_js = (root / "js" / "data.js").read_text(encoding="utf-8")
    profile = (root / "profile.html").read_text(encoding="utf-8")
    assert "LOCAL_HISTORY_DAYS = 30" in data_js
    assert "exportLocalHistory" in data_js
    assert "clearLocalHistory" in data_js
    assert 'id="privacy-export"' in profile
    assert 'id="privacy-clear"' in profile


def test_primary_tabs_have_fidelina_first_visit_tours():
    root = Path(__file__).resolve().parents[2] / "frontend"
    for name in ("catalog.html", "handbook.html", "scenario-studio.html", "profile.html"):
        html = (root / name).read_text(encoding="utf-8")
        assert "/static/css/tour.css" in html
        assert "/static/js/tour.js" in html
        assert "/static/js/page-tours.js" in html
    page_tours = (root / "js" / "page-tours.js").read_text(encoding="utf-8")
    assert "nt_page_tour_" in page_tours
    assert "Повторить знакомство" in page_tours
    assert "Управление приватностью" in page_tours
