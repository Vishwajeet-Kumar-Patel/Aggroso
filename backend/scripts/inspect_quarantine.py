import json
import re
import datetime
from pathlib import Path
from app.services.dry_run_service import DryRunService, ISO_COUNTRY_CODES
from app.agent.fallback_agent import FallbackAgent
from tests.test_scenarios import independent_reference_validator

DATA_FILE = Path("app/data/scenarios/realistic_250.json")
with open(DATA_FILE, "r", encoding="utf-8") as f:
    records = json.load(f)

proposal = FallbackAgent.generate_proposal()
mappings = proposal.field_mappings

indexed = sorted(list(enumerate(records)), key=lambda item: (str(item[1].get("cust_id", "")), item[0]))

dry_run_accepted = []
for idx, r in indexed:
    data, errs, is_tr = DryRunService.validate_and_transform_single_record(r, mappings, idx)
    if not errs:
        dry_run_accepted.append(r["cust_id"])

print(f"Total records: {len(records)}")
print(f"Dry run accepted count before deduplication: {len(dry_run_accepted)}")

# Run full dry run
from app.core.db import AppSessionLocal, reset_databases
db = AppSessionLocal()
from app.services.plan_service import PlanService
plan = PlanService.get_or_create_default_plan(db)
from app.domain.transforms import PlanDefinition
v1 = PlanService.create_plan_version(db, plan.id, PlanDefinition(field_mappings=mappings))
dry, res = DryRunService.execute_dry_run(db, v1.id, records=records)

print(f"Dry run total_accepted: {dry.total_accepted}, total_quarantined: {dry.total_quarantined}")
print(f"Independent reference validator count: {independent_reference_validator(records)}")

# Compare each record
for idx, r in indexed:
    data, errs, is_tr = DryRunService.validate_and_transform_single_record(r, mappings, idx)
    # Check what independent validator thinks
    cust_id = r.get("cust_id")
    full_name = r.get("full_name")
    name_parts = str(full_name).strip().split(None, 1) if full_name else []
    email = r.get("email_addr")
    country = r.get("country_code")
    status = r.get("status_flag")
    phone = r.get("phone")
    dob = r.get("dob")
    credit = r.get("credit_limit")
    ts = r.get("signup_ts")

    dry_accepted = (len(errs) == 0)
    
    # Check independent validator logic on this individual record
    indep_ok = True
    reasons = []
    if not cust_id: indep_ok = False; reasons.append("cust_id")
    if len(name_parts) < 2: indep_ok = False; reasons.append(f"name: {full_name}")
    cleaned_email = str(email).strip().lower() if email else ""
    if not re.match(r"^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$", cleaned_email): indep_ok = False; reasons.append(f"email: {email}")
    if not country or str(country).strip().upper() not in ISO_COUNTRY_CODES: indep_ok = False; reasons.append(f"country: {country}")
    if str(status).strip().upper() not in ("A", "I", "P"): indep_ok = False; reasons.append(f"status: {status}")
    if phone:
        digits = re.sub(r"\D", "", str(phone))
        if not digits or len(digits) < 7 or len(digits) > 15: indep_ok = False; reasons.append(f"phone: {phone}")
    if dob:
        try: datetime.datetime.strptime(str(dob).strip(), "%d/%m/%Y")
        except: indep_ok = False; reasons.append(f"dob: {dob}")
    if not ts: indep_ok = False; reasons.append("no ts")
    else:
        try: datetime.datetime.strptime(str(ts).strip(), "%Y-%m-%d %H:%M:%S")
        except: indep_ok = False; reasons.append(f"ts: {ts}")
    if credit is not None and str(credit).strip():
        try:
            c_float = float(str(credit).strip().lstrip("$").replace(",", ""))
            if c_float < 0: indep_ok = False; reasons.append(f"credit: {credit}")
        except: indep_ok = False; reasons.append(f"credit: {credit}")

    if dry_accepted != indep_ok:
        print(f"Diff at {cust_id}: dry_accepted={dry_accepted} (errs: {[e.error_code + '/' + e.field for e in errs]}), indep_ok={indep_ok} (reasons: {reasons})")
