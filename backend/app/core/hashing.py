import hashlib
import json
from typing import Any


def canonical_json(data: Any) -> str:
    """Produce deterministic canonical JSON string with sorted keys and compact separators."""
    return json.dumps(
        data,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=True,
        default=str,
    )


def compute_sha256(data: Any) -> str:
    """Compute SHA-256 hash of any JSON-serializable object or string."""
    if isinstance(data, str):
        content = data.encode("utf-8")
    else:
        content = canonical_json(data).encode("utf-8")
    return hashlib.sha256(content).hexdigest()


def compute_batch_hash(records: list[dict[str, Any]]) -> str:
    """Compute deterministic SHA-256 hash for a batch of records."""
    return compute_sha256(records)
