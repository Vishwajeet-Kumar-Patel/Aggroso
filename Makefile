# ===================================================================
# Makefile: Agentic Data Migration Planner & Reconciliation Workbench
# ===================================================================
# Run `make help` to see all available targets.
#
# Prerequisites:
#   - Python 3.11+ with pip
#   - Node.js 18+ with npm
#   - (Optional) Docker & Docker Compose for containerized deploys
# ===================================================================

.PHONY: help install seed test lint dev e2e verify clean check-links smoke build docker-up docker-down

help: ## Show this help message
	@echo "Available targets:"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'

# ===================================================================
# Setup & Install
# ===================================================================

install: ## Install all backend and frontend dependencies
	cd backend && pip install -r requirements.txt
	cd frontend && npm ci

# ===================================================================
# Data & Seed
# ===================================================================

seed: ## Reset databases and seed sample data via the demo endpoint
	curl -s -X POST http://127.0.0.1:8000/api/demo/reset | python -m json.tool

# ===================================================================
# Build
# ===================================================================

build: ## Build the frontend production bundle
	cd frontend && npm run build

# ===================================================================
# Testing
# ===================================================================

test: test-backend test-frontend ## Run all unit and integration tests

test-backend: ## Run backend pytest suite
	cd backend && python -m pytest -q

test-frontend: ## Run frontend Vitest suite
	cd frontend && npx vitest run

check-links: ## Check all markdown and documentation links
	node scripts/check_links.mjs

smoke: ## Run deployment smoke test against local/remote URLs
	bash scripts/smoke_test.sh

# ===================================================================
# Linting
# ===================================================================

lint: lint-backend lint-frontend ## Lint both backend and frontend

lint-backend: ## Lint Python code with ruff
	cd backend && python -m ruff check app/ tests/

lint-frontend: ## Lint frontend with oxlint / eslint
	cd frontend && npm run lint || true

# ===================================================================
# Development Servers
# ===================================================================

dev: ## Start both backend and frontend dev servers
	@echo "Starting backend on http://127.0.0.1:8000 ..."
	@echo "Starting frontend on http://localhost:5173 ..."
	@echo ""
	@echo "Run in separate terminals:"
	@echo "  Terminal 1: cd backend && python -m uvicorn app.main:app --reload --port 8000"
	@echo "  Terminal 2: cd frontend && npm run dev"

dev-backend: ## Start backend dev server with hot-reload
	cd backend && python -m uvicorn app.main:app --reload --port 8000

dev-frontend: ## Start frontend Vite dev server
	cd frontend && npm run dev

# ===================================================================
# End-to-End Testing
# ===================================================================

e2e: ## Run Playwright end-to-end test suite
	cd frontend && npx playwright test

# ===================================================================
# Full Verification
# ===================================================================

verify: test check-links build ## Run all tests, link checks, and build
	@echo ""
	@echo "✅ All verification checks passed!"
	@echo "   Backend tests: PASS"
	@echo "   Frontend tests: PASS"
	@echo "   Link check: PASS"
	@echo "   Production build: PASS"

# ===================================================================
# Docker
# ===================================================================

docker-up: ## Build and start all services with Docker Compose
	docker compose up --build -d

docker-down: ## Stop all Docker Compose services
	docker compose down -v

# ===================================================================
# Cleanup
# ===================================================================

clean: ## Remove build artifacts, caches, and databases
	rm -rf backend/app.db backend/target.db backend/.pytest_cache backend/.coverage
	rm -rf frontend/dist frontend/node_modules/.vite
