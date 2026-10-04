import json
import pytest
from unittest.mock import patch, MagicMock
from app.core.config import settings
from app.agent.fallback_agent import FallbackAgent
from app.agent.llm_agent import LLMAgent
from app.agent.output_schema import (
    AgentProposalOutput,
    ClarificationAnswer,
    ReviseProposalRequest,
)
from app.agent.tools import AGENT_TOOL_DEFINITIONS, AGENT_TOOL_REGISTRY, execute_tool
from app.services.agent_service import AgentService


def test_agent_tool_allowlist_isolation():
    """Assert exactly 6 read-only tools are registered and calling unknown tool raises (B4)."""
    expected_tools = {
        "get_source_schema",
        "get_target_schema",
        "sample_source_records",
        "list_supported_transformations",
        "validate_mapping",
        "preview_transformation",
    }
    assert set(AGENT_TOOL_REGISTRY.keys()) == expected_tools
    assert len(AGENT_TOOL_DEFINITIONS) == 6

    # Verify no write, delete, execute, or approve tools exist
    disallowed_keywords = ["write", "delete", "execute", "run", "approve", "modify", "insert", "drop"]
    for tool_def in AGENT_TOOL_DEFINITIONS:
        name = tool_def["name"]
        for kw in disallowed_keywords:
            assert kw not in name.lower(), f"Disallowed keyword '{kw}' found in tool name '{name}'"

    # Calling an unauthorized tool raises ValueError
    with pytest.raises(ValueError, match="Unauthorized or unknown tool"):
        execute_tool("execute_migration", {})

    with pytest.raises(ValueError, match="Unauthorized or unknown tool"):
        execute_tool("approve_plan", {})


def test_agent_tools_execution():
    source_schema = execute_tool("get_source_schema", {})
    assert source_schema["name"] == "legacy_customers"

    target_schema = execute_tool("get_target_schema", {})
    assert target_schema["name"] == "customers"

    sample = execute_tool("sample_source_records", {"n": 5})
    assert len(sample) == 5

    transforms = execute_tool("list_supported_transformations", {})
    assert "rules" in transforms

    valid_mapping = {
        "target_field": "email",
        "source_fields": ["email_addr"],
        "transformations": [{"rule": "trim"}, {"rule": "lowercase"}],
    }
    val_res = execute_tool("validate_mapping", {"mapping": valid_mapping})
    assert val_res["valid"] is True


def test_fallback_agent_offline_generation(app_db):
    proposal = FallbackAgent.generate_proposal()
    assert proposal.source == "fallback"
    assert len(proposal.field_mappings) >= 10
    assert len(proposal.risks) >= 3
    assert len(proposal.clarification_questions) >= 3
    assert proposal.proposed_migration_plan is not None

    # Test proposal via AgentService
    service_prop = AgentService.propose_plan(app_db, force_fallback=True)
    assert service_prop.source == "fallback"


def test_clarification_revision_creates_new_version(app_db):
    # 1. Generate initial proposal
    AgentService.propose_plan(app_db, force_fallback=True)

    # 2. Answer clarification questions
    answers = [
        ClarificationAnswer(question_id="Q1", selected_option_or_text="GOLD"),
        ClarificationAnswer(question_id="Q2", selected_option_or_text="Default to PENDING"),
        ClarificationAnswer(question_id="Q3", selected_option_or_text="GB (+44)"),
    ]
    req = ReviseProposalRequest(answers=answers)
    revised = AgentService.revise_proposal(app_db, req, actor="user")

    # Verify answers reflected in mappings
    loyalty_mapping = next(m for m in revised.field_mappings if m.target_field == "loyalty_tier")
    assert loyalty_mapping.transformations[0].params["value"] == "GOLD"

    status_mapping = next(m for m in revised.field_mappings if m.target_field == "status")
    assert status_mapping.transformations[0].params["on_unmapped"] == "default"
    assert status_mapping.transformations[0].params["default"] == "PENDING"


