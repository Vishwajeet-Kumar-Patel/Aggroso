from typing import List, Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from app.core.db import get_app_db
from app.domain.schemas import AuditEventOut
from app.services.audit_service import AuditService

router = APIRouter(prefix="/audit", tags=["Audit Log"])


@router.get("", response_model=List[AuditEventOut])
def list_audit_events(
    event_type: Optional[str] = Query(None),
    plan_version_id: Optional[str] = Query(None),
    run_id: Optional[str] = Query(None),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_app_db),
):
    """Retrieve append-only audit trail events in reverse chronological order."""
    events = AuditService.list_events(
        db=db,
        event_type=event_type,
        plan_version_id=plan_version_id,
        run_id=run_id,
        limit=limit,
        offset=offset,
    )
    return [
        AuditEventOut(
            id=e.id,
            event_type=e.event_type,
            actor=e.actor,
            timestamp=e.timestamp,
            plan_version_id=e.plan_version_id,
            run_id=e.run_id,
            payload=e.payload_json,
        )
        for e in events
    ]
