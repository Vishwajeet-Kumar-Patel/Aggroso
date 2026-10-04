from typing import Any, Dict, List, Optional
from app.agent.output_schema import (
    AgentProposalOutput,
    ClarificationAnswer,
    ClarificationQuestion,
    IncompatibleFieldInfo,
    MigrationRisk,
    ProposedMigrationPlan,
)
from app.domain.transforms import FieldMapping, TransformRuleInvocation


class FallbackAgent:
    @staticmethod
    def generate_proposal(
        tools_called: Optional[List[Dict[str, Any]]] = None,
        fallback_reason: Optional[str] = None,
    ) -> AgentProposalOutput:
        """Deterministic heuristic mapping agent when LLM is unavailable or offline."""
        mappings = [
            FieldMapping(
                target_field="customer_id",
                source_fields=["cust_id"],
                transformations=[TransformRuleInvocation(rule="rename")],
                confidence=1.0,
                rationale="Direct primary key mapping from legacy cust_id to customer_id",
            ),
            FieldMapping(
                target_field="first_name",
                source_fields=["full_name"],
                transformations=[
                    TransformRuleInvocation(rule="trim"),
                    TransformRuleInvocation(rule="split_name", params={"part": "first"}),
                ],
                confidence=0.92,
                rationale="Extract first name token by splitting legacy full_name on whitespace",
            ),
            FieldMapping(
                target_field="last_name",
                source_fields=["full_name"],
                transformations=[
                    TransformRuleInvocation(rule="trim"),
                    TransformRuleInvocation(rule="split_name", params={"part": "last"}),
                ],
                confidence=0.92,
                rationale="Extract remaining surname tokens from legacy full_name",
            ),
            FieldMapping(
                target_field="email",
                source_fields=["email_addr"],
                transformations=[
                    TransformRuleInvocation(rule="trim"),
                    TransformRuleInvocation(rule="lowercase"),
                ],
                confidence=1.0,
                rationale="Sanitize whitespace and normalize email casing for target unique constraint",
            ),
            FieldMapping(
                target_field="phone_e164",
                source_fields=["phone"],
                transformations=[
                    TransformRuleInvocation(rule="normalize_phone_e164", params={"default_country": "US"}),
                ],
                confidence=0.88,
                rationale="Normalize free-form legacy phone numbers to standard E.164 international format",
            ),
            FieldMapping(
                target_field="date_of_birth",
                source_fields=["dob"],
                transformations=[
                    TransformRuleInvocation(rule="parse_date", params={"input_format": "%d/%m/%Y"}),
                ],
                confidence=0.95,
                rationale="Parse legacy DD/MM/YYYY date format into ISO-8601 YYYY-MM-DD",
            ),
            FieldMapping(
                target_field="country",
                source_fields=["country_code"],
                transformations=[
                    TransformRuleInvocation(rule="trim"),
                    TransformRuleInvocation(rule="uppercase"),
                ],
                confidence=0.98,
                rationale="Standardize mixed-case 2-letter country codes to uppercase ISO-2",
            ),
            FieldMapping(
                target_field="status",
                source_fields=["status_flag"],
                transformations=[
                    TransformRuleInvocation(
                        rule="enum_map",
                        params={
                            "mapping": {"A": "ACTIVE", "I": "INACTIVE", "P": "PENDING"},
                            "on_unmapped": "error",
                        },
                    ),
                ],
                confidence=0.95,
                rationale="Map single-letter legacy status codes ('A','I','P') to modern status enum",
            ),
            FieldMapping(
                target_field="created_at",
                source_fields=["signup_ts"],
                transformations=[
                    TransformRuleInvocation(rule="parse_datetime", params={"input_format": "%Y-%m-%d %H:%M:%S"}),
                ],
                confidence=1.0,
                rationale="Convert legacy timestamp string to ISO-8601 UTC datetime string",
            ),
            FieldMapping(
                target_field="credit_limit_cents",
                source_fields=["credit_limit"],
                transformations=[
                    TransformRuleInvocation(rule="cast_decimal_to_cents"),
                ],
                confidence=0.97,
                rationale="Convert dollar decimal strings to integer cents for high-precision accounting",
            ),
            FieldMapping(
                target_field="loyalty_tier",
                source_fields=[],
                transformations=[
                    TransformRuleInvocation(rule="default_value", params={"value": "BRONZE"}),
                ],
                confidence=0.85,
                rationale="Target field has no legacy equivalent; assign default starting tier BRONZE",
            ),
        ]

        incompatible = [
            IncompatibleFieldInfo(
                field_name="legacy_notes",
                description="Legacy unstructured free-text notes have no destination column in modern customers schema",
                suggestion="Archive legacy notes to cold storage or append to customer audit history",
            ),
            IncompatibleFieldInfo(
                field_name="loyalty_tier",
                description="Target requires loyalty_tier enum but legacy database does not track loyalty",
                suggestion="Default to 'BRONZE' tier or calculate based on signup_ts",
            ),
        ]

        risks = [
            MigrationRisk(
                severity="high",
                description="Target table enforces unique constraints on email and customer_id. Duplicates in legacy data will be quarantined.",
                affected_fields=["email", "customer_id"],
            ),
            MigrationRisk(
                severity="medium",
                description="Legacy full_name contains single-word entries (mononyms) which will fail mandatory last_name extraction.",
                affected_fields=["last_name"],
            ),
            MigrationRisk(
                severity="medium",
                description="Invalid calendar dates (e.g. 31/02/1990) and unparseable date strings will be quarantined.",
                affected_fields=["date_of_birth"],
            ),
            MigrationRisk(
                severity="low",
                description="Negative credit limits in legacy system are disallowed by target non-negative integer constraint.",
                affected_fields=["credit_limit_cents"],
            ),
        ]

        clarifications = [
            ClarificationQuestion(
                id="Q1",
                question="What initial loyalty tier should be assigned to migrated legacy customers?",
                affects_field="loyalty_tier",
                suggested_options=["BRONZE", "SILVER", "GOLD", "PLATINUM"],
                user_answer="BRONZE",
            ),
            ClarificationQuestion(
                id="Q2",
                question="How should missing or unknown legacy status flags be handled?",
                affects_field="status",
                suggested_options=["Quarantine record (Error)", "Default to PENDING", "Default to INACTIVE"],
                user_answer="Quarantine record (Error)",
            ),
            ClarificationQuestion(
                id="Q3",
                question="Which default country prefix should be used when normalizing phone numbers without leading '+'?",
                affects_field="phone_e164",
                suggested_options=["US (+1)", "GB (+44)", "CA (+1)", "AU (+61)"],
                user_answer="US (+1)",
            ),
        ]

        plan = ProposedMigrationPlan(
            summary="Automated agentic migration of legacy customers into normalized schema with validation gating.",
            ordered_steps=[
                "1. Read and parse legacy customers dataset (validated under 500 records)",
                "2. Normalize phone numbers into E.164 and emails into lowercased RFC format",
                "3. Convert dates to ISO-8601 and decimal currency to integer cents",
                "4. Execute deterministic dry-run to quarantine invalid dates, negative balances, and duplicates",
                "5. Human review and approval gate signoff on immutable plan version hash",
                "6. Transactional execution into target database with ON CONFLICT idempotency",
                "7. Automated 3-point reconciliation check against source totals and target rows",
            ],
        )

        return AgentProposalOutput(
            source="fallback",
            fallback_reason=fallback_reason,
            field_mappings=mappings,
            incompatible_or_missing_fields=incompatible,
            risks=risks,
            clarification_questions=clarifications,
            proposed_migration_plan=plan,
            tools_called=tools_called or [
                {"name": "get_source_schema", "args": {}},
                {"name": "get_target_schema", "args": {}},
                {"name": "list_supported_transformations", "args": {}},
                {"name": "sample_source_records", "args": {"n": 10}},
            ],
        )

    @staticmethod
    def revise_proposal(
        answers: List[ClarificationAnswer],
        previous_mappings: Optional[List[FieldMapping]] = None,
    ) -> AgentProposalOutput:
        """Revise proposal based on human clarification responses."""
        base = FallbackAgent.generate_proposal()
        mappings = previous_mappings if previous_mappings else base.field_mappings

        # Apply answers to mappings
        for ans in answers:
            if ans.question_id == "Q1":
                # Loyalty tier choice
                tier = ans.selected_option_or_text.upper()
                for m in mappings:
                    if m.target_field == "loyalty_tier":
                        m.transformations = [
                            TransformRuleInvocation(rule="default_value", params={"value": tier})
                        ]
                        m.rationale = f"User selected default loyalty tier: {tier}"
            elif ans.question_id == "Q2":
                # Status handling
                for m in mappings:
                    if m.target_field == "status":
                        if "PENDING" in ans.selected_option_or_text.upper():
                            m.transformations = [
                                TransformRuleInvocation(
                                    rule="enum_map",
                                    params={
                                        "mapping": {"A": "ACTIVE", "I": "INACTIVE", "P": "PENDING"},
                                        "on_unmapped": "default",
                                        "default": "PENDING",
                                    },
                                )
                            ]
                            m.rationale = "User specified fallback to PENDING for unknown status flags"
                        elif "INACTIVE" in ans.selected_option_or_text.upper():
                            m.transformations = [
                                TransformRuleInvocation(
                                    rule="enum_map",
                                    params={
                                        "mapping": {"A": "ACTIVE", "I": "INACTIVE", "P": "PENDING"},
                                        "on_unmapped": "default",
                                        "default": "INACTIVE",
                                    },
                                )
                            ]
                            m.rationale = "User specified fallback to INACTIVE for unknown status flags"
            elif ans.question_id == "Q3":
                # Phone default country
                country = "US"
                if "GB" in ans.selected_option_or_text.upper() or "44" in ans.selected_option_or_text:
                    country = "GB"
                elif "CA" in ans.selected_option_or_text.upper():
                    country = "CA"
                elif "AU" in ans.selected_option_or_text.upper() or "61" in ans.selected_option_or_text:
                    country = "AU"
                for m in mappings:
                    if m.target_field == "phone_e164":
                        m.transformations = [
                            TransformRuleInvocation(rule="normalize_phone_e164", params={"default_country": country})
                        ]
                        m.rationale = f"User selected default country prefix for phone: {country}"

        # Update questions with user answers
        for q in base.clarification_questions:
            for ans in answers:
                if q.id == ans.question_id:
                    q.user_answer = ans.selected_option_or_text

        base.field_mappings = mappings
        return base
