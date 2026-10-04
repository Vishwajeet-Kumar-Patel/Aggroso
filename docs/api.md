# API Reference

Base URL: `http://localhost:8000/api`

Interactive docs: `http://localhost:8000/docs` (Swagger UI) or `http://localhost:8000/redoc`

All error responses follow the format:
```json
{
  "code": "ERROR_CODE",
  "message": "Human-readable description",
  "details": null
}
```

---

## Schemas & Sample Data

### GET `/schemas/source`

Returns the legacy source schema definition.

**Response 200:**
```json
{
  "name": "legacy_customers",
  "description": "Legacy system customer export table",
  "primary_key": ["cust_id"],
  "fields": [
    {
      "name": "cust_id",
      "type": "string",
      "nullable": false,
      "description": "Legacy unique customer identifier"
    }
  ]
}
```

### GET `/schemas/target`

Returns the modern target schema definition with constraints.

### GET `/schemas/transformations`

Returns the whitelist transform registry (13 rules).

**Response 200:**
```json
{
  "rules": [
    {
      "name": "trim",
      "description": "Strip leading and trailing whitespace",
      "category": "string",
      "params_schema": {}
    }
  ]
}
```

### GET `/sample?limit=20&offset=0`

Paginated source dataset records.

**Response 200:**
```json
{
  "total": 60,
  "limit": 20,
  "offset": 0,
  "records": [
    {
      "cust_id": "CUST-0001",
      "full_name": "Alice Johnson",
      "email_addr": "alice.j@example.com"
    }
  ]
}
```

---

## AI Agent

### POST `/agent/propose?force_fallback=false`

Generates an AI-powered mapping proposal. Set `force_fallback=true` to use the deterministic fallback agent.

**Response 200:**
```json
{
  "source": "fallback",
  "field_mappings": [
    {
      "target_field": "customer_id",
      "source_fields": ["cust_id"],
      "transformations": [{"rule": "trim"}],
      "confidence": 1.0,
      "rationale": "Direct primary key mapping"
    }
  ],
  "incompatible_or_missing_fields": [],
  "risks": [],
  "clarification_questions": [],
  "proposed_migration_plan": {
    "summary": "...",
    "ordered_steps": ["Step 1", "Step 2"]
  },
  "tools_called": [{"name": "get_source_schema"}]
}
```

### POST `/agent/revise`

Revise a proposal with human clarification answers. Creates a new immutable plan version.

**Request:**
```json
{
  "answers": [
    {
      "question_id": "q1",
      "selected_option_or_text": "Use 'BRONZE' as default tier"
    }
  ],
  "previous_mappings": []
}
```

### POST `/agent/preview-transform`

Preview a transform rule on sample values.

**Request:**
```json
{
  "rule": "parse_date",
  "params": {"input_format": "%d/%m/%Y"},
  "sample_values": ["25/12/1990", "31/02/2000"]
}
```

---

## Plans & Versioning

### GET `/plans/active`

Returns the active plan with its current version.

### GET `/plans/{plan_id}/versions`

List all versions for a plan (newest first).

### POST `/plans/{plan_id}/versions`

Create a new immutable plan version.

**Request:**
```json
{
  "plan_definition": {
    "field_mappings": [],
    "unmapped_target_fields": [],
    "unmapped_source_fields": ["legacy_notes"]
  },
  "creator": "user"
}
```

### GET `/plans/diff/{v1_id}/{v2_id}`

Compare two plan versions field-by-field.

**Response 200:**
```json
{
  "v1_id": "...",
  "v1_num": 1,
  "v2_id": "...",
  "v2_num": 2,
  "changes": [
    {
      "field": "first_name",
      "change_type": "modified",
      "v1_value": {...},
      "v2_value": {...},
      "details": "Transformation rules changed"
    }
  ],
  "is_identical": false
}
```

### POST `/plans/versions/{version_id}/approve`

Approve a plan version. Requires a named approver.

**Request:**
```json
{
  "approver": "TechLead Reviewer"
}
```

### POST `/plans/versions/{version_id}/reject`

Reject a plan version.

**Request:**
```json
{
  "reason": "Rejected during manual review"
}
```

---

## Dry Run & Quarantine

### POST `/dry-run`

Execute a deterministic dry run against source records.

**Request:**
```json
{
  "plan_version_id": "...",
  "records": null
}
```

**Response 200:**
```json
{
  "id": "...",
  "plan_version_id": "...",
  "input_hash": "sha256:...",
  "result_hash": "sha256:...",
  "total_source": 60,
  "total_transformed": 60,
  "total_accepted": 48,
  "total_quarantined": 12,
  "is_deterministic": true,
  "sample_records": []
}
```

### POST `/dry-run/verify-determinism`

Run the dry run N times and verify byte-identical output.

**Request:**
```json
{
  "plan_version_id": "...",
  "iterations": 3
}
```

### GET `/quarantine?dry_run_id=...&field=...&error_code=...&limit=50&offset=0`

Query quarantined records with field and error code filters.

### GET `/quarantine/export?dry_run_id=...&format=json`

Export quarantine data as JSON or CSV.

---

## Execution & Runs

### POST `/runs/execute`

Execute the migration. **Requires an approved plan version** (returns HTTP 403 otherwise).

**Request:**
```json
{
  "plan_version_id": "...",
  "idempotency_key": "optional-uuid",
  "simulate_failure_at_record": null
}
```

### POST `/runs/retry`

Retry a failed migration run.

**Request:**
```json
{
  "run_id": "...",
  "simulate_failure_at_record": null
}
```

### POST `/runs/rollback`

Rollback target rows inserted by a specific run.

**Request:**
```json
{
  "run_id": "...",
  "plan_version_id": "..."
}
```

### GET `/runs`

List all migration runs (newest first).

### GET `/runs/{run_id}`

Get details for a specific run.

---

## Reconciliation

### POST `/reconciliation`

Run 3-point reconciliation (source ↔ dry-run ↔ target).

**Request:**
```json
{
  "plan_version_id": "...",
  "run_id": "..."
}
```

**Response 200:**
```json
{
  "plan_version_id": "...",
  "run_id": "...",
  "overall_status": "PASS",
  "checks": [
    {
      "name": "Source → Target Count Match",
      "description": "...",
      "expected": 48,
      "actual": 48,
      "status": "PASS"
    }
  ],
  "missing_in_target_keys": [],
  "unexpected_target_keys": [],
  "timestamp": "2024-01-01T00:00:00"
}
```

---

## Audit

### GET `/audit?event_type=...&plan_version_id=...&run_id=...&limit=100&offset=0`

Query the append-only audit event timeline.

**Response 200:**
```json
[
  {
    "id": "...",
    "event_type": "approved",
    "actor": "TechLead Reviewer",
    "timestamp": "...",
    "plan_version_id": "...",
    "run_id": null,
    "payload": {"version_num": 1, "approver": "TechLead Reviewer"}
  }
]
```

---

## Demo

### POST `/demo/reset`

Reset both databases to clean initial state and reload seed data.

**Response 200:**
```json
{
  "status": "success",
  "message": "Demo reset complete",
  "source_records_loaded": 60
}
```
