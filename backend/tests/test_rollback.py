import pytest
from app.domain.models import TargetCustomer
from app.domain.schemas import ExecutionRequest
from app.services.migration_runner import MigrationRunner
from app.services.plan_service import PlanService
from tests.test_execution import get_full_plan_definition


def test_rollback_and_re_execution(app_db, target_db):
    plan = PlanService.get_or_create_default_plan(app_db)
    v1 = PlanService.create_plan_version(app_db, plan.id, get_full_plan_definition())
    PlanService.approve_plan_version(app_db, v1.id, approver="DevOps")

    run = MigrationRunner.execute_migration(
        app_db=app_db,
        target_db=target_db,
        request=ExecutionRequest(plan_version_id=v1.id),
    )
    assert run.status == "completed"
    initial_inserted = run.inserted_count
    assert target_db.query(TargetCustomer).count() == initial_inserted

    # 1. Rollback
    rollback_res = MigrationRunner.rollback(
        app_db=app_db,
        target_db=target_db,
        run_id=run.id,
    )
    assert rollback_res.status == "completed"
    assert rollback_res.deleted_count == initial_inserted
    assert target_db.query(TargetCustomer).count() == 0

    # 2. Idempotent Rollback (rolling back a second time is a safe no-op)
    rollback_res_2 = MigrationRunner.rollback(
        app_db=app_db,
        target_db=target_db,
        run_id=run.id,
    )
    assert rollback_res_2.status == "completed"
    assert rollback_res_2.deleted_count == 0

    # 3. Re-execution after rollback succeeds
    run2 = MigrationRunner.execute_migration(
        app_db=app_db,
        target_db=target_db,
        request=ExecutionRequest(plan_version_id=v1.id, idempotency_key="re-exec-run-1"),
    )
    assert run2.status == "completed"
    assert run2.inserted_count == initial_inserted
    assert target_db.query(TargetCustomer).count() == initial_inserted
