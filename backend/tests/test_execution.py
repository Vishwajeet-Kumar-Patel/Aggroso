import pytest
from app.core.config import settings
from app.core.errors import AppError, ApprovalRequiredError, BadRequestError
from app.domain.models import MigrationRun, TargetCustomer
from app.domain.schemas import ExecutionRequest, RetryRequest
from app.domain.transforms import FieldMapping, PlanDefinition, TransformRuleInvocation
from app.services.migration_runner import MigrationRunner
from app.services.plan_service import PlanService


def get_full_plan_definition() -> PlanDefinition:
    return PlanDefinition(
        field_mappings=[
            FieldMapping(
                target_field="customer_id",
                source_fields=["cust_id"],
                transformations=[TransformRuleInvocation(rule="rename")],
                confidence=1.0,
                rationale="ID",
            ),
            FieldMapping(
                target_field="first_name",
                source_fields=["full_name"],
                transformations=[
                    TransformRuleInvocation(rule="trim"),
                    TransformRuleInvocation(rule="split_name", params={"part": "first"}),
                ],
                confidence=0.95,
                rationale="First name",
            ),
            FieldMapping(
                target_field="last_name",
                source_fields=["full_name"],
                transformations=[
                    TransformRuleInvocation(rule="trim"),
                    TransformRuleInvocation(rule="split_name", params={"part": "last"}),
                ],
                confidence=0.95,
                rationale="Last name",
            ),
            FieldMapping(
                target_field="email",
                source_fields=["email_addr"],
                transformations=[
                    TransformRuleInvocation(rule="trim"),
                    TransformRuleInvocation(rule="lowercase"),
                ],
                confidence=1.0,
                rationale="Email",
            ),
            FieldMapping(
                target_field="country",
                source_fields=["country_code"],
                transformations=[
                    TransformRuleInvocation(rule="trim"),
                    TransformRuleInvocation(rule="uppercase"),
                ],
                confidence=1.0,
                rationale="Country",
            ),
            FieldMapping(
                target_field="status",
                source_fields=["status_flag"],
                transformations=[
                    TransformRuleInvocation(
                        rule="enum_map",
                        params={
                            "mapping": {"A": "ACTIVE", "I": "INACTIVE", "P": "PENDING"},
                            "on_unmapped": "error",
                        },
                    ),
                ],
                confidence=0.95,
                rationale="Status",
            ),
            FieldMapping(
                target_field="created_at",
                source_fields=["signup_ts"],
                transformations=[
                    TransformRuleInvocation(rule="parse_datetime", params={"input_format": "%Y-%m-%d %H:%M:%S"}),
                ],
                confidence=1.0,
                rationale="Created at",
            ),
            FieldMapping(
                target_field="credit_limit_cents",
                source_fields=["credit_limit"],
                transformations=[
                    TransformRuleInvocation(rule="cast_decimal_to_cents"),
                ],
                confidence=1.0,
                rationale="Credit limit",
            ),
            FieldMapping(
                target_field="loyalty_tier",
                source_fields=[],
                transformations=[
                    TransformRuleInvocation(rule="default_value", params={"value": "BRONZE"}),
                ],
                confidence=1.0,
                rationale="Loyalty tier",
            ),
        ]
    )


def test_approval_gate_blocks_unapproved_execution(app_db, target_db):
    plan = PlanService.get_or_create_default_plan(app_db)
    v1 = PlanService.create_plan_version(app_db, plan.id, get_full_plan_definition())
    assert v1.status == "draft"

    # Execution without approval raises ApprovalRequiredError
    with pytest.raises(ApprovalRequiredError):
        MigrationRunner.execute_migration(
            app_db=app_db,
            target_db=target_db,
            request=ExecutionRequest(plan_version_id=v1.id),
        )


def test_execution_and_idempotency_key_replay(app_db, target_db):
    plan = PlanService.get_or_create_default_plan(app_db)
    v1 = PlanService.create_plan_version(app_db, plan.id, get_full_plan_definition())
    PlanService.approve_plan_version(app_db, v1.id, approver="LeadArchitect")

    # 1. First execution
    run1 = MigrationRunner.execute_migration(
        app_db=app_db,
        target_db=target_db,
        request=ExecutionRequest(plan_version_id=v1.id, idempotency_key="idemp-key-1"),
    )
    assert run1.status == "completed"
    assert run1.inserted_count > 0
    assert run1.skipped_existing_count == 0
    assert getattr(run1, "replayed", False) is False

    target_count1 = target_db.query(TargetCustomer).count()
    assert target_count1 == run1.inserted_count

    # 2. Re-sending the same idempotency key -> returns original run result with replayed: true (A1)
    run1_replay = MigrationRunner.execute_migration(
        app_db=app_db,
        target_db=target_db,
        request=ExecutionRequest(plan_version_id=v1.id, idempotency_key="idemp-key-1"),
    )
    assert run1_replay.id == run1.id
    assert getattr(run1_replay, "replayed", False) is True
    assert target_db.query(TargetCustomer).count() == target_count1

    # 3. New execution with a different idempotency key -> 0 inserted, all skipped_existing (A1)
    run2 = MigrationRunner.execute_migration(
        app_db=app_db,
        target_db=target_db,
        request=ExecutionRequest(plan_version_id=v1.id, idempotency_key="idemp-key-2"),
    )
    assert run2.status == "completed"
    assert run2.inserted_count == 0
    assert run2.skipped_existing_count == target_count1
    assert target_db.query(TargetCustomer).count() == target_count1


