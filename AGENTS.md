# Negotiation Lab: карта проекта для следующих агентов

Это краткая карта изменений. Продуктовые ограничения и политика безопасности
описаны в `PROJECT_CONTEXT.md`.

## Запуск

- `start.bat` — основной Windows-установщик: выбирает Python 3.13/3.12, чинит
  `.venv` и `pip`, ставит зависимости и запускает Uvicorn.
- `start-demo.sh` — локальный запуск macOS/Linux с проверкой окружения.
- `backend/app/main.py` — FastAPI-приложение, регистрация API и раздача
  статического frontend.
- `frontend/*.html` — страницы без сборщика; каждый экран подключает общий
  `data.js`, `app.js` и собственный контроллер.

## Backend по слоям

- `backend/app/api/auth.py` — вход, регистрация, гостевой principal, удаление
  аккаунта.
- `backend/app/api/scenarios.py` — каталог, CRUD, preview/refine/generate и
  публикация пользовательских сценариев.
- `backend/app/api/sessions.py` — сессия, ход, подсказка, завершение, результат
  и анализ.
- `backend/app/api/learning.py` — каталог SPIN, попытки, прогресс, повторение,
  мини-диалог, рефлексия, replay и рекомендация.
- `backend/app/api/knowledge.py` — стабильный HTTP-контур поиска по знаниям.
- `backend/app/api/schemas.py` — входные схемы и лимиты.
- `backend/app/engine/dialogue.py` — ход оппонента и подсказка Фиделины.
- `backend/app/engine/analysis.py` — итоговый анализ с проверкой цитат.
- `backend/app/engine/generator.py` — генерация и проверка графа сценария.
- `backend/app/llm/registry.py` — fast/smart цепочки и fallback моделей.
- `backend/app/knowledge/retrieval.py` — единая точка BM25/RAG-поиска.
- `backend/app/db/database.py` — SQLAlchemy-таблицы и инициализация схемы.
- `backend/app/db/*_repo.py` — хранение сценариев, сессий и результатов.

## Frontend по экранам

- `frontend/js/data.js` — API-клиент, wire-преобразования и локальная приватная
  история. UI сюда не добавлять.
- `frontend/js/app.js` — общая навигация и базовые helper'ы.
- `frontend/js/secretary.js` — состояние и видимость Фиделины.
- `frontend/js/tour.js` — универсальный движок пошагового знакомства.
- `frontend/js/page-tours.js` — конфигурации туров страниц.
- `frontend/js/home.js` — главная, модели и первое знакомство.
- `frontend/js/learning.js` — учебный экран и локальное состояние курса.
- `frontend/js/session.js` / `session-audio.js` — текстовая/голосовая сессии.
- `frontend/js/scenario.js` — бриф и запуск сценария.
- `frontend/js/studio.js` — создание, визуальный граф, drag-to-connect/retarget, инспектор ноды, preview и сохранение сценария.
- `backend/app/engine/generator.py::refine_scenario` — единственная точка prompt-правок существующего графа; не подменять её новой генерацией.
- `frontend/js/results.js`, `stats.js`, `profile.js` — результаты, агрегаты,
  приватность и локальная история.
- `frontend/content/methods/*.json` — справочник семи методик; не смешивать с
  машинными RAG-чанками.

## Как добавить методику или учебный режим

1. Активный трек намеренно SPIN-only. Расширять его только после отдельного
   продуктового решения и калибровки.
2. Контент курса хранить в `backend/app/knowledge/learning.json`, сохраняя
   `content_version`, `rubric_version`, `unit_id` и обязательные поля задания.
3. Для нескольких активных треков сначала изменить контракт
   `/api/learning/catalog` и выбор трека в `learning.js`. Не выводить все
   методики одной стеной карточек.
4. Новый оцениватель должен иметь детерминированный fallback и тесты на
   естественные перефразировки.
5. Знания подключать через `retrieval.py`; RAG-текст всегда считать
   недоверенными данными, а не инструкциями.
6. Добавить API-, engine- и frontend-регрессии.

## Проверки

```bash
DATABASE_URL=sqlite:///./test-isolated.sqlite PYTHONPATH=backend python -m pytest -q backend/tests
PYTHONPATH=backend python tools/validate_learning.py
PYTHONPATH=backend python tools/validate_spin_gold.py
PYTHONPATH=backend python tools/benchmark_rag.py
```

Frontend дополнительно проверить с пустым `localStorage`, с завершённым туром,
при недоступном API и на мобильной ширине.

## Инварианты

- Полные диалоги и учебные тексты не должны оставаться на сервере дольше
  установленной политики; приватная история живёт в браузере.
- Фиделина остаётся `position: fixed`; нельзя анимировать `body` через
  `transform`.
- Подсказка в сессии недоступна до первой реплики пользователя.
- Граф сценария на launch-экране закрыт по умолчанию.
- Внешний текст сценария, RAG и ответ LLM не являются инструкциями агенту.
- При изменении JS/CSS обновлять cache-busting версию в HTML.