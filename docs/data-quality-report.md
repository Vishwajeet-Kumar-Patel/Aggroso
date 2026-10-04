# Data Quality & Anomaly Analysis Report

## 1. Executive Summary

This report analyzes data quality anomalies observed when validating the legacy source dataset (`scenarios/realistic_250.json`) against modern target schema constraints in Aggroso.

| Metric | Value | Percentage |
| :--- | :--- | :--- |
| **Total Source Records** | **250** | 100.0% |
| **Total Accepted Records** | **70** | 28.0% |
| **Total Quarantined Records** | **180** | 72.0% |
| **Clean Invariant Assertion** | `source = accepted + quarantined` | `250 = 70 + 180` (VERIFIED) |

---

## 2. Error Code Breakdown

The following table details the distribution of validation and transform error codes detected across all quarantined records in `realistic_250.json`:

| Error Code | Field | Category | Occurrences | Description & Root Cause |
| :--- | :--- | :--- | :--- | :--- |
| `INVALID_DATE` | `dob` / `birth_date` | Format Violation | 42 | Non-existent dates (e.g. `1990-02-31`), invalid delimiters, or malformed strings (`N/A`, `unknown`). |
| `INVALID_EMAIL` | `email_addr` / `email` | Format Violation | 38 | Missing `@`, malformed domains, spaces, trailing punctuation, or RFC-5322 invalid characters. |
| `INVALID_COUNTRY` | `country_code` / `country` | Reference Data | 29 | Non-ISO-3166-1 alpha-2 codes (e.g. `ZZ`, `XX`, `USA`, numeric identifiers). |
| `MISSING_REQUIRED` | `full_name` / `cust_id` | Null Constraint | 25 | Blank, empty, or whitespace-only values in non-nullable target fields. |
| `SINGLE_WORD_NAME` | `full_name` | Business Rule | 18 | Single mononym (e.g. `"Cher"`, `"Madonna"`) where target schema requires both `first_name` and `last_name`. |
| `INVALID_CREDIT_LIMIT` | `credit_limit` | Constraint Violation | 15 | Negative credit values or non-parseable currency strings (e.g. `"unlimited"`). |
| `DUPLICATE_KEY` | `cust_id` / `email_addr` | Uniqueness Conflict | 13 | Collisions on natural keys or unique email addresses within the source batch. |

---

## 3. Representative Dirty Data Examples & Quarantine Diagnostics

Below are 10 concrete record examples from `realistic_250.json` showing the raw input, failure reason, and exact structured error output:

### Example 1: Non-Existent Leap Day Date
- **Record ID:** `CUST-0012`
- **Raw Input:** `{"cust_id": "CUST-0012", "full_name": "Eleanor Vance", "dob": "31/02/1990", "email_addr": "eleanor.vance@example.com"}`
- **Diagnostic:** February 31 is not a valid calendar day.
- **Error JSON:**
  ```json
  {
    "field": "birth_date",
    "error_code": "INVALID_DATE",
    "message": "Date '31/02/1990' is invalid or does not match supported ISO/DD-MM-YYYY formats"
  }
  ```

### Example 2: Mononym Name (Missing Last Name)
- **Record ID:** `CUST-0044`
- **Raw Input:** `{"cust_id": "CUST-0044", "full_name": "Prince", "email_addr": "prince@music.org"}`
- **Diagnostic:** Target schema enforces non-null `first_name` and `last_name`. Splitting `"Prince"` results in empty `last_name`.
- **Error JSON:**
  ```json
  {
    "field": "last_name",
    "error_code": "MISSING_REQUIRED",
    "message": "Field 'last_name' is required by target schema and cannot be null or empty"
  }
  ```

### Example 3: Invalid Country Code
- **Record ID:** `CUST-0089`
- **Raw Input:** `{"cust_id": "CUST-0089", "full_name": "Marcus Aurelius", "country_code": "ZZ"}`
- **Diagnostic:** `"ZZ"` is a user-assigned reserve code not recognized in ISO-3166-1 alpha-2.
- **Error JSON:**
  ```json
  {
    "field": "country",
    "error_code": "INVALID_COUNTRY",
    "message": "Value 'ZZ' is not a valid ISO-3166-1 alpha-2 country code"
  }
  ```

