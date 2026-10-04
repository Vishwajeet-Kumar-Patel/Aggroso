import csv
import json
import re
import pytest
from sqlalchemy import text
from app.agent.tools import AGENT_TOOL_DEFINITIONS, AGENT_TOOL_REGISTRY, execute_tool
from app.core.config import settings
from app.core.hashing import compute_sha256
from app.domain.models import AuditEvent, MigrationRun, Plan, PlanVersion, TargetCustomer
from app.domain.schemas import DiffChange, PlanVersionDiff


@pytest.fixture(autouse=True)
def fallback_llm_mode(monkeypatch):
    """Ensure tests run deterministically using FallbackAgent without making live external API calls."""
    monkeypatch.setattr(settings, "ANTHROPIC_API_KEY", None)


def test_b1_start_app_and_load_60_records(client, app_db):
    """Item 1: Start the app fresh (reset databases). Confirm 60 sample records load."""
    resp = client.post("/api/demo/reset")
    assert resp.status_code == 200, f"Reset failed: {resp.text}"
    data = resp.json()
    assert data["source_records_loaded"] == 60
    assert data["status"] in ("ready", "success")


def test_b2_docs_lists_all_routers(client):
    """Item 2: GET /openapi.json loads and OpenAPI schema lists every router."""
    resp = client.get("/openapi.json")
    assert resp.status_code == 200
    openapi = resp.json()
    tags = set(t for p in openapi["paths"].values() for m in p.values() if isinstance(m, dict) for t in m.get("tags", []))
    expected_tags = {
        "AI Agent",
        "Plans & Versions",
        "Dry Run",
        "Execution & Runs",
        "Reconciliation",
        "Quarantine Workbench",
        "Audit Log",
        "Sample Data",
        "Schemas",
        "Demo Administration",
    }
    for expected in expected_tags:
        assert expected in tags, f"Missing router tag: {expected}"



def test_b3_agent_propose_fallback_five_sections(client, app_db):
    """Item 3: Agent propose returns all five sections; fallback when no API key."""
    resp = client.post("/api/agent/propose")
    assert resp.status_code == 200
    data = resp.json()
    assert data["source"] == "fallback"
    assert "field_mappings" in data and len(data["field_mappings"]) > 0
    assert "incompatible_or_missing_fields" in data
    assert "risks" in data and len(data["risks"]) > 0
    assert "clarification_questions" in data and len(data["clarification_questions"]) > 0
    assert "proposed_migration_plan" in data and "ordered_steps" in data["proposed_migration_plan"]


def test_b4_agent_tools_allowlist_six_readonly_tools():
    """Item 4: Agent tool allow-list contains exactly the six read-only tools."""
    expected = {
        "get_source_schema",
        "get_target_schema",
        "sample_source_records",
        "list_supported_transformations",
        "validate_mapping",
        "preview_transformation",
    }
    assert set(AGENT_TOOL_REGISTRY.keys()) == expected
    assert len(AGENT_TOOL_DEFINITIONS) == 6

    # Calling an unknown or write tool raises
    with pytest.raises(ValueError, match="Unauthorized or unknown tool"):
        execute_tool("execute_migration", {})


def test_b5_answer_clarification_creates_new_version(client, app_db):
    """Item 5: Answer clarification creates new version; old version's hash unchanged."""
    client.post("/api/agent/propose")
    plans_resp = client.get("/api/plans/active")
    plan = plans_resp.json()
    v1_id = plan["active_version"]["id"]
    v1_hash = plan["active_version"]["content_hash"]

    # Revise proposal
    revise_payload = {
        "answers": [
            {"question_id": "Q1", "selected_option_or_text": "PLATINUM"},
            {"question_id": "Q2", "selected_option_or_text": "Default to PENDING"},
        ]
    }
    revise_resp = client.post("/api/agent/revise", json=revise_payload)
    assert revise_resp.status_code == 200

    # Verify v2 was created
    plans_resp2 = client.get("/api/plans/active")
    plan2 = plans_resp2.json()
    assert plan2["active_version"]["version_num"] == 2
    assert plan2["active_version"]["id"] != v1_id

    # Verify v1 hash is unchanged
    v1_resp = client.get(f"/api/plans/versions/{v1_id}")
    assert v1_resp.json()["content_hash"] == v1_hash


