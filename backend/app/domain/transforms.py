from typing import Any, Dict, List, Literal, Optional, Union
from pydantic import BaseModel, Field, model_validator


class RuleParamBase(BaseModel):
    """Base class for transformation rule parameters."""
    pass


class ParseDateParams(RuleParamBase):
    input_format: str = Field(
        ...,
        description="Format string compatible with strftime/strptime (e.g. '%d/%m/%Y')",
    )


class ParseDateTimeParams(RuleParamBase):
    input_format: str = Field(
        ...,
        description="Format string compatible with strftime/strptime (e.g. '%Y-%m-%d %H:%M:%S')",
    )


class SplitNameParams(RuleParamBase):
    part: Literal["first", "last"] = Field(
        ...,
        description="Which part of the split full name to extract",
    )


class DefaultValueParams(RuleParamBase):
    value: Any = Field(..., description="Default fallback value")


class EnumMapParams(RuleParamBase):
    mapping: Dict[str, str] = Field(..., description="Map of source values to target enum strings")
    on_unmapped: Literal["error", "default"] = Field("error", description="Behavior when value is not in mapping")
    default: Optional[str] = Field(None, description="Default value if on_unmapped is 'default'")

    @model_validator(mode="after")
    def validate_default(self) -> "EnumMapParams":
        if self.on_unmapped == "default" and self.default is None:
            raise ValueError("default must be provided when on_unmapped is 'default'")
        return self


class NormalizePhoneParams(RuleParamBase):
    default_country: str = Field("US", description="Default ISO country code prefix if phone has no country code")


class ConcatParams(RuleParamBase):
    fields: List[str] = Field(..., min_length=1, description="List of source field names to concatenate")
    separator: str = Field(" ", description="Separator string")


class TransformRuleInvocation(BaseModel):
    rule: str = Field(..., description="Name of rule from transform registry")
    params: Dict[str, Any] = Field(default_factory=dict, description="Rule-specific parameters")


class FieldMapping(BaseModel):
    target_field: str = Field(..., description="Name of target schema field")
    source_fields: List[str] = Field(default_factory=list, description="List of source fields used")
    transformations: List[TransformRuleInvocation] = Field(
        default_factory=list,
        description="Ordered list of transformation rules to apply",
    )
    confidence: float = Field(1.0, ge=0.0, le=1.0, description="Agent confidence score (0.0 - 1.0)")
    rationale: str = Field("", description="Explanation of why this mapping & transform chain was chosen")


class PlanDefinition(BaseModel):
    field_mappings: List[FieldMapping] = Field(..., description="List of field mapping configurations")
    unmapped_target_fields: List[str] = Field(default_factory=list, description="Target fields not mapped")
    unmapped_source_fields: List[str] = Field(default_factory=list, description="Source fields not mapped")
