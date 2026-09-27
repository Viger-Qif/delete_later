from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")
    unikey_api_key: str = ""
    unikey_base_url: str = "https://www.getunikey.ai/v1"
    dialog_model: str = "google/gemini-3.1-flash-lite"
    smart_model: str = "deepseek/deepseek-v4-pro"
    # Запасные кандидаты в порядке приоритета. Основные модели всегда идут первыми.
    dialog_model_fallbacks: str = "google/gemini-3.5-flash,openai/gpt-5.2-mini,anthropic/claude-4.5-haiku"
    smart_model_fallbacks: str = "google/gemini-3.5-flash,deepseek/deepseek-v3.2,openai/gpt-5.2"
    database_url: str = "sqlite:///./soisety.db"
    llm_timeout_seconds: float = 20.0
    llm_dialog_timeout_seconds: float = 25.0
    llm_smart_timeout_seconds: float = 50.0
    llm_total_deadline_seconds: float = 120.0
    llm_max_retries: int = 0
    demo_reset_scenarios: bool = False
    cors_origins: str = "http://127.0.0.1:8000,http://localhost:8000"
    auth_required: bool = False
    auth_session_days: int = 30
    auth_cookie_name: str = "negotiation_lab_session"
    auth_cookie_secure: bool = False
    auth_cookie_samesite: str = "lax"
    guest_user_id: str = "guest"
    environment: str = "development"
    anonymous_session_days: int = 7
    persist_user_scenario_context: bool = False
    @property
    def cors_origin_list(self) -> list[str]:
        return [x.strip() for x in self.cors_origins.split(",") if x.strip()]

@lru_cache
def get_settings() -> Settings:
    return Settings()