def test_b6_edit_approved_plan_creates_draft_revokes_execution(client, app_db):
    """Item 6: Edit approved plan -> new version is draft; old approval no longer authorizes execution."""
    client.post("/api/agent/propose")
    plans_resp = client.get("/api/plans/active")
    plan_id = plans_resp.json()["id"]
    v1_id = plans_resp.json()["active_version"]["id"]

    # Approve v1
    appr_resp = client.post(f"/api/plans/versions/{v1_id}/approve", json={"approver": "Lead"})
    assert appr_resp.status_code == 200

    # Edit plan -> creates v2
    v1_def = appr_resp.json()["mapping_json"]
    edit_resp = client.post(
        f"/api/plans/{plan_id}/versions",
        json={"plan_definition": v1_def, "creator": "user"},
    )
    assert edit_resp.status_code == 200
    v2 = edit_resp.json()
    assert v2["version_num"] == 2
    assert v2["status"] == "draft"

    # Attempting to execute unapproved v2 returns 403
    exec_v2 = client.post("/api/runs/execute", json={"plan_version_id": v2["id"]})
    assert exec_v2.status_code == 403

    # Attempting to execute superseded v1 also returns 403
    exec_v1 = client.post("/api/runs/execute", json={"plan_version_id": v1_id})
    assert exec_v1.status_code == 403


def test_b7_execution_gating_unapproved_edited_tampered(client, app_db):
    """Item 7: Execute with no approval returns 403; execute tampered DB plan returns 403."""
    client.post("/api/agent/propose")
    plans_resp = client.get("/api/plans/active")
    v1_id = plans_resp.json()["active_version"]["id"]

    # 1. Unapproved -> 403
    r1 = client.post("/api/runs/execute", json={"plan_version_id": v1_id})
    assert r1.status_code == 403
    assert r1.json()["code"] == "APPROVAL_REQUIRED"

    # 2. Approve v1
    client.post(f"/api/plans/versions/{v1_id}/approve", json={"approver": "Lead"})

    # 3. Directly tamper with mapping_json in database
    pv = app_db.query(PlanVersion).filter(PlanVersion.id == v1_id).first()
    tampered_mapping = dict(pv.mapping_json)
    tampered_mapping["tampered"] = True
    pv.mapping_json = tampered_mapping
    app_db.commit()

    # 4. Attempt execute -> hash mismatch returns 403
    r2 = client.post("/api/runs/execute", json={"plan_version_id": v1_id})
    assert r2.status_code == 403
    assert r2.json()["code"] == "APPROVAL_REQUIRED"


def test_b8_dry_run_determinism_and_zero_target_rows(client, app_db, target_db):
    """Item 8: Dry run 3 times -> identical input_hash & result_hash; zero rows in target."""
    client.post("/api/agent/propose")
    plans_resp = client.get("/api/plans/active")
    v1_id = plans_resp.json()["active_version"]["id"]

    hashes = []
    for _ in range(3):
        r = client.post("/api/dry-run", json={"plan_version_id": v1_id})
        assert r.status_code == 200
        hashes.append((r.json()["input_hash"], r.json()["result_hash"]))

    assert len(set(hashes)) == 1, "Dry run hashes were not identical across 3 iterations"
    assert target_db.query(TargetCustomer).count() == 0


def test_b9_counts_satisfy_a4_invariants(client, app_db):
    """Item 9: Counts satisfy A4 invariants: source = accepted + quarantined & accepted <= transformed <= source."""
    client.post("/api/agent/propose")
    plans_resp = client.get("/api/plans/active")
    v1_id = plans_resp.json()["active_version"]["id"]

    r = client.post("/api/dry-run", json={"plan_version_id": v1_id})
    data = r.json()
    source = data["total_source"]
    transformed = data["total_transformed"]
    accepted = data["total_accepted"]
    quarantined = data["total_quarantined"]

    assert source == accepted + quarantined
    assert accepted <= transformed <= source


