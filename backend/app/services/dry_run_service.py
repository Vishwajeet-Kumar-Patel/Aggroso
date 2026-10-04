import datetime
import json
import re
from typing import Any, Dict, List, Optional, Set, Tuple
from sqlalchemy.orm import Session
from app.core.config import settings
from app.core.errors import BadRequestError, ValidationError
from app.core.hashing import canonical_json, compute_batch_hash, compute_sha256
from app.domain.models import DryRun, PlanVersion, QuarantinedRecord
from app.domain.schemas import DryRunResult, RecordErrorDetail, TransformedRecordResult
from app.domain.transforms import FieldMapping, PlanDefinition
from app.services.audit_service import AuditService
from app.services.plan_service import PlanService
from app.services.transform_engine import TransformEngine, TransformExecutionError

# Validation regexes & enums
EMAIL_REGEX = re.compile(r"^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$")
ISO_COUNTRY_CODES = {
    "AF", "AX", "AL", "DZ", "AS", "AD", "AO", "AI", "AQ", "AG", "AR", "AM", "AW", "AU", "AT",
    "AZ", "BS", "BH", "BD", "BB", "BY", "BE", "BZ", "BJ", "BM", "BT", "BO", "BQ", "BA", "BW",
    "BV", "BR", "IO", "BN", "BG", "BF", "BI", "KH", "CM", "CA", "CV", "KY", "CF", "TD", "CL",
    "CN", "CX", "CC", "CO", "KM", "CG", "CD", "CK", "CR", "CI", "HR", "CU", "CW", "CY", "CZ",
    "DK", "DJ", "DM", "DO", "EC", "EG", "SV", "GQ", "ER", "EE", "ET", "FK", "FO", "FJ", "FI",
    "FR", "GF", "PF", "TF", "GA", "GM", "GE", "DE", "GH", "GI", "GR", "GL", "GD", "GP", "GU",
    "GT", "GG", "GN", "GW", "GY", "HT", "HM", "VA", "HN", "HK", "HU", "IS", "IN", "ID", "IR",
    "IQ", "IE", "IM", "IL", "IT", "JM", "JP", "JE", "JO", "KZ", "KE", "KI", "KP", "KR", "KW",
    "KG", "LA", "LV", "LB", "LS", "LR", "LY", "LI", "LT", "LU", "MO", "MK", "MG", "MW", "MY",
    "MV", "ML", "MT", "MH", "MQ", "MR", "MU", "YT", "MX", "FM", "MD", "MC", "MN", "ME", "MS",
    "MA", "MZ", "MM", "NA", "NR", "NP", "NL", "NC", "NZ", "NI", "NE", "NG", "NU", "NF", "MP",
    "NO", "OM", "PK", "PW", "PS", "PA", "PG", "PY", "PE", "PH", "PN", "PL", "PT", "PR", "QA",
    "RE", "RO", "RU", "RW", "BL", "SH", "KN", "LC", "MF", "PM", "VC", "WS", "SM", "ST", "SA",
    "SN", "RS", "SC", "SL", "SG", "SX", "SK", "SI", "SB", "SO", "ZA", "GS", "SS", "ES", "LK",
    "SD", "SR", "SJ", "SZ", "SE", "CH", "SY", "TW", "TJ", "TZ", "TH", "TL", "TG", "TK", "TO",
    "TT", "TN", "TR", "TM", "TC", "TV", "UG", "UA", "AE", "GB", "US", "UM", "UY", "UZ", "VU",
    "VE", "VN", "VG", "VI", "WF", "EH", "YE", "ZM", "ZW",
}

VALID_STATUSES = {"ACTIVE", "INACTIVE", "PENDING"}
VALID_LOYALTY_TIERS = {"BRONZE", "SILVER", "GOLD", "PLATINUM"}


