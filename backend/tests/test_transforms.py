import pytest
from app.services.transform_engine import TransformEngine, TransformExecutionError


def test_rule_rename():
    assert TransformEngine.apply_rule("rename", "hello", {}) == "hello"
    assert TransformEngine.apply_rule("rename", 123, {}) == 123
    assert TransformEngine.apply_rule("rename", None, {}) is None


def test_rule_trim():
    assert TransformEngine.apply_rule("trim", "  hello  ", {}) == "hello"
    assert TransformEngine.apply_rule("trim", "\tworld\n", {}) == "world"
    assert TransformEngine.apply_rule("trim", None, {}) is None
    assert TransformEngine.apply_rule("trim", 42, {}) == "42"


def test_rule_uppercase():
    assert TransformEngine.apply_rule("uppercase", "us", {}) == "US"
    assert TransformEngine.apply_rule("uppercase", "Alice", {}) == "ALICE"
    assert TransformEngine.apply_rule("uppercase", None, {}) is None


def test_rule_lowercase():
    assert TransformEngine.apply_rule("lowercase", "ALICE@EXAMPLE.COM", {}) == "alice@example.com"
    assert TransformEngine.apply_rule("lowercase", "GB", {}) == "gb"
    assert TransformEngine.apply_rule("lowercase", None, {}) is None


def test_rule_cast_int():
    assert TransformEngine.apply_rule("cast_int", "123", {}) == 123
    assert TransformEngine.apply_rule("cast_int", "  456  ", {}) == 456
    assert TransformEngine.apply_rule("cast_int", "100.0", {}) == 100
    assert TransformEngine.apply_rule("cast_int", 789, {}) == 789

    with pytest.raises(TransformExecutionError):
        TransformEngine.apply_rule("cast_int", "invalid_num", {})

    with pytest.raises(TransformExecutionError):
        TransformEngine.apply_rule("cast_int", None, {})


def test_rule_cast_decimal_to_cents():
    assert TransformEngine.apply_rule("cast_decimal_to_cents", "2500.00", {}) == 250000
    assert TransformEngine.apply_rule("cast_decimal_to_cents", "1200.50", {}) == 120050
    assert TransformEngine.apply_rule("cast_decimal_to_cents", "500", {}) == 50000
    assert TransformEngine.apply_rule("cast_decimal_to_cents", "0.00", {}) == 0
    assert TransformEngine.apply_rule("cast_decimal_to_cents", "", {}) == 0
    assert TransformEngine.apply_rule("cast_decimal_to_cents", None, {}) == 0

    # Negative credit limit is rejected
    with pytest.raises(TransformExecutionError, match="Negative credit limit"):
        TransformEngine.apply_rule("cast_decimal_to_cents", "-500.00", {})

    # Non-numeric is rejected
    with pytest.raises(TransformExecutionError, match="Cannot convert non-numeric"):
        TransformEngine.apply_rule("cast_decimal_to_cents", "unlimited", {})


def test_rule_parse_date():
    params = {"input_format": "%d/%m/%Y"}
    assert TransformEngine.apply_rule("parse_date", "15/04/1988", params) == "1988-04-15"
    assert TransformEngine.apply_rule("parse_date", "01/01/2000", params) == "2000-01-01"
    assert TransformEngine.apply_rule("parse_date", None, params) is None
    assert TransformEngine.apply_rule("parse_date", "", params) is None

    # Invalid calendar date (Feb 31)
    with pytest.raises(TransformExecutionError, match="invalid calendar date"):
        TransformEngine.apply_rule("parse_date", "31/02/1990", params)

    # Invalid format ("N/A")
    with pytest.raises(TransformExecutionError):
        TransformEngine.apply_rule("parse_date", "N/A", params)


def test_rule_parse_datetime():
    params = {"input_format": "%Y-%m-%d %H:%M:%S"}
    assert TransformEngine.apply_rule("parse_datetime", "2023-01-10 09:30:00", params) == "2023-01-10T09:30:00Z"

    with pytest.raises(TransformExecutionError):
        TransformEngine.apply_rule("parse_datetime", "10-01-2023", params)

    with pytest.raises(TransformExecutionError):
        TransformEngine.apply_rule("parse_datetime", None, params)


