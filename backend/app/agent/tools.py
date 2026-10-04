import json
from typing import Any, Callable, Dict, List, Optional
from app.core.config import settings
from app.domain.transforms import FieldMapping
from app.services.transform_engine import TransformEngine


# Tool definitions for Anthropic Claude SDK
AGENT_TOOL_DEFINITIONS = [
    {
        "name": "get_source_schema",
        "description": "Inspect the schema definition of the legacy source database table.",
        "input_schema": {
            "type": "object",
            "properties": {},
        },
    },
    {
        "name": "get_target_schema",
        "description": "Inspect the schema definition of the target database table including types, nullability, enums, and unique constraints.",
        "input_schema": {
            "type": "object",
            "properties": {},
        },
    },
    {
        "name": "sample_source_records",
        "description": "Inspect up to N (max 20) sample source records to understand legacy data formats and dirty values.",
        "input_schema": {
            "type": "object",
            "properties": {
                "n": {
                    "type": "integer",
                    "description": "Number of records to sample (1 to 20)",
                    "default": 10,
                }
            },
        },
    },
    {
        "name": "list_supported_transformations",
        "description": "List all whitelist transformation rules supported by the deterministic execution engine along with their parameter schemas.",
        "input_schema": {
            "type": "object",
            "properties": {},
        },
    },
    {
        "name": "validate_mapping",
        "description": "Validate a proposed field mapping configuration and check parameter correctness.",
        "input_schema": {
            "type": "object",
            "properties": {
                "mapping": {
                    "type": "object",
                    "description": "Field mapping object with target_field, source_fields, transformations",
                }
            },
            "required": ["mapping"],
        },
    },
    {
        "name": "preview_transformation",
        "description": "Preview output of a transformation rule on sample values before finalizing mapping proposal.",
        "input_schema": {
            "type": "object",
            "properties": {
                "rule": { "type": "string", "description": "Transformation rule name" },
                "params": { "type": "object", "description": "Rule parameters dictionary", "default": {} },
                "sample_values": { "type": "array", "description": "List of sample values to test" },
            },
            "required": ["rule", "sample_values"],
        },
    },
]


def tool_get_source_schema() -> Dict[str, Any]:
    with open(settings.SOURCE_SCHEMA_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def tool_get_target_schema() -> Dict[str, Any]:
    with open(settings.TARGET_SCHEMA_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def tool_sample_source_records(n: int = 10) -> List[Dict[str, Any]]:
    limit = max(1, min(n, 20))
    with open(settings.SOURCE_SAMPLE_PATH, "r", encoding="utf-8") as f:
        records = json.load(f)
        return records[:limit]


def tool_list_supported_transformations() -> Dict[str, Any]:
    with open(settings.TRANSFORM_REGISTRY_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def tool_validate_mapping(mapping: Dict[str, Any]) -> Dict[str, Any]:
    try:
        fm = FieldMapping(**mapping)
        for t in fm.transformations:
            TransformEngine.validate_rule_params(t.rule, t.params)
        return {"valid": True, "errors": []}
    except Exception as e:
        return {"valid": False, "errors": [str(e)]}


def tool_preview_transformation(
    rule: str,
    sample_values: List[Any],
    params: Optional[Dict[str, Any]] = None,
) -> List[Dict[str, Any]]:
    return TransformEngine.preview(rule, params or {}, sample_values)


AGENT_TOOL_REGISTRY: Dict[str, Callable[..., Any]] = {
    "get_source_schema": tool_get_source_schema,
    "get_target_schema": tool_get_target_schema,
    "sample_source_records": tool_sample_source_records,
    "list_supported_transformations": tool_list_supported_transformations,
    "validate_mapping": tool_validate_mapping,
    "preview_transformation": tool_preview_transformation,
}


def execute_tool(name: str, arguments: Dict[str, Any]) -> Any:
    """Strictly dispatch only allowed read-only inspection tools."""
    if name not in AGENT_TOOL_REGISTRY:
        raise ValueError(f"Unauthorized or unknown tool: '{name}'. Agent only has access to read-only inspection tools.")
    func = AGENT_TOOL_REGISTRY[name]
    return func(**arguments)
