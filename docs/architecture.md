# Architecture

## System Overview

The Agentic Data Migration Planner follows a **Clean Architecture** pattern with clear separation between API, Service, Domain, and Infrastructure layers.

```
┌───────────────────────────────────────────────────────────────────────┐
│                         FRONTEND (React SPA)                         │
│                                                                       │
│  ┌────────┐ ┌──────────┐ ┌────────┐ ┌────────┐ ┌───────┐ ┌───────┐ │
│  │Schemas │ │Proposal  │ │Plan    │ │Dry Run │ │Exec & │ │Audit  │ │
│  │Explorer│ │& Q&A     │ │Editor  │ │& Quar. │ │Recon. │ │Trail  │ │
│  └────┬───┘ └────┬─────┘ └───┬────┘ └───┬────┘ └──┬────┘ └──┬────┘ │
│       │          │           │           │         │          │       │
│       └──────────┴───────────┴───────────┴─────────┴──────────┘       │
│                          TanStack Query                               │
│                          API Client (fetch)                           │
└────────────────────────────┬──────────────────────────────────────────┘
                             │ HTTP (Vite proxy → :8000)
┌────────────────────────────▼──────────────────────────────────────────┐
│                      BACKEND (FastAPI + Uvicorn)                      │
│                                                                       │
│  ┌──────────────────── API Layer (11 Routers) ─────────────────────┐ │
│  │ schemas │ sample │ agent │ plans │ dry_run │ runs │ quarantine │ │ │
│  │ reconciliation │ audit │ demo                                   │ │
│  └───────────────────────────┬─────────────────────────────────────┘ │
│                              │                                       │
│  ┌──────────────── Service Layer (Business Logic) ─────────────────┐ │
│  │                                                                   │ │
│  │  ┌──────────────┐ ┌────────────┐ ┌────────────────┐              │ │
│  │  │AgentService  │ │PlanService │ │DryRunService   │              │ │
│  │  │(LLM+Fallback)│ │(Versioning)│ │(Deterministic) │              │ │
│  │  └──────────────┘ └────────────┘ └────────────────┘              │ │
│  │  ┌───────────────┐ ┌─────────────────┐ ┌────────────┐           │ │
│  │  │MigrationRunner│ │ReconcilService  │ │AuditService│           │ │
│  │  │(Transactional)│ │(3-Point Verify) │ │(Append-Only│           │ │
│  │  └───────────────┘ └─────────────────┘ └────────────┘           │ │
│  │                                                                   │ │
│  │  ┌─────────────────────────────────────────────────┐             │ │
│  │  │ TransformEngine (13 Pure Functions)              │             │ │
│  │  │ trim | lowercase | uppercase | parse_date |     │             │ │
│  │  │ parse_datetime | split_name | to_float |        │             │ │
│  │  │ to_integer | default_value | enum_map |         │             │ │
│  │  │ normalize_email | normalize_phone_e164 | passthrough │        │ │
│  │  └─────────────────────────────────────────────────┘             │ │
│  └───────────────────────────┬─────────────────────────────────────┘ │
│                              │                                       │
│  ┌──────────── Domain Layer (Models + Schemas) ────────────────────┐ │
│  │  Plan, PlanVersion, AuditEvent, MigrationRun, TargetRecord      │ │
│  │  QuarantineEntry, DryRunResult (SQLAlchemy 2.x Models)          │ │
│  │  Pydantic Schemas (request/response validation)                  │ │
│  └───────────────────────────┬─────────────────────────────────────┘ │
│                              │                                       │
│  ┌──────────── Infrastructure Layer ───────────────────────────────┐ │
│  │  Dual SQLite Engines (app.db + target.db)                        │ │
│  │  SHA-256 Content Hashing (canonical JSON)                        │ │
│  │  Anthropic SDK (optional LLM integration)                        │ │
│  └─────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────┘
```

## Data Flow

### Migration Lifecycle

```
1. INSPECT        →  Source/Target schema exploration + sample data review
2. PROPOSE        →  AI agent analyzes schemas and proposes field mappings
3. CLARIFY        →  Human answers agent's clarification questions
4. EDIT & VERSION →  Human refines mappings; each save creates immutable version
5. APPROVE        →  Named human approves specific version (unlocks execution)
6. DRY RUN        →  Deterministic transformation test (zero target writes)
7. EXECUTE        →  Transactional INSERT into mock target store
8. RECONCILE      →  3-point source ↔ dry-run ↔ target verification
9. (if needed)    →  ROLLBACK or RETRY with idempotency guarantees
```

### Approval Gate Enforcement

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│ Plan Version│────▶│ Approval Gate│────▶│ Execution   │
│ (draft)     │     │ (server-side)│     │ (INSERT)    │
└─────────────┘     └──────────────┘     └─────────────┘
       │                    │                    │
       │            HTTP 403 if not       Idempotency key
       │            approved              ON CONFLICT DO NOTHING
       │                    │                    │
       ▼                    ▼                    ▼
  Content Hash      Approval Hash          Run ID + Audit
  (SHA-256)         (SHA-256)              (append-only log)
```

## Database Schema

### app.db (Application State)

- **plans** — Migration plan metadata
- **plan_versions** — Immutable version snapshots with content hashes
- **audit_events** — Append-only event log
- **dry_run_results** — Deterministic run output with result hashes
- **migration_runs** — Execution run records with status tracking
- **quarantine_entries** — Rejected records with field-level error diagnostics

### target.db (Mock Target Store)

- **target_records** — Migrated customer records with provenance metadata
  - `source_key` — Original primary key from source
  - `run_id` — Which migration run inserted this record
  - `plan_version_id` — Which plan version was used

## Technology Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Frontend | React 19 + TypeScript | UI components |
| Styling | Tailwind CSS 3.4 | Utility-first CSS |
| State | TanStack Query 5 | Server state management |
| Routing | React Router 7 | SPA navigation |
| Icons | Lucide React | Consistent iconography |
| Backend | FastAPI 0.111+ | REST API framework |
| ORM | SQLAlchemy 2.x | Database abstraction |
| Validation | Pydantic 2.7+ | Request/response schemas |
| Database | SQLite (dual) | Embedded SQL databases |
| AI Agent | Anthropic SDK | LLM integration |
| Testing | Pytest + Vitest | Backend + frontend tests |
