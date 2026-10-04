from typing import Any, Dict, List, Optional
from sqlalchemy.orm import Session
from app.agent.fallback_agent import FallbackAgent
from app.agent.llm_agent import LLMAgent
from app.agent.output_schema import (
    AgentProposalOutput,
    ClarificationAnswer,
    ReviseProposalRequest,
)
from app.domain.transforms import FieldMapping, PlanDefinition
from app.services.audit_service import AuditService
from app.services.plan_service import PlanService


class AgentService:
    @staticmethod
    def propose_plan(
        db: Session,
        actor: str = "agent",
        force_fallback: bool = False,
    ) -> AgentProposalOutput:
        """Run agent proposal and log audit event."""
        if force_fallback:
            proposal = FallbackAgent.generate_proposal()
        else:
            proposal = LLMAgent.run_agent_loop()

        # Create or update default plan with this proposal
        plan = PlanService.get_or_create_default_plan(db)
        plan_def = PlanDefinition(
            field_mappings=proposal.field_mappings,
            unmapped_target_fields=[
                f.field_name for f in proposal.incompatible_or_missing_fields
            ],
            unmapped_source_fields=["legacy_notes"],
        )
        version = PlanService.create_plan_version(
            db=db,
            plan_id=plan.id,
            plan_def=plan_def,
            creator=proposal.source,
        )

        AuditService.log_event(
            db=db,
            event_type="agent_proposal",
            actor=proposal.source,
            plan_version_id=version.id,
            payload={
                "source": proposal.source,
                "fallback_reason": proposal.fallback_reason,
                "validation_retries": proposal.validation_retries,
                "tools_called": proposal.tools_called,
                "mappings_count": len(proposal.field_mappings),
                "risks_count": len(proposal.risks),
                "questions_count": len(proposal.clarification_questions),
                "tools_called_count": len(proposal.tools_called),
            },
        )

        return proposal

    @staticmethod
    def revise_proposal(
        db: Session,
        request: ReviseProposalRequest,
        actor: str = "user",
    ) -> AgentProposalOutput:
        """Revise proposal based on clarification answers and generate a new plan version."""
        revised = FallbackAgent.revise_proposal(
            answers=request.answers,
            previous_mappings=request.previous_mappings,
        )

        plan = PlanService.get_or_create_default_plan(db)
        plan_def = PlanDefinition(
            field_mappings=revised.field_mappings,
            unmapped_target_fields=[
                f.field_name for f in revised.incompatible_or_missing_fields
            ],
            unmapped_source_fields=["legacy_notes"],
        )

        # Creates a new immutable plan version
        version = PlanService.create_plan_version(
            db=db,
            plan_id=plan.id,
            plan_def=plan_def,
            creator=actor,
        )

        AuditService.log_event(
            db=db,
            event_type="plan_edited",
            actor=actor,
            plan_version_id=version.id,
            payload={
                "action": "clarification_revision",
                "answers": [a.model_dump() for a in request.answers],
                "new_version_num": version.version_num,
            },
        )

        return revised
