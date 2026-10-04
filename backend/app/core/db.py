from typing import Generator
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker, Session
from app.core.config import settings

# Dual SQLite engines
app_engine = create_engine(
    settings.APP_DB_URL,
    connect_args={"check_same_thread": False},
    echo=False,
)

target_engine = create_engine(
    settings.TARGET_DB_URL,
    connect_args={"check_same_thread": False},
    echo=False,
)

# Dual sessionmakers
AppSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=app_engine)
TargetSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=target_engine)

# Dual declarative bases
AppBase = declarative_base()
TargetBase = declarative_base()


def get_app_db() -> Generator[Session, None, None]:
    """Dependency for obtaining app database session."""
    db = AppSessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_target_db() -> Generator[Session, None, None]:
    """Dependency for obtaining mock target database session."""
    db = TargetSessionLocal()
    try:
        yield db
    finally:
        db.close()


from sqlalchemy import text


def init_databases() -> None:
    """Initialize tables in both app and target databases with immutability triggers."""
    AppBase.metadata.create_all(bind=app_engine)
    TargetBase.metadata.create_all(bind=target_engine)

    # SQLite append-only triggers for audit_events table
    with app_engine.begin() as conn:
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


def reset_databases() -> None:
    """Drop and recreate all tables in both databases (used in demo reset / test fixtures)."""
    AppBase.metadata.drop_all(bind=app_engine)
    TargetBase.metadata.drop_all(bind=target_engine)
    init_databases()
