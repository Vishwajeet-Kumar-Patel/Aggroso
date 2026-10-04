from fastapi import APIRouter
from app.api.agent_router import router as agent_router
from app.api.audit_router import router as audit_router
from app.api.demo_router import router as demo_router
from app.api.dry_run_router import router as dry_run_router
from app.api.plans_router import router as plans_router
from app.api.quarantine_router import router as quarantine_router
from app.api.reconciliation_router import router as reconciliation_router
from app.api.runs_router import router as runs_router
from app.api.sample_router import router as sample_router
from app.api.schemas_router import router as schemas_router

api_router = APIRouter(prefix="/api")

api_router.include_router(schemas_router)
api_router.include_router(sample_router)
api_router.include_router(agent_router)
api_router.include_router(plans_router)
api_router.include_router(dry_run_router)
api_router.include_router(quarantine_router)
api_router.include_router(runs_router)
api_router.include_router(reconciliation_router)
api_router.include_router(audit_router)
api_router.include_router(demo_router)
