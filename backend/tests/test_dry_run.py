import pytest
from app.core.errors import ValidationError
from app.domain.transforms import FieldMapping, PlanDefinition, TransformRuleInvocation
from app.services.dry_run_service import DryRunService
from app.services.plan_service import PlanService


def get_full_plan_definition() -> PlanDefinition:
    """Returns a full mapping plan for legacy_customers -> customers."""
    return PlanDefinition(
        field_mappings=[
            FieldMapping(
                target_field="customer_id",
                source_fields=["cust_id"],
                transformations=[TransformRuleInvocation(rule="rename")],
                confidence=1.0,
                rationale="Direct ID mapping",
            ),
            FieldMapping(
                target_field="first_name",
                source_fields=["full_name"],
                transformations=[
                    TransformRuleInvocation(rule="trim"),
                    TransformRuleInvocation(rule="split_name", params={"part": "first"}),
                ],
                confidence=0.95,
                rationale="Split first name",
            ),
            FieldMapping(
                target_field="last_name",
                source_fields=["full_name"],
                transformations=[
                    TransformRuleInvocation(rule="trim"),
                    TransformRuleInvocation(rule="split_name", params={"part": "last"}),
                ],
                confidence=0.95,
                rationale="Split last name",
            ),
            FieldMapping(
                target_field="email",
                source_fields=["email_addr"],
                transformations=[
                    TransformRuleInvocation(rule="trim"),
                    TransformRuleInvocation(rule="lowercase"),
                ],
                confidence=1.0,
                rationale="Normalize email",
            ),
            FieldMapping(
                target_field="phone_e164",
                source_fields=["phone"],
                transformations=[
                    TransformRuleInvocation(rule="normalize_phone_e164", params={"default_country": "US"}),
                ],
                confidence=0.9,
                rationale="Normalize phone to E.164",
            ),
            FieldMapping(
                target_field="date_of_birth",
                source_fields=["dob"],
                transformations=[
                    TransformRuleInvocation(rule="parse_date", params={"input_format": "%d/%m/%Y"}),
                ],
                confidence=1.0,
                rationale="Parse ISO date",
            ),
            FieldMapping(
                target_field="country",
                source_fields=["country_code"],
                transformations=[
                    TransformRuleInvocation(rule="trim"),
                    TransformRuleInvocation(rule="uppercase"),
                ],
                confidence=1.0,
                rationale="Uppercase ISO country code",
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
                rationale="Map status flag to enum",
            ),
            FieldMapping(
                target_field="created_at",
                source_fields=["signup_ts"],
                transformations=[
                    TransformRuleInvocation(rule="parse_datetime", params={"input_format": "%Y-%m-%d %H:%M:%S"}),
                ],
                confidence=1.0,
                rationale="Parse ISO creation datetime",
            ),
            FieldMapping(
                target_field="credit_limit_cents",
                source_fields=["credit_limit"],
                transformations=[
                    TransformRuleInvocation(rule="cast_decimal_to_cents"),
                ],
                confidence=1.0,
                rationale="Convert decimal string to cents",
            ),
            FieldMapping(
                target_field="loyalty_tier",
                source_fields=[],
                transformations=[
                    TransformRuleInvocation(rule="default_value", params={"value": "BRONZE"}),
                ],
                confidence=1.0,
                rationale="Default bronze loyalty tier",
            ),
        ]
    )


def test_dry_run_determinism_and_invariants(app_db, sample_records):
    plan = PlanService.get_or_create_default_plan(app_db)
    plan_def = get_full_plan_definition()
    version = PlanService.create_plan_version(app_db, plan.id, plan_def)

    # Execute dry run #1
    dry_run1, results1 = DryRunService.execute_dry_run(app_db, version.id, sample_records)
    
    # Assert counts invariant: source = accepted + quarantined
    assert dry_run1.total_source == len(sample_records)
    assert dry_run1.total_source == dry_run1.total_accepted + dry_run1.total_quarantined
    # Expected roughly 70-75% valid records
    assert 40 <= dry_run1.total_accepted <= 50
    assert 10 <= dry_run1.total_quarantined <= 20

    # Execute dry run #2 and verify deterministic identical hash
    dry_run2, results2 = DryRunService.execute_dry_run(app_db, version.id, sample_records)
    assert dry_run1.input_hash == dry_run2.input_hash
    assert dry_run1.result_hash == dry_run2.result_hash
    assert dry_run1.total_accepted == dry_run2.total_accepted
    assert dry_run1.total_quarantined == dry_run2.total_quarantined

    # Test verify_determinism helper
    verif = DryRunService.verify_determinism(app_db, version.id, iterations=3)
    assert verif["is_deterministic"] is True


def test_quarantine_evidence_preservation(app_db, sample_records):
    plan = PlanService.get_or_create_default_plan(app_db)
    plan_def = get_full_plan_definition()
    version = PlanService.create_plan_version(app_db, plan.id, plan_def)

    dry_run, results = DryRunService.execute_dry_run(app_db, version.id, sample_records)
    quarantined = [r for r in results if r.status == "quarantined"]
    assert len(quarantined) == dry_run.total_quarantined

    for q in quarantined:
        assert len(q.errors) >= 1
        for err in q.errors:
            assert err.field is not None
            assert err.message is not None
            assert err.error_code is not None

    # Verify specific bad records were quarantined as expected
    error_codes = [err.error_code for q in quarantined for err in q.errors]
    assert "DUPLICATE_KEY" in error_codes
    assert "TRANSFORM_ERROR" in error_codes
    assert "REQUIRED_FIELD_MISSING" in error_codes


def test_500_record_limit_enforced(app_db):
    plan = PlanService.get_or_create_default_plan(app_db)
    plan_def = get_full_plan_definition()
    version = PlanService.create_plan_version(app_db, plan.id, plan_def)

    # Generate 501 records
    large_batch = [{"cust_id": f"CUST-{i:04d}", "full_name": "Test User", "email_addr": f"user{i}@test.com"} for i in range(501)]

    with pytest.raises(ValidationError, match="exceeds the maximum allowed limit of 500"):
        DryRunService.execute_dry_run(app_db, version.id, large_batch)