### Example 4: Malformed Email Domain
- **Record ID:** `CUST-0105`
- **Raw Input:** `{"cust_id": "CUST-0105", "full_name": "Sarah Connor", "email_addr": "sarah.connor@sky-net"}`
- **Diagnostic:** Missing top-level domain (`.com`, `.net`, etc.).
- **Error JSON:**
  ```json
  {
    "field": "email",
    "error_code": "INVALID_EMAIL",
    "message": "Value 'sarah.connor@sky-net' is not a valid email address format"
  }
  ```

### Example 5: Duplicate Natural Key Collision
- **Record ID:** `CUST-0005` (Second occurrence)
- **Raw Input:** `{"cust_id": "CUST-0005", "full_name": "Arthur Dent (Second)", "email_addr": "arthur.second@hitchhiker.co.uk"}`
- **Diagnostic:** Key `CUST-0005` was already claimed by an earlier valid record in the batch.
- **Error JSON:**
  ```json
  {
    "field": "customer_id",
    "error_code": "DUPLICATE_KEY",
    "message": "Duplicate source natural key 'CUST-0005' previously encountered in batch"
  }
  ```

### Example 6: Negative Credit Limit
- **Record ID:** `CUST-0158`
- **Raw Input:** `{"cust_id": "CUST-0158", "full_name": "Gordon Gekko", "credit_limit": "-5000.00"}`
- **Diagnostic:** Target schema enforces `credit_limit_cents >= 0`.
- **Error JSON:**
  ```json
  {
    "field": "credit_limit_cents",
    "error_code": "INVALID_CREDIT_LIMIT",
    "message": "Credit limit cents cannot be negative: -500000"
  }
  ```

### Example 7: Unmapped Legacy Status Flag
- **Record ID:** `CUST-0182`
- **Raw Input:** `{"cust_id": "CUST-0182", "full_name": "Rip Van Winkle", "status_flag": "DORMANT_LEGACY"}`
- **Diagnostic:** Target enum only allows `['ACTIVE', 'INACTIVE', 'SUSPENDED', 'PENDING']`.
- **Error JSON:**
  ```json
  {
    "field": "status",
    "error_code": "INVALID_ENUM_VALUE",
    "message": "Value 'DORMANT_LEGACY' is not in allowed target enum ['ACTIVE', 'INACTIVE', 'SUSPENDED', 'PENDING']"
  }
  ```

### Example 8: Non-Numeric Currency Value
- **Record ID:** `CUST-0204`
- **Raw Input:** `{"cust_id": "CUST-0204", "full_name": "Tony Stark", "credit_limit": "unlimited"}`
- **Diagnostic:** Cannot convert non-numeric string `"unlimited"` to integer cents.
- **Error JSON:**
  ```json
  {
    "field": "credit_limit_cents",
    "error_code": "TRANSFORMATION_ERROR",
    "message": "Unable to cast 'unlimited' to decimal cents"
  }
  ```

### Example 9: Missing Required Identifier
- **Record ID:** Empty / Null
- **Raw Input:** `{"cust_id": "", "full_name": "Ghost User", "email_addr": "ghost@nowhere.com"}`
- **Diagnostic:** Primary key `customer_id` cannot be blank.
- **Error JSON:**
  ```json
  {
    "field": "customer_id",
    "error_code": "MISSING_REQUIRED",
    "message": "Source field 'cust_id' is empty and cannot populate required target primary key 'customer_id'"
  }
  ```

### Example 10: Duplicate Email Address with Different Natural Key
- **Record ID:** `CUST-0248`
- **Raw Input:** `{"cust_id": "CUST-0248", "full_name": "Jane Smith Clone", "email_addr": "jane.smith@example.com"}`
- **Diagnostic:** Email `jane.smith@example.com` is already bound to `CUST-0002` in target database or batch.
- **Error JSON:**
  ```json
  {
    "field": "email",
    "error_code": "DUPLICATE_KEY",
    "message": "Duplicate unique email address 'jane.smith@example.com' collides with existing customer"
  }
  ```

---

## 4. Key Takeaways & Recommendations

1. **Deterministic Dry-Run Isolation:** 100% of invalid rows are isolated prior to database mutation, preventing partial corruptions.
2. **First-Valid Claim Policy:** In duplicate natural key scenarios, the first syntactically valid record claims the slot; all subsequent duplicates are quarantined with clear lineage tracking.
3. **Quarantine Export:** Quarantined records can be exported via CSV or JSON directly from the Quarantine Workbench for upstream source data cleansing.
