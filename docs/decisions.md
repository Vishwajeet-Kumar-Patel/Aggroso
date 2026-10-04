# Design Decisions (ADRs)

This document records the key architectural and design decisions made during the development of the Agentic Data Migration Planner & Reconciliation Workbench.

---

## ADR-001: Dual SQLite Database Architecture

**Status:** Accepted

**Context:** The application manages both operational state (plans, audit logs, dry runs) and migrated data (target records). Mixing these in a single database could lead to accidental data loss during demo resets and makes the "mock target store" concept harder to demonstrate.

**Decision:** Use two separate SQLite databases:
- `app.db` — Plans, versions, audit events, dry run results, quarantine entries
- `target.db` — Migrated customer records only

**Consequences:**
- Clear separation of concerns; target can be reset independently
- Two SQLAlchemy engines and session makers to manage
- Slightly more complex test fixtures (need `StaticPool` for in-memory test DBs)

---

## ADR-002: Immutable Plan Versioning with SHA-256 Content Hashing

**Status:** Accepted

**Context:** The migration plan must be auditable and traceable. Any edit to a plan should not overwrite previous state, and the exact content used for execution must be cryptographically verifiable.

**Decision:** Every plan edit creates a new `PlanVersion` row with:
- Monotonically increasing `version_num`
- SHA-256 hash of canonically-serialized JSON (`sorted_keys`, `separators=(',', ':')`)
- Status lifecycle: `draft` → `approved` (or `rejected` or `superseded`)
- Previous versions are marked `superseded` when a new one is created

**Consequences:**
- Full version history is preserved
- Content hash enables tamper detection
- The approval hash links the approver to the exact plan content
- Storage grows linearly with edits (acceptable for bounded datasets)

---

## ADR-003: Server-Side Approval Gate (HTTP 403)

**Status:** Accepted

**Context:** The human-in-the-loop approval requirement must be enforced securely, not merely as a UI toggle that could be bypassed.

**Decision:** The `/runs/execute` endpoint checks `plan_version.status == 'approved'` on the server. If not approved, it returns HTTP 403 with error code `APPROVAL_REQUIRED`.

**Consequences:**
- Cannot be bypassed by calling the API directly
- Frontend displays a clear locked/unlocked gate visualization
- Approval status is also reflected in the global navbar badge

---

## ADR-004: Deterministic Fallback Agent

**Status:** Accepted

**Context:** LLM-based agents (Anthropic Claude) require API keys and may be unavailable. The system must work fully without external dependencies.

**Decision:** Implement a `FallbackAgent` that uses heuristic field name matching (Jaccard similarity, substring matching, type compatibility) to propose mappings deterministically.

**Consequences:**
- System works completely offline without an API key
- Fallback produces reasonable mappings for the demo dataset
- `force_fallback=true` query parameter allows explicit testing
- Both agents use identical Pydantic output schemas

---

## ADR-005: Whitelist-Only Transform Registry

**Status:** Accepted

**Context:** Allowing arbitrary code execution in transformations would be a security and correctness risk. The transform pipeline must be auditable and deterministic.

**Decision:** Define exactly 13 named, pure transform functions in a JSON registry. The plan editor only allows selecting from this whitelist. Each function:
- Takes a value and optional parameters
- Returns a transformed value or raises a validation error
- Has zero side effects and no external I/O

**Consequences:**
- Complete auditability — every transform is named and parameterized
- Determinism is guaranteed (same input → same output)
- Adding new transforms requires code changes, not user configuration
- Trade-off: less flexibility, more safety

---

## ADR-006: Append-Only Audit Trail

**Status:** Accepted

**Context:** For compliance and debugging, every significant action must be recorded immutably.

**Decision:** The `AuditService` enforces append-only semantics:
- Only `insert()` is exposed; `update()` and `delete()` are intentionally not implemented
- Every event captures: `event_type`, `actor`, `timestamp`, `plan_version_id`, `run_id`, and a JSON `payload`
- The service layer blocks any attempt to modify or delete audit events

**Consequences:**
- Tamper-resistant history of all actions
- Audit timeline enables full provenance tracing
- Storage grows monotonically (acceptable for bounded scope)

---

## ADR-007: Quarantine with Rich Field-Level Diagnostics

**Status:** Accepted

**Context:** When records fail transformation or validation, the system must provide enough context for humans to understand and fix the underlying data issues.