class DryRunService:
    @staticmethod
    def load_default_sample_records() -> List[Dict[str, Any]]:
        with open(settings.SOURCE_SAMPLE_PATH, "r", encoding="utf-8") as f:
            return json.load(f)

    @staticmethod
    def validate_and_transform_single_record(
        raw_record: Dict[str, Any],
        mappings: List[FieldMapping],
        record_index: int,
    ) -> Tuple[Optional[Dict[str, Any]], List[RecordErrorDetail], bool]:
        """Applies transformation mapping to a single record and validates target schema rules.
        Returns: (transformed_data, errors, is_transformed) where is_transformed is True if all transform rules ran without error.
        """
        errors: List[RecordErrorDetail] = []
        transformed: Dict[str, Any] = {}
        is_transformed = True

        source_key = raw_record.get("cust_id")
        if not source_key:
            source_key = f"ROW-{record_index}"

        # 1. Apply field mappings and transformation rules
        for mapping in mappings:
            target_field = mapping.target_field
            value, error = TransformEngine.apply_mapping(mapping, raw_record)
            if error:
                is_transformed = False
                errors.append(
                    RecordErrorDetail(
                        field=target_field,
                        rule=error.rule,
                        original_value=error.original_value,
                        attempted_value=None,
                        message=error.message,
                        error_code="TRANSFORM_ERROR",
                    )
                )
            else:
                transformed[target_field] = value

        # 2. Target Schema Constraints Validation
        # Required fields check
        required_fields = ["customer_id", "first_name", "last_name", "email", "country", "status", "created_at"]
        for rf in required_fields:
            if rf not in transformed or transformed[rf] is None or (isinstance(transformed[rf], str) and not transformed[rf].strip()):
                errors.append(
                    RecordErrorDetail(
                        field=rf,
                        rule="required_field",
                        original_value=raw_record.get(rf) or raw_record.get("full_name" if "name" in rf else rf),
                        attempted_value=transformed.get(rf),
                        message=f"Field '{rf}' is required and cannot be empty",
                        error_code="REQUIRED_FIELD_MISSING",
                    )
                )

        # Email format validation
        email_val = transformed.get("email")
        if email_val:
            if not EMAIL_REGEX.match(str(email_val)):
                errors.append(
                    RecordErrorDetail(
                        field="email",
                        rule="email_format",
                        original_value=raw_record.get("email_addr"),
                        attempted_value=email_val,
                        message=f"Invalid email address format: '{email_val}'",
                        error_code="INVALID_EMAIL_FORMAT",
                    )
                )

        # Country ISO-2 uppercase validation
        country_val = transformed.get("country")
        if country_val:
            if str(country_val).upper() not in ISO_COUNTRY_CODES:
                errors.append(
                    RecordErrorDetail(
                        field="country",
                        rule="iso2_enum",
                        original_value=raw_record.get("country_code"),
                        attempted_value=country_val,
                        message=f"Country code '{country_val}' is not a valid ISO-2 uppercase country code",
                        error_code="INVALID_COUNTRY_CODE",
                    )
                )

        # Status enum validation
        status_val = transformed.get("status")
        if status_val:
            if status_val not in VALID_STATUSES:
                errors.append(
                    RecordErrorDetail(
                        field="status",
                        rule="status_enum",
                        original_value=raw_record.get("status_flag"),
                        attempted_value=status_val,
                        message=f"Status '{status_val}' is not one of {list(VALID_STATUSES)}",
                        error_code="INVALID_STATUS_ENUM",
                    )
                )

        # Loyalty tier enum validation
        loyalty_val = transformed.get("loyalty_tier", "BRONZE")
        if loyalty_val not in VALID_LOYALTY_TIERS:
            errors.append(
                RecordErrorDetail(
                    field="loyalty_tier",
                    rule="loyalty_tier_enum",
                    original_value=None,
                    attempted_value=loyalty_val,
                    message=f"Loyalty tier '{loyalty_val}' is not one of {list(VALID_LOYALTY_TIERS)}",
                    error_code="INVALID_LOYALTY_TIER",
                )
            )

        # Credit limit cents validation (integer >= 0)
        credit_cents = transformed.get("credit_limit_cents")
        if credit_cents is not None:
            if not isinstance(credit_cents, int) or credit_cents < 0:
                errors.append(
                    RecordErrorDetail(
                        field="credit_limit_cents",
                        rule="non_negative_integer",
                        original_value=raw_record.get("credit_limit"),
                        attempted_value=credit_cents,
                        message=f"Credit limit cents must be an integer >= 0, got '{credit_cents}'",
                        error_code="INVALID_CREDIT_LIMIT",
                    )
                )

        # Default source_key and provenance fields in transformed payload
        transformed["source_key"] = source_key
        if "loyalty_tier" not in transformed or not transformed["loyalty_tier"]:
            transformed["loyalty_tier"] = "BRONZE"
        if "credit_limit_cents" not in transformed or transformed["credit_limit_cents"] is None:
            transformed["credit_limit_cents"] = 0

        if errors:
            return None, errors, is_transformed
        return transformed, [], is_transformed

    @staticmethod
    def execute_dry_run(
        db: Session,
        plan_version_id: str,
        records: Optional[List[Dict[str, Any]]] = None,
        actor: str = "user",
    ) -> Tuple[DryRun, List[TransformedRecordResult]]:
        """Run deterministic dry run for a plan version against source records."""
        version = PlanService.get_plan_version(db, plan_version_id)
        raw_mappings = version.mapping_json.get("field_mappings", [])
        field_mappings = [FieldMapping(**m) for m in raw_mappings]

        source_records = records if records is not None else DryRunService.load_default_sample_records()

        # Enforce server-side 500 records limit
        if len(source_records) > settings.MAX_SOURCE_RECORDS:
            raise ValidationError(
                f"Source record count ({len(source_records)}) exceeds the maximum allowed limit of {settings.MAX_SOURCE_RECORDS} records."
            )

        # Deterministic sorting: sort records by primary key 'cust_id' if present, preserving original index
        indexed_records = list(enumerate(source_records))
        indexed_records.sort(key=lambda item: (str(item[1].get("cust_id", "")), item[0]))

        # Calculate input hash
        input_hash = compute_batch_hash([rec for _, rec in indexed_records])

        # Claimed keys map: key -> winning_cust_id (Only valid records claim keys)
        claimed_cust_ids: Dict[str, str] = {}
        claimed_emails: Dict[str, str] = {}

        transformed_results: List[TransformedRecordResult] = []
        accepted_payloads: List[Dict[str, Any]] = []

        total_source = len(indexed_records)
        total_transformed = 0
        total_accepted = 0
        total_quarantined = 0

        dry_run = DryRun(
            plan_version_id=version.id,
            input_hash=input_hash,
            result_hash="",
            total_source=total_source,
            total_transformed=0,
            total_accepted=0,
            total_quarantined=0,
            is_deterministic=True,
        )
        db.add(dry_run)
        db.flush()

        for original_idx, raw_rec in indexed_records:
            source_key = raw_rec.get("cust_id", f"ROW-{original_idx}")
            transformed_data, errors, is_transformed = DryRunService.validate_and_transform_single_record(
                raw_record=raw_rec,
                mappings=field_mappings,
                record_index=original_idx,
            )

            if is_transformed:
                total_transformed += 1

            if errors or not transformed_data:
                # Record failed transformation or field validations -> quarantined; DOES NOT claim keys
                total_quarantined += 1
                result_item = TransformedRecordResult(
                    index=original_idx,
                    source_key=source_key,
                    status="quarantined",
                    transformed_data=None,
                    errors=errors,
                )
                transformed_results.append(result_item)

                q_record = QuarantinedRecord(
                    dry_run_id=dry_run.id,
                    record_index=original_idx,
                    source_key=source_key,
                    raw_record_json=raw_rec,
                    errors_json=[e.model_dump() for e in errors],
                )
                db.add(q_record)
                continue

            # Record passed field validations -> evaluate batch uniqueness / duplicate resolution (A5)
            cust_id_val = transformed_data.get("customer_id") or source_key
            email_val = transformed_data.get("email")
            normalized_email = str(email_val).strip().lower() if email_val else None

            duplicate_errors: List[RecordErrorDetail] = []

            if cust_id_val in claimed_cust_ids:
                winning_id = claimed_cust_ids[cust_id_val]
                duplicate_errors.append(
                    RecordErrorDetail(
                        field="customer_id",
                        rule="duplicate_resolution",
                        original_value=source_key,
                        attempted_value=cust_id_val,
                        message=f"Duplicate cust_id '{cust_id_val}' detected within batch (winning record: {winning_id})",
                        error_code="DUPLICATE_KEY",
                    )
                )

            if normalized_email and normalized_email in claimed_emails:
                winning_id = claimed_emails[normalized_email]
                duplicate_errors.append(
                    RecordErrorDetail(
                        field="email",
                        rule="duplicate_resolution",
                        original_value=raw_rec.get("email_addr"),
                        attempted_value=email_val,
                        message=f"Duplicate email '{email_val}' detected within batch (winning record: {winning_id})",
                        error_code="DUPLICATE_KEY",
                    )
                )

            if duplicate_errors:
                total_quarantined += 1
                result_item = TransformedRecordResult(
                    index=original_idx,
                    source_key=source_key,
                    status="quarantined",
                    transformed_data=None,
                    errors=duplicate_errors,
                )
                transformed_results.append(result_item)

                q_record = QuarantinedRecord(
                    dry_run_id=dry_run.id,
                    record_index=original_idx,
                    source_key=source_key,
                    raw_record_json=raw_rec,
                    errors_json=[e.model_dump() for e in duplicate_errors],
                )
                db.add(q_record)
            else:
                # ACCEPTED: Claim keys
                claimed_cust_ids[cust_id_val] = cust_id_val
                if normalized_email:
                    claimed_emails[normalized_email] = cust_id_val

                total_accepted += 1
                accepted_payloads.append(transformed_data)
                result_item = TransformedRecordResult(
                    index=original_idx,
                    source_key=source_key,
                    status="accepted",
                    transformed_data=transformed_data,
                    errors=[],
                )
                transformed_results.append(result_item)

        # Invariant assertions: source = accepted + quarantined, and accepted <= transformed <= source
        assert total_source == total_accepted + total_quarantined, (
            f"Invariant violated: total_source ({total_source}) != accepted ({total_accepted}) + quarantined ({total_quarantined})"
        )
        assert total_accepted <= total_transformed <= total_source, (
            f"Invariant violated: accepted ({total_accepted}) <= transformed ({total_transformed}) <= source ({total_source})"
        )

        # Deterministic result hash
        result_content = {
            "plan_hash": version.content_hash,
            "input_hash": input_hash,
            "accepted": accepted_payloads,
            "quarantined_count": total_quarantined,
        }
        result_hash = compute_sha256(result_content)

        dry_run.result_hash = result_hash
        dry_run.total_transformed = total_transformed
        dry_run.total_accepted = total_accepted
        dry_run.total_quarantined = total_quarantined
        db.commit()
        db.refresh(dry_run)

        # Log audit
        AuditService.log_event(
            db=db,
            event_type="dry_run",
            actor=actor,
            plan_version_id=version.id,
            payload={
                "dry_run_id": dry_run.id,
                "input_hash": input_hash,
                "result_hash": result_hash,
                "total_source": total_source,
                "total_transformed": total_transformed,
                "total_accepted": total_accepted,
                "total_quarantined": total_quarantined,
            },
        )

        return dry_run, transformed_results

    @staticmethod
    def verify_determinism(
        db: Session,
        plan_version_id: str,
        iterations: int = 3,
    ) -> Dict[str, Any]:
        """Run dry run multiple times and verify byte-identical result hashes."""
        hashes = []
        for _ in range(iterations):
            dry_run, _ = DryRunService.execute_dry_run(db, plan_version_id)
            hashes.append(dry_run.result_hash)

        is_deterministic = len(set(hashes)) == 1
        return {
            "plan_version_id": plan_version_id,
            "iterations": iterations,
            "result_hashes": hashes,
            "is_deterministic": is_deterministic,
        }
