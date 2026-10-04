from typing import Any, Dict, List, Literal, Optional
from pydantic import BaseModel, Field
from app.domain.transforms import FieldMapping


class IncompatibleFieldInfo(BaseModel):
    field_name: str
    description: str
    suggestion: str


class MigrationRisk(BaseModel):
    severity: Literal["low", "medium", "high"]
    description: str
    affected_fields: List[str] = Field(default_factory=list)


class ClarificationQuestion(BaseModel):
    id: str
    question: str
    affects_field: str
    suggested_options: List[str] = Field(default_factory=list)
    user_answer: Optional[str] = None


class ProposedMigrationPlan(BaseModel):
    summary: str
    ordered_steps: List[str] = Field(default_factory=list)


class AgentProposalOutput(BaseModel):
    source: Literal["llm", "fallback"] = "fallback"
    fallback_reason: Optional[str] = None
    validation_retries: int = 0
    field_mappings: List[FieldMapping]
    incompatible_or_missing_fields: List[IncompatibleFieldInfo] = Field(default_factory=list)
    risks: List[MigrationRisk] = Field(default_factory=list)
    clarification_questions: List[ClarificationQuestion] = Field(default_factory=list)
    proposed_migration_plan: ProposedMigrationPlan
    tools_called: List[Dict[str, Any]] = Field(default_factory=list)


class ClarificationAnswer(BaseModel):
    question_id: str
    selected_option_or_text: str


class ReviseProposalRequest(BaseModel):
    answers: List[ClarificationAnswer]
    previous_mappings: Optional[List[FieldMapping]] = None