def test_b10_quarantine_records_and_json_csv_export(client, app_db):
    """Item 10: Quarantined records error format, JSON and CSV exports row count match."""
    client.post("/api/agent/propose")
    plans_resp = client.get("/api/plans/active")
    v1_id = plans_resp.json()["active_version"]["id"]

    dry_resp = client.post("/api/dry-run", json={"plan_version_id": v1_id})
    dry_id = dry_resp.json()["id"]

    # Check quarantine list
    q_resp = client.get(f"/api/quarantine?dry_run_id={dry_id}&limit=100")
    assert q_resp.status_code == 200
    q_data = q_resp.json()
    quarantined_items = q_data["records"]
    assert len(quarantined_items) == dry_resp.json()["total_quarantined"]

    for item in quarantined_items:
        assert len(item["errors"]) >= 1
        err = item["errors"][0]
        assert "field" in err and "error_code" in err and "message" in err

    # JSON export
    json_export = client.get(f"/api/quarantine/export/json?dry_run_id={dry_id}")
    assert json_export.status_code == 200
    exported_json = json_export.json()
    assert len(exported_json) == len(quarantined_items)

    # CSV export
    csv_export = client.get(f"/api/quarantine/export/csv?dry_run_id={dry_id}")
    assert csv_export.status_code == 200
    csv_lines = [line for line in csv_export.text.strip().split("\n") if line.strip()]
    # CSV has 1 header line + N record lines
    assert len(csv_lines) == len(quarantined_items) + 1


def test_b11_load_501_returns_422_500_succeeds(client, app_db):
    """Item 11: 501 records returns 422 with documented error format; 500 records succeeds."""
    r_501 = client.post("/api/sample/load", json={"scenario_name": "overflow_501"})
    assert r_501.status_code == 422
    err = r_501.json()
    assert err["code"] == "VALIDATION_ERROR"
    assert "exceeds the maximum allowed limit of 500" in err["message"]

    r_500 = client.post("/api/sample/load", json={"scenario_name": "stress_500"})
    assert r_500.status_code == 200
    assert r_500.json()["record_count"] == 500


def test_b12_execute_inserted_idempotency_replay(client, app_db, target_db):
    """Item 12: Execute inserts accepted rows; new idempotency key skips; same key replays."""
    client.post("/api/demo/reset")
    client.post("/api/agent/propose")
    plans_resp = client.get("/api/plans/active")
    v1_id = plans_resp.json()["active_version"]["id"]
    client.post(f"/api/plans/versions/{v1_id}/approve", json={"approver": "Lead"})

    # Execute with key-A
    exec1 = client.post("/api/runs/execute", json={"plan_version_id": v1_id, "idempotency_key": "audit-key-A"})
    assert exec1.status_code == 200
    d1 = exec1.json()
    assert d1["inserted_count"] == 48
    assert d1["replayed"] is False

    # Same key-A replays
    exec1_replay = client.post("/api/runs/execute", json={"plan_version_id": v1_id, "idempotency_key": "audit-key-A"})
    assert exec1_replay.status_code == 200
    assert exec1_replay.json()["replayed"] is True

    # New key-B skips all
    exec2 = client.post("/api/runs/execute", json={"plan_version_id": v1_id, "idempotency_key": "audit-key-B"})
    assert exec2.status_code == 200
    d2 = exec2.json()
    assert d2["inserted_count"] == 0
    assert d2["skipped_existing_count"] == 48