def test_rule_split_name():
    assert TransformEngine.apply_rule("split_name", "Alice Smith", {"part": "first"}) == "Alice"
    assert TransformEngine.apply_rule("split_name", "Alice Smith", {"part": "last"}) == "Smith"
    assert TransformEngine.apply_rule("split_name", "John Jacob Jingleheimer Schmidt", {"part": "first"}) == "John"
    assert TransformEngine.apply_rule("split_name", "John Jacob Jingleheimer Schmidt", {"part": "last"}) == "Jacob Jingleheimer Schmidt"

    # Single-word name fails when extracting last name
    assert TransformEngine.apply_rule("split_name", "Cher", {"part": "first"}) == "Cher"
    with pytest.raises(TransformExecutionError, match="single-word name"):
        TransformEngine.apply_rule("split_name", "Cher", {"part": "last"})

    with pytest.raises(TransformExecutionError):
        TransformEngine.apply_rule("split_name", "", {"part": "first"})


def test_rule_default_value():
    assert TransformEngine.apply_rule("default_value", None, {"value": "BRONZE"}) == "BRONZE"
    assert TransformEngine.apply_rule("default_value", "", {"value": "ACTIVE"}) == "ACTIVE"
    assert TransformEngine.apply_rule("default_value", "GOLD", {"value": "BRONZE"}) == "GOLD"


def test_rule_enum_map():
    mapping = {"A": "ACTIVE", "I": "INACTIVE", "P": "PENDING"}
    
    # Exact and case-insensitive matching
    assert TransformEngine.apply_rule("enum_map", "A", {"mapping": mapping}) == "ACTIVE"
    assert TransformEngine.apply_rule("enum_map", "a", {"mapping": mapping}) == "ACTIVE"
    assert TransformEngine.apply_rule("enum_map", "I", {"mapping": mapping}) == "INACTIVE"
    assert TransformEngine.apply_rule("enum_map", "P", {"mapping": mapping}) == "PENDING"

    # Unmapped with error
    with pytest.raises(TransformExecutionError, match="not found in enum mapping"):
        TransformEngine.apply_rule("enum_map", "UNKNOWN", {"mapping": mapping, "on_unmapped": "error"})

    # Unmapped with default
    assert TransformEngine.apply_rule("enum_map", "UNKNOWN", {"mapping": mapping, "on_unmapped": "default", "default": "PENDING"}) == "PENDING"


def test_rule_normalize_phone_e164():
    assert TransformEngine.apply_rule("normalize_phone_e164", "+1-555-123-4567", {}) == "+15551234567"
    assert TransformEngine.apply_rule("normalize_phone_e164", "(555) 234-5678", {"default_country": "US"}) == "+15552345678"
    assert TransformEngine.apply_rule("normalize_phone_e164", "+44 20 7946 0991", {}) == "+442079460991"
    assert TransformEngine.apply_rule("normalize_phone_e164", None, {}) is None
    assert TransformEngine.apply_rule("normalize_phone_e164", "", {}) is None

    # Invalid phone (no digits)
    with pytest.raises(TransformExecutionError, match="no digits"):
        TransformEngine.apply_rule("normalize_phone_e164", "no-digits", {})


def test_rule_concat():
    record = {"first": "Jane", "last": "Doe"}
    assert TransformEngine.apply_rule("concat", None, {"fields": ["first", "last"], "separator": " "}, record=record) == "Jane Doe"
    assert TransformEngine.apply_rule("concat", None, {"fields": ["last", "first"], "separator": ", "}, record=record) == "Doe, Jane"


def test_preview():
    results = TransformEngine.preview(
        rule_name="uppercase",
        params={},
        sample_values=["us", "gb", None],
    )
    assert len(results) == 3
    assert results[0]["output"] == "US"
    assert results[1]["output"] == "GB"
    assert results[2]["output"] is None
