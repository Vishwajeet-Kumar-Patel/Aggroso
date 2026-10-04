import datetime
import re
from typing import Any, Dict, List, Optional, Tuple
from app.domain.transforms import (
    ConcatParams,
    DefaultValueParams,
    EnumMapParams,
    FieldMapping,
    NormalizePhoneParams,
    ParseDateParams,
    ParseDateTimeParams,
    SplitNameParams,
    TransformRuleInvocation,
)

# Registry of parameter model classes for validation
PARAM_MODELS = {
    "parse_date": ParseDateParams,
    "parse_datetime": ParseDateTimeParams,
    "split_name": SplitNameParams,
    "default_value": DefaultValueParams,
    "enum_map": EnumMapParams,
    "normalize_phone_e164": NormalizePhoneParams,
    "concat": ConcatParams,
}

# Country to phone prefix map for basic fallback
COUNTRY_PHONE_PREFIXES = {
    "US": "+1",
    "CA": "+1",
    "GB": "+44",
    "UK": "+44",
    "CH": "+41",
    "AU": "+61",
    "FR": "+33",
    "ES": "+34",
    "GR": "+30",
    "IL": "+972",
    "RU": "+7",
    "IT": "+39",
    "DE": "+49",
}


class TransformExecutionError(ValueError):
    """Specific error raised during transformation rule execution."""
    def __init__(self, rule: str, message: str, original_value: Any = None):
        super().__init__(message)
        self.rule = rule
        self.message = message
        self.original_value = original_value


# ==========================================
# PURE TRANSFORMATION FUNCTIONS
# ==========================================


def rule_rename(value: Any, params: Dict[str, Any], record: Optional[Dict[str, Any]] = None) -> Any:
    return value


def rule_trim(value: Any, params: Dict[str, Any], record: Optional[Dict[str, Any]] = None) -> Any:
    if value is None:
        return None
    if isinstance(value, str):
        return value.strip()
    return str(value).strip()


def rule_uppercase(value: Any, params: Dict[str, Any], record: Optional[Dict[str, Any]] = None) -> Any:
    if value is None:
        return None
    return str(value).upper()


def rule_lowercase(value: Any, params: Dict[str, Any], record: Optional[Dict[str, Any]] = None) -> Any:
    if value is None:
        return None
    return str(value).lower()


def rule_cast_int(value: Any, params: Dict[str, Any], record: Optional[Dict[str, Any]] = None) -> int:
    if value is None or (isinstance(value, str) and not value.strip()):
        raise TransformExecutionError("cast_int", "Cannot cast empty or null value to integer", value)
    try:
        val_str = str(value).strip()
        # Handle decimal strings like "100.0"
        if "." in val_str:
            return int(float(val_str))
        return int(val_str)
    except (ValueError, TypeError) as e:
        raise TransformExecutionError("cast_int", f"Failed to cast '{value}' to integer: {str(e)}", value)


def rule_cast_decimal_to_cents(value: Any, params: Dict[str, Any], record: Optional[Dict[str, Any]] = None) -> int:
    if value is None or (isinstance(value, str) and not value.strip()):
        return 0
    try:
        val_str = str(value).strip().lstrip("$").replace(",", "")
        float_val = float(val_str)
        if float_val < 0:
            raise TransformExecutionError("cast_decimal_to_cents", f"Negative credit limit is not allowed: {float_val}", value)
        return int(round(float_val * 100))
    except (ValueError, TypeError) as e:
        if isinstance(e, TransformExecutionError):
            raise
        raise TransformExecutionError("cast_decimal_to_cents", f"Cannot convert non-numeric value '{value}' to cents", value)


def rule_parse_date(value: Any, params: Dict[str, Any], record: Optional[Dict[str, Any]] = None) -> Optional[str]:
    if value is None or (isinstance(value, str) and not value.strip()):
        return None
    validated_params = ParseDateParams(**params)
    val_str = str(value).strip()
    try:
        # Strict parsing
        dt = datetime.datetime.strptime(val_str, validated_params.input_format)
        return dt.strftime("%Y-%m-%d")
    except ValueError as e:
        raise TransformExecutionError("parse_date", f"Date '{val_str}' does not match format '{validated_params.input_format}' or is invalid calendar date: {str(e)}", value)


