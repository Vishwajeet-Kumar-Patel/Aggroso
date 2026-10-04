import csv
import io
import json
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session
from sqlalchemy import desc
from app.core.db import get_app_db
from app.domain.models import QuarantinedRecord
from app.domain.schemas import QuarantinedRecordOut, RecordErrorDetail

router = APIRouter(prefix="/quarantine", tags=["Quarantine Workbench"])


@router.get("", response_model=Dict[str, Any])
def list_quarantined_records(
    dry_run_id: Optional[str] = Query(None),
    field: Optional[str] = Query(None),
    error_code: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_app_db),
):
    """List quarantined records with detailed field error diagnostics and filters."""
    query = db.query(QuarantinedRecord)
    if dry_run_id:
        query = query.filter(QuarantinedRecord.dry_run_id == dry_run_id)

    records = query.order_by(desc(QuarantinedRecord.created_at)).all()

    # In-memory filter for JSON fields
    filtered = []
    for r in records:
        errors = [RecordErrorDetail(**e) for e in r.errors_json]
        if field and not any(e.field == field for e in errors):
            continue
        if error_code and not any(e.error_code == error_code for e in errors):
            continue
        filtered.append(
            QuarantinedRecordOut(
                id=r.id,
                dry_run_id=r.dry_run_id,
                run_id=r.run_id,
                record_index=r.record_index,
                source_key=r.source_key,
                raw_record=r.raw_record_json,
                errors=errors,
                created_at=r.created_at,
            )
        )

    total = len(filtered)
    paginated = filtered[offset : offset + limit]

    return {
        "total": total,
        "limit": limit,
        "offset": offset,
        "records": paginated,
    }


@router.get("/export")
def export_quarantine(
    format: str = Query("json", pattern="^(json|csv)$"),
    dry_run_id: Optional[str] = Query(None),
    db: Session = Depends(get_app_db),
):
    """Export quarantined records in JSON or CSV format."""
    query = db.query(QuarantinedRecord)
    if dry_run_id:
        query = query.filter(QuarantinedRecord.dry_run_id == dry_run_id)
    records = query.all()

    data = [
        {
            "id": r.id,
            "source_key": r.source_key,
            "record_index": r.record_index,
            "errors": r.errors_json,
            "raw_record": r.raw_record_json,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in records
    ]

    if format == "csv":
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(["id", "source_key", "record_index", "error_fields", "error_codes", "error_messages", "raw_json"])
        for item in data:
            err_fields = "; ".join(e.get("field", "") for e in item["errors"])
            err_codes = "; ".join(e.get("error_code", "") for e in item["errors"])
            err_msgs = "; ".join(e.get("message", "") for e in item["errors"])
            writer.writerow([
                item["id"],
                item["source_key"],
                item["record_index"],
                err_fields,
                err_codes,
                err_msgs,
                json.dumps(item["raw_record"]),
            ])
        return Response(
            content=output.getvalue(),
            media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=quarantine_export.csv"},
        )

    return Response(
        content=json.dumps(data, indent=2, default=str),
        media_type="application/json",
        headers={"Content-Disposition": "attachment; filename=quarantine_export.json"},
    )


@router.get("/export/json")
def export_quarantine_json(
    dry_run_id: Optional[str] = Query(None),
    db: Session = Depends(get_app_db),
):
    """Convenience endpoint returning quarantine records as JSON."""
    return export_quarantine(format="json", dry_run_id=dry_run_id, db=db)


@router.get("/export/csv")
def export_quarantine_csv(
    dry_run_id: Optional[str] = Query(None),
    db: Session = Depends(get_app_db),
):
    """Convenience endpoint returning quarantine records as CSV."""
    return export_quarantine(format="csv", dry_run_id=dry_run_id, db=db)

