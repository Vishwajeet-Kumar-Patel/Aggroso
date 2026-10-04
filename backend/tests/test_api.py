import pytest
from fastapi.testclient import TestClient
from app.core.db import get_app_db, get_target_db
from app.main import app


@pytest.fixture
def client(app_db, target_db):
    def override_get_app_db():
        yield app_db

    def override_get_target_db():
        yield target_db

    app.dependency_overrides[get_app_db] = override_get_app_db
    app.dependency_overrides[get_target_db] = override_get_target_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


def test_health_check(client):
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json()["status"] == "healthy"


def test_schemas_and_sample_api(client):
    # Source schema
    res_src = client.get("/api/schemas/source")
    assert res_src.status_code == 200
    assert res_src.json()["name"] == "legacy_customers"

    # Target schema
    res_tgt = client.get("/api/schemas/target")
    assert res_tgt.status_code == 200
    assert res_tgt.json()["name"] == "customers"

    # Transformations registry
    res_tr = client.get("/api/schemas/transformations")
    assert res_tr.status_code == 200
    assert len(res_tr.json()["rules"]) == 13

    # Sample records
    res_samp = client.get("/api/sample?limit=10&offset=0")
    assert res_samp.status_code == 200
    data = res_samp.json()
    assert data["total"] == 60
    assert len(data["records"]) == 10


def test_agent_api_flow(client):
    # Propose
    res_prop = client.post("/api/agent/propose?force_fallback=true")
    assert res_prop.status_code == 200
    prop_data = res_prop.json()
    assert prop_data["source"] == "fallback"
    assert len(prop_data["field_mappings"]) >= 10

    # Preview transform
    res_prev = client.post(
        "/api/agent/preview-transform",
        json={"rule": "uppercase", "params": {}, "sample_values": ["abc", "xyz"]},
    )
    assert res_prev.status_code == 200
    assert res_prev.json()[0]["output"] == "ABC"

    # Revise
    answers = [
        {"question_id": "Q1", "selected_option_or_text": "PLATINUM"},
        {"question_id": "Q2", "selected_option_or_text": "Default to PENDING"},
    ]
    res_rev = client.post(
        "/api/agent/revise",
        json={"answers": answers, "previous_mappings": prop_data["field_mappings"]},
    )
    assert res_rev.status_code == 200
    rev_data = res_rev.json()
    loyalty_m = next(m for m in rev_data["field_mappings"] if m["target_field"] == "loyalty_tier")
    assert loyalty_m["transformations"][0]["params"]["value"] == "PLATINUM"


def test_full_lifecycle_api(client):
    # 1. Propose plan -> creates v1
    res_prop = client.post("/api/agent/propose?force_fallback=true")
    assert res_prop.status_code == 200

    # 2. Get active plan
    res_plan = client.get("/api/plans/active")
    assert res_plan.status_code == 200
    plan = res_plan.json()
    v1_id = plan["active_version"]["id"]

    # 3. Dry run on v1
    res_dry = client.post("/api/dry-run", json={"plan_version_id": v1_id})
    assert res_dry.status_code == 200
    dry_data = res_dry.json()
    assert dry_data["total_source"] == 60
    assert dry_data["total_accepted"] + dry_data["total_quarantined"] == 60

    # 4. Verify determinism
    res_verif = client.post(
        "/api/dry-run/verify-determinism",
        json={"plan_version_id": v1_id, "iterations": 3},
    )
    assert res_verif.status_code == 200
    assert res_verif.json()["is_deterministic"] is True

    # 5. Quarantine listing & export
    res_q = client.get(f"/api/quarantine?dry_run_id={dry_data['id']}&limit=10")
    assert res_q.status_code == 200
    assert res_q.json()["total"] == dry_data["total_quarantined"]

    res_q_json = client.get(f"/api/quarantine/export?dry_run_id={dry_data['id']}&format=json")
    assert res_q_json.status_code == 200
    res_q_csv = client.get(f"/api/quarantine/export?dry_run_id={dry_data['id']}&format=csv")
    assert res_q_csv.status_code == 200

    # 6. Execute unapproved -> 403 Forbidden
    res_exec_fail = client.post("/api/runs/execute", json={"plan_version_id": v1_id})
    assert res_exec_fail.status_code == 403

    # 7. Approve v1
    res_appr = client.post(f"/api/plans/versions/{v1_id}/approve", json={"approver": "LeadAdmin"})
    assert res_appr.status_code == 200
    assert res_appr.json()["status"] == "approved"

    # 8. Execute approved -> 200 OK
    res_exec = client.post("/api/runs/execute", json={"plan_version_id": v1_id, "idempotency_key": "api-exec-1"})
    assert res_exec.status_code == 200
    run_data = res_exec.json()
    run_id = run_data["id"]
    assert run_data["status"] == "completed"
    assert run_data["inserted_count"] == dry_data["total_accepted"]

    # 9. Reconciliation -> PASS
    res_rec = client.post("/api/reconciliation", json={"plan_version_id": v1_id, "run_id": run_id})
    assert res_rec.status_code == 200
    assert res_rec.json()["overall_status"] == "PASS"

    # 10. Rollback -> 200 OK
    res_rb = client.post("/api/runs/rollback", json={"run_id": run_id})
    assert res_rb.status_code == 200
    assert res_rb.json()["deleted_count"] == run_data["inserted_count"]

    # 11. Audit log -> verify all events captured
    res_audit = client.get("/api/audit")
    assert res_audit.status_code == 200
    events = res_audit.json()
    event_types = [e["event_type"] for e in events]
    assert "agent_proposal" in event_types
    assert "approved" in event_types
    assert "dry_run" in event_types
    assert "executed" in event_types
    assert "reconciled" in event_types
    assert "rolled_back" in event_types

    # 12. Demo reset
    res_reset = client.post("/api/demo/reset")
    assert res_reset.status_code == 200
    assert res_reset.json()["status"] == "success"
