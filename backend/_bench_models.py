import time

import httpx

from app.core.config import get_settings

s = get_settings()
base = s.unikey_base_url.rstrip("/")
headers = {"Authorization": f"Bearer {s.unikey_api_key}"}


def call(model, messages, max_tokens=300):
    started = time.time()
    for attempt in range(4):
        try:
            resp = httpx.post(
                base + "/chat/completions",
                headers=headers,
                json={"model": model, "messages": messages, "max_tokens": max_tokens, "temperature": 0.6},
                timeout=90,
            )
            break
        except httpx.TransportError:
            if attempt == 3:
                raise
            time.sleep(1.5)
    elapsed = time.time() - started
    try:
        payload = resp.json()
        message = payload["choices"][0]["message"]
        return elapsed, resp.status_code, message.get("content"), message.get("reasoning_content")
    except Exception:
        return elapsed, resp.status_code, resp.text[:150], None


GREETING = [
    {"role": "system", "content": "Ты играешь роль строгого директора по закупкам. Отвечай 1-2 предложениями по-русски."},
    {"role": "user", "content": "Здравствуйте, хочу обсудить пилот."},
]
JSON_TASK = [
    {"role": "system", "content": 'Ответь СТРОГО JSON: {"intent":"...","adjust":0,"off_topic":false}'},
    {"role": "user", "content": "Допустимые intent: ask_about_needs, discuss_price. Реплика: Расскажите про ваши задачи"},
]

for model in ["google/gemini-3.1-flash-lite", "google/gemini-3.5-flash", "deepseek/deepseek-v4-pro"]:
    print("===", model)
    dt, code, content, reasoning = call(model, GREETING)
    print(f"  greeting {dt:5.2f}s {code} content={str(content)[:90]!r} reasoning={str(reasoning)[:40]!r}")
    dt, code, content, reasoning = call(model, JSON_TASK, 120)
    print(f"  json     {dt:5.2f}s {code} content={str(content)[:90]!r}")
