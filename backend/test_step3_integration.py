# test_step3_integration.py - Validates full Step 3 pipeline
import json
import urllib.request
import re

BACKEND_URL = "http://127.0.0.1:8000/analyze"

def analyze_fixture(name, payload, expected_verdict, max_trust=None, min_trust=None, expected_flags=None):
    print(f"\n=======================================================")
    print(f"TESTING FIXTURE: {name}")
    print(f"=======================================================")
    req = urllib.request.Request(
        BACKEND_URL,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST"
    )
    with urllib.request.urlopen(req) as resp:
        res = json.loads(resp.read().decode("utf-8"))

    print(f"Verdict        : {res.get('verdict')}")
    print(f"Trust Score    : {res.get('trustScore')}")
    print(f"Scam Risk      : {res.get('scam', {}).get('risk')} (Score: {res.get('scam', {}).get('score')})")
    print(f"Inclusivity    : {res.get('inclusivity', {}).get('score')}")
    print(f"Transparency   : {res.get('transparency', {}).get('score')}")
    print(f"Signals/Flags  : {len(res.get('scam', {}).get('signals', []))} scam signals, {len(res.get('inclusivity', {}).get('flags', []))} inclusivity flags")
    print(f"Reasons        : {res.get('reasons')}")

    # Assertions
    assert res.get("verdict") == expected_verdict, f"Expected verdict {expected_verdict}, got {res.get('verdict')}"
    if max_trust is not None:
        assert res.get("trustScore") <= max_trust, f"Expected trustScore <= {max_trust}, got {res.get('trustScore')}"
    if min_trust is not None:
        assert res.get("trustScore") >= min_trust, f"Expected trustScore >= {min_trust}, got {res.get('trustScore')}"
    if expected_flags:
        found_phrases = [f["phrase"].lower() for f in res.get("inclusivity", {}).get("flags", [])]
        for ef in expected_flags:
            assert any(ef.lower() in fp for fp in found_phrases), f"Expected flag phrase '{ef}' not found in {found_phrases}"
    print(f">>> PASS: {name} verified successfully.")

def run_all():
    # 1. Scam fixture (mock_scam.html)
    scam_payload = {
        "title": "Online Back Office & Form Filling Specialist",
        "company": "Apex Global Freelance Services",
        "location": "Remote / Work From Anywhere",
        "salary": "₹50,000 - ₹80,000 per month (Daily Payouts Guaranteed)",
        "description": "Simple copy paste and typing tasks from home. No interview required! Direct selection for all applicants. Earn up to ₹2,500 per day working just 2 hours daily on your smartphone or laptop. A refundable registration and software security deposit fee of ₹999 is mandatory before job kit dispatch. Contact our HR manager immediately on WhatsApp / Telegram at +91 9876543210 or email recruitment.apexglobaljobs@gmail.com. Join our official channel at https://t.me/apex_instant_jobs.",
        "url": "http://127.0.0.1:8000/test-scam",
        "contacts": {
            "emails": ["recruitment.apexglobaljobs@gmail.com"],
            "urls": ["https://t.me/apex_instant_jobs"],
            "phones": ["+91 9876543210"]
        }
    }
    analyze_fixture("mock_scam.html", scam_payload, expected_verdict="Likely scam", max_trust=30)

    # 2. Mock Test (mock_test.html - TCS listing with bias flags)
    test_payload = {
        "title": "Lead Full-Stack Platform Engineer",
        "company": "Tata Consultancy Services (TCS)",
        "location": "Bengaluru, Karnataka (Hybrid)",
        "salary": "₹18,00,000 - ₹24,00,000 PA",
        "description": "Tata Consultancy Services is looking for a passionate and aggressive rockstar engineer. Willingness to work late nights when production deadlines hit and support 24x7 sprint cycles. Looking for young and energetic candidates with high bandwidth and digital native intuition. TCS is an equal opportunity employer. We strictly enforce POSH compliance across all offices. We offer 26 weeks of paid parental leave, flexible hybrid schedules.",
        "url": "http://127.0.0.1:8000/test",
        "contacts": {
            "emails": ["talent.acquisition@tcs.com"],
            "urls": ["https://www.tcs.com/careers"],
            "phones": []
        }
    }
    analyze_fixture("mock_test.html", test_payload, expected_verdict="Apply with caution", min_trust=70, expected_flags=["rockstar", "aggressive", "young and energetic"])

    # 3. Clean corporate listing
    clean_payload = {
        "title": "Senior Frontend Engineer",
        "company": "Infosys",
        "location": "Bangalore",
        "salary": "₹22,00,000 - ₹28,00,000 PA",
        "description": "Selected candidate will design accessible web applications. Equal opportunity employer. POSH compliant workplace with flexible hybrid working hours and comprehensive parental leave.",
        "url": "http://127.0.0.1:8000/test-clean",
        "contacts": {"emails": ["careers@infosys.com"], "urls": [], "phones": []}
    }
    analyze_fixture("clean listing", clean_payload, expected_verdict="Looks OK", min_trust=85)

    print("\n=======================================================")
    print("ALL STEP 3 CORE LOOP INTEGRATION TESTS PASSED!")
    print("=======================================================")

if __name__ == "__main__":
    run_all()