def rule_parse_datetime(value: Any, params: Dict[str, Any], record: Optional[Dict[str, Any]] = None) -> str:
    if value is None or (isinstance(value, str) and not value.strip()):
        raise TransformExecutionError("parse_datetime", "Cannot parse empty datetime string", value)
    validated_params = ParseDateTimeParams(**params)
    val_str = str(value).strip()
    try:
        dt = datetime.datetime.strptime(val_str, validated_params.input_format)
        return dt.strftime("%Y-%m-%dT%H:%M:%SZ")
    except ValueError as e:
        raise TransformExecutionError("parse_datetime", f"Datetime '{val_str}' does not match format '{validated_params.input_format}': {str(e)}", value)


def rule_split_name(value: Any, params: Dict[str, Any], record: Optional[Dict[str, Any]] = None) -> str:
    if value is None or (isinstance(value, str) and not value.strip()):
        raise TransformExecutionError("split_name", "Cannot split empty or null name", value)
    validated_params = SplitNameParams(**params)
    val_str = str(value).strip()
    parts = val_str.split(None, 1)  # split on whitespace, max 2 parts

    if validated_params.part == "first":
        return parts[0]
    elif validated_params.part == "last":
        if len(parts) < 2:
            raise TransformExecutionError("split_name", f"Cannot extract last name from single-word name '{val_str}'", value)
        return parts[1]
    raise TransformExecutionError("split_name", f"Unknown name part '{validated_params.part}'", value)


def rule_default_value(value: Any, params: Dict[str, Any], record: Optional[Dict[str, Any]] = None) -> Any:
    validated_params = DefaultValueParams(**params)
    if value is None or (isinstance(value, str) and not value.strip()):
        return validated_params.value
    return value


def rule_enum_map(value: Any, params: Dict[str, Any], record: Optional[Dict[str, Any]] = None) -> Any:
    validated_params = EnumMapParams(**params)
    key = str(value).strip() if value is not None else ""
    
    if key in validated_params.mapping:
        return validated_params.mapping[key]
    
    # Also check case-insensitive match
    for k, v in validated_params.mapping.items():
        if k.upper() == key.upper():
            return v

    if validated_params.on_unmapped == "default":
        return validated_params.default
    
    raise TransformExecutionError("enum_map", f"Value '{value}' not found in enum mapping {validated_params.mapping}", value)


def rule_normalize_phone_e164(value: Any, params: Dict[str, Any], record: Optional[Dict[str, Any]] = None) -> Optional[str]:
    if value is None or (isinstance(value, str) and not value.strip()):
        return None
    validated_params = NormalizePhoneParams(**params)
    val_str = str(value).strip()
    
    # Check if already starts with '+'
    has_plus = val_str.startswith("+")
    digits_only = re.sub(r"\D", "", val_str)

    if not digits_only:
        raise TransformExecutionError("normalize_phone_e164", f"Phone number '{val_str}' contains no digits", value)

    if has_plus:
        # Validate E.164 length (usually 8 to 15 digits)
        if len(digits_only) < 7 or len(digits_only) > 15:
            raise TransformExecutionError("normalize_phone_e164", f"International phone '{val_str}' digit count {len(digits_only)} out of E.164 range [7, 15]", value)
        return f"+{digits_only}"
    else:
        # Prepend country prefix based on default_country or record country_code
        country = validated_params.default_country
        if record and "country_code" in record and record["country_code"]:
            country = str(record["country_code"]).strip().upper()
        prefix = COUNTRY_PHONE_PREFIXES.get(country, "+1")
        # If number already has country code (e.g. 10 digits for US/CA, 11 digits starting with 1)
        if prefix == "+1" and len(digits_only) == 10:
            return f"+1{digits_only}"
        elif prefix == "+1" and len(digits_only) == 11 and digits_only.startswith("1"):
            return f"+{digits_only}"
        elif len(digits_only) >= 7 and len(digits_only) <= 15:
            # If digits already starts with the country code digits without plus
            prefix_digits = prefix.lstrip("+")
            if digits_only.startswith(prefix_digits):
                return f"+{digits_only}"
            return f"{prefix}{digits_only}"
        else:
            raise TransformExecutionError("normalize_phone_e164", f"Cannot normalize phone '{val_str}' to E.164", value)