**Decision:** Each quarantined record preserves:
- The original raw source record (complete JSON)
- A list of `RecordErrorDetail` objects, each containing:
  - `field` — which target field failed
  - `rule` — which transform rule caused the failure
  - `original_value` — the input value
  - `attempted_value` — the output value (if partial transform succeeded)
  - `error_code` — machine-readable error type
  - `message` — human-readable diagnostic

**Consequences:**
- Rich drill-down UI for investigating failures
- Exportable to JSON/CSV for offline analysis
- No loss of information — raw source data is always preserved

---

## ADR-008: React + TanStack Query Frontend Architecture

**Status:** Accepted

**Context:** The frontend needs to display real-time server state (plan versions, run status, audit events) with efficient caching and refetching.

**Decision:** Use React 19 with TanStack Query v5 for server state management:
- Every API call is a query with automatic caching and background refetching
- Mutations invalidate relevant queries for instant UI updates
- No client-side state management library (Redux, Zustand) needed

**Consequences:**
- Simple, declarative data fetching with loading/error states
- Automatic cache invalidation on mutations
- Minimal boilerplate compared to Redux patterns
- Frontend tests focus on business logic, not component rendering

---

## ADR-009: Vite Proxy for API Routing

**Status:** Accepted

**Context:** The frontend and backend run on different ports during development. CORS configuration is needed, but a simpler approach is preferable.

**Decision:** Configure Vite's development server to proxy `/api/*` requests to `http://127.0.0.1:8000`. The frontend API client uses relative URLs (`/api/...`).

**Consequences:**
- No CORS issues during development
- Same-origin cookie/session handling
- Production deployment uses nginx reverse proxy (same pattern)
- Backend CORS middleware is still configured as a safety net

---

## ADR-010: Fault Injection Hook for Resilience Testing

**Status:** Accepted

**Context:** Demonstrating transactional rollback and retry requires the ability to simulate failures mid-execution.

**Decision:** The `/runs/execute` and `/runs/retry` endpoints accept an optional `simulate_failure_at_record` parameter. When set, the `MigrationRunner` raises a deliberate exception after inserting N records, triggering a full transaction rollback. Fault injection is strictly guarded by the `ENABLE_FAULT_INJECTION` environment flag (HTTP 403 `FAULT_INJECTION_DISABLED` when disabled).

---

## ADR-011: Cross-Database 3-Step Consistency & Stuck Run Recovery

**Status:** Accepted

**Context:** Aggroso manages dual databases (`app.db` for state/audit and `target.db` for migrated entities). If execution terminates unexpectedly mid-batch, state cannot be left dangling.

**Decision:** Implement 3-step commit:
1. Initialize `MigrationRun(status='running')` in `app.db`.
2. Commit records into `target.db`.
3. Update `MigrationRun(status='completed')` and log audit event in `app.db`.
If step 2 fails, step 3 marks run as `failed`. On retry, target records are computed via set difference against `target.db`, ensuring no duplicate insertions.

---

## ADR-012: Count Definitions & Mathematical Invariants

**Status:** Accepted

**Context:** Data migration metrics must satisfy strict invariant laws across all datasets:
- $total\_source == total\_accepted + total\_quarantined$
- $total\_accepted \le total\_transformed \le total\_source$

**Decision:** The dry-run and execution engines enforce these invariants mathematically. Any record rejected during validation or deduplication is assigned to quarantine with structured error lineage.

---

## ADR-013: First-Valid Duplicate Resolution Policy

**Status:** Accepted

**Context:** When duplicates appear within the same batch, the system must deterministically determine which record claims the target key.

**Decision:** The first syntactically valid record in the input order claims the natural key and email. Subsequent duplicate records are routed to the Quarantine Workbench with error code `DUPLICATE_KEY` and reference the winning `cust_id`.

---

## ADR-014: Database-Enforced Append-Only Audit Immutability

**Status:** Accepted

**Context:** Security compliance requires that audit log tampering be prevented at the database engine level in addition to service-level safeguards.

**Decision:** Attach SQLite `BEFORE UPDATE` and `BEFORE DELETE` triggers to `audit_events` that abort any raw SQL update/delete with `SELECT RAISE(ABORT, ...)`.

---

## ADR-015: Idempotency Replay & Email Conflict (409) Handling

**Status:** Accepted

**Context:** Network retries or replayed execution calls must be safe and idempotent.

**Decision:**
- Re-executing with the **same idempotency key** returns the existing run result with `replayed: true`.
- Executing with a **new idempotency key** skips already-migrated keys (`skipped_existing_count`).
- Colliding on an existing email with a *different* source key returns HTTP 409 `TARGET_EMAIL_CONFLICT`.

