import datetime
import uuid
from typing import Any, Dict, List, Optional, Tuple
from sqlalchemy.orm import Session
from app.core.config import settings
from app.core.errors import AppError, ApprovalRequiredError, BadRequestError, ConflictError, NotFoundError
from app.domain.models import MigrationRun, PlanVersion, TargetCustomer
from app.domain.schemas import ExecutionRequest, MigrationRunOut, RetryRequest, RollbackResult
from app.services.audit_service import AuditService
from app.services.dry_run_service import DryRunService
from app.services.plan_service import PlanService


class MigrationRunner:
    @staticmethod
    def execute_migration(
        app_db: Session,
        target_db: Session,
        request: ExecutionRequest,
        actor: str = "user",
    ) -> MigrationRun:
        """Executes migration of accepted records into mock target database."""
        # 1. Fault injection safety check (A8)
        if request.simulate_failure_at_record is not None and not settings.ENABLE_FAULT_INJECTION:
            raise AppError(
                status_code=403,
                code="FAULT_INJECTION_DISABLED",
                message="Fault injection is disabled. Set ENABLE_FAULT_INJECTION=true in environment to enable.",
            )

        # 2. Enforce strict server-side approval gate
        approved_version = PlanService.verify_approval_gate(app_db, request.plan_version_id)

        # 3. Idempotency Key check & replay (A1)
        idempotency_key = request.idempotency_key or str(uuid.uuid4())
        existing_run = (
            app_db.query(MigrationRun)
            .filter(MigrationRun.idempotency_key == idempotency_key)
            .first()
        )
        if existing_run:
            if existing_run.status == "completed":
                # Replay without writes (HTTP 200, replayed: true)
                existing_run.replayed = True  # type: ignore[attr-defined]
                return existing_run
            run = existing_run
            run.status = "running"
            app_db.commit()
        else:
            # Step 1 of Cross-DB: Write run row as 'running' in app.db (commit) (A3)
            run = MigrationRun(
                plan_version_id=approved_version.id,
                idempotency_key=idempotency_key,
                status="running",
            )
            app_db.add(run)
            app_db.commit()
            app_db.refresh(run)

        # Perform fresh deterministic dry-run to obtain accepted records
        dry_run, results = DryRunService.execute_dry_run(
            db=app_db,
            plan_version_id=approved_version.id,
            actor=actor,
        )

        accepted_records = [r for r in results if r.status == "accepted"]
        run.total_accepted = len(accepted_records)

        inserted_count = 0
        skipped_count = 0
        error_msg = None

        try:
            # Step 2 of Cross-DB: Insert target rows in ONE transaction in target.db (A3)
            for idx, item in enumerate(accepted_records):
                # Fault injection check
                if (
                    request.simulate_failure_at_record is not None
                    and idx == request.simulate_failure_at_record
                ):
                    raise RuntimeError(
                        f"Simulated fault injected at record index {idx} (source_key: {item.source_key})"
                    )

                data = item.transformed_data or {}
                source_key = data.get("source_key", item.source_key)
                email = data.get("email")

                # Target email and source_key conflict checks (A1)
                existing_by_email = (
                    target_db.query(TargetCustomer)
                    .filter(TargetCustomer.email == email)
                    .first()
                )
                if existing_by_email:
                    if existing_by_email.source_key != source_key:
                        raise AppError(
                            status_code=409,
                            code="TARGET_EMAIL_CONFLICT",
                            message=f"Target email conflict: email '{email}' already belongs to source_key '{existing_by_email.source_key}'",
                        )
                    # Same source_key and same email -> already migrated
                    skipped_count += 1
                    continue

                existing_by_source = (
                    target_db.query(TargetCustomer)
                    .filter(TargetCustomer.source_key == source_key)
                    .first()
                )
                if existing_by_source:
                    skipped_count += 1
                    continue

                customer = TargetCustomer(
                    customer_id=data["customer_id"],
                    first_name=data["first_name"],
                    last_name=data["last_name"],
                    email=data["email"],
                    phone_e164=data.get("phone_e164"),
                    date_of_birth=data.get("date_of_birth"),
                    country=data["country"],
                    status=data["status"],
                    created_at=data["created_at"],
                    credit_limit_cents=data.get("credit_limit_cents", 0),
                    loyalty_tier=data.get("loyalty_tier", "BRONZE"),
                    source_key=source_key,
                    plan_version_id=approved_version.id,
                    run_id=run.id,
                )
                target_db.add(customer)
                inserted_count += 1

            target_db.commit()

            # Step 3 of Cross-DB: Update run to 'completed' with counts in app.db (A3)
            run.status = "completed"
            run.completed_at = datetime.datetime.now(datetime.timezone.utc)
            run.inserted_count = inserted_count
            run.skipped_existing_count = skipped_count
            run.failed_count = 0
            run.error_details = None
            app_db.commit()
            app_db.refresh(run)

        except Exception as e:
            target_db.rollback()
            run.status = "failed"
            error_msg = str(e)
            run.error_details = error_msg
            run.inserted_count = 0
            run.skipped_existing_count = 0
            run.failed_count = len(accepted_records)
            app_db.commit()

            AuditService.log_event(
                db=app_db,
                event_type="error",
                actor=actor,
                plan_version_id=approved_version.id,
                run_id=run.id,
                payload={"error": error_msg},
            )
            if isinstance(e, AppError):
                raise e
            raise BadRequestError(f"Migration execution failed: {error_msg}")

        # Log audit
        AuditService.log_event(
            db=app_db,
            event_type="executed",
            actor=actor,
            plan_version_id=approved_version.id,
            run_id=run.id,
            payload={
                "inserted": run.inserted_count,
                "skipped_existing": run.skipped_existing_count,
                "total_accepted": run.total_accepted,
                "status": run.status,
            },
        )

        return run

    @staticmethod
    def retry_migration(
        app_db: Session,
        target_db: Session,
        request: RetryRequest,
        actor: str = "user",
    ) -> MigrationRun:
        """Retry a failed, partial, or stuck run using delta from target contents."""
        # 1. Fault injection safety check (A8)
        if request.simulate_failure_at_record is not None and not settings.ENABLE_FAULT_INJECTION:
            raise AppError(
                status_code=403,
                code="FAULT_INJECTION_DISABLED",
                message="Fault injection is disabled. Set ENABLE_FAULT_INJECTION=true in environment to enable.",
            )

        run = app_db.query(MigrationRun).filter(MigrationRun.id == request.run_id).first()
        if not run:
            raise NotFoundError(f"Migration run '{request.run_id}' not found")

        # Idempotency check for retry if idempotency_key is provided
        if request.idempotency_key and request.idempotency_key == run.idempotency_key and run.status == "completed":
            run.replayed = True  # type: ignore[attr-defined]
            return run

        approved_version = PlanService.verify_approval_gate(app_db, run.plan_version_id)

        # Dry run to get current accepted records
        dry_run, results = DryRunService.execute_dry_run(
            db=app_db,
            plan_version_id=approved_version.id,
            actor=actor,
        )

        accepted_records = [r for r in results if r.status == "accepted"]
        run.total_accepted = len(accepted_records)
        run.status = "running"
        run.error_details = None
        app_db.commit()

        # Compute delta from actual target contents (source_key set difference) (A3)
        existing_target_customers = {
            c.source_key: c for c in target_db.query(TargetCustomer).all()
        }

        inserted_count = 0
        skipped_count = 0

        try:
            for idx, item in enumerate(accepted_records):
                if (
                    request.simulate_failure_at_record is not None
                    and idx == request.simulate_failure_at_record
                ):
                    raise RuntimeError(
                        f"Simulated fault injected during retry at index {idx}"
                    )

                data = item.transformed_data or {}
                source_key = data.get("source_key", item.source_key)
                email = data.get("email")

                # Check if email exists for another source key in target
                existing_email_record = (
                    target_db.query(TargetCustomer)
                    .filter(TargetCustomer.email == email)
                    .first()
                )
                if existing_email_record and existing_email_record.source_key != source_key:
                    raise AppError(
                        status_code=409,
                        code="TARGET_EMAIL_CONFLICT",
                        message=f"Target email conflict: email '{email}' already belongs to source_key '{existing_email_record.source_key}'",
                    )

                if source_key in existing_target_customers:
                    skipped_count += 1
                    continue

                customer = TargetCustomer(
                    customer_id=data["customer_id"],
                    first_name=data["first_name"],
                    last_name=data["last_name"],
                    email=data["email"],
                    phone_e164=data.get("phone_e164"),
                    date_of_birth=data.get("date_of_birth"),
                    country=data["country"],
                    status=data["status"],
                    created_at=data["created_at"],
                    credit_limit_cents=data.get("credit_limit_cents", 0),
                    loyalty_tier=data.get("loyalty_tier", "BRONZE"),
                    source_key=source_key,
                    plan_version_id=approved_version.id,
                    run_id=run.id,
                )
                target_db.add(customer)
                inserted_count += 1

            target_db.commit()

            # Compute actual count in target DB for this run or accepted keys
            total_in_target = target_db.query(TargetCustomer).filter(
                TargetCustomer.source_key.in_([r.source_key for r in accepted_records])
            ).count()

            run.status = "completed"
            run.completed_at = datetime.datetime.now(datetime.timezone.utc)
            run.inserted_count = total_in_target
            run.skipped_existing_count = skipped_count
            run.failed_count = 0
            run.error_details = None
            app_db.commit()
            app_db.refresh(run)

        except Exception as e:
            target_db.rollback()
            run.status = "failed"
            run.error_details = str(e)
            run.failed_count = len(accepted_records) - skipped_count
            app_db.commit()
            if isinstance(e, AppError):
                raise e
            raise BadRequestError(f"Retry execution failed: {str(e)}")

        AuditService.log_event(
            db=app_db,
            event_type="retried",
            actor=actor,
            plan_version_id=approved_version.id,
            run_id=run.id,
            payload={
                "newly_inserted": inserted_count,
                "skipped_existing": skipped_count,
                "total_in_db": run.inserted_count,
                "status": run.status,
            },
        )

        return run

    @staticmethod
    def rollback(
        app_db: Session,
        target_db: Session,
        run_id: Optional[str] = None,
        plan_version_id: Optional[str] = None,
        actor: str = "user",
    ) -> RollbackResult:
        """Rolls back target rows for a specific run or plan version inside a transaction."""
        if not run_id and not plan_version_id:
            raise BadRequestError("Either run_id or plan_version_id must be provided for rollback")

        query = target_db.query(TargetCustomer)
        if run_id:
            query = query.filter(TargetCustomer.run_id == run_id)
        elif plan_version_id:
            query = query.filter(TargetCustomer.plan_version_id == plan_version_id)

        rows_to_delete = query.all()
        deleted_count = len(rows_to_delete)

        if deleted_count > 0:
            for row in rows_to_delete:
                target_db.delete(row)
            target_db.commit()

        if run_id:
            run = app_db.query(MigrationRun).filter(MigrationRun.id == run_id).first()
            if run:
                run.status = "rolled_back"
                app_db.commit()

        AuditService.log_event(
            db=app_db,
            event_type="rolled_back",
            actor=actor,
            plan_version_id=plan_version_id,
            run_id=run_id,
            payload={"deleted_count": deleted_count, "run_id": run_id, "plan_version_id": plan_version_id},
        )

        return RollbackResult(
            run_id=run_id,
            plan_version_id=plan_version_id,
            deleted_count=deleted_count,
            status="completed",
            message=f"Successfully rolled back {deleted_count} records from target database",
        )
