import csv
import io
import json
from pathlib import Path
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, File, Query, UploadFile
from sqlalchemy.orm import Session
from app.core.config import settings
from app.core.db import get_app_db
from app.core.errors import BadRequestError, NotFoundError, ValidationError
from app.domain.schemas import SampleLoadRequest
from app.services.audit_service import AuditService

router = APIRouter(prefix="/sample", tags=["Sample Data"])


@router.get("")
def get_sample_records(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
) -> Dict[str, Any]:
    """Retrieve paginated source sample records."""
    if not settings.SOURCE_SAMPLE_PATH.exists():
        return {"total": 0, "limit": limit, "offset": offset, "records": []}
    with open(settings.SOURCE_SAMPLE_PATH, "r", encoding="utf-8") as f:
        records: List[Dict[str, Any]] = json.load(f)

    total = len(records)
    paginated = records[offset : offset + limit]
    return {
        "total": total,
        "limit": limit,
        "offset": offset,
        "records": paginated,
    }


@router.get("/scenarios")
def list_scenarios() -> List[Dict[str, Any]]:
    """List all available test and validation scenarios."""
    scenarios_dir = settings.DATA_DIR / "scenarios"
    if not scenarios_dir.exists():
        return []

    results = []
    for filepath in sorted(scenarios_dir.glob("*.json")):
        scenario_name = filepath.stem
        try:
            with open(filepath, "r", encoding="utf-8") as f:
                data = json.load(f)
            count = len(data) if isinstance(data, list) else 0
        except Exception:
            count = 0

        descriptions = {
            "baseline_60": "Baseline seed dataset (60 legacy customer records)",
            "realistic_250": "Realistic human-entered dataset (250 multi-cultural records with messy formatting & duplicates)",
            "stress_500": "Stress dataset (500 records upper-bound scale test)",
            "all_valid_100": "All valid dataset (100 clean records, 100% acceptance expected)",
            "all_invalid_40": "All invalid dataset (40 dirty records, 0% acceptance expected)",
            "overflow_501": "Overflow test dataset (501 records, triggers 422 limit validation)",
            "hostile_inputs": "Hostile attack payloads (SQLi, XSS, Unicode, long strings, null bytes)",
        }

        results.append({
            "name": scenario_name,
            "description": descriptions.get(scenario_name, f"Scenario dataset: {scenario_name}"),
            "record_count": count,
        })

    return results


@router.post("/load")
def load_sample_dataset(
    request: Optional[SampleLoadRequest] = None,
    db: Session = Depends(get_app_db),
) -> Dict[str, Any]:
    """Load a named scenario or custom record batch into active source sample, enforcing 500 records limit."""
    records: List[Dict[str, Any]] = []
    scenario_name = "custom"

    if request and request.scenario_name:
        scenario_name = request.scenario_name
        scenario_file = settings.DATA_DIR / "scenarios" / f"{scenario_name}.json"
        if not scenario_file.exists():
            raise NotFoundError(f"Scenario '{scenario_name}' not found in available scenarios")
        with open(scenario_file, "r", encoding="utf-8") as f:
            records = json.load(f)
    elif request and request.records is not None:
        records = request.records
        scenario_name = "custom_json"
    else:
        # Default to baseline_60
        scenario_name = "baseline_60"
        scenario_file = settings.DATA_DIR / "scenarios" / "baseline_60.json"
        if scenario_file.exists():
            with open(scenario_file, "r", encoding="utf-8") as f:
                records = json.load(f)

    # 1. Enforce max 500 records limit
    if len(records) > settings.MAX_SOURCE_RECORDS:
        raise ValidationError(
            f"Source record count ({len(records)}) exceeds the maximum allowed limit of {settings.MAX_SOURCE_RECORDS} records.",
            details={"record_count": len(records), "max_allowed": settings.MAX_SOURCE_RECORDS},
        )

    # 2. Validate records structure
    if not isinstance(records, list):
        raise ValidationError("Source dataset must be a list of records")

    for i, rec in enumerate(records):
        if not isinstance(rec, dict):
            raise ValidationError(f"Record at index {i} is not a valid JSON object")

    # 3. Save as current active sample
    with open(settings.SOURCE_SAMPLE_PATH, "w", encoding="utf-8") as f:
        json.dump(records, f, indent=2, ensure_ascii=False)

    # 4. Audit event
    AuditService.log_event(
        db=db,
        event_type="sample_loaded",
        actor="user",
        payload={
            "scenario": scenario_name,
            "record_count": len(records),
        },
    )

    return {
        "status": "success",
        "scenario": scenario_name,
        "record_count": len(records),
        "message": f"Successfully loaded scenario '{scenario_name}' with {len(records)} records",
    }
