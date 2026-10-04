import json
from pathlib import Path
from typing import Generator
import pytest
from sqlalchemy import create_engine
from sqlalchemy.pool import StaticPool
from sqlalchemy.orm import sessionmaker, Session
from app.core.config import settings
from app.core.db import AppBase, TargetBase

# In-memory SQLite engines with StaticPool to share connection across all threads/sessions
test_app_engine = create_engine(
    "sqlite://",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
test_target_engine = create_engine(
    "sqlite://",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)

TestAppSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_app_engine)
TestTargetSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_target_engine)


from sqlalchemy import text


@pytest.fixture(scope="function")
def app_db() -> Generator[Session, None, None]:
    AppBase.metadata.create_all(bind=test_app_engine)
    with test_app_engine.begin() as conn:
        conn.execute(text("""
            CREATE TRIGGER IF NOT EXISTS audit_events_no_update
            BEFORE UPDATE ON audit_events
            BEGIN
                SELECT RAISE(ABORT, 'audit_events table is append-only: updates are forbidden');
            END;
        """))
        conn.execute(text("""
            CREATE TRIGGER IF NOT EXISTS audit_events_no_delete
            BEFORE DELETE ON audit_events
            BEGIN
                SELECT RAISE(ABORT, 'audit_events table is append-only: deletes are forbidden');
            END;
        """))
    session = TestAppSessionLocal()
    try:
        yield session
    finally:
        session.close()
        AppBase.metadata.drop_all(bind=test_app_engine)


@pytest.fixture(scope="function")
def target_db() -> Generator[Session, None, None]:
    TargetBase.metadata.create_all(bind=test_target_engine)
    session = TestTargetSessionLocal()
    try:
        yield session
    finally:
        session.close()
        TargetBase.metadata.drop_all(bind=test_target_engine)


@pytest.fixture(autouse=True)
def reset_sample_file():
    """Ensure source_sample.json contains baseline_60 records for test isolation."""
    baseline_path = settings.DATA_DIR / "scenarios" / "baseline_60.json"
    if baseline_path.exists():
        with open(baseline_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        with open(settings.SOURCE_SAMPLE_PATH, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
    yield
    if baseline_path.exists():
        with open(baseline_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        with open(settings.SOURCE_SAMPLE_PATH, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)


@pytest.fixture
def sample_records():
    baseline_path = settings.DATA_DIR / "scenarios" / "baseline_60.json"
    if baseline_path.exists():
        with open(baseline_path, "r", encoding="utf-8") as f:
            return json.load(f)
    with open(settings.SOURCE_SAMPLE_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


@pytest.fixture
def source_schema():
    with open(settings.SOURCE_SCHEMA_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


@pytest.fixture
def target_schema():
    with open(settings.TARGET_SCHEMA_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


@pytest.fixture
def client(app_db, target_db):
    from fastapi.testclient import TestClient
    from app.core.db import get_app_db, get_target_db
    from app.main import app
    def override_get_app_db():
        yield app_db
    def override_get_target_db():
        yield target_db
    app.dependency_overrides[get_app_db] = override_get_app_db
    app.dependency_overrides[get_target_db] = override_get_target_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


