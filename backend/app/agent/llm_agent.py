import json
import logging
from typing import Any, Dict, List, Optional
import anthropic
from app.agent.fallback_agent import FallbackAgent
from app.agent.output_schema import AgentProposalOutput, ClarificationAnswer
from app.agent.tools import AGENT_TOOL_DEFINITIONS, execute_tool
from app.core.config import settings

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are an expert Data Migration Architect AI agent.
Your mission is to inspect the legacy source schema, target schema, sample records, and supported transformation rules using ONLY the provided read-only tools.
Then produce a structured migration plan proposal.

STRICT RULES:
1. You have NO execute, write, or approve tools. Propose mappings only.
2. Only use transformation rules available in the supported transform registry.
3. Analyze sample records carefully to detect dirty data, missing fields, invalid formats, and duplicates.
4. Highlight all risks and formulate precise clarification questions where target fields lack source equivalents (like loyalty_tier) or status mappings.
5. Provide your final response matching the AgentProposalOutput schema with: field_mappings, incompatible_or_missing_fields, risks, clarification_questions, proposed_migration_plan.
"""


class LLMAgent:
    @staticmethod
    def run_agent_loop() -> AgentProposalOutput:
        """Run Anthropic tool-calling loop with schema validation retry and fallback."""
        if not settings.ANTHROPIC_API_KEY:
            logger.info("ANTHROPIC_API_KEY not set. Using deterministic FallbackAgent.")
            return FallbackAgent.generate_proposal(fallback_reason="Missing ANTHROPIC_API_KEY")

        tools_called: List[Dict[str, Any]] = []
        validation_retries = 0

        try:
            client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)
            messages = [
                {
                    "role": "user",
                    "content": "Please inspect the source schema, target schema, sample records, and supported transform rules using the read-only tools. Then generate a comprehensive data migration proposal in AgentProposalOutput JSON format.",
                }
            ]

            # Tool calling & generation loop
            max_iterations = 6
            for _ in range(max_iterations):
                response = client.messages.create(
                    model=settings.ANTHROPIC_MODEL,
                    max_tokens=4000,
                    system=SYSTEM_PROMPT,
                    tools=AGENT_TOOL_DEFINITIONS,
                    messages=messages,
                )

                if response.stop_reason == "tool_use":
                    # Process tool calls
                    assistant_content = response.content
                    messages.append({"role": "assistant", "content": assistant_content})
                    tool_results = []

                    for block in assistant_content:
                        if block.type == "tool_use":
                            tool_name = block.name
                            tool_input = block.input
                            try:
                                result = execute_tool(tool_name, tool_input)
                                result_str = json.dumps(result, default=str)
                                output_summary = result_str[:120] + ("..." if len(result_str) > 120 else "")
                                tools_called.append({
                                    "name": tool_name,
                                    "args": tool_input,
                                    "output_summary": output_summary,
                                })
                                tool_results.append(
                                    {
                                        "type": "tool_result",
                                        "tool_use_id": block.id,
                                        "content": result_str,
                                    }
                                )
                            except Exception as tool_err:
                                tools_called.append({
                                    "name": tool_name,
                                    "args": tool_input,
                                    "output_summary": f"ERROR: {str(tool_err)}",
                                })
                                tool_results.append(
                                    {
                                        "type": "tool_result",
                                        "tool_use_id": block.id,
                                        "is_error": True,
                                        "content": str(tool_err),
                                    }
                                )

                    messages.append({"role": "user", "content": tool_results})
                else:
                    # Final response text - extract JSON and validate against Pydantic schema
                    text_content = ""
                    for block in response.content:
                        if hasattr(block, "text"):
                            text_content += block.text

                    parse_error: Optional[str] = None
                    try:
                        json_str = text_content
                        if "```json" in text_content:
                            json_str = text_content.split("```json")[1].split("```")[0].strip()
                        elif "```" in text_content:
                            json_str = text_content.split("```")[1].split("```")[0].strip()

                        data = json.loads(json_str)
                        data["source"] = "llm"
                        data["tools_called"] = tools_called
                        data["validation_retries"] = validation_retries
                        return AgentProposalOutput(**data)
                    except Exception as err:
                        parse_error = str(err)
                        logger.warning(f"LLM proposal validation error: {parse_error}")

                    # If first failure, retry once by feeding validation error back to LLM
                    if validation_retries == 0 and parse_error:
                        validation_retries += 1
                        messages.append({"role": "assistant", "content": text_content})
                        messages.append({
                            "role": "user",
                            "content": f"The proposal failed schema validation:\n{parse_error}\nPlease correct the errors and output ONLY valid JSON matching the AgentProposalOutput schema.",
                        })
                        continue

                    # If retry already attempted and still failed, fall back
                    return FallbackAgent.generate_proposal(
                        tools_called=tools_called,
                        fallback_reason=f"Schema validation failed after retry: {parse_error}",
                    )

            # If iterations exhausted
            return FallbackAgent.generate_proposal(
                tools_called=tools_called,
                fallback_reason="Agent loop exceeded maximum iterations without completing",
            )

        except Exception as e:
            logger.warning(f"Anthropic agent execution failed: {e}. Utilizing deterministic FallbackAgent.")
            return FallbackAgent.generate_proposal(
                tools_called=tools_called,
                fallback_reason=f"LLM execution exception: {str(e)}",
            )
