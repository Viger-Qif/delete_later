#!/usr/bin/env python3
"""Контрольные проверки two-chairs-compare: спиннер, карточки, анализ.

Запускает локальный мок-бэкенд и браузер Playwright, прогоняет 4 сценария:
1) «с ключом API» — /api/chat/completions отвечает быстро;
2) «офлайн» — все /api/* зависают навсегда (имитация недоступной модели);
3) прерванный режим (только раунд 1);
4) через 5 секунд узла спиннера в DOM нет (в обоих полных режимах).
"""
import json
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

FRONTEND = "/workspace/frontend"
MODE = {"name": "online"}  # online | offline


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def _send(self, code, body, ctype="application/json"):
        raw = body.encode("utf-8") if isinstance(body, str) else body
        self.send_response(code)
        self.send_header("Content-Type", ctype + "; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def do_GET(self):
        path = self.path.split("?")[0]
        if MODE["name"] == "offline" and path.startswith("/api/"):
            time.sleep(60)  # вечное зависание — имитация недоступного сервера
            return
        if path.startswith("/static/"):
            rel = path[len("/static/"):]
            try:
                with open(FRONTEND + "/" + rel, "rb") as f:
                    self._send(200, f.read(), "text/javascript" if rel.endswith(".js") else "text/css")
            except Exception:
                self._send(404, "{}")
            return
        if path.endswith(".html") or path == "/":
            fname = (path[1:] or "index.html").split("/")[-1]
            try:
                with open(FRONTEND + "/" + fname, "rb") as f:
                    self._send(200, f.read().decode("utf-8"), "text/html")
            except Exception:
                self._send(404, "{}")
            return
        if path == "/api/scenarios":
            items = [
                {"id": "pair-x", "title": "Повышение", "user_role": "Сотрудник",
                 "counterpart_role": "Руководитель", "difficulty": "mid", "industry": "hr"},
                {"id": "pair-x-inv", "title": "Повышение (инверсия)", "user_role": "Руководитель",
                 "counterpart_role": "Сотрудник", "difficulty": "mid", "industry": "hr"},
            ]
            self._send(200, json.dumps({"items": items}))
            return
        if path.startswith("/api/scenarios/"):
            sid = path.split("/")[-1]
            self._send(200, json.dumps({"id": sid, "title": "Повышение", "user_role": "Сотрудник",
                                        "counterpart_role": "Руководитель", "difficulty": "mid", "industry": "hr"}))
            return
        self._send(404, json.dumps({"detail": "not found"}))

    def do_POST(self):
        length = int(self.headers.get("Content-Length", 0))
        self.rfile.read(length)
        path = self.path.split("?")[0]
        if MODE["name"] == "offline" and path.startswith("/api/"):
            time.sleep(60)
            return
        if path == "/api/chat/completions":
            self._send(200, json.dumps({
                "choices": [{"message": {"content": "Модельный вывод: во второй роли вы держались увереннее."}}]
            }))
            return
        if path.endswith("/two-chairs"):
            self._send(200, json.dumps({
                "scenario": {"id": "pair-x", "title": "Повышение", "user_role": "Сотрудник",
                             "counterpart_role": "Руководитель", "difficulty": "mid", "industry": "hr"},
                "inverted": {"id": "pair-x-inv", "title": "Повышение (инверсия)", "user_role": "Руководитель",
                             "counterpart_role": "Сотрудник", "difficulty": "mid", "industry": "hr"},
                "created": False,
            }))
            return
        self._send(404, json.dumps({"detail": "not found"}))


def seed_js(complete=True):
    r1 = {"sessionId": "s1", "score": 72, "interest": 55, "role": "Сотрудник",
          "counterpart": "Руководитель", "title": "Повышение", "ended": "finished"}
    r2 = {"sessionId": "s2", "score": 80, "interest": 78, "role": "Руководитель",
          "counterpart": "Сотрудник", "title": "Повышение (инверсия)", "ended": "finished"} if complete else None
    rec = {"id": "pair-x", "pairId": "pair-x", "twoChairs": True, "title": "Повышение",
           "date": "2026-09-26T10:00:00Z", "firstRound": r1, "secondRound": r2}
    plan = {"pairId": "pair-x", "scenarioId": "pair-x", "invertedId": "pair-x-inv",
            "round1Done": True, "round2Done": complete, "completed": complete}
    # ВАЖНО: add_init_script исполняет строку как ТЕЛО функции — объявляем
    # данные через var и присваиваем в localStorage синхронно.
    return ("var __REC = %s; var __PLAN = %s;"
            "localStorage.setItem('nt_completed_sessions_v1', JSON.stringify([__REC]));"
            "localStorage.setItem('nt_two_chairs_plan_v1', JSON.stringify(__PLAN));"
            % (json.dumps(rec), json.dumps(plan)))


def run_check(page, base, mode, complete, label):
    MODE["name"] = mode
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.add_init_script(seed_js(complete))
    t0 = time.time()
    page.goto(base + "/two-chairs-compare.html?pair=pair-x", wait_until="domcontentloaded")

    # Контент должен появиться СРАЗУ (< 600 мс), без ожидания промисов.
    cards_at = None
    analysis_at = None
    deadline = time.time() + 3
    while time.time() < deadline:
        if cards_at is None and page.evaluate(
                "document.querySelectorAll('#tc-rounds .tc-round-card').length === 2 && !document.getElementById('tc-rounds').hidden"):
            cards_at = time.time() - t0
        if analysis_at is None and page.evaluate("!document.getElementById('tc-analysis').hidden && document.getElementById('tc-analysis-body').innerHTML.length > 50"):
            analysis_at = time.time() - t0
        if cards_at is not None and analysis_at is not None:
            break
        page.wait_for_timeout(20)

    spinner_present_early = page.evaluate("!!document.getElementById('tc-loading')")
    spinner_gone = page.wait_for_function("!document.getElementById('tc-loading')", timeout=4000)
    spin_end = time.time() - t0
    page.wait_for_timeout(5000 - (time.time() - t0)) if (time.time() - t0) < 5 else None
    spinner_after_5s = page.evaluate("!!document.getElementById('tc-loading')")
    html_body = page.evaluate("document.getElementById('tc-analysis-body').innerText")
    bars = page.evaluate("document.querySelectorAll('#tc-analysis-body .tc-bar').length")
    pause_link = page.evaluate("!!Array.from(document.querySelectorAll('#tc-analysis-body a')).find(a=>a.textContent.includes('Вернуться к паузе'))")
    card2_notplayed = page.evaluate("document.querySelectorAll('#tc-rounds .tc-round-card')[1]?.innerText.includes('не сыгран')")

    print(f"\n=== {label} ===")
    print(f"карточки появились через: {cards_at*1000:.0f} мс" if cards_at else "карточки НЕ появились!")
    print(f"анализ появился через: {analysis_at*1000:.0f} мс" if analysis_at else "анализ НЕ появился!")
    if complete:
        print(f"спиннер виден при загрузке: {spinner_present_early}; исчез к {spin_end*1000:.0f} мс (норма ≤ ~2100 мс)")
    else:
        print(f"спиннер удалён сразу (renderIncomplete): {not spinner_present_early}")
    print(f"спиннера в DOM через 5 с: {not spinner_after_5s}")
    print(f"баров в анализе: {bars}")
    if not complete:
        print(f"карточка 2 «не сыгран»: {card2_notplayed}; ссылка «Вернуться к паузе»: {pause_link}")
    print("фрагмент анализа:", html_body.replace("\n", " ")[:180])
    ok = (cards_at is not None and cards_at < 0.6 and not spinner_after_5s and not errors)
    if complete:
        ok = ok and analysis_at is not None and spin_end <= 2.5
        ok = ok and (("Модельный вывод" in html_body) == (mode == "online"))
        ok = ok and ("без API-ключа" in html_body) == (mode != "online")
    else:
        ok = ok and bars == 0 and pause_link and card2_notplayed
    print("ИТОГ:", "PASS" if ok else "FAIL", ("| pageerrors: " + "; ".join(errors)) if errors else "")
    return ok


def main():
    from playwright.sync_api import sync_playwright
    srv = ThreadingHTTPServer(("127.0.0.1", 8931), Handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    base = "http://127.0.0.1:8931"
    results = []
    with sync_playwright() as p:
        browser = p.chromium.launch()
        for mode, complete, label in [
            ("online", True, "Проверка 1: с ключом API (модель отвечает)"),
            ("offline", True, "Проверка 2: без ключа API / офлайн (запросы висят)"),
            ("online", False, "Проверка 3: прерванный режим (только раунд 1)"),
        ]:
            ctx = browser.new_context()
            page = ctx.new_page()
            results.append(run_check(page, base, mode, complete, label))
            ctx.close()
        browser.close()
    srv.shutdown()
    print("\nВСЕ ПРОВЕРКИ:", "PASS" if all(results) else "FAIL")
    sys.exit(0 if all(results) else 1)


if __name__ == "__main__":
    main()
