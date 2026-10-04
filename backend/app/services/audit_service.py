import datetime
from typing import Any, Dict, List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import desc
from app.domain.models import AuditEvent


class AuditService:
    @staticmethod
    def log_event(
        db: Session,
        event_type: str,
        actor: str,
        payload: Dict[str, Any],
        plan_version_id: Optional[str] = None,
        run_id: Optional[str] = None,
    ) -> AuditEvent:
        """Append an audit event to the immutable audit log."""
        event = AuditEvent(
            event_type=event_type,
            actor=actor,
            timestamp=datetime.datetime.now(datetime.timezone.utc),
            plan_version_id=plan_version_id,
            run_id=run_id,
            payload_json=payload,
        )
        db.add(event)
        db.commit()
        db.refresh(event)
        return event

    @staticmethod
    def list_events(
        db: Session,
        event_type: Optional[str] = None,
        plan_version_id: Optional[str] = None,
        run_id: Optional[str] = None,
        limit: int = 100,
        offset: int = 0,
    ) -> List[AuditEvent]:
        """Query audit events in reverse chronological order."""
        query = db.query(AuditEvent)
        if event_type:
            query = query.filter(AuditEvent.event_type == event_type)
        if plan_version_id:
            query = query.filter(AuditEvent.plan_version_id == plan_version_id)
        if run_id:
            query = query.filter(AuditEvent.run_id == run_id)
        return query.order_by(desc(AuditEvent.timestamp)).offset(offset).limit(limit).all()

    @staticmethod
    def assert_immutable(event_id: str) -> None:
        """Explicit assertion that audit events cannot be modified or deleted."""
        raise RuntimeError("Audit log is strictly append-only: updates and deletions are forbidden")
