import datetime
import json
import re
from pathlib import Path
from typing import Any, Dict, List, Set, Tuple
import pytest
from app.agent.fallback_agent import FallbackAgent
from app.api.sample_router import load_sample_dataset
from app.core.config import settings
from app.domain.models import MigrationRun, TargetCustomer
from app.domain.schemas import (
    ApprovalRequest,
    ExecutionRequest,
    RetryRequest,
    RollbackRequest,
    SampleLoadRequest,
)
from app.domain.transforms import PlanDefinition
from app.services.dry_run_service import DryRunService, ISO_COUNTRY_CODES
from app.services.migration_runner import MigrationRunner
from app.services.plan_service import PlanService
from app.services.reconciliation_service import ReconciliationService

EMAIL_REGEX = re.compile(r"^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$")


def independent_reference_validator(records: List[Dict[str, Any]]) -> int:
    """Independent reference validator to compute expected accepted records count without using engine code."""
    indexed = sorted(list(enumerate(records)), key=lambda item: (str(item[1].get("cust_id", "")), item[0]))

    claimed_cust_ids: Set[str] = set()
    claimed_emails: Set[str] = set()
    accepted_count = 0

    for original_idx, rec in indexed:
        cust_id = rec.get("cust_id")
        if not cust_id or not str(cust_id).strip():
            continue

        full_name = rec.get("full_name")
        if not full_name or not str(full_name).strip():
            continue
        name_parts = str(full_name).strip().split(None, 1)
        if len(name_parts) < 2:  # mononym fails last_name split
            continue

        email = rec.get("email_addr")
        if not email or not str(email).strip():
            continue
        cleaned_email = str(email).strip().lower()
        if not EMAIL_REGEX.match(cleaned_email):
            continue

        country = rec.get("country_code")
        if not country or str(country).strip().upper() not in ISO_COUNTRY_CODES:
            continue

        status_raw = str(rec.get("status_flag", "")).strip().upper()
        if status_raw not in ("A", "I", "P"):
            continue

        # Phone validation (must contain valid digits)
        phone_raw = rec.get("phone")
        if phone_raw and str(phone_raw).strip():
            phone_str = str(phone_raw).strip()
            digits = re.sub(r"\D", "", phone_str)
            if not digits or len(digits) < 7 or len(digits) > 15:
                continue

        # Validate date of birth if present
        dob_raw = rec.get("dob")
        if dob_raw and str(dob_raw).strip():
            dob_str = str(dob_raw).strip()
            try:
                datetime.datetime.strptime(dob_str, "%d/%m/%Y")
            except ValueError:
                continue

        # Validate signup timestamp
        ts_raw = rec.get("signup_ts")
        if not ts_raw or not str(ts_raw).strip():
            continue
        try:
            datetime.datetime.strptime(str(ts_raw).strip(), "%Y-%m-%d %H:%M:%S")
        except ValueError:
            continue

        # Validate credit limit
        credit_raw = rec.get("credit_limit")
        if credit_raw is not None and str(credit_raw).strip():
            c_str = str(credit_raw).strip().lstrip("$").replace(",", "")
            try:
                c_float = float(c_str)
                if c_float < 0:
                    continue
            except ValueError:
                continue

        # Check duplicate resolution (A5)
        if str(cust_id) in claimed_cust_ids or cleaned_email in claimed_emails:
            continue

        # All passed
        claimed_cust_ids.add(str(cust_id))
        claimed_emails.add(cleaned_email)
        accepted_count += 1

    return accepted_count


SCENARIOS = [
    "baseline_60",
    "realistic_250",
    "stress_500",
    "all_valid_100",
    "all_invalid_40",
    "hostile_inputs",
]


