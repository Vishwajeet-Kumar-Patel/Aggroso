# Agentic Data Migration Planner & Reconciliation Workbench

A full-stack web application that helps plan, validate, execute, reconcile and roll back the migration of a bounded dataset from a legacy source schema to a modern target schema into a **mock target store**. An AI agent proposes mappings and plans using read-only inspection tools. A human must approve a specific plan version before anything executes.

---

## ✨ Key Features

| Feature | Description |
|---------|-------------|
| **AI-Powered Mapping** | Anthropic Claude 3.5 Sonnet (or deterministic fallback) proposes field mappings from source → target |
| **13 Pure Transforms** | Whitelist-only transformation registry (`trim`, `lowercase`, `parse_date`, `split_name`, `enum_map`, etc.) |
| **Immutable Plan Versioning** | Every edit creates a new version with SHA-256 content hashing; no in-place mutations |
| **Human Approval Gate** | Server-side HTTP 403 blocks execution until a named human approves a specific version |
| **Deterministic Dry Run** | Runs transformations with zero target writes; verifies byte-identical output across N iterations |
| **Rich Quarantine Evidence** | Rejected records preserve raw source data, failed field, rule, error code, and diagnostic message |
| **Transactional Execution** | `INSERT ... ON CONFLICT DO NOTHING` with idempotency keys; full transaction rollback on failure |
| **Fault Injection Hook** | Simulate mid-run failures at any record index to test retry/rollback resilience |
| **3-Point Reconciliation** | Automated source ↔ dry-run ↔ target count and key-set parity verification |
| **Append-Only Audit Trail** | Every action (proposal, approval, execution, rollback) is immutably logged with payloads |
| **Glassmorphic Dark UI** | Premium React frontend with Inter font, gradient accents, and micro-animations |

---

## 🏗️ Architecture

```
┌─────────────────────┐     ┌──────────────────────────┐
│  React Frontend     │────▶│  FastAPI Backend          │
│  Vite + TypeScript  │     │  Uvicorn + SQLAlchemy 2.x │
│  TanStack Query     │     │                            │
│  Tailwind CSS       │     │  ┌──────────┐ ┌─────────┐ │
│  Lucide Icons       │     │  │  app.db  │ │target.db│ │
│  React Router       │     │  │(plans,   │ │(migrated│ │
└─────────────────────┘     │  │ audit,   │ │ data)   │ │
                            │  │ quarant.)│ │         │ │
                            │  └──────────┘ └─────────┘ │
                            └──────────────────────────┘
```

See [docs/architecture.md](docs/architecture.md) for the full component diagram.

---

## 🚀 Quick Start

### Prerequisites

- **Python** 3.12+
- **Node.js** 22+ with npm
- (Optional) **Docker** and **Docker Compose**

### 1. Install Dependencies

```bash
# Backend
cd backend
pip install -r requirements.txt

# Frontend
cd ../frontend
npm ci
```

### 2. Start Development Servers

**Terminal 1 — Backend:**
```bash
cd backend
python -m uvicorn app.main:app --reload --port 8000
```

**Terminal 2 — Frontend:**
```bash
cd frontend
npm run dev
```

Open **http://localhost:5173** in your browser.

### 3. (Alternative) Docker Compose

```bash
cp .env.example .env
# Optionally add your ANTHROPIC_API_KEY to .env
docker compose up --build
```

Open **http://localhost:3000** in your browser.

---

## 🧪 Testing

### Run All Tests

```bash
# Backend (35 tests, ~91% coverage)
cd backend
python -m pytest --tb=short --cov=app --cov-report=term-missing -q

# Frontend (4 tests)
cd frontend
npx vitest run --reporter=verbose
```

### Test Coverage Areas

