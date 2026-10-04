from typing import List, Optional
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.core.db import get_app_db
from app.domain.schemas import (
    ApprovalRequest,
    PlanCreateRequest,
    PlanEditRequest,
    PlanOut,
    PlanVersionDiff,
    PlanVersionOut,
    RejectionRequest,
)
from app.services.plan_service import PlanService

router = APIRouter(prefix="/plans", tags=["Plans & Versions"])


@router.get("/active", response_model=PlanOut)
def get_active_plan(db: Session = Depends(get_app_db)):
    """Get the active migration plan and its current active version."""
    plan = PlanService.get_or_create_default_plan(db)
    versions = PlanService.list_plan_versions(db, plan.id)
    active_version = None
    if plan.active_version_id:
        active_version = next((v for v in versions if v.id == plan.active_version_id), None)
    elif versions:
        active_version = versions[0]

    return PlanOut(
        id=plan.id,
        name=plan.name,
        description=plan.description,
        active_version_id=plan.active_version_id,
        active_version=PlanVersionOut.model_validate(active_version) if active_version else None,
        created_at=plan.created_at,
        updated_at=plan.updated_at,
        versions_count=len(versions),
    )


@router.get("/{plan_id}/versions", response_model=List[PlanVersionOut])
def list_plan_versions(plan_id: str, db: Session = Depends(get_app_db)):
    """List all immutable versions for a migration plan."""
    return PlanService.list_plan_versions(db, plan_id)


@router.get("/versions/{version_id}", response_model=PlanVersionOut)
def get_plan_version(version_id: str, db: Session = Depends(get_app_db)):
    """Get detailed specification for a specific immutable plan version."""
    return PlanService.get_plan_version(db, version_id)


@router.post("/{plan_id}/versions", response_model=PlanVersionOut)
def create_plan_version(
    plan_id: str,
    request: PlanEditRequest,
    db: Session = Depends(get_app_db),
):
    """Create a new immutable plan version from human edits."""
    return PlanService.create_plan_version(
        db=db,
        plan_id=plan_id,
        plan_def=request.plan_definition,
        creator=request.creator,
    )


@router.get("/diff/{v1_id}/{v2_id}", response_model=PlanVersionDiff)
def get_plan_version_diff(v1_id: str, v2_id: str, db: Session = Depends(get_app_db)):
    """Compare two immutable plan versions and return field-by-field differences."""
    return PlanService.compute_diff(db, v1_id, v2_id)


@router.post("/versions/{version_id}/approve", response_model=PlanVersionOut)
def approve_plan_version(
    version_id: str,
    request: ApprovalRequest,
    db: Session = Depends(get_app_db),
):
    """Sign off and approve an exact plan version by content hash."""
    return PlanService.approve_plan_version(
        db=db,
        plan_version_id=version_id,
        approver=request.approver,
    )


@router.post("/{plan_id}/versions/{version_ref}/approve", response_model=PlanVersionOut)
def approve_plan_version_by_ref(
    plan_id: str,
    version_ref: str,
    request: ApprovalRequest,
    db: Session = Depends(get_app_db),
):
    """Approve a plan version by plan_id and version number or ID."""
    version_id = version_ref
    if version_ref.isdigit():
        versions = PlanService.list_plan_versions(db, plan_id)
        match = next((v for v in versions if v.version_num == int(version_ref)), None)
        if match:
            version_id = match.id
    return PlanService.approve_plan_version(
        db=db,
        plan_version_id=version_id,
        approver=request.approver,
    )


@router.post("/versions/{version_id}/reject", response_model=PlanVersionOut)
def reject_plan_version(
    version_id: str,
    request: RejectionRequest,
    db: Session = Depends(get_app_db),
):
    """Reject a plan version."""
    return PlanService.reject_plan_version(
        db=db,
        plan_version_id=version_id,
        reason=request.reason,
    )


@router.post("/{plan_id}/versions/{version_ref}/reject", response_model=PlanVersionOut)
def reject_plan_version_by_ref(
    plan_id: str,
    version_ref: str,
    request: RejectionRequest,
    db: Session = Depends(get_app_db),
):
    """Reject a plan version by plan_id and version number or ID."""
    version_id = version_ref
    if version_ref.isdigit():
        versions = PlanService.list_plan_versions(db, plan_id)
        match = next((v for v in versions if v.version_num == int(version_ref)), None)
        if match:
            version_id = match.id
    return PlanService.reject_plan_version(
        db=db,
        plan_version_id=version_id,
        reason=request.reason,
    )