@pytest.mark.parametrize("scenario_name", SCENARIOS)
def test_scenario_full_lifecycle(app_db, target_db, scenario_name):
    """Run full pipeline through API / service layer for each test scenario."""
    # 1. Load scenario into active dataset via endpoint handler
    load_res = load_sample_dataset(SampleLoadRequest(scenario_name=scenario_name), db=app_db)
    assert load_res["status"] == "success"

    scenario_path = settings.DATA_DIR / "scenarios" / f"{scenario_name}.json"
    with open(scenario_path, "r", encoding="utf-8") as f:
        records = json.load(f)

    # 2. Independent validation
    expected_accepted = independent_reference_validator(records)

    # 3. Propose plan via deterministic fallback agent
    proposal = FallbackAgent.generate_proposal()
    plan = PlanService.get_or_create_default_plan(app_db, name=f"Plan-{scenario_name}")
    plan_def = PlanDefinition(
        field_mappings=proposal.field_mappings,
        unmapped_target_fields=[f.field_name for f in proposal.incompatible_or_missing_fields],
        unmapped_source_fields=["legacy_notes"],
    )
    v1 = PlanService.create_plan_version(app_db, plan.id, plan_def, creator="agent")

    # 4. Approve plan
    approved_v1 = PlanService.approve_plan_version(app_db, v1.id, approver="LeadArchitect")
    assert approved_v1.status == "approved"

    # 5. Dry Run x2 to assert determinism & identical hashes
    dry1, res1 = DryRunService.execute_dry_run(app_db, v1.id, records=records)
    dry2, res2 = DryRunService.execute_dry_run(app_db, v1.id, records=records)

    assert dry1.input_hash == dry2.input_hash
    assert dry1.result_hash == dry2.result_hash

    # Assert A4 invariants: source = accepted + quarantined, and accepted <= transformed <= source
    assert dry1.total_source == len(records)
    assert dry1.total_source == dry1.total_accepted + dry1.total_quarantined
    assert dry1.total_accepted <= dry1.total_transformed <= dry1.total_source

    # Assert accepted matches independent reference validator
    assert dry1.total_accepted == expected_accepted

    # Assert target DB is pristine after dry runs
    assert target_db.query(TargetCustomer).count() == 0

    # 6. Execute Migration
    run = MigrationRunner.execute_migration(
        app_db=app_db,
        target_db=target_db,
        request=ExecutionRequest(plan_version_id=v1.id, idempotency_key=f"run-{scenario_name}-1"),
    )
    assert run.status == "completed"
    assert run.inserted_count == expected_accepted

    target_count = target_db.query(TargetCustomer).count()
    assert target_count == expected_accepted

    # Assert no duplicate source_key or email in target
    target_records = target_db.query(TargetCustomer).all()
    source_keys = [t.source_key for t in target_records]
    emails = [t.email for t in target_records]
    assert len(source_keys) == len(set(source_keys))
    assert len(emails) == len(set(emails))

    # 7. Retry (idempotency check)
    retry_run = MigrationRunner.retry_migration(
        app_db=app_db,
        target_db=target_db,
        request=RetryRequest(run_id=run.id),
    )
    assert retry_run.status == "completed"
    assert target_db.query(TargetCustomer).count() == expected_accepted

    # 8. Automated Reconciliation
    recon = ReconciliationService.reconcile(
        app_db=app_db,
        target_db=target_db,
        plan_version_id=v1.id,
        run_id=run.id,
    )
    assert recon.overall_status == "PASS"

    # 9. Rollback
    rb = MigrationRunner.rollback(
        app_db=app_db,
        target_db=target_db,
        run_id=run.id,
        plan_version_id=v1.id,
    )
    assert rb.deleted_count == expected_accepted
    assert target_db.query(TargetCustomer).count() == 0


def test_overflow_501_rejected_with_422(app_db):
    """501 records must trigger 422 limit validation error."""
    scenario_path = settings.DATA_DIR / "scenarios" / "overflow_501.json"
    with open(scenario_path, "r", encoding="utf-8") as f:
        records = json.load(f)
    assert len(records) == 501

    plan = PlanService.get_or_create_default_plan(app_db)
    v1 = PlanService.create_plan_version(app_db, plan.id, PlanDefinition(field_mappings=[]), creator="agent")

    with pytest.raises(Exception) as exc_info:
        DryRunService.execute_dry_run(app_db, v1.id, records=records)
    assert "exceeds the maximum allowed limit of 500" in str(exc_info.value)