def test_mocked_llm_missing_api_key(monkeypatch):
    """Missing API key cleanly defaults to FallbackAgent (A6)."""
    monkeypatch.setattr(settings, "ANTHROPIC_API_KEY", None)
    proposal = LLMAgent.run_agent_loop()
    assert proposal.source == "fallback"
    assert proposal.fallback_reason == "Missing ANTHROPIC_API_KEY"


def test_mocked_llm_valid_output(monkeypatch):
    """Mocked LLM returns valid structured proposal on first attempt (A6)."""
    monkeypatch.setattr(settings, "ANTHROPIC_API_KEY", "mock-key-12345")
    valid_payload = FallbackAgent.generate_proposal().model_dump()
    valid_payload["source"] = "llm"

    mock_resp = MagicMock()
    mock_resp.stop_reason = "end_turn"
    mock_block = MagicMock()
    mock_block.text = json.dumps(valid_payload)
    mock_resp.content = [mock_block]

    with patch("anthropic.Anthropic") as mock_anthropic:
        client_mock = MagicMock()
        client_mock.messages.create.return_value = mock_resp
        mock_anthropic.return_value = client_mock

        proposal = LLMAgent.run_agent_loop()
        assert proposal.source == "llm"
        assert proposal.validation_retries == 0
        assert len(proposal.field_mappings) >= 10


def test_mocked_llm_invalid_then_valid(monkeypatch):
    """Mocked LLM returns malformed JSON, receives feedback, then returns valid proposal (A6)."""
    monkeypatch.setattr(settings, "ANTHROPIC_API_KEY", "mock-key-12345")
    valid_payload = FallbackAgent.generate_proposal().model_dump()
    valid_payload["source"] = "llm"

    # First response: invalid JSON; Second response: valid JSON
    mock_resp1 = MagicMock()
    mock_resp1.stop_reason = "end_turn"
    block1 = MagicMock()
    block1.text = "{ malformed json..."
    mock_resp1.content = [block1]

    mock_resp2 = MagicMock()
    mock_resp2.stop_reason = "end_turn"
    block2 = MagicMock()
    block2.text = json.dumps(valid_payload)
    mock_resp2.content = [block2]

    with patch("anthropic.Anthropic") as mock_anthropic:
        client_mock = MagicMock()
        client_mock.messages.create.side_effect = [mock_resp1, mock_resp2]
        mock_anthropic.return_value = client_mock

        proposal = LLMAgent.run_agent_loop()
        assert proposal.source == "llm"
        assert proposal.validation_retries == 1
        assert len(proposal.field_mappings) >= 10


def test_mocked_llm_invalid_twice_triggers_fallback(monkeypatch):
    """Mocked LLM returns invalid JSON twice -> falls back to deterministic agent (A6)."""
    monkeypatch.setattr(settings, "ANTHROPIC_API_KEY", "mock-key-12345")

    mock_resp = MagicMock()
    mock_resp.stop_reason = "end_turn"
    block = MagicMock()
    block.text = "NOT JSON"
    mock_resp.content = [block]

    with patch("anthropic.Anthropic") as mock_anthropic:
        client_mock = MagicMock()
        client_mock.messages.create.side_effect = [mock_resp, mock_resp]
        mock_anthropic.return_value = client_mock

        proposal = LLMAgent.run_agent_loop()
        assert proposal.source == "fallback"
        assert "Schema validation failed after retry" in (proposal.fallback_reason or "")


def test_mocked_llm_exception_or_timeout_triggers_fallback(monkeypatch):
    """Mocked LLM network timeout or exception triggers fallback (A6)."""
    monkeypatch.setattr(settings, "ANTHROPIC_API_KEY", "mock-key-12345")

    with patch("anthropic.Anthropic") as mock_anthropic:
        client_mock = MagicMock()
        client_mock.messages.create.side_effect = TimeoutError("Connection timed out")
        mock_anthropic.return_value = client_mock

        proposal = LLMAgent.run_agent_loop()
        assert proposal.source == "fallback"
        assert "LLM execution exception" in (proposal.fallback_reason or "")