def rule_concat(value: Any, params: Dict[str, Any], record: Optional[Dict[str, Any]] = None) -> str:
    validated_params = ConcatParams(**params)
    if not record:
        raise TransformExecutionError("concat", "Concat rule requires access to full record", value)
    
    parts = []
    for field_name in validated_params.fields:
        field_val = record.get(field_name, "")
        if field_val is not None:
            parts.append(str(field_val))
        else:
            parts.append("")
    return validated_params.separator.join(parts)


# Rule dispatch dictionary
TRANSFORM_REGISTRY = {
    "rename": rule_rename,
    "trim": rule_trim,
    "uppercase": rule_uppercase,
    "lowercase": rule_lowercase,
    "cast_int": rule_cast_int,
    "cast_decimal_to_cents": rule_cast_decimal_to_cents,
    "parse_date": rule_parse_date,
    "parse_datetime": rule_parse_datetime,
    "split_name": rule_split_name,
    "default_value": rule_default_value,
    "enum_map": rule_enum_map,
    "normalize_phone_e164": rule_normalize_phone_e164,
    "concat": rule_concat,
}


# ==========================================
# TRANSFORM ENGINE SERVICE
# ==========================================


class TransformEngine:
    @staticmethod
    def get_supported_rules() -> List[str]:
        return list(TRANSFORM_REGISTRY.keys())

    @staticmethod
    def validate_rule_params(rule_name: str, params: Dict[str, Any]) -> None:
        if rule_name not in TRANSFORM_REGISTRY:
            raise ValueError(f"Unsupported transformation rule: '{rule_name}'")
        if rule_name in PARAM_MODELS:
            PARAM_MODELS[rule_name](**params)

    @staticmethod
    def apply_rule(
        rule_name: str,
        value: Any,
        params: Dict[str, Any],
        record: Optional[Dict[str, Any]] = None,
    ) -> Any:
        if rule_name not in TRANSFORM_REGISTRY:
            raise TransformExecutionError(rule_name, f"Unknown rule '{rule_name}'", value)
        func = TRANSFORM_REGISTRY[rule_name]
        return func(value, params, record)

    @staticmethod
    def apply_mapping(
        mapping: FieldMapping,
        record: Dict[str, Any],
    ) -> Tuple[Any, Optional[TransformExecutionError]]:
        """Apply a field mapping and its transformation chain to a source record."""
        # Initial value from primary source field if present
        current_value = None
        if mapping.source_fields:
            primary_field = mapping.source_fields[0]
            current_value = record.get(primary_field)

        for invocation in mapping.transformations:
            try:
                current_value = TransformEngine.apply_rule(
                    rule_name=invocation.rule,
                    value=current_value,
                    params=invocation.params,
                    record=record,
                )
            except TransformExecutionError as e:
                return None, e
            except Exception as e:
                return None, TransformExecutionError(invocation.rule, str(e), current_value)

        return current_value, None

    @staticmethod
    def preview(rule_name: str, params: Dict[str, Any], sample_values: List[Any]) -> List[Dict[str, Any]]:
        """Preview rule transformation on sample inputs."""
        TransformEngine.validate_rule_params(rule_name, params)
        results = []
        for val in sample_values:
            mock_record = {"field": val, "country_code": "US"}
            try:
                out = TransformEngine.apply_rule(rule_name, val, params, mock_record)
                results.append({"input": val, "output": out, "success": True, "error": None})
            except Exception as e:
                results.append({"input": val, "output": None, "success": False, "error": str(e)})
        return results
