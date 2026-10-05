# Agentic Data Migration Planner & Reconciliation Workbench

A full-stack web application that helps plan, validate, execute, reconcile and roll back the migration of a bounded dataset from a legacy source schema to a modern target schema into a **mock target store**. An AI agent proposes mappings and plans using read-only inspection tools. A human must approve a specific plan version before anything executes.

Designed with a minimal, professional, dusty-and-white aesthetic, fast page load speeds, complete SEO meta tags, code-splitting, and cloud deployment readiness on Render and Vercel.

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
| **Minimal Dusty-White UI** | Plain, distraction-free interface with system fonts, WCAG AA contrast, and zero horizontal scroll |

---

## 🏗️ Architecture

```
┌─────────────────────┐     ┌──────────────────────────┐
│  React Frontend     │────▶│  FastAPI Backend          │
│  Vite + TypeScript  │     │  Uvicorn + SQLAlchemy 2.x │
│  TanStack Query     │     │  GZipMiddleware           │
│  Tailwind CSS       │     │  ┌──────────┐ ┌─────────┐ │
│  Lucide Icons       │     │  │  app.db  │ │target.db│ │
│  React Router (Lazy)│     │  │(plans,   │ │(migrated│ │
└─────────────────────┘     │  │ audit,   │ │ data)   │ │
                            │  │ quarant.)│ │         │ │
                            │  └──────────┘ └─────────┘ │
                            └──────────────────────────┘
```

See [docs/architecture.md](docs/architecture.md) for the full component diagram.

---

## 🚀 Quick Start

### Prerequisites

- **Python** 3.11+
- **Node.js** 18+ with npm
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

### 3. Production Deployment (Render + Vercel)

See [docs/deployment.md](docs/deployment.md) for exact copy-paste instructions to deploy the backend on Render and frontend on Vercel:
- **Backend:** Render Blueprint with [`render.yaml`](render.yaml)
- **Frontend:** Vercel SPA deployment with [`frontend/vercel.json`](frontend/vercel.json)

---

## 🧪 Testing & Verification

### Run All Verification Checks

```bash
make verify
```

### Unit & Integration Test Suites

```bash
# Backend (68 pytest tests)
cd backend
pytest -q

# Frontend (9 Vitest tests)
cd frontend
npx vitest run

# Link Checker
node scripts/check_links.mjs

# Deployment Smoke Test
./scripts/smoke_test.sh http://localhost:8000 http://localhost:5173
```

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
│   │   └── main.py          # FastAPI app entry point with GZipMiddleware
│   ├── tests/               # Pytest suite (68 tests)
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── api/             # Type-safe API client
│   │   ├── components/      # Reusable layout & safe email rendering components
│   │   ├── hooks/           # usePageTitle hook with route meta tags
│   │   ├── pages/           # 6 code-split lazy loaded pages + 404 page
│   │   ├── types/           # TypeScript interfaces
│   │   └── __tests__/       # Vitest test suite
│   ├── public/              # Favicon and assets
│   ├── vercel.json          # SPA rewrite rules & headers
│   └── package.json
├── docs/                    # Architecture, API, decisions, demo script, deployment
├── scripts/                 # check_links.mjs, smoke_test.sh
├── Makefile                 # Test, lint, dev, verify, smoke targets
├── render.yaml              # Render blueprint for cloud deploy
├── docker-compose.yml       # Full-stack containerized deployment
├── Dockerfile.backend
├── Dockerfile.frontend
└── .env.example
```

---

## 📖 Documentation

- [Deployment Guide](docs/deployment.md) — Render and Vercel setup
- [Architecture](docs/architecture.md) — Component diagram, data flow, design decisions
- [API Reference](docs/api.md) — Full REST API with request/response examples
- [Design Decisions](docs/decisions.md) — ADRs for key technical choices
- [Demo Script](docs/demo-script.md) — Step-by-step walkthrough for evaluators
- [Baseline & Performance Targets](docs/baseline.md) — Web hygiene and performance metrics

---

## 🔒 Security & Constraints

- **500-record max** enforced at API and service layers
- **Approval gate** is server-side (HTTP 403), not client-side
- **Target store is SQLite** — explicitly marked as a mock sandbox
- **Append-only audit** blocks UPDATE/DELETE on audit events at the service layer
- **AI agent tools are read-only** — no write access to any database
- **Safe Email Rendering** — strict RFC-compliant email validation before `mailto:` generation; malformed emails rendered as safe plain text

---

## License

MIT