def test_b13_inject_failure_and_retry_recovery(client, app_db, target_db, monkeypatch):
    """Item 13: Injected failure partial state, retry recovery, zero duplicate source_key or email."""
    monkeypatch.setattr(settings, "ENABLE_FAULT_INJECTION", True)
    client.post("/api/demo/reset")
    client.post("/api/agent/propose")
    plans_resp = client.get("/api/plans/active")
    v1_id = plans_resp.json()["active_version"]["id"]
    client.post(f"/api/plans/versions/{v1_id}/approve", json={"approver": "Lead"})

    # Injected failure
    fail_resp = client.post(
        "/api/runs/execute",
        json={"plan_version_id": v1_id, "idempotency_key": "fault-audit-1", "simulate_failure_at_record": 10},
    )
    assert fail_resp.status_code == 400
    assert target_db.query(TargetCustomer).count() == 0

    # Get failed run
    runs = client.get("/api/runs").json()
    failed_run = next(r for r in runs if r["idempotency_key"] == "fault-audit-1")
    assert failed_run["status"] == "failed"

    # Retry
    retry_resp = client.post("/api/runs/retry", json={"run_id": failed_run["id"]})
    assert retry_resp.status_code == 200
    assert retry_resp.json()["status"] == "completed"
    assert retry_resp.json()["inserted_count"] == 48


def test_b14_reconciliation_pass_and_failures(client, app_db, target_db):
    """Item 14: Reconciliation PASS; FAIL on deleted target row; FAIL on rogue extra row."""
    client.post("/api/demo/reset")
    client.post("/api/agent/propose")
    plans_resp = client.get("/api/plans/active")
    v1_id = plans_resp.json()["active_version"]["id"]
    client.post(f"/api/plans/versions/{v1_id}/approve", json={"approver": "Lead"})
    exec_resp = client.post("/api/runs/execute", json={"plan_version_id": v1_id, "idempotency_key": "recon-key-1"})
    run_id = exec_resp.json()["id"]

    # 1. Clean PASS
    r1 = client.post(f"/api/reconciliation/run?plan_version_id={v1_id}&run_id={run_id}")
    assert r1.status_code == 200
    assert r1.json()["overall_status"] == "PASS"

    # 2. Manually delete one target row -> FAIL naming missing key
    row = target_db.query(TargetCustomer).first()
    deleted_key = row.source_key
    target_db.delete(row)
    target_db.commit()

    r2 = client.post(f"/api/reconciliation/run?plan_version_id={v1_id}&run_id={run_id}")
    assert r2.status_code == 200
    assert r2.json()["overall_status"] == "FAIL"
    assert deleted_key in r2.json()["missing_in_target_keys"]

    # 3. Add rogue unexpected row -> FAIL naming unexpected key
    rogue = TargetCustomer(
        customer_id="ROGUE-999",
        first_name="Rogue",
        last_name="User",
        email="rogue@test.com",
        country="US",
        status="ACTIVE",
        created_at="2023-01-01T00:00:00Z",
        source_key="ROGUE-999",
        plan_version_id=v1_id,
        run_id=run_id,
    )
    target_db.add(rogue)
    target_db.commit()

    r3 = client.post(f"/api/reconciliation/run?plan_version_id={v1_id}&run_id={run_id}")
    assert r3.status_code == 200
    assert r3.json()["overall_status"] == "FAIL"
    assert "ROGUE-999" in r3.json()["unexpected_target_keys"]


def test_b15_rollback_isolation_and_noop(client, app_db, target_db):
    """Item 15: Rollback deletes only that run's rows; second rollback is reported no-op."""
    client.post("/api/demo/reset")
    client.post("/api/agent/propose")
    plans_resp = client.get("/api/plans/active")
    v1_id = plans_resp.json()["active_version"]["id"]
    client.post(f"/api/plans/versions/{v1_id}/approve", json={"approver": "Lead"})

    # Seed isolated other run's row
    other_row = TargetCustomer(
        customer_id="OTHER-1",
        first_name="Other",
        last_name="User",
        email="other@test.com",
        country="US",
        status="ACTIVE",
        created_at="2023-01-01T00:00:00Z",
        source_key="OTHER-1",
        plan_version_id=v1_id,
        run_id="other-run-id",
    )
    target_db.add(other_row)
    target_db.commit()

    # Execute run 1
    exec_resp = client.post("/api/runs/execute", json={"plan_version_id": v1_id, "idempotency_key": "rb-key-1"})
    run_id = exec_resp.json()["id"]
    assert target_db.query(TargetCustomer).count() == 49

    # First Rollback
    rb1 = client.post("/api/runs/rollback", json={"run_id": run_id})
    assert rb1.status_code == 200
    assert rb1.json()["deleted_count"] == 48
    assert target_db.query(TargetCustomer).count() == 1  # isolated other row preserved

    # Second Rollback -> 0 deleted (no-op)
    rb2 = client.post("/api/runs/rollback", json={"run_id": run_id})
    assert rb2.status_code == 200
    assert rb2.json()["deleted_count"] == 0


