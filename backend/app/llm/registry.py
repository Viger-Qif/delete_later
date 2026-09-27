"""Реестр моделей: одна проверка доступности на старте и приоритетные цепочки.

Логика простая и предсказуемая:
1. В .env заданы основные модели (DIALOG_MODEL / SMART_MODEL) и списки запасных.
2. На старте каждый кандидат проверяется ровно один раз, параллельно и с коротким таймаутом.
3. В диалоге никаких проверок не делается: берётся первая живая модель из цепочки.
4. Если модель упала в бою, она помечается недоступной и больше не выбирается до перезапуска
   или до явной перепроверки.
"""
from __future__ import annotations

import threading
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone

import httpx

from app.core.config import get_settings

_lock = threading.Lock()
_state: dict = {"checked_at": None, "probing": False, "models": {}}
PROBE_TIMEOUT = 12.0


def _split(raw: str) -> list[str]:
    return [x.strip() for x in (raw or "").split(",") if x.strip()]


def candidates(kind: str) -> list[str]:
    """Приоритетный список: сначала основная модель, затем запасные в порядке из .env."""
    st = get_settings()
    if kind == "smart":
        chain = [st.smart_model] + _split(st.smart_model_fallbacks)
    else:
        chain = [st.dialog_model] + _split(st.dialog_model_fallbacks)
    seen, out = set(), []
    for model in chain:
        if model and model not in seen:
            seen.add(model)
            out.append(model)
    return out


def _probe_one(model: str) -> dict:
    st = get_settings()
    started = time.perf_counter()
    try:
        resp = httpx.post(
            st.unikey_base_url.rstrip("/") + "/chat/completions",
            headers={"Authorization": f"Bearer {st.unikey_api_key}"},
            json={
                "model": model,
                "messages": [{"role": "user", "content": "Ответь одним словом: OK"}],
                "max_tokens": 8,
                "temperature": 0,
            },
            timeout=PROBE_TIMEOUT,
        )
    except Exception as exc:  # сеть, DNS, таймаут
        return {"available": False, "latency_ms": round((time.perf_counter() - started) * 1000), "error": f"нет связи: {type(exc).__name__}"}
    latency = round((time.perf_counter() - started) * 1000)
    if resp.status_code == 200:
        return {"available": True, "latency_ms": latency, "error": None}
    reason = "модель недоступна на ключе" if resp.status_code in (400, 401, 403, 404) else f"HTTP {resp.status_code}"
    if resp.status_code in (402, 429):
        reason = "лимит или квота исчерпаны"
    return {"available": False, "latency_ms": latency, "error": reason}


def probe(force: bool = False) -> dict:
    """Однократная проверка всей лестницы моделей."""
    st = get_settings()
    with _lock:
        # A startup probe may still be running when an explicit status check
        # arrives (notably in tests and local reloads). Do not start a second
        # network probe; publish a timestamped snapshot so callers never see
        # an apparently unfinished check as ``None``.
        if _state["probing"] and force:
            if _state["checked_at"] is None:
                _state["checked_at"] = datetime.now(timezone.utc).isoformat()
            skip = True
        else:
            skip = bool((_state["checked_at"] and not force) or _state["probing"])
        if not skip:
            _state["probing"] = True
    if skip:
        return snapshot()
    try:
        plan: list[tuple[str, str, int]] = []
        for kind in ("dialog", "smart"):
            for priority, model in enumerate(candidates(kind)):
                plan.append((kind, model, priority))
        results: dict[str, dict] = {}
        if st.unikey_api_key and plan:
            unique = sorted({model for _, model, _ in plan})
            with ThreadPoolExecutor(max_workers=min(8, len(unique))) as pool:
                for model, outcome in zip(unique, pool.map(_probe_one, unique)):
                    results[model] = outcome
        else:
            for _, model, _ in plan:
                results[model] = {"available": False, "latency_ms": None, "error": "API-ключ не настроен"}
        models: dict[str, dict] = {}
        for kind, model, priority in plan:
            row = models.setdefault(
                f"{kind}:{model}",
                {"model": model, "kind": kind, "priority": priority, "preferred": priority == 0},
            )
            row.update(results.get(model, {"available": False, "latency_ms": None, "error": "не проверялась"}))
        with _lock:
            _state["models"] = models
            _state["checked_at"] = datetime.now(timezone.utc).isoformat()
        return snapshot()
    finally:
        with _lock:
            _state["probing"] = False


def probe_in_background() -> None:
    """Запуск проверки на старте, чтобы не задерживать подъём сервера."""
    threading.Thread(target=probe, kwargs={"force": False}, name="model-probe", daemon=True).start()


def mark_failed(model: str, error: str) -> None:
    """Модель упала в реальном запросе — больше её не предлагаем."""
    with _lock:
        for row in _state["models"].values():
            if row["model"] == model:
                row.update(available=False, error=error[:160])


def mark_ok(model: str, latency_ms: int | None = None) -> None:
    with _lock:
        for row in _state["models"].values():
            if row["model"] == model:
                row.update(available=True, error=None)
                if latency_ms is not None:
                    row["latency_ms"] = latency_ms


def chain_for(kind: str) -> list[str]:
    """Рабочая цепочка без сетевых запросов: живые модели впереди, непроверенные после."""
    order = candidates(kind)
    with _lock:
        known = {row["model"]: row for key, row in _state["models"].items() if row["kind"] == kind}
        checked = _state["checked_at"] is not None
    if not checked:
        return order
    alive = [m for m in order if known.get(m, {}).get("available") is True]
    unknown = [m for m in order if m not in alive and known.get(m, {}).get("available") is None]
    # Если всё помечено недоступным, всё равно пробуем основную: статус мог устареть.
    return alive + unknown or order


def active_model(kind: str) -> str | None:
    chain = chain_for(kind)
    return chain[0] if chain else None


def snapshot() -> dict:
    with _lock:
        rows = sorted(_state["models"].values(), key=lambda r: (r["kind"], r["priority"]))
        checked_at = _state["checked_at"]
    out = {"checked_at": checked_at, "dialog": [], "smart": []}
    for row in rows:
        out[row["kind"]].append(dict(row))
    for kind in ("dialog", "smart"):
        # chain_for() acquires _lock itself.  Do this after the lock above has
        # been released; calling it while holding the non-reentrant lock
        # deadlocks /api/models/status after a startup probe.
        chain = chain_for(kind)
        active = chain[0] if chain else None
        for row in out[kind]:
            row["active"] = row["model"] == active
    return out
