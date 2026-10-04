import pytest
from sqlalchemy import text
from app.services.audit_service import AuditService


def test_audit_event_logging_and_filtering(app_db):
    # Log several events
    e1 = AuditService.log_event(
        db=app_db,
        event_type="plan_created",
        actor="agent",
        payload={"plan_id": "test-plan-1", "version": 1},
        plan_version_id="pv-1",
    )
    e2 = AuditService.log_event(
        db=app_db,
        event_type="approved",
        actor="TechLead",
        payload={"approved_version": 1},
        plan_version_id="pv-1",
    )
    e3 = AuditService.log_event(
        db=app_db,
        event_type="executed",
        actor="system",
        payload={"inserted": 45},
        plan_version_id="pv-1",
        run_id="run-100",
    )

    all_events = AuditService.list_events(app_db)
    assert len(all_events) == 3

    # Filter by event_type
    approved_events = AuditService.list_events(app_db, event_type="approved")
    assert len(approved_events) == 1
    assert approved_events[0].actor == "TechLead"

    # Filter by run_id
    run_events = AuditService.list_events(app_db, run_id="run-100")
    assert len(run_events) == 1
    assert run_events[0].event_type == "executed"


def test_audit_immutability_service_and_sqlite_triggers(app_db):
    """Test that audit_events table cannot be updated or deleted via service or raw SQL triggers (A6/B16)."""
    # 1. Service layer check
    with pytest.raises(RuntimeError, match="strictly append-only"):
        AuditService.assert_immutable("any-id")

    # 2. Insert a valid audit event
    event = AuditService.log_event(
        db=app_db,
        event_type="plan_created",
        actor="agent",
        payload={"test": "immutability"},
    )

    # 3. Raw SQL UPDATE must be rejected by SQLite BEFORE UPDATE trigger
    with pytest.raises(Exception) as exc_update:
        app_db.execute(
            text("UPDATE audit_events SET actor = 'tampered' WHERE id = :id"),
            {"id": event.id},
        )
        app_db.commit()
    assert "append-only: updates are forbidden" in str(exc_update.value)
    app_db.rollback()

    # 4. Raw SQL DELETE must be rejected by SQLite BEFORE DELETE trigger
    with pytest.raises(Exception) as exc_delete:
        app_db.execute(
            text("DELETE FROM audit_events WHERE id = :id"),
            {"id": event.id},
        )
        app_db.commit()
    assert "append-only: deletes are forbidden" in str(exc_delete.value)
    app_db.rollback()


def test_all_audit_event_types_supported(app_db):
    """Confirm audit events exist and can be logged for every required event type."""
    required_types = [
        "agent_proposal",
        "plan_created",
        "plan_edited",
        "approved",
        "rejected",
        "dry_run",
        "executed",
        "retried",
        "reconciled",
        "rolled_back",
        "error",
    ]
    for et in required_types:
        ev = AuditService.log_event(
            db=app_db,
            event_type=et,
            actor="test_runner",
            payload={"event": et},
        )
        assert ev.id is not None
        assert ev.event_type == et
