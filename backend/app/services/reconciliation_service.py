import datetime
from typing import Any, Dict, List, Optional
from sqlalchemy.orm import Session
from app.domain.models import MigrationRun, TargetCustomer
from app.domain.schemas import ReconciliationCheck, ReconciliationResult
from app.services.audit_service import AuditService
from app.services.dry_run_service import DryRunService
from app.services.plan_service import PlanService


class ReconciliationService:
    @staticmethod
    def reconcile(
        app_db: Session,
        target_db: Session,
        plan_version_id: str,
        run_id: Optional[str] = None,
        actor: str = "system",
    ) -> ReconciliationResult:
        """Perform comprehensive automated reconciliation between source, dry run, and target database."""
        version = PlanService.get_plan_version(app_db, plan_version_id)
        
        # Execute dry-run to get ground-truth expected sets
        dry_run, results = DryRunService.execute_dry_run(
            db=app_db,
            plan_version_id=version.id,
            actor=actor,
        )

        accepted_records = [r for r in results if r.status == "accepted"]
        quarantined_records = [r for r in results if r.status == "quarantined"]
        
        expected_accepted_count = len(accepted_records)
        expected_source_count = dry_run.total_source
        expected_quarantined_count = len(quarantined_records)
        expected_source_keys = {r.source_key for r in accepted_records if r.source_key}

        # Query actual records from target DB
        query = target_db.query(TargetCustomer)
        if run_id:
            query = query.filter(TargetCustomer.run_id == run_id)
        else:
            query = query.filter(TargetCustomer.plan_version_id == version.id)

        target_customers = query.all()
        actual_target_count = len(target_customers)
        actual_target_keys = {c.source_key for c in target_customers}

        checks: List[ReconciliationCheck] = []

        # Check 1: Invariant (Source = Accepted + Quarantined)
        inv_sum = expected_accepted_count + expected_quarantined_count
        inv_passed = (expected_source_count == inv_sum)
        checks.append(
            ReconciliationCheck(
                name="Source vs (Accepted + Quarantined) Invariant",
                description="Verifies that all source records are strictly partitioned into accepted or quarantined",
                expected=expected_source_count,
                actual=inv_sum,
                status="PASS" if inv_passed else "FAIL",
                discrepancy_details=None if inv_passed else f"Discrepancy: source ({expected_source_count}) != accepted ({expected_accepted_count}) + quarantined ({expected_quarantined_count})",
            )
        )

        # Check 2: Accepted Count vs Target Database Row Count
        count_passed = (expected_accepted_count == actual_target_count)
        checks.append(
            ReconciliationCheck(
                name="Accepted Records vs Target Store Count",
                description="Verifies that target row count matches accepted dry-run record count exactly",
                expected=expected_accepted_count,
                actual=actual_target_count,
                status="PASS" if count_passed else "FAIL",
                discrepancy_details=None if count_passed else f"Expected {expected_accepted_count} rows in target store, but found {actual_target_count}",
            )
        )

        # Check 3: Key-Set Discrepancies
        missing_in_target = sorted(list(expected_source_keys - actual_target_keys))
        unexpected_in_target = sorted(list(actual_target_keys - expected_source_keys))

        keys_passed = (len(missing_in_target) == 0 and len(unexpected_in_target) == 0)
        checks.append(
            ReconciliationCheck(
                name="Key-Set Integrity Check",
                description="Verifies 1:1 primary key correspondence with no missing or orphaned records",
                expected="0 missing, 0 unexpected",
                actual=f"{len(missing_in_target)} missing, {len(unexpected_in_target)} unexpected",
                status="PASS" if keys_passed else "FAIL",
                discrepancy_details=None if keys_passed else f"Missing keys: {missing_in_target[:5]}, Unexpected: {unexpected_in_target[:5]}",
            )
        )

        overall_status = "PASS" if all(c.status == "PASS" for c in checks) else "FAIL"

        result = ReconciliationResult(
            plan_version_id=version.id,
            run_id=run_id,
            overall_status=overall_status,
            checks=checks,
            missing_in_target_keys=missing_in_target,
            unexpected_target_keys=unexpected_in_target,
            timestamp=datetime.datetime.now(datetime.timezone.utc),
        )

        # Log audit
        AuditService.log_event(
            db=app_db,
            event_type="reconciled",
            actor=actor,
            plan_version_id=version.id,
            run_id=run_id,
            payload={
                "overall_status": overall_status,
                "expected_accepted": expected_accepted_count,
                "actual_target": actual_target_count,
                "missing_count": len(missing_in_target),
                "unexpected_count": len(unexpected_in_target),
            },
        )

        return result
