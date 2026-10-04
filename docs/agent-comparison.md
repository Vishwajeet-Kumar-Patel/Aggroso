# AI Agent Comparison: LLMAgent vs FallbackAgent

## 1. Architecture Overview

Aggroso implements a dual-mode migration planner architecture:

1. **LLMAgent (Anthropic Claude 3.5 Sonnet):** Dynamic, autonomous agent leveraging tool-calling allow-lists, feedback retry loops, semantic reasoning across unstructured data, and risk detection.
2. **FallbackAgent (Deterministic Rule-Based Planner):** Zero-dependency offline engine guaranteeing deterministic proposal generation and system resilience when API keys are absent, network connections fail, or rate limits are encountered.

---

## 2. Comparative Analysis Matrix

| Evaluation Dimension | LLMAgent (Claude 3.5 Sonnet) | FallbackAgent (Deterministic Engine) |
| :--- | :--- | :--- |
| **Tool Execution** | Autonomous multi-step tool calling (schema inspection, record sampling, rule preview). | Hardcoded invocation sequence of registered transformations. |
| **Field Mapping Precision** | High context reasoning (e.g. recognizing `phone_num` vs `phone_mobile`, `dob` vs `birth_date`). | Direct schema-defined heuristics matching exact field names. |
| **Dirty Data Detection** | Identifies subtle semantic anomalies in sample records (e.g. mononyms, non-standard dates). | Detects known edge cases based on deterministic regular expressions. |
| **Clarification Questions** | Dynamically synthesizes contextual business questions with options and impacts. | Returns pre-compiled standard clarification questions (`Q1`, `Q2`). |
| **Risk Assessment** | Generates detailed narrative risk summaries (e.g. data loss on loyalty tiers, unmapped enums). | Returns structured list of known migration risks. |
| **Execution Speed** | 2.5s – 5.0s (network + LLM latency). | < 10ms (instantaneous). |
| **Offline Reliability** | Requires internet access & Anthropic API Key. | 100% offline, zero external dependencies. |
| **Failure Recovery** | 1-retry feedback loop on Pydantic validation failure before graceful fallback. | N/A (deterministic success). |

---

## 3. Resilience & Fallback Guarantees

- **Automatic Downgrade:** If `ANTHROPIC_API_KEY` is empty, expired, or invalid, `LLMAgent` instantly falls back to `FallbackAgent` with `source: "fallback"` and `fallback_reason` populated.
- **Safety Allow-List Enforcement:** The LLM is restricted to six read-only inspection tools:
  - `get_source_schema`
  - `get_target_schema`
  - `sample_source_records`
  - `list_supported_transformations`
  - `validate_mapping`
  - `preview_transformation`
- **Zero Arbitrary Execution:** Neither agent can execute arbitrary SQL, run code, or approve migration plans. Approval requires human authorization with cryptographic hash verification.