| Suite | File | Tests |
|-------|------|-------|
| Transforms | `test_transforms.py` | 13 pure transform functions |
| Plans | `test_plans.py` | Versioning, hashing, approval gates |
| Audit | `test_audit.py` | Append-only enforcement |
| Dry Run | `test_dry_run.py` | Determinism, 500-record limit, quarantine |
| Execution | `test_execution.py` | Idempotency, transactional commit |
| Reconciliation | `test_reconciliation.py` | 3-point count/key verification |
| Rollback | `test_rollback.py` | Transactional rollback by run_id |
| Agent | `test_agent.py` | Fallback proposal, tool isolation |
| API | `test_api.py` | HTTP integration tests |
| Frontend | `__tests__/*.test.tsx` | Metrics invariants, gating logic, diff |

---

## 📁 Project Structure

```
Aggroso/
├── backend/
│   ├── app/
│   │   ├── agent/           # AI agent (LLM + fallback)
│   │   ├── api/             # FastAPI routers (11 endpoints)
│   │   ├── core/            # Config, DB, errors, hashing
│   │   ├── data/            # Seed JSON files (schemas, samples, registry)
│   │   ├── domain/          # SQLAlchemy models, Pydantic schemas, transforms
│   │   ├── services/        # Business logic layer
│   │   └── main.py          # FastAPI app entry point
│   ├── tests/               # Pytest suite (9 test files)
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── api/             # Type-safe API client
│   │   ├── components/      # Reusable layout components
│   │   ├── pages/           # 6 screen pages
│   │   ├── types/           # TypeScript interfaces
│   │   └── __tests__/       # Vitest test suite
│   └── package.json
├── docs/                    # Architecture, API, decisions, demo script
├── Makefile                 # Test, lint, dev, e2e, verify targets
├── docker-compose.yml       # Full-stack containerized deployment
├── Dockerfile.backend
├── Dockerfile.frontend
└── .env.example
```

---

## 📖 Documentation

- [Architecture](docs/architecture.md) — Component diagram, data flow, design decisions
- [API Reference](docs/api.md) — Full REST API with request/response examples
- [Design Decisions](docs/decisions.md) — ADRs for key technical choices
- [Demo Script](docs/demo-script.md) — Step-by-step walkthrough for evaluators

---

## 🔒 Security & Constraints

- **500-record max** enforced at API and service layers
- **Approval gate** is server-side (HTTP 403), not client-side
- **Target store is SQLite** — explicitly marked as a mock sandbox
- **Append-only audit** blocks UPDATE/DELETE on audit events at the service layer
- **AI agent tools are read-only** — no write access to any database

---

## 📋 API Overview

All endpoints are under `/api`. Full OpenAPI docs available at `http://localhost:8000/docs`.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/schemas/source` | Source schema definition |
| GET | `/api/schemas/target` | Target schema definition |
| GET | `/api/schemas/transformations` | Transform rule whitelist registry |
| GET | `/api/sample` | Paginated source records |
| POST | `/api/agent/propose` | AI agent proposal (LLM or fallback) |
| POST | `/api/agent/revise` | Revise proposal with clarification answers |
| GET | `/api/plans/active` | Active plan with current version |
| POST | `/api/plans/{id}/versions` | Create new immutable plan version |
| POST | `/api/plans/versions/{id}/approve` | Approve version (unlocks execution) |
| POST | `/api/dry-run` | Execute deterministic dry run |
| POST | `/api/dry-run/verify-determinism` | Verify N-run byte-identical output |
| GET | `/api/quarantine` | Filtered quarantine records |
| GET | `/api/quarantine/export` | Export quarantine as JSON or CSV |
| POST | `/api/runs/execute` | Execute migration (requires approval) |
| POST | `/api/runs/retry` | Retry failed run |
| POST | `/api/runs/rollback` | Rollback target rows transactionally |
| POST | `/api/reconciliation` | Run 3-point reconciliation |
| GET | `/api/audit` | Filtered audit event timeline |
| POST | `/api/demo/reset` | Reset demo to clean state |

---

## License

MIT
