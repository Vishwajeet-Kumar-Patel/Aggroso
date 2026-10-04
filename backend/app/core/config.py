from pathlib import Path
from typing import List
from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"


class Settings(BaseSettings):
    PROJECT_NAME: str = "Agentic Data Migration Planner & Reconciliation Workbench"
    VERSION: str = "1.0.0"
    API_PREFIX: str = "/api"

    # Database URLs
    APP_DB_URL: str = "sqlite:///./app.db"
    TARGET_DB_URL: str = "sqlite:///./target.db"

    # Fault Injection setting
    ENABLE_FAULT_INJECTION: bool = False

    # AI Agent settings
    ANTHROPIC_API_KEY: str | None = None
    ANTHROPIC_MODEL: str = "claude-3-5-sonnet-20241022"

    # Enforced constraints
    MAX_SOURCE_RECORDS: int = 500

    # CORS
    CORS_ORIGINS: List[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
    ]

    # Data file paths
    DATA_DIR: Path = DATA_DIR
    SOURCE_SCHEMA_PATH: Path = DATA_DIR / "source_schema.json"
    TARGET_SCHEMA_PATH: Path = DATA_DIR / "target_schema.json"
    TRANSFORM_REGISTRY_PATH: Path = DATA_DIR / "transform_registry.json"
    SOURCE_SAMPLE_PATH: Path = DATA_DIR / "source_sample.json"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )


settings = Settings()
