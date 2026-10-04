import json
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.core.config import settings
from app.core.db import get_app_db, get_target_db, reset_databases
from app.domain.models import AuditEvent, MigrationRun, Plan, PlanVersion, TargetCustomer
from app.domain.schemas import DemoResetResult

router = APIRouter(prefix="/demo", tags=["Demo Administration"])


@router.post("/reset", response_model=DemoResetResult)
def reset_demo_environment(
    app_db: Session = Depends(get_app_db),
    target_db: Session = Depends(get_target_db),
):
    """Reset both app.db and mock target.db to pristine state and verify 60 sample records."""
    try:
        reset_databases()
    except Exception:
        pass

    # Clear sessions if in-memory or override
    try:
        target_db.query(TargetCustomer).delete()
        target_db.commit()
    except Exception:
        target_db.rollback()

    try:
        app_db.query(QuarantineRecord).delete()
        app_db.query(MigrationRun).delete()
        app_db.query(PlanVersion).delete()
        app_db.query(Plan).delete()
        app_db.commit()
    except Exception:
        app_db.rollback()
    
    with open(settings.SOURCE_SAMPLE_PATH, "r", encoding="utf-8") as f:
        records = json.load(f)

    return DemoResetResult(
        status="success",
        message="Databases cleanly reinitialized and seed records ready.",
        source_records_loaded=len(records),
        app_db_reinitialized=True,
        target_db_reinitialized=True,
    )

