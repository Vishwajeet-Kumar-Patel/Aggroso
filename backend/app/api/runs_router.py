from typing import List, Optional
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import desc
from app.core.db import get_app_db, get_target_db
from app.core.errors import NotFoundError
from app.domain.models import MigrationRun
from app.domain.schemas import (
    ExecutionRequest,
    MigrationRunOut,
    RetryRequest,
    RollbackRequest,
    RollbackResult,
)
from app.services.migration_runner import MigrationRunner

router = APIRouter(prefix="/runs", tags=["Execution & Runs"])


@router.post("/execute", response_model=MigrationRunOut)
def execute_migration(
    request: ExecutionRequest,
    app_db: Session = Depends(get_app_db),
    target_db: Session = Depends(get_target_db),
):
    """Execute migration into mock target database for an approved plan version."""
    run = MigrationRunner.execute_migration(
        app_db=app_db,
        target_db=target_db,
        request=request,
    )
    return MigrationRunOut.model_validate(run)


@router.post("/retry", response_model=MigrationRunOut)
def retry_migration(
    request: RetryRequest,
    app_db: Session = Depends(get_app_db),
    target_db: Session = Depends(get_target_db),
):
    """Retry a failed or partial run idempotently."""
    run = MigrationRunner.retry_migration(
        app_db=app_db,
        target_db=target_db,
        request=request,
    )
    return MigrationRunOut.model_validate(run)


@router.post("/rollback", response_model=RollbackResult)
def rollback_migration(
    request: RollbackRequest,
    app_db: Session = Depends(get_app_db),
    target_db: Session = Depends(get_target_db),
):
    """Roll back target database rows for a specific run or plan version."""
    return MigrationRunner.rollback(
        app_db=app_db,
        target_db=target_db,
        run_id=request.run_id,
        plan_version_id=request.plan_version_id,
    )


@router.get("", response_model=List[MigrationRunOut])
def list_runs(app_db: Session = Depends(get_app_db)):
    """List execution history and runs."""
    runs = app_db.query(MigrationRun).order_by(desc(MigrationRun.started_at)).all()
    return [MigrationRunOut.model_validate(r) for r in runs]


@router.get("/{run_id}", response_model=MigrationRunOut)
def get_run(run_id: str, app_db: Session = Depends(get_app_db)):
    """Get status and metrics for a specific migration run."""
    run = app_db.query(MigrationRun).filter(MigrationRun.id == run_id).first()
    if not run:
        raise NotFoundError(f"Migration run '{run_id}' not found")
    return MigrationRunOut.model_validate(run)
