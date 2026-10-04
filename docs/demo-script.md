# Demo Script

This document provides a step-by-step walkthrough of the complete migration workflow. Follow these steps to demonstrate all major features.

---

## Prerequisites

1. Backend running on `http://127.0.0.1:8000`
2. Frontend running on `http://localhost:5173`
3. Fresh database state (use "Reset Demo" button if needed)

---

## Step 1: Explore Schemas & Source Data

**Navigate to:** `http://localhost:5173/` (Schemas & Data tab)

**What to show:**
- **Source Schema** (left card): 10 fields from `legacy_customers` table
  - Note the `string` types for everything, mixed formats, nullable fields
- **Target Schema** (right card): 9 fields in `customers` table  
  - Note the typed fields (`integer`, `float`, `date`, `datetime`), `NOT NULL` constraints, enum validations
- **Source Dataset Explorer**: Scroll through the 60 records
  - ~75% are valid records
  - ~25% are intentional edge cases (highlighted with anomaly tags):
    - Invalid dates (Feb 31), malformed emails, single-word names
    - Negative credit limits, non-numeric credit ("unlimited")
    - Duplicate customer IDs and emails
    - Empty names, whitespace padding, unmapped status flags

**Key point:** The source data is messy by design — the system must handle all these edge cases.

---

## Step 2: Generate AI Proposal

**Navigate to:** `http://localhost:5173/proposal` (AI Proposal tab)

**Actions:**
1. Check the **"Deterministic Fallback Mode"** checkbox (guarantees proposal without API key)
2. Click **"Re-run Agent Proposal"**
3. Observe:
   - **Agent Engine Source badge**: Shows "Deterministic Heuristic Fallback Agent"
   - **Proposed Migration Strategy**: Summary + ordered steps
   - **Field Mappings Table**: Each target field mapped to source fields with:
     - Transform rule pipelines (e.g., `trim → split_name → lowercase`)
     - Confidence scores with progress bars
     - Agent rationale explaining each mapping
   - **Detected Risks**: Data quality and schema compatibility warnings
   - **Incompatible Fields**: `legacy_notes` identified as unmappable
   - **Clarification Questions**: Interactive Q&A cards with suggested options

**Key point:** The AI agent uses only read-only tools — no database writes.

---

## Step 3: Answer Clarifications & Create Plan

**Still on Proposal tab:**
1. Answer the clarification questions (click suggested options or type custom answers)
2. Click **"Revise Proposal (Creates New Version)"**
3. See the green success banner: "A new immutable plan version has been created in draft status"

---

## Step 4: Review & Edit Plan Versions

**Navigate to:** `http://localhost:5173/plans` (Plan & Versions tab)

**What to show:**
1. **Version selector**: Click between v1, v2 to see different versions
   - Each shows status badge (draft/approved/superseded)
2. **Version metadata**: Content hash (SHA-256), creator, timestamp
3. **Field Mapping Editor**: 
   - Click "Add Rule" to add a transformation to a field
   - Change a rule in the dropdown (whitelist-only!)
   - Edit rule parameters (e.g., change `input_format` for `parse_date`)
4. Click **"Save as New Version"** — creates v3 as a new immutable version
5. Click **"Compare Version Diff"** — shows field-by-field changes between versions
   - Green = added, Red = removed, Yellow = modified

**Key point:** Every edit creates a new version. Nothing is mutated in place.

---

## Step 5: Approve a Plan Version

**Still on Plan tab:**
1. Select the latest version (should be `draft` status)
2. In the approval controls, enter an approver name (e.g., "TechLead Reviewer")
3. Click **"Approve v3"**
4. Observe:
   - Badge changes from amber (DRAFT) to green (APPROVED)
   - Global navbar shows "Active Plan: v3 APPROVED"
   - The approval is recorded in the audit trail

**Key point:** This is a server-side gate — HTTP 403 will block execution without approval.

---

## Step 6: Run Deterministic Dry Run

**Navigate to:** `http://localhost:5173/dry-run` (Dry Run & Quarantine tab)

**Actions:**
1. Click **"Re-run Dry Run"** — executes transformation with zero target writes
2. Observe the 4 metric cards:
   - **Total Source**: 60 records
   - **Processed**: 60 records (100%)
   - **Accepted**: ~45-48 records (green)
   - **Quarantined**: ~12-15 records (red)
