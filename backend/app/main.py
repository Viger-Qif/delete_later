from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.api import auth, knowledge, learning, scenarios, sessions
from app.auth import create_anonymous_user, create_auth_session, user_from_request
from app.core.config import get_settings
from app.db.database import ResultSummaryRow, ScenarioRow, SessionRow, get_sessionmaker, init_db
from app.db.seed import SEED_SCENARIOS
from app.db import scenario_repo
from app.knowledge import get_retriever
from app.llm import credit_status, models_status, provider_name


def _seed() -> None:
    db = get_sessionmaker()()
    try:
        db.query(ScenarioRow).filter(ScenarioRow.owner_id == "admin").update({"owner_id": "system"}, synchronize_session=False)
        # Historical shared guest/admin records intentionally remain unassigned.
        # New anonymous visitors always receive an isolated principal.
        db.commit()
        if get_settings().demo_reset_scenarios:
            allowed_ids = {scenario.id for scenario in SEED_SCENARIOS}
            db.query(ScenarioRow).filter(~ScenarioRow.id.in_(allowed_ids)).delete(synchronize_session=False)
            db.query(SessionRow).filter(~SessionRow.scenario_id.in_(allowed_ids)).delete(synchronize_session=False)
        db.commit()
        for scenario in SEED_SCENARIOS:
            if scenario_repo.get_scenario(db, scenario.id) is None:
                scenario_repo.create_scenario(db, scenario)
            else:
                scenario_repo.update_scenario(db, scenario)
    finally:
        db.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    _seed()
    try:
        from app.llm import registry
        # Do not start a pointless network worker when the cloud key is absent.
        # This keeps local/offline startup deterministic and avoids background
        # probe threads in tests and in the no-key Docker setup.
        if get_settings().unikey_api_key:
            registry.probe_in_background()  # проверяем цепочки моделей один раз, не задерживая старт
    except Exception:
        pass
    yield


app = FastAPI(
    title="Negotiation Simulator API",
    description="Симулятор деловых переговоров: сценарии, графы диалога, сессии, ИИ-анализ",
    version="0.27.0-python-bootstrap",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def disable_demo_cache(request, call_next):
    settings = get_settings()
    anonymous_token = None
    if not settings.auth_required:
        db = get_sessionmaker()()
        try:
            user = user_from_request(request, db)
            if user is None:
                user = create_anonymous_user(db)
                anonymous_token = create_auth_session(db, user)
            request.state.current_user = user
        finally:
            db.close()
    response = await call_next(request)
    # Registration/login may have installed a stronger account cookie.
    # Never overwrite it with the provisional anonymous token.
    existing_set_cookie = response.headers.get("set-cookie", "")
    if anonymous_token and settings.auth_cookie_name not in existing_set_cookie:
        response.set_cookie(
            settings.auth_cookie_name,
            anonymous_token,
            max_age=settings.anonymous_session_days * 86400,
            httponly=True,
            secure=settings.auth_cookie_secure or settings.environment.lower() == "production",
            samesite=settings.auth_cookie_samesite,
            path="/",
        )
    if request.url.path == "/" or request.url.path.startswith("/static/") or request.url.path.endswith(".html"):
        response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
        response.headers["Pragma"] = "no-cache"
    return response


# --- API: регистрируется ДО статики и страниц ---
app.include_router(scenarios.router)
app.include_router(sessions.router)
app.include_router(knowledge.router)
app.include_router(auth.router)
app.include_router(learning.router)

# --- Статика фронтенда: css/, js/ и всё остальное по /static/... ---
FRONTEND_DIR = Path(__file__).resolve().parents[2] / "frontend"
app.mount("/static", StaticFiles(directory=FRONTEND_DIR), name="static")


# --- Корень: главная страница ---
@app.get("/", include_in_schema=False)
def frontend_index():
    return FileResponse(FRONTEND_DIR / "index.html")


# --- Любая страница фронтенда: /catalog.html, /session.html и т.д. ---
@app.get("/{page}.html", include_in_schema=False)
def frontend_page(page: str):
    root = FRONTEND_DIR.resolve()
    target = (root / f"{page}.html").resolve()
    # защита: файл должен лежать прямо в frontend/ и существовать
    if target.parent != root or not target.is_file():
        raise HTTPException(status_code=404, detail="Not Found")
    return FileResponse(target)


def _active_dialog_model() -> str:
    """Активная модель из цепочки — без сетевых запросов."""
    try:
        from app.llm import registry
        return registry.active_model("dialog") or get_settings().dialog_model
    except Exception:
        return get_settings().dialog_model


@app.get("/api/health")
def health():
    return {
        "status": "ok",
        "build": "v21.25-fidelina-welcome",
        "llm_mode": provider_name(),
        "dialog_model": _active_dialog_model() if provider_name().startswith("cloud") else "offline-expert",
        "auth_required": get_settings().auth_required,
        "credits": credit_status(),
        "rag": get_retriever().status(),
    }

_probe_last = 0.0
@app.get("/api/models/status")
def model_status(request: Request, probe: bool = False):
    if probe:
        from app.auth import current_user
        import time
        from app.db.database import get_sessionmaker
        global _probe_last
        db = get_sessionmaker()()
        try:
            user = current_user(request, db)
            if user.role == "guest":
                raise HTTPException(status_code=403, detail="Проверка моделей доступна только авторизованным пользователям")
        finally:
            db.close()
        if time.monotonic() - _probe_last < 60:
            raise HTTPException(status_code=429, detail="Повторите проверку через минуту")
        _probe_last = time.monotonic()
    return models_status(probe=probe)
