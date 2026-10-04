# Implementation Plan: Agentic Data Migration Planner & Reconciliation Workbench

## 1. System Architecture & Component Design
The system is divided into two primary subsystems:
1. **Backend (Python 3.11+, FastAPI, Pydantic v2, SQLAlchemy 2.x, SQLite)**
   - **Dual DB Architecture**:
     - `app.db`: Metadata, plan versions, dry run results, quarantine records, migration execution logs, append-only audit events.
     - `target.db`: Mock target store (`customers` table) with source tracking (`source_key`, `plan_version_id`, `run_id`).
   - **Service Layer**:
     - `TransformEngine`: Pure functional pipeline applying validated transformation rules from the whitelist registry.
     - `PlanService`: Immutable plan versioning, canonical JSON hashing, approval gating, version diffing.
     - `DryRunService`: Stable deterministic record transformation, batch unique constraint validation, hash generation, and quarantine extraction.
     - `MigrationRunner`: Transactional insertion into target DB with idempotency, conflict resolution (`ON CONFLICT DO NOTHING`), simulated fault injection, and rollback support.
     - `ReconciliationService`: Verification of counts and key sets between source, dry run, and target database.
     - `AuditService`: Append-only event store preventing any mutations or deletions.
     - `AgentService`: Read-only tool orchestration, Anthropic SDK structured tool calling, validation retries, and deterministic heuristic fallback agent.
2. **Frontend (React 18, TypeScript Strict, Vite, Tailwind CSS, TanStack Query, React Router, Lucide Icons)**
   - **6 Dedicated Workflow Views**:
     1. **Schemas & Sample Data**: Interactive side-by-side schema viewer and paginated 60-record dataset explorer with bad record annotations.
     2. **AI Proposal & Clarification**: Visual field mapping with confidence scores, severity-ranked risks, missing field notices, and interactive clarification Q&A with live revision.
     3. **Plan Editor & Version Diff**: Strict rule-picker and parameter configurator (no code execution), version history list, visual diff viewer, and approval gating controls.
     4. **Dry Run & Quarantine Workbench**: Metric cards (Source, Transformed, Accepted, Quarantined), determinism re-verifier, filterable quarantine table, record drill-down drawer, and JSON/CSV exporter.
     5. **Execution & Reconciliation**: Gated execution, fault injection testing, retry mechanism, transactional rollback, and automated reconciliation table with PASS/FAIL badges.
     6. **Audit Timeline**: Real-time append-only event log with actor, action, timestamp, and payload inspector.

---

## 2. Phase Gates and Execution Strategy

- **Phase 0: Project Scaffolding & Core Infrastructure**
  - Setup repository structure, root `Makefile`, `docker-compose.yml`, `.env.example`.
  - Configure backend with FastAPI, Pydantic v2, SQLAlchemy 2.x session factories for `app.db` and `target.db`.
  - Generate static seed files: `source_schema.json`, `target_schema.json`, `transform_registry.json`, and 60 realistic records in `source_sample.json` (70-75% valid, with documented edge cases).
- **Phase 1: Pure Transform Engine & Whitelist Registry**
  - Implement 13 pure transformation functions and strict Pydantic argument schemas.
  - Implement `TransformEngine.apply_pipeline`.
  - Comprehensive unit tests for all 13 rules (valid, invalid, edge, boundary, nulls).
- **Phase 2: Plan Versioning, Approval Gate & Append-Only Audit**
  - Implement canonical JSON hashing (`SHA-256`) and immutable plan version lifecycle (`draft`, `approved`, `superseded`, `rejected`).
  - Implement version diff calculation.
  - Implement server-side approval enforcement.
  - Implement append-only `AuditService` with immutability guarantees.
  - Unit & integration tests for versioning, diff, approval invalidation, and audit append-only constraints.
- **Phase 3: Deterministic Dry Run & Quarantine Evidence**
  - Implement dry-run execution with strict sorting, uniqueness validation, and input/output hashing.
  - Implement quarantine record persistence with detailed field-level error diagnostics.
  - Determinism verification tests (asserting identical hash across N runs) and 500-record limit validation (422 response for 501+ records).
- **Phase 4: Target Execution, Idempotency, Retry, Rollback & Reconciliation**
  - Implement target repository with `INSERT ... ON CONFLICT DO NOTHING`.
  - Implement migration execution with `source_key`, `plan_version_id`, `run_id` tracking.
  - Fault injection parameter (`simulate_failure_at_record`) for testable mid-run failure and retry recovery.
  - Implement transactional, idempotent rollback by `run_id` or `plan_version_id`.
  - Implement automated reconciliation engine comparing source totals, accepted counts, and target rows.
  - Comprehensive tests for idempotency, retry, rollback, and reconciliation discrepancy detection.
- **Phase 5: Agent Architecture (LLM + Deterministic Fallback)**
  - Implement strict read-only tool suite (`get_source_schema`, `get_target_schema`, `sample_source_records`, `list_supported_transformations`, `validate_mapping`, `preview_transformation`).
  - Implement `LLMAgent` using Anthropic Python SDK with structured tool calling and schema validation.
  - Implement `FallbackAgent` with heuristic fuzzy matching and rule assignment.
  - Unit tests verifying tool allow-list isolation, fallback activation, and proposal validity.
- **Phase 6: REST API & OpenAPI Documentation**
  - Implement routers: `/api/schemas`, `/api/sample`, `/api/agent`, `/api/plans`, `/api/dry-run`, `/api/runs`, `/api/reconciliation`, `/api/quarantine`, `/api/audit`, `/api/demo/reset`.
  - Standardized error response model `{code, message, details}`.
  - Full API integration tests with `httpx.TestClient`.
- **Phase 7: Frontend Web Application**
  - Scaffold Vite + React 18 + TypeScript (strict) + Tailwind CSS + TanStack Query + React Router.
  - Build polished, glassmorphic UI components, navigation, mock target indicators, plan status banners, and all 6 screens.
  - Write Vitest + React Testing Library component tests.
- **Phase 8: End-to-End Verification (Playwright)**
  - Automated E2E test covering full lifecycle: propose -> clarify -> edit -> approve -> dry run -> execute -> reconcile -> rollback -> retry.
- **Phase 9: Packaging, Documentation & Make Targets**
  - Create `Makefile` (`make test`, `make lint`, `make seed`, `make dev`, `make e2e`, `make verify`).
  - Write `README.md`, `docs/architecture.md`, `docs/api.md`, `docs/decisions.md`, `docs/demo-script.md`.
- **Phase 10: Final Verification & Walkthrough Artifact**
  - Run `make verify`, confirm all backend/frontend/e2e tests pass, generate screenshots and final walkthrough artifact.