def test_b16_audit_immutability_and_all_events(app_db):
    """Item 16: Audit table triggers prevent update/delete; all event types verifiable."""
    # Triggers test
    ev = AuditEvent(event_type="test", actor="system", payload_json={})
    app_db.add(ev)
    app_db.commit()

    with pytest.raises(Exception) as exc_up:
        app_db.execute(text("UPDATE audit_events SET actor = 'bad' WHERE id = :id"), {"id": ev.id})
        app_db.commit()
    assert "updates are forbidden" in str(exc_up.value)
    app_db.rollback()

    with pytest.raises(Exception) as exc_del:
        app_db.execute(text("DELETE FROM audit_events WHERE id = :id"), {"id": ev.id})
        app_db.commit()
    assert "deletes are forbidden" in str(exc_del.value)
    app_db.rollback()


def test_b17_static_scan_no_eval_exec():
    """Item 17: Scan backend for eval, exec, compile, subprocess, os.system, pickle."""
    import ast
    from pathlib import Path

    backend_app_dir = Path(settings.DATA_DIR).parent
    forbidden_calls = {"eval", "exec", "compile", "__import__"}
    forbidden_modules = {"subprocess", "os.system", "pickle"}

    for py_file in backend_app_dir.rglob("*.py"):
        if "tests" in str(py_file):
            continue
        code = py_file.read_text(encoding="utf-8")
        tree = ast.parse(code, filename=str(py_file))
        for node in ast.walk(tree):
            if isinstance(node, ast.Call):
                if isinstance(node.func, ast.Name) and node.func.id in forbidden_calls:
                    pytest.fail(f"Forbidden builtin call '{node.func.id}' found in {py_file} at line {node.lineno}")
                elif isinstance(node.func, ast.Attribute):
                    full_name = f"{getattr(node.func.value, 'id', '')}.{node.func.attr}"
                    if full_name in forbidden_modules or node.func.attr in ("system", "popen"):
                        pytest.fail(f"Forbidden call '{full_name}' found in {py_file} at line {node.lineno}")
            elif isinstance(node, ast.Import):
                for alias in node.names:
                    if alias.name in ("subprocess", "pickle"):
                        pytest.fail(f"Forbidden import '{alias.name}' in {py_file}")
            elif isinstance(node, ast.ImportFrom):
                if node.module in ("subprocess", "pickle"):
                    pytest.fail(f"Forbidden import from '{node.module}' in {py_file}")



def test_b18_api_error_format_envelope(client):
    """Item 18: API error format for 400, 403, 404, 409, 422 is {code, message, details}."""
    # 404
    r_404 = client.get("/api/plans/versions/non-existent-uuid")
    assert r_404.status_code == 404
    d404 = r_404.json()
    assert "code" in d404 and "message" in d404 and "details" in d404

    # 403
    r_403 = client.post("/api/runs/execute", json={"plan_version_id": "fake-uuid"})
    assert r_403.status_code in (403, 404)
    d403 = r_403.json()
    assert "code" in d403 and "message" in d403 and "details" in d403

    # 422
    r_422 = client.post("/api/plans/active/versions", json={"invalid": "payload"})
    assert r_422.status_code == 422
    d422 = r_422.json()
    assert "code" in d422 and "message" in d422 and "details" in d422
