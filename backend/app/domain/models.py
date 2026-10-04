import datetime
import uuid
from typing import Any, Optional
from sqlalchemy import (
    Column,
    String,
    Integer,
    DateTime,
    Text,
    ForeignKey,
    UniqueConstraint,
    JSON,
    Boolean,
)
from sqlalchemy.orm import relationship
from app.core.db import AppBase, TargetBase


def generate_uuid() -> str:
    return str(uuid.uuid4())


def utcnow() -> datetime.datetime:
    return datetime.datetime.now(datetime.timezone.utc)


# ==========================================
# APP DATABASE MODELS (Metadata, Plans, Runs, Audit)
# ==========================================


class Plan(AppBase):
    __tablename__ = "plans"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    name = Column(String(255), nullable=False, default="Legacy to Modern Customer Migration")
    description = Column(Text, nullable=True)
    active_version_id = Column(String(36), nullable=True)
    created_at = Column(DateTime, nullable=False, default=utcnow)
    updated_at = Column(DateTime, nullable=False, default=utcnow, onupdate=utcnow)

    versions = relationship("PlanVersion", back_populates="plan", cascade="all, delete-orphan")


class PlanVersion(AppBase):
    __tablename__ = "plan_versions"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    plan_id = Column(String(36), ForeignKey("plans.id"), nullable=False, index=True)
    version_num = Column(Integer, nullable=False)
    mapping_json = Column(JSON, nullable=False)
    content_hash = Column(String(64), nullable=False, index=True)
    creator = Column(String(100), nullable=False, default="agent")  # "agent" or "user"
    parent_version_id = Column(String(36), ForeignKey("plan_versions.id"), nullable=True)
    status = Column(String(50), nullable=False, default="draft")  # draft, approved, superseded, rejected
    approver = Column(String(100), nullable=True)
    approved_at = Column(DateTime, nullable=True)
    approval_hash = Column(String(64), nullable=True)
    created_at = Column(DateTime, nullable=False, default=utcnow)

    plan = relationship("Plan", back_populates="versions")
    dry_runs = relationship("DryRun", back_populates="plan_version")
    migration_runs = relationship("MigrationRun", back_populates="plan_version")

    __table_args__ = (
        UniqueConstraint("plan_id", "version_num", name="uq_plan_version_num"),
    )


class DryRun(AppBase):
    __tablename__ = "dry_runs"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    plan_version_id = Column(String(36), ForeignKey("plan_versions.id"), nullable=False, index=True)
    input_hash = Column(String(64), nullable=False)
    result_hash = Column(String(64), nullable=False)
    total_source = Column(Integer, nullable=False)
    total_transformed = Column(Integer, nullable=False)
    total_accepted = Column(Integer, nullable=False)
    total_quarantined = Column(Integer, nullable=False)
    is_deterministic = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, nullable=False, default=utcnow)

    plan_version = relationship("PlanVersion", back_populates="dry_runs")
    quarantined_records = relationship("QuarantinedRecord", back_populates="dry_run", cascade="all, delete-orphan")


class QuarantinedRecord(AppBase):
    __tablename__ = "quarantined_records"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    dry_run_id = Column(String(36), ForeignKey("dry_runs.id"), nullable=True, index=True)
    run_id = Column(String(36), nullable=True, index=True)
    record_index = Column(Integer, nullable=False)
    source_key = Column(String(255), nullable=True, index=True)
    raw_record_json = Column(JSON, nullable=False)
    errors_json = Column(JSON, nullable=False)
    created_at = Column(DateTime, nullable=False, default=utcnow)

    dry_run = relationship("DryRun", back_populates="quarantined_records")


class MigrationRun(AppBase):
    __tablename__ = "migration_runs"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    plan_version_id = Column(String(36), ForeignKey("plan_versions.id"), nullable=False, index=True)
    idempotency_key = Column(String(64), nullable=False, unique=True, index=True)
    status = Column(String(50), nullable=False, default="in_progress")  # in_progress, completed, failed, rolled_back
    total_accepted = Column(Integer, nullable=False, default=0)
    inserted_count = Column(Integer, nullable=False, default=0)
    skipped_existing_count = Column(Integer, nullable=False, default=0)
    failed_count = Column(Integer, nullable=False, default=0)
    error_details = Column(Text, nullable=True)
    started_at = Column(DateTime, nullable=False, default=utcnow)
    completed_at = Column(DateTime, nullable=True)

    plan_version = relationship("PlanVersion", back_populates="migration_runs")


class AuditEvent(AppBase):
    __tablename__ = "audit_events"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    event_type = Column(String(100), nullable=False, index=True)
    # Types: agent_proposal, plan_created, plan_edited, approved, rejected, dry_run, executed, retried, reconciled, rolled_back, error
    actor = Column(String(100), nullable=False)
    timestamp = Column(DateTime, nullable=False, default=utcnow, index=True)
    plan_version_id = Column(String(36), nullable=True, index=True)
    run_id = Column(String(36), nullable=True, index=True)
    payload_json = Column(JSON, nullable=False)


# ==========================================
# TARGET DATABASE MODEL (Mock Target Store)
# ==========================================


class TargetCustomer(TargetBase):
    __tablename__ = "customers"

    customer_id = Column(String(255), primary_key=True)
    first_name = Column(String(255), nullable=False)
    last_name = Column(String(255), nullable=False)
    email = Column(String(255), nullable=False, unique=True, index=True)
    phone_e164 = Column(String(50), nullable=True)
    date_of_birth = Column(String(50), nullable=True)
    country = Column(String(10), nullable=False)
    status = Column(String(50), nullable=False)  # ACTIVE, INACTIVE, PENDING
    created_at = Column(String(50), nullable=False)
    credit_limit_cents = Column(Integer, nullable=False, default=0)
    loyalty_tier = Column(String(50), nullable=False, default="BRONZE")

    # Provenance tracking fields
    source_key = Column(String(255), nullable=False, unique=True, index=True)
    plan_version_id = Column(String(36), nullable=False, index=True)
    run_id = Column(String(36), nullable=False, index=True)