3. Verify the **invariant badge**: `Source (60) = Accepted (48) + Quarantined (12)` ✅
4. Note the **input hash** and **result hash** (SHA-256)

**Determinism verification:**
1. Click **"Verify Determinism (3x)"**
2. Wait for the verification banner showing 3 identical result hashes

**Quarantine drill-down:**
1. Scroll to the quarantine table
2. Click on any quarantined record → opens the diagnostic drawer:
   - Field that failed
   - Rule that caused the failure  
   - Original value vs attempted value
   - Error code and human-readable message
   - Preserved raw source record (JSON)
3. Try **Export JSON** and **Export CSV** buttons

---

## Step 7: Execute Migration

**Navigate to:** `http://localhost:5173/execution` (Execution & Reconciliation tab)

**Observe the approval gate:**
- Shows **"Approval Gate Unlocked"** with green styling (because we approved in Step 5)

**Execute clean run:**
1. Leave "Fault Injection" field blank
2. Click **"Execute Migration Run"** → Confirm in the dialog
3. Observe the 4 metric cards:
   - Status: **COMPLETED**
   - Inserted Rows: matches accepted count from dry run
   - Skipped Existing: 0 (first run)
4. **Reconciliation** automatically runs → should show **OVERALL STATUS: PASS**
   - All checks green: count match, key-set parity, etc.

**Demonstrate idempotency:**
1. Click **"Execute Migration Run"** again
2. Observe: Inserted = 0, Skipped Existing = 48 (all records already present)
3. Reconciliation still **PASS**

---

## Step 8: Demonstrate Fault Injection & Recovery

**Still on Execution tab:**
1. Enter **`5`** in the "Fault Injection" field
2. Click **"Execute Migration Run"** → Confirm
3. Observe: Status = **FAILED**, error message about simulated crash
4. Note the error banner: "Target database transaction was automatically rolled back"
5. Click **"Retry Run"** (leave fault injection blank this time)
6. Observe: Status = **COMPLETED**, all records inserted correctly
7. Reconciliation: **PASS**

**Demonstrate rollback:**
1. Click **"Rollback"** → Confirm in the dialog
2. Observe: Status changes to **ROLLED_BACK**
3. The rollback result shows how many target rows were deleted
4. Reconciliation now shows **FAIL** (expected — target is empty)

---

## Step 9: Review Audit Trail

**Navigate to:** `http://localhost:5173/audit` (Audit Log tab)

**What to show:**
1. **Immutability badge**: "Strictly Append-Only (Mutations Blocked)"
2. **Timeline of events** in chronological order:
   - `agent_proposal` — AI generated mapping
   - `plan_created` — Initial plan version
   - `plan_edited` — Subsequent versions
   - `approved` — Human approval with approver name
   - `dry_run` — Deterministic run with result hashes
   - `executed` — Migration run with counts
   - `error` — Failed run details
   - `retried` — Retry attempt
   - `rolled_back` — Rollback with deleted count
   - `reconciled` — Reconciliation results
3. Click **"View Payload"** on any event → shows the immutable JSON payload
4. **Filter by event type** using the dropdown

**Key point:** Every action is logged with full provenance. Nothing can be modified or deleted.

---

## Step 10: Reset and Repeat

1. Click the **"Reset Demo"** button in the top-right navbar
2. Confirm the reset dialog
3. All databases are wiped and re-seeded with the original 60 records
4. Audit trail is also cleared (fresh start)

---

## Summary of Definition of Done Items Demonstrated

| # | Requirement | Where Demonstrated |
|---|-------------|-------------------|
| 1 | AI agent proposes mappings using read-only tools | Step 2 |
| 2 | Human approves before execution | Steps 5, 7 |
| 3 | Whitelist-only transforms | Steps 2, 4 |
| 4 | Immutable plan versioning with SHA-256 | Steps 3, 4 |
| 5 | Deterministic dry run | Step 6 |
| 6 | Rich quarantine evidence | Step 6 |
| 7 | Transactional execution with idempotency | Step 7 |
| 8 | 3-point reconciliation | Step 7 |
| 9 | Fault injection and recovery | Step 8 |
| 10 | Transactional rollback | Step 8 |
| 11 | Append-only audit trail | Step 9 |
| 12 | 500-record limit enforcement | API layer |
| 13 | Mock target store (SQLite sandbox) | Navbar banner |
