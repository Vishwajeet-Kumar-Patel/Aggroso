from typing import Any, Dict, Optional
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session
from app.core.db import get_app_db
from app.domain.schemas import DryRunRequest, DryRunResult
from app.services.dry_run_service import DryRunService
from app.services.plan_service import PlanService

router = APIRouter(prefix="/dry-run", tags=["Dry Run"])


class VerifyDeterminismRequest(BaseModel):
    plan_version_id: str
    iterations: int = 3


@router.post("", response_model=DryRunResult)
def execute_dry_run(
    request: DryRunRequest,
    db: Session = Depends(get_app_db),
):
    """Execute a deterministic dry-run of a plan version without writing to the target store."""
    plan_version_id = request.plan_version_id
    if not plan_version_id:
        plan = PlanService.get_or_create_default_plan(db)
        if not plan.active_version_id:
            from app.services.agent_service import AgentService
            AgentService.propose_plan(db, force_fallback=True)
            db.refresh(plan)
        plan_version_id = plan.active_version_id

    dry_run, results = DryRunService.execute_dry_run(
        db=db,
        plan_version_id=plan_version_id,
        records=request.records,
    )

    return DryRunResult(
        id=dry_run.id,
        plan_version_id=dry_run.plan_version_id,
        input_hash=dry_run.input_hash,
        result_hash=dry_run.result_hash,
        total_source=dry_run.total_source,
        total_transformed=dry_run.total_transformed,
        total_accepted=dry_run.total_accepted,
        total_quarantined=dry_run.total_quarantined,
        is_deterministic=dry_run.is_deterministic,
        created_at=dry_run.created_at,
        sample_records=results,
    )


@router.post("/verify-determinism")
def verify_determinism(
    request: VerifyDeterminismRequest,
    db: Session = Depends(get_app_db),
):
    """Run dry run multiple times and verify byte-identical result hashes."""
    return DryRunService.verify_determinism(
        db=db,
        plan_version_id=request.plan_version_id,
        iterations=request.iterations,
    )
