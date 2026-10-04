from typing import Optional
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session
from app.core.db import get_app_db, get_target_db
from app.domain.schemas import ReconciliationResult
from app.services.plan_service import PlanService
from app.services.reconciliation_service import ReconciliationService

router = APIRouter(prefix="/reconciliation", tags=["Reconciliation"])


class ReconcileRequest(BaseModel):
    plan_version_id: Optional[str] = None
    run_id: Optional[str] = None


@router.post("", response_model=ReconciliationResult)
@router.post("/run", response_model=ReconciliationResult)
def perform_reconciliation(
    request: Optional[ReconcileRequest] = None,
    plan_version_id: Optional[str] = None,
    run_id: Optional[str] = None,
    app_db: Session = Depends(get_app_db),
    target_db: Session = Depends(get_target_db),
):
    """Run automated reconciliation verifying source total invariant, target count, and key sets."""
    resolved_plan_version_id = (request.plan_version_id if request else None) or plan_version_id
    resolved_run_id = (request.run_id if request else None) or run_id

    if not resolved_plan_version_id:
        plan = PlanService.get_or_create_default_plan(app_db)
        resolved_plan_version_id = plan.active_version_id

    return ReconciliationService.reconcile(
        app_db=app_db,
        target_db=target_db,
        plan_version_id=resolved_plan_version_id,
        run_id=resolved_run_id,
    )