def test_target_email_conflict_fails_with_TARGET_EMAIL_CONFLICT(app_db, target_db):
    """When an email exists in target for a DIFFERENT source_key, fail with TARGET_EMAIL_CONFLICT (A1)."""
    plan = PlanService.get_or_create_default_plan(app_db)
    v1 = PlanService.create_plan_version(app_db, plan.id, get_full_plan_definition())
    PlanService.approve_plan_version(app_db, v1.id, approver="LeadArchitect")

    # Insert a rogue customer in target with the email alice.smith@example.com but DIFFERENT source_key
    rogue = TargetCustomer(
        customer_id="ROGUE-1",
        first_name="Rogue",
        last_name="User",
        email="alice.smith@example.com",
        phone_e164="+15551234567",
        country="US",
        status="ACTIVE",
        created_at="2023-01-01T00:00:00Z",
        source_key="DIFFERENT-SOURCE-KEY",
        plan_version_id=v1.id,
        run_id="rogue-run",
    )
    target_db.add(rogue)
    target_db.commit()

    with pytest.raises(AppError) as exc_info:
        MigrationRunner.execute_migration(
            app_db=app_db,
            target_db=target_db,
            request=ExecutionRequest(plan_version_id=v1.id, idempotency_key="conflict-run-1"),
        )
    assert exc_info.value.code == "TARGET_EMAIL_CONFLICT"
    assert exc_info.value.status_code == 409


def test_fault_injection_safety_flag(app_db, target_db, monkeypatch):
    """Fault injection is OFF by default; 403 when disabled, honored when enabled (A8)."""
    plan = PlanService.get_or_create_default_plan(app_db)
    v1 = PlanService.create_plan_version(app_db, plan.id, get_full_plan_definition())
    PlanService.approve_plan_version(app_db, v1.id, approver="LeadArchitect")

    # 1. Disabled state (default): must return 403 FAULT_INJECTION_DISABLED
    monkeypatch.setattr(settings, "ENABLE_FAULT_INJECTION", False)
    with pytest.raises(AppError) as exc_info:
        MigrationRunner.execute_migration(
            app_db=app_db,
            target_db=target_db,
            request=ExecutionRequest(
                plan_version_id=v1.id,
                idempotency_key="fault-disabled-run",
                simulate_failure_at_record=5,
            ),
        )
    assert exc_info.value.code == "FAULT_INJECTION_DISABLED"
    assert exc_info.value.status_code == 403

    # 2. Enabled state: fault is injected and roll back target DB
    monkeypatch.setattr(settings, "ENABLE_FAULT_INJECTION", True)
    with pytest.raises(BadRequestError, match="Simulated fault injected"):
        MigrationRunner.execute_migration(
            app_db=app_db,
            target_db=target_db,
            request=ExecutionRequest(
                plan_version_id=v1.id,
                idempotency_key="fault-enabled-run",
                simulate_failure_at_record=5,
            ),
        )
    assert target_db.query(TargetCustomer).count() == 0

    # 3. Retry succeeds and inserts accepted records
    failed_run = app_db.query(MigrationRun).filter(MigrationRun.idempotency_key == "fault-enabled-run").first()
    assert failed_run.status == "failed"

    retried_run = MigrationRunner.retry_migration(
        app_db=app_db,
        target_db=target_db,
        request=RetryRequest(run_id=failed_run.id),
    )
    assert retried_run.status == "completed"
    assert retried_run.inserted_count > 0
    assert target_db.query(TargetCustomer).count() == retried_run.inserted_count


def test_cross_db_consistency_stuck_run_recovery(app_db, target_db):
    """Simulate crash after step 2 (target inserted) and before step 3 (app.db updated to completed) (A3)."""
    plan = PlanService.get_or_create_default_plan(app_db)
    v1 = PlanService.create_plan_version(app_db, plan.id, get_full_plan_definition())
    PlanService.approve_plan_version(app_db, v1.id, approver="LeadArchitect")

    # Step 1: Create stuck run row in app.db with status 'running'
    stuck_run = MigrationRun(
        plan_version_id=v1.id,
        idempotency_key="stuck-crash-run",
        status="running",
        total_accepted=0,
        inserted_count=0,
    )
    app_db.add(stuck_run)
    app_db.commit()

    # Step 2: Simulate that target.db inserted 10 rows before crash
    for i in range(1, 11):
        target_db.add(
            TargetCustomer(
                customer_id=f"CUST-000{i}",
                first_name="Alice",
                last_name=f"User{i}",
                email=f"alice.user{i}@example.com",
                country="US",
                status="ACTIVE",
                created_at="2023-01-01T00:00:00Z",
                source_key=f"CUST-000{i}",
                plan_version_id=v1.id,
                run_id=stuck_run.id,
            )
        )
    target_db.commit()
    assert target_db.query(TargetCustomer).count() == 10

    # Step 3: Trigger retry - it computes delta from target contents and finishes the rest
    recovered_run = MigrationRunner.retry_migration(
        app_db=app_db,
        target_db=target_db,
        request=RetryRequest(run_id=stuck_run.id),
    )
    assert recovered_run.status == "completed"
    assert recovered_run.inserted_count > 10
    # No duplicate source_keys
    all_keys = [c.source_key for c in target_db.query(TargetCustomer).all()]
    assert len(all_keys) == len(set(all_keys))
