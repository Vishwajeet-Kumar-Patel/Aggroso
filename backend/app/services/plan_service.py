import datetime
from typing import Any, Dict, List, Optional, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import desc
from app.core.errors import ApprovalRequiredError, BadRequestError, NotFoundError
from app.core.hashing import canonical_json, compute_sha256
from app.domain.models import Plan, PlanVersion
from app.domain.schemas import DiffChange, PlanVersionDiff
from app.domain.transforms import PlanDefinition
from app.services.audit_service import AuditService


class PlanService:
    @staticmethod
    def get_or_create_default_plan(db: Session, name: str = "Customer Data Migration Plan") -> Plan:
        plan = db.query(Plan).first()
        if not plan:
            plan = Plan(name=name, description="Default migration plan for legacy customers")
            db.add(plan)
            db.commit()
            db.refresh(plan)
        return plan

    @staticmethod
    def create_plan_version(
        db: Session,
        plan_id: str,
        plan_def: PlanDefinition,
        creator: str = "agent",
        parent_version_id: Optional[str] = None,
    ) -> PlanVersion:
        """Create a new immutable plan version."""
        plan = db.query(Plan).filter(Plan.id == plan_id).first()
        if not plan:
            raise NotFoundError(f"Plan '{plan_id}' not found")

        # Determine next version number
        last_version = (
            db.query(PlanVersion)
            .filter(PlanVersion.plan_id == plan_id)
            .order_by(desc(PlanVersion.version_num))
            .first()
        )
        next_version_num = (last_version.version_num + 1) if last_version else 1

        # If previous version was active/approved, mark as superseded
        if last_version and last_version.status == "approved":
            last_version.status = "superseded"

        mapping_dict = plan_def.model_dump()
        content_hash = compute_sha256(mapping_dict)

        version = PlanVersion(
            plan_id=plan_id,
            version_num=next_version_num,
            mapping_json=mapping_dict,
            content_hash=content_hash,
            creator=creator,
            parent_version_id=parent_version_id or (last_version.id if last_version else None),
            status="draft",
        )
        db.add(version)
        db.flush()

        # Update active version on plan
        plan.active_version_id = version.id
        plan.updated_at = datetime.datetime.now(datetime.timezone.utc)
        db.commit()
        db.refresh(version)

        # Log audit event
        event_type = "plan_created" if next_version_num == 1 else "plan_edited"
        AuditService.log_event(
            db=db,
            event_type=event_type,
            actor=creator,
            plan_version_id=version.id,
            payload={
                "version_num": version.version_num,
                "content_hash": version.content_hash,
                "fields_count": len(plan_def.field_mappings),
                "parent_version_id": version.parent_version_id,
            },
        )

        return version

    @staticmethod
    def get_plan_version(db: Session, plan_version_id: str) -> PlanVersion:
        version = db.query(PlanVersion).filter(PlanVersion.id == plan_version_id).first()
        if not version:
            raise NotFoundError(f"Plan version '{plan_version_id}' not found")
        return version

    @staticmethod
    def list_plan_versions(db: Session, plan_id: str) -> List[PlanVersion]:
        return (
            db.query(PlanVersion)
            .filter(PlanVersion.plan_id == plan_id)
            .order_by(desc(PlanVersion.version_num))
            .all()
        )

    @staticmethod
    def approve_plan_version(
        db: Session,
        plan_version_id: str,
        approver: str,
    ) -> PlanVersion:
        """Approve an exact immutable plan version."""
        version = PlanService.get_plan_version(db, plan_version_id)
        if version.status == "superseded":
            raise BadRequestError("Cannot approve a superseded plan version")

        # Verify content hash integrity
        calculated_hash = compute_sha256(version.mapping_json)
        if calculated_hash != version.content_hash:
            raise BadRequestError("Plan content hash mismatch - data may have been corrupted")

        # Supersede any other currently approved versions for this plan
        other_approved = (
            db.query(PlanVersion)
            .filter(PlanVersion.plan_id == version.plan_id, PlanVersion.id != version.id, PlanVersion.status == "approved")
            .all()
        )
        for ov in other_approved:
            ov.status = "superseded"

        version.status = "approved"
        version.approver = approver
        version.approved_at = datetime.datetime.now(datetime.timezone.utc)
        version.approval_hash = calculated_hash

        # Update active version on plan
        plan = db.query(Plan).filter(Plan.id == version.plan_id).first()
        if plan:
            plan.active_version_id = version.id

        db.commit()
        db.refresh(version)

        # Log audit
        AuditService.log_event(
            db=db,
            event_type="approved",
            actor=approver,
            plan_version_id=version.id,
            payload={
                "version_num": version.version_num,
                "approval_hash": version.approval_hash,
                "approver": approver,
            },
        )

        return version

    @staticmethod
    def reject_plan_version(
        db: Session,
        plan_version_id: str,
        reason: Optional[str] = None,
        actor: str = "user",
    ) -> PlanVersion:
        """Reject a plan version."""
        version = PlanService.get_plan_version(db, plan_version_id)
        version.status = "rejected"
        db.commit()
        db.refresh(version)

        AuditService.log_event(
            db=db,
            event_type="rejected",
            actor=actor,
            plan_version_id=version.id,
            payload={"version_num": version.version_num, "reason": reason},
        )
        return version

    @staticmethod
    def verify_approval_gate(db: Session, plan_version_id: str) -> PlanVersion:
        """Strict server-side approval verification gate."""
        version = PlanService.get_plan_version(db, plan_version_id)
        if version.status != "approved":
            raise ApprovalRequiredError(
                f"Plan version v{version.version_num} is in status '{version.status}', but must be 'approved' to execute."
            )

        current_hash = compute_sha256(version.mapping_json)
        if not version.approval_hash or version.approval_hash != current_hash or version.content_hash != current_hash:
            raise ApprovalRequiredError(
                f"Plan version v{version.version_num} content hash has changed since approval."
            )

        return version

    @staticmethod
    def compute_diff(db: Session, v1_id: str, v2_id: str) -> PlanVersionDiff:
        """Compute structured field-by-field diff between two plan versions."""
        v1 = PlanService.get_plan_version(db, v1_id)
        v2 = PlanService.get_plan_version(db, v2_id)

        v1_mappings = {m["target_field"]: m for m in v1.mapping_json.get("field_mappings", [])}
        v2_mappings = {m["target_field"]: m for m in v2.mapping_json.get("field_mappings", [])}

        all_fields = sorted(list(set(v1_mappings.keys()) | set(v2_mappings.keys())))
        changes: List[DiffChange] = []

        for field in all_fields:
            if field in v1_mappings and field not in v2_mappings:
                changes.append(
                    DiffChange(
                        field=field,
                        change_type="removed",
                        v1_value=v1_mappings[field],
                        v2_value=None,
                        details=f"Field '{field}' mapping was removed in v{v2.version_num}",
                    )
                )
            elif field not in v1_mappings and field in v2_mappings:
                changes.append(
                    DiffChange(
                        field=field,
                        change_type="added",
                        v1_value=None,
                        v2_value=v2_mappings[field],
                        details=f"Field '{field}' mapping was added in v{v2.version_num}",
                    )
                )
            else:
                m1 = v1_mappings[field]
                m2 = v2_mappings[field]
                if canonical_json(m1) != canonical_json(m2):
                    changes.append(
                        DiffChange(
                            field=field,
                            change_type="modified",
                            v1_value=m1,
                            v2_value=m2,
                            details=f"Field '{field}' transformations/sources modified",
                        )
                    )
                else:
                    changes.append(
                        DiffChange(
                            field=field,
                            change_type="unchanged",
                            v1_value=m1,
                            v2_value=m2,
                            details="No changes",
                        )
                    )

        is_identical = all(c.change_type == "unchanged" for c in changes)
        return PlanVersionDiff(
            v1_id=v1.id,
            v1_num=v1.version_num,
            v2_id=v2.id,
            v2_num=v2.version_num,
            changes=changes,
            is_identical=is_identical,
        )
