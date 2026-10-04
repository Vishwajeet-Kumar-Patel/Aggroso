import pytest
from app.core.errors import ApprovalRequiredError, BadRequestError
from app.domain.transforms import FieldMapping, PlanDefinition, TransformRuleInvocation
from app.services.audit_service import AuditService
from app.services.plan_service import PlanService


def get_sample_plan_definition() -> PlanDefinition:
    return PlanDefinition(
        field_mappings=[
            FieldMapping(
                target_field="customer_id",
                source_fields=["cust_id"],
                transformations=[TransformRuleInvocation(rule="rename")],
                confidence=1.0,
                rationale="Direct identifier mapping",
            ),
            FieldMapping(
                target_field="first_name",
                source_fields=["full_name"],
                transformations=[
                    TransformRuleInvocation(rule="trim"),
                    TransformRuleInvocation(rule="split_name", params={"part": "first"}),
                ],
                confidence=0.95,
                rationale="Extract first name",
            ),
        ]
    )


def test_plan_versioning_and_immutability(app_db):
    plan = PlanService.get_or_create_default_plan(app_db)
    assert plan.id is not None

    # Create v1
    v1_def = get_sample_plan_definition()
    v1 = PlanService.create_plan_version(app_db, plan.id, v1_def, creator="agent")
    assert v1.version_num == 1
    assert v1.status == "draft"
    assert v1.content_hash is not None
    assert v1.parent_version_id is None

    # Approve v1
    v1_approved = PlanService.approve_plan_version(app_db, v1.id, approver="TechLead")
    assert v1_approved.status == "approved"
    assert v1_approved.approver == "TechLead"
    assert v1_approved.approval_hash == v1.content_hash

    # Gate verification passes for approved v1
    verified_v1 = PlanService.verify_approval_gate(app_db, v1.id)
    assert verified_v1.id == v1.id

    # Edit plan -> creates v2
    v2_def = PlanDefinition(
        field_mappings=v1_def.field_mappings
        + [
            FieldMapping(
                target_field="loyalty_tier",
                source_fields=[],
                transformations=[TransformRuleInvocation(rule="default_value", params={"value": "BRONZE"})],
                confidence=1.0,
                rationale="Default bronze tier",
            )
        ]
    )
    v2 = PlanService.create_plan_version(app_db, plan.id, v2_def, creator="user")
    assert v2.version_num == 2
    assert v2.status == "draft"
    assert v2.parent_version_id == v1.id
    assert v2.content_hash != v1.content_hash

    # Previous v1 is marked as superseded
    app_db.refresh(v1)
    assert v1.status == "superseded"

    # Approval gate fails for draft v2
    with pytest.raises(ApprovalRequiredError):
        PlanService.verify_approval_gate(app_db, v2.id)

    # Approval gate fails for superseded v1
    with pytest.raises(ApprovalRequiredError):
        PlanService.verify_approval_gate(app_db, v1.id)


def test_reject_plan_version_records_reason_and_blocks_execution(app_db):
    """Confirm reject records reason, writes rejected audit event, and blocks execution (A7)."""
    plan = PlanService.get_or_create_default_plan(app_db)
    v1 = PlanService.create_plan_version(app_db, plan.id, get_sample_plan_definition(), creator="agent")

    # Reject v1
    rejected_v1 = PlanService.reject_plan_version(
        db=app_db,
        plan_version_id=v1.id,
        reason="Field mappings incomplete for address fields",
        actor="SecurityLead",
    )
    assert rejected_v1.status == "rejected"

    # Audit event written
    events = AuditService.list_events(app_db, event_type="rejected")
    assert len(events) == 1
    assert events[0].plan_version_id == v1.id
    assert events[0].payload_json.get("reason") == "Field mappings incomplete for address fields"

    # Approval gate blocks execution of rejected version
    with pytest.raises(ApprovalRequiredError) as exc_info:
        PlanService.verify_approval_gate(app_db, v1.id)
    assert "rejected" in str(exc_info.value)


def test_plan_diff(app_db):
    plan = PlanService.get_or_create_default_plan(app_db)
    v1_def = get_sample_plan_definition()
    v1 = PlanService.create_plan_version(app_db, plan.id, v1_def, creator="agent")

    v2_def = PlanDefinition(
        field_mappings=[
            # Modified first_name
            FieldMapping(
                target_field="first_name",
                source_fields=["full_name"],
                transformations=[
                    TransformRuleInvocation(rule="split_name", params={"part": "first"}),
                ],
                confidence=0.9,
                rationale="Modified",
            ),
            # Added email
            FieldMapping(
                target_field="email",
                source_fields=["email_addr"],
                transformations=[
                    TransformRuleInvocation(rule="trim"),
                    TransformRuleInvocation(rule="lowercase"),
                ],
                confidence=1.0,
                rationale="Email mapping",
            ),
        ]
    )
    v2 = PlanService.create_plan_version(app_db, plan.id, v2_def, creator="user")

    diff = PlanService.compute_diff(app_db, v1.id, v2.id)
    assert not diff.is_identical
    assert diff.v1_num == 1
    assert diff.v2_num == 2

    changes_by_field = {c.field: c.change_type for c in diff.changes}
    assert changes_by_field["customer_id"] == "removed"
    assert changes_by_field["first_name"] == "modified"
    assert changes_by_field["email"] == "added"
