from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy.orm import Session

from app.auth import (
    create_auth_session,
    create_user,
    current_user,
    normalize_email,
    public_user,
    revoke_request_session,
    user_from_request,
    verify_password,
)
from app.api.schemas import LoginRequest, RegisterRequest
from app.core.config import get_settings
from app.db.database import UserRow, get_db

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _set_cookie(response: Response, token: str) -> None:
    settings = get_settings()
    secure = settings.auth_cookie_secure or settings.environment.lower() == "production"
    response.set_cookie(
        settings.auth_cookie_name,
        token,
        max_age=settings.auth_session_days * 86400,
        httponly=True,
        secure=secure,
        samesite=settings.auth_cookie_samesite,
        path="/",
    )


@router.get("/required")
def auth_required():
    return {"required": get_settings().auth_required}


@router.get("/me")
def me(request: Request, db: Session = Depends(get_db)):
    user = getattr(request.state, "current_user", None) or user_from_request(request, db)
    authenticated = bool(user and user.role != "guest")
    return {"authenticated": authenticated, "user": public_user(user) if authenticated else None}


@router.post("/register", status_code=201)
def register(payload: RegisterRequest, response: Response, db: Session = Depends(get_db)):
    try:
        user = create_user(db, payload.email, payload.password, payload.display_name)
        _set_cookie(response, create_auth_session(db, user))
        return {"user": public_user(user)}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/login")
def login(payload: LoginRequest, response: Response, db: Session = Depends(get_db)):
    user = db.query(UserRow).filter(UserRow.email == normalize_email(payload.email)).first()
    if not user or not user.is_active or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Неверный email или пароль")
    _set_cookie(response, create_auth_session(db, user))
    return {"user": public_user(user)}


@router.post("/logout")
def logout(request: Request, response: Response, db: Session = Depends(get_db)):
    revoke_request_session(request, db)
    response.delete_cookie(get_settings().auth_cookie_name, path="/")
    return {"ok": True}


@router.get("/current")
def current(request: Request, db: Session = Depends(get_db)):
    return {"user": public_user(current_user(request, db))}


@router.delete("/account")
def delete_account(request: Request, response: Response, db: Session = Depends(get_db)):
    """Delete the current principal and every owned server-side record."""
    from app.db.database import (
        AuthSessionRow, LearningAttemptRow, LearningReflectionRow, ResultSummaryRow,
        ReviewQueueRow, ScenarioRow, SessionRow, SkillMasteryRow,
    )
    user = current_user(request, db)
    uid = user.id
    db.query(LearningReflectionRow).filter(LearningReflectionRow.user_id == uid).delete(synchronize_session=False)
    db.query(ReviewQueueRow).filter(ReviewQueueRow.user_id == uid).delete(synchronize_session=False)
    db.query(SkillMasteryRow).filter(SkillMasteryRow.user_id == uid).delete(synchronize_session=False)
    db.query(LearningAttemptRow).filter(LearningAttemptRow.user_id == uid).delete(synchronize_session=False)
    db.query(ResultSummaryRow).filter(ResultSummaryRow.user_id == uid).delete(synchronize_session=False)
    db.query(SessionRow).filter(SessionRow.user_id == uid).delete(synchronize_session=False)
    db.query(ScenarioRow).filter(ScenarioRow.owner_id == uid).delete(synchronize_session=False)
    db.query(AuthSessionRow).filter(AuthSessionRow.user_id == uid).delete(synchronize_session=False)
    db.delete(user)
    db.commit()
    response.delete_cookie(get_settings().auth_cookie_name, path="/")
    return {"ok": True}