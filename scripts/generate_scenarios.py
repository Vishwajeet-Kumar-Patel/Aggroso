import json
import random
from pathlib import Path

# Seed for absolute reproducibility
random.seed(42)

ROOT_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT_DIR / "backend" / "app" / "data"
SCENARIOS_DIR = DATA_DIR / "scenarios"
SCENARIOS_DIR.mkdir(parents=True, exist_ok=True)

# 1. Baseline 60 (copy of source_sample.json)
source_sample_path = DATA_DIR / "source_sample.json"
with open(source_sample_path, "r", encoding="utf-8") as f:
    baseline_60_records = json.load(f)

with open(SCENARIOS_DIR / "baseline_60.json", "w", encoding="utf-8") as f:
    json.dump(baseline_60_records, f, indent=2, ensure_ascii=False)

# 2. Realistic 250 records
first_names_multicultural = [
    # Indian
    "Aarav", "Priya", "Vikram", "Ananya", "Rohan", "Deepika", "Aditya", "Sneha",
    # US / UK
    "James", "Mary", "John", "Patricia", "Robert", "Jennifer", "Michael", "Linda",
    "William", "Elizabeth", "David", "Barbara", "Richard", "Susan", "Joseph", "Jessica",
    # German
    "Maximilian", "Sophie", "Alexander", "Marie", "Paul", "Maria", "Elias", "Sophia",
    # Brazilian
    "Lucas", "Juliana", "Gabriel", "Beatriz", "Matheus", "Larissa", "Thiago", "Camila",
    # Japanese
    "Ren", "Hina", "Haruto", "Yui", "Sota", "Aoi", "Yuto", "Rin",
    # Arabic
    "Mohammed", "Fatima", "Omar", "Aisha", "Ali", "Maryam", "Tariq", "Zainab",
]

last_names_multicultural = [
    "Sharma", "Patel", "Verma", "Gupta", "Singh", "Kumar", "Rao", "Nair",
    "Smith", "Johnson", "Williams", "Brown", "Jones", "Miller", "Davis", "Wilson",
    "Müller", "Schmidt", "Schneider", "Fischer", "Weber", "Meyer", "Wagner", "Becker",
    "Silva", "Santos", "Oliveira", "Souza", "Rodrigues", "Ferreira", "Alves", "Pereira",
    "Sato", "Suzuki", "Takahashi", "Tanaka", "Watanabe", "Ito", "Yamamoto", "Nakamura",
    "Al-Mansoor", "Al-Hashimi", "Haddad", "Khoury", "Nasser", "Qasim", "Farah", "Saleh",
]

name_variations = [
    lambda f, l: f"{f} {l}",
    lambda f, l: f"Dr. {f} {l}",
    lambda f, l: f"Mr. {f} {l} Jr.",
    lambda f, l: f"{f} {f[0]}. {l}",
    lambda f, l: f"{f.upper()} {l.upper()}",
    lambda f, l: f"{f.lower()} {l.lower()}",
    lambda f, l: f"  {f}   {l}  ",
    lambda f, l: f"{f}-{f[:3]} {l}",
    lambda f, l: f"{f}",  # mononym (will fail last_name split)
]

countries = ["US", "GB", "IN", "DE", "BR", "JP", "AE", "CA", "FR", "AU"]

phone_templates = [
    lambda c, num: f"+91 {num[:5]} {num[5:]}",
    lambda c, num: f"({num[:3]}) {num[3:6]}-{num[6:]}",
    lambda c, num: f"0044 20 7946 {num[:4]}",
    lambda c, num: f"{num[:5]}-{num[5:]}",
    lambda c, num: f"+1-{num[:3]}-{num[3:6]}-{num[6:]}",
    lambda c, num: f"+49 30 {num[:8]}",
    lambda c, num: f"+55 11 9{num[:8]}",
    lambda c, num: f"{num} ext 102",  # dirty
    lambda c, num: "call after 5pm",  # text dirty
    lambda c, num: "",  # blank
]

dob_templates = [
    lambda d, m, y: f"{d:02d}/{m:02d}/{y}",  # valid DD/MM/YYYY
    lambda d, m, y: f"{d:02d}/{m:02d}/{y}",
    lambda d, m, y: f"{d:02d}/{m:02d}/{y}",
    lambda d, m, y: f"31/02/{y}",  # impossible date
    lambda d, m, y: f"15/13/{y}",  # invalid month
    lambda d, m, y: "01/01/1900",  # sentinel
    lambda d, m, y: "12/05/2099",  # future date
    lambda d, m, y: "",  # blank
]

credit_templates = [
    lambda val: f"{val:.2f}",
    lambda val: f"${val:,.2f}",
    lambda val: f"{int(val):,}",
    lambda val: f"{val:.1e}",
    lambda val: f"-{val:.2f}",  # negative
    lambda val: "abc",  # invalid
    lambda val: "",  # empty
    lambda val: "99999999.99",  # very large
]

realistic_250 = []
generated_emails = []

for i in range(1, 251):
    cust_id = f"CUST-{i:04d}"
    # Introduce a couple duplicate cust_ids
    if i in (75, 150):
        cust_id = f"CUST-{(i - 1):04d}"

    fn = random.choice(first_names_multicultural)
    ln = random.choice(last_names_multicultural)
    name_fmt = random.choice(name_variations)(fn, ln)

    # Email generation
    domain = random.choice(["example.com", "company.org", "mail.net", "techcorp.io", "global.co.uk"])
    email_style = random.choice([
        f"{fn.lower()}.{ln.lower()}@{domain}",
        f"{fn.lower()}+{i}@{domain}",
        f"{fn.upper()}.{ln.upper()}@{domain}",
        f"  {fn.lower()}.{ln.lower()}@{domain}  ",
        f"{fn.lower()}@{domain}",
        f"{fn.lower()}{ln.lower()}@{domain}.",  # trailing dot
        f"{fn.lower()}{ln.lower()}{domain}",  # missing @
    ])

    # 10% duplicate emails differing by case or whitespace
    if i > 20 and i % 10 == 0 and generated_emails:
        prev_email = random.choice(generated_emails)
        email_style = f"  {prev_email.upper()}  "
    else:
        generated_emails.append(email_style.strip().lower())

    # Phone
    digits = f"{random.randint(1000000000, 9999999999)}"
    phone = random.choice(phone_templates)("US", digits)

    # DOB
    d = random.randint(1, 28)
    m = random.randint(1, 12)
    y = random.randint(1960, 2005)
    dob = random.choice(dob_templates)(d, m, y)

    # Country
    country = random.choice(countries)
    country_var = random.choice([country, country.lower(), f" {country} ", "UK" if country == "GB" else country, "XX" if i % 40 == 0 else country])

    # Status
    status_flag = random.choice(["A", "I", "P", "a", "i", "p", "X" if i % 25 == 0 else "A", ""])

    # Signup ts
    signup_ts = f"{random.randint(2018, 2024)}-{random.randint(1, 12):02d}-{random.randint(1, 28):02d} {random.randint(0, 23):02d}:{random.randint(0, 59):02d}:{random.randint(0, 59):02d}"

    # Credit limit
    c_val = random.uniform(50, 25000)
    credit_limit = random.choice(credit_templates)(c_val)

    # Legacy notes
    notes = random.choice([
        f"Referred by partner #{random.randint(100, 999)}, VIP client 🌟",
        "Preferred language: English, Spanish.\nContact via SMS.",
        'Quote: "Always deliver more than expected."',
        "Contains emoji: 🚀 💳 ✅",
        "Legacy imported notes, no action required.",
        "",
    ])

    record = {
        "cust_id": cust_id,
        "full_name": name_fmt,
        "email_addr": email_style,
        "phone": phone,
        "dob": dob,
        "country_code": country_var,
        "status_flag": status_flag,
        "signup_ts": signup_ts,
        "credit_limit": credit_limit,
        "legacy_notes": notes,
    }
    realistic_250.append(record)

with open(SCENARIOS_DIR / "realistic_250.json", "w", encoding="utf-8") as f:
    json.dump(realistic_250, f, indent=2, ensure_ascii=False)

# 3. Stress 500 records
stress_500 = []
for i in range(1, 501):
    stress_500.append({
        "cust_id": f"STRESS-{i:05d}",
        "full_name": f"StressUser{i} TestLastname",
        "email_addr": f"stress.user.{i}@benchmark.test",
        "phone": f"+155501{i:04d}",
        "dob": f"{(i % 28) + 1:02d}/{(i % 12) + 1:02d}/1990",
        "country_code": "US",
        "status_flag": "A" if i % 2 == 0 else "P",
        "signup_ts": "2023-01-15 10:30:00",
        "credit_limit": f"{1000 + i}.00",
        "legacy_notes": f"Stress benchmark record #{i}",
    })

with open(SCENARIOS_DIR / "stress_500.json", "w", encoding="utf-8") as f:
    json.dump(stress_500, f, indent=2, ensure_ascii=False)

# 4. All Valid 100
all_valid_100 = []
for i in range(1, 101):
    all_valid_100.append({
        "cust_id": f"VALID-{i:04d}",
        "full_name": f"ValidFirst{i} ValidLast{i}",
        "email_addr": f"valid.user.{i}@company.com",
        "phone": f"+1415555{i:04d}",
        "dob": f"{(i % 25) + 1:02d}/05/1992",
        "country_code": "US",
        "status_flag": "A",
        "signup_ts": "2023-05-10 14:20:00",
        "credit_limit": "5000.00",
        "legacy_notes": "Clean pristine customer record",
    })

with open(SCENARIOS_DIR / "all_valid_100.json", "w", encoding="utf-8") as f:
    json.dump(all_valid_100, f, indent=2, ensure_ascii=False)

# 5. All Invalid 40
all_invalid_40 = []
for i in range(1, 41):
    all_invalid_40.append({
        "cust_id": f"INVALID-{i:04d}",
        "full_name": "MononymOnly",  # fails last_name split
        "email_addr": "not-an-email",  # fails email format
        "phone": "invalid phone letters",  # fails phone
        "dob": "31/02/1990",  # impossible calendar date
        "country_code": "INVALID_COUNTRY",  # fails ISO-2
        "status_flag": "UNKNOWN_FLAG",  # fails enum map
        "signup_ts": "invalid timestamp",  # fails datetime parse
        "credit_limit": "-999.00",  # negative credit limit
        "legacy_notes": "All fields intentionally invalid",
    })

with open(SCENARIOS_DIR / "all_invalid_40.json", "w", encoding="utf-8") as f:
    json.dump(all_invalid_40, f, indent=2, ensure_ascii=False)

# 6. Overflow 501
overflow_501 = []
for i in range(1, 502):
    overflow_501.append({
        "cust_id": f"OVERFLOW-{i:05d}",
        "full_name": f"OverflowUser{i} Test",
        "email_addr": f"overflow.{i}@test.com",
        "phone": "+14155550199",
        "dob": "01/01/1990",
        "country_code": "US",
        "status_flag": "A",
        "signup_ts": "2023-01-01 00:00:00",
        "credit_limit": "100.00",
        "legacy_notes": "Overflow record",
    })

with open(SCENARIOS_DIR / "overflow_501.json", "w", encoding="utf-8") as f:
    json.dump(overflow_501, f, indent=2, ensure_ascii=False)

# 7. Hostile Inputs
hostile_inputs = [
    {
        "cust_id": "HOSTILE-001",
        "full_name": "'; DROP TABLE customers; -- Injection",
        "email_addr": "sqli@test.com",
        "phone": "+14155550199",
        "dob": "10/10/1990",
        "country_code": "US",
        "status_flag": "A",
        "signup_ts": "2023-01-01 12:00:00",
        "credit_limit": "100.00",
        "legacy_notes": "SQL Injection attempt in name",
    },
    {
        "cust_id": "HOSTILE-002",
        "full_name": "<script>alert('XSS')</script> Hacker",
        "email_addr": "xss@test.com",
        "phone": "+14155550198",
        "dob": "10/10/1990",
        "country_code": "US",
        "status_flag": "A",
        "signup_ts": "2023-01-01 12:00:00",
        "credit_limit": "100.00",
        "legacy_notes": "XSS script tags in fields",
    },
    {
        "cust_id": "HOSTILE-003",
        "full_name": "Long " + ("A" * 9000) + " String",
        "email_addr": "long@test.com",
        "phone": "+14155550197",
        "dob": "10/10/1990",
        "country_code": "US",
        "status_flag": "A",
        "signup_ts": "2023-01-01 12:00:00",
        "credit_limit": "100.00",
        "legacy_notes": "Long payload",
    },
    {
        "cust_id": "HOSTILE-004",
        "full_name": "Null\x00Byte Attack",
        "email_addr": "nullbyte@test.com",
        "phone": "+14155550196",
        "dob": "10/10/1990",
        "country_code": "US",
        "status_flag": "A",
        "signup_ts": "2023-01-01 12:00:00",
        "credit_limit": "100.00",
        "legacy_notes": "Null byte in strings",
    },
    {
        "cust_id": "HOSTILE-005",
        "full_name": '{"admin": true, "role": "superuser"} Hacker',
        "email_addr": "jsoninjection@test.com",
        "phone": "+14155550195",
        "dob": "10/10/1990",
        "country_code": "US",
        "status_flag": "A",
        "signup_ts": "2023-01-01 12:00:00",
        "credit_limit": "100.00",
        "legacy_notes": "JSON payload in string field",
    },
    {
        "cust_id": "HOSTILE-006",
        "full_name": "مرحبا بالعالم Al-Arabiyya",
        "email_addr": "rtl@test.com",
        "phone": "+971501234567",
        "dob": "15/07/1988",
        "country_code": "AE",
        "status_flag": "A",
        "signup_ts": "2023-01-01 12:00:00",
        "credit_limit": "5000.00",
        "legacy_notes": "RTL Arabic Unicode strings",
    },
    {
        "cust_id": "HOSTILE-007",
        "full_name": "🔥🔥🔥 Emoji 🎉⚡💥 Overload 🚀✨",
        "email_addr": "emoji@test.com",
        "phone": "+14155550194",
        "dob": "20/08/1995",
        "country_code": "US",
        "status_flag": "A",
        "signup_ts": "2023-01-01 12:00:00",
        "credit_limit": "250.00",
        "legacy_notes": "Multi-byte emojis across fields",
    },
]

with open(SCENARIOS_DIR / "hostile_inputs.json", "w", encoding="utf-8") as f:
    json.dump(hostile_inputs, f, indent=2, ensure_ascii=False)

print("Generated all 7 scenario datasets in backend/app/data/scenarios/ successfully.")
