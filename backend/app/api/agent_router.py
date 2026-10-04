from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session
from app.agent.output_schema import AgentProposalOutput, ReviseProposalRequest
from app.core.db import get_app_db
from app.services.agent_service import AgentService
from app.services.transform_engine import TransformEngine

router = APIRouter(prefix="/agent", tags=["AI Agent"])


class PreviewTransformRequest(BaseModel):
    rule: str
    params: Dict[str, Any] = {}
    sample_values: List[Any]


@router.post("/propose", response_model=AgentProposalOutput)
def propose_migration_plan(
    force_fallback: bool = Query(False, description="Force deterministic fallback agent"),
    db: Session = Depends(get_app_db),
):
    """Run AI agent to propose schema mappings, identify risks, and raise clarification questions."""
    return AgentService.propose_plan(db=db, force_fallback=force_fallback)


@router.post("/revise", response_model=AgentProposalOutput)
def revise_proposal(
    request: ReviseProposalRequest,
    db: Session = Depends(get_app_db),
):
    """Submit human clarification answers to produce a revised proposal and new plan version."""
    return AgentService.revise_proposal(db=db, request=request)


@router.post("/preview-transform")
def preview_transformation(request: PreviewTransformRequest):
    """Preview rule output on sample values without executing a full migration."""
    return TransformEngine.preview(
        rule_name=request.rule,
        params=request.params,
        sample_values=request.sample_values,
    )
