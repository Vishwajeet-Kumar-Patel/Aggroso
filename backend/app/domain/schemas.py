import datetime
from typing import Any, Dict, List, Literal, Optional
from pydantic import BaseModel, Field
from app.domain.transforms import FieldMapping, PlanDefinition


# ==========================================
# SCHEMA INSPECTION SCHEMAS
# ==========================================


class FieldDefinition(BaseModel):
    name: str
    type: str
    nullable: bool = False
    format: Optional[str] = None
    enum: Optional[List[str]] = None
    default: Optional[Any] = None
    min: Optional[int] = None
    unique: Optional[bool] = None
    description: Optional[str] = None


class SchemaDefinition(BaseModel):
    name: str
    description: Optional[str] = None
    primary_key: List[str] = Field(default_factory=list)
    unique_constraints: Optional[List[List[str]]] = None
    fields: List[FieldDefinition] = Field(default_factory=list)


# ==========================================
# PLAN & VERSION SCHEMAS
# ==========================================


class PlanCreateRequest(BaseModel):
    name: str = "Customer Data Migration Plan"
    description: Optional[str] = None
    plan_definition: PlanDefinition
    creator: str = "agent"


class PlanEditRequest(BaseModel):
    plan_definition: PlanDefinition
    creator: str = "user"


class PlanVersionOut(BaseModel):
    id: str
    plan_id: str
    version_num: int
    mapping_json: Dict[str, Any]
    content_hash: str
    creator: str
    parent_version_id: Optional[str] = None
    status: str
    approver: Optional[str] = None
    approved_at: Optional[datetime.datetime] = None
    approval_hash: Optional[str] = None
    created_at: datetime.datetime

    model_config = {"from_attributes": True}


class PlanOut(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    active_version_id: Optional[str] = None
    active_version: Optional[PlanVersionOut] = None
    created_at: datetime.datetime
    updated_at: datetime.datetime
    versions_count: int = 0

    model_config = {"from_attributes": True}


class DiffChange(BaseModel):
    field: str
    change_type: Literal["added", "removed", "modified", "unchanged"]
    v1_value: Optional[Any] = None
    v2_value: Optional[Any] = None
    details: Optional[str] = None


class PlanVersionDiff(BaseModel):
    v1_id: str
    v1_num: int
    v2_id: str
    v2_num: int
    changes: List[DiffChange]
    is_identical: bool


class ApprovalRequest(BaseModel):
    approver: str = Field(..., min_length=1, description="Approver name or identifier")


class RejectionRequest(BaseModel):
    reason: Optional[str] = None


# ==========================================
# DRY RUN SCHEMAS
# ==========================================


class DryRunRequest(BaseModel):
    plan_version_id: Optional[str] = None
    records: Optional[List[Dict[str, Any]]] = None


class RecordErrorDetail(BaseModel):
    field: str
    rule: Optional[str] = None
    original_value: Optional[Any] = None
    attempted_value: Optional[Any] = None
    message: str
    error_code: str


class TransformedRecordResult(BaseModel):
    index: int
    source_key: Optional[str]
    status: Literal["accepted", "quarantined"]
    transformed_data: Optional[Dict[str, Any]] = None
    errors: List[RecordErrorDetail] = Field(default_factory=list)


class DryRunResult(BaseModel):
    id: str
    plan_version_id: str
    input_hash: str
    result_hash: str
    total_source: int
    total_transformed: int
    total_accepted: int
    total_quarantined: int
    is_deterministic: bool
    created_at: datetime.datetime
    sample_records: List[TransformedRecordResult] = Field(default_factory=list)

    model_config = {"from_attributes": True}


# ==========================================
# QUARANTINE SCHEMAS
# ==========================================


class QuarantinedRecordOut(BaseModel):
    id: str
    dry_run_id: Optional[str]
    run_id: Optional[str]
    record_index: int
    source_key: Optional[str]
    raw_record: Dict[str, Any]
    errors: List[RecordErrorDetail]
    created_at: datetime.datetime

    model_config = {"from_attributes": True}


# ==========================================
# EXECUTION & RETRY SCHEMAS
# ==========================================


class ExecutionRequest(BaseModel):
    plan_version_id: str
    idempotency_key: Optional[str] = None
    simulate_failure_at_record: Optional[int] = Field(
        None,
        description="Fault injection parameter: simulate crash/failure at record index N",
    )


class MigrationRunOut(BaseModel):
    id: str
    plan_version_id: str
    idempotency_key: str
    status: str
    total_accepted: int
    inserted_count: int
    skipped_existing_count: int
    failed_count: int
    replayed: bool = False
    error_details: Optional[str] = None
    started_at: datetime.datetime
    completed_at: Optional[datetime.datetime] = None

    model_config = {"from_attributes": True}


class RetryRequest(BaseModel):
    run_id: str
    idempotency_key: Optional[str] = None
    simulate_failure_at_record: Optional[int] = None


class SampleLoadRequest(BaseModel):
    scenario_name: Optional[str] = None
    records: Optional[List[Dict[str, Any]]] = None


# ==========================================
# ROLLBACK SCHEMAS
# ==========================================


class RollbackRequest(BaseModel):
    run_id: Optional[str] = None
    plan_version_id: Optional[str] = None


class RollbackResult(BaseModel):
    run_id: Optional[str]
    plan_version_id: Optional[str]
    deleted_count: int
    status: str
    message: str


# ==========================================
# RECONCILIATION SCHEMAS
# ==========================================


class ReconciliationCheck(BaseModel):
    name: str
    description: str
    expected: Any
    actual: Any
    status: Literal["PASS", "FAIL"]
    discrepancy_details: Optional[str] = None


class ReconciliationResult(BaseModel):
    plan_version_id: str
    run_id: Optional[str]
    overall_status: Literal["PASS", "FAIL"]
    checks: List[ReconciliationCheck]
    missing_in_target_keys: List[str] = Field(default_factory=list)
    unexpected_target_keys: List[str] = Field(default_factory=list)
    timestamp: datetime.datetime


# ==========================================
# AUDIT EVENT SCHEMAS
# ==========================================


class AuditEventOut(BaseModel):
    id: str
    event_type: str
    actor: str
    timestamp: datetime.datetime
    plan_version_id: Optional[str] = None
    run_id: Optional[str] = None
    payload: Dict[str, Any]

    model_config = {"from_attributes": True}


# ==========================================
# DEMO RESET SCHEMA
# ==========================================


class DemoResetResult(BaseModel):
    status: str
    message: str
    source_records_loaded: int
    app_db_reinitialized: bool
    target_db_reinitialized: bool
