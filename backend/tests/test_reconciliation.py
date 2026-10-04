import pytest
from app.domain.models import TargetCustomer
from app.domain.schemas import ExecutionRequest
from app.services.migration_runner import MigrationRunner
from app.services.plan_service import PlanService
from app.services.reconciliation_service import ReconciliationService
from tests.test_execution import get_full_plan_definition


def test_reconciliation_pass_and_fail(app_db, target_db):
    plan = PlanService.get_or_create_default_plan(app_db)
    v1 = PlanService.create_plan_version(app_db, plan.id, get_full_plan_definition())
    PlanService.approve_plan_version(app_db, v1.id, approver="QAEngineer")

    run = MigrationRunner.execute_migration(
        app_db=app_db,
        target_db=target_db,
        request=ExecutionRequest(plan_version_id=v1.id),
    )

    # 1. Reconciliation immediately after clean execution -> PASS
    rec_pass = ReconciliationService.reconcile(
        app_db=app_db,
        target_db=target_db,
        plan_version_id=v1.id,
        run_id=run.id,
    )
    assert rec_pass.overall_status == "PASS"
    assert len(rec_pass.missing_in_target_keys) == 0
    assert len(rec_pass.unexpected_target_keys) == 0

    # 2. Simulate manual deletion of 1 target record -> FAIL
    first_customer = target_db.query(TargetCustomer).first()
    deleted_key = first_customer.source_key
    target_db.delete(first_customer)
    target_db.commit()

    rec_fail = ReconciliationService.reconcile(
        app_db=app_db,
        target_db=target_db,
        plan_version_id=v1.id,
        run_id=run.id,
    )
    assert rec_fail.overall_status == "FAIL"
    assert deleted_key in rec_fail.missing_in_target_keys

    # 3. Simulate unexpected extra row in target -> FAIL
    extra = TargetCustomer(
        customer_id="EXTRA-999",
        first_name="Ghost",
        last_name="Record",
        email="ghost@target.com",
        country="US",
        status="ACTIVE",
        created_at="2023-01-01T00:00:00Z",
        source_key="EXTRA-GHOST-KEY",
        plan_version_id=v1.id,
        run_id=run.id,
    )
    target_db.add(extra)
    target_db.commit()

    rec_extra = ReconciliationService.reconcile(
        app_db=app_db,
        target_db=target_db,
        plan_version_id=v1.id,
        run_id=run.id,
    )
    assert rec_extra.overall_status == "FAIL"
    assert "EXTRA-GHOST-KEY" in rec_extra.unexpected_target_keys
