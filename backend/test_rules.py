"""Offline tests for the rule engine. Run inside backend/:  python -m unittest test_rules -v"""
import unittest

import rules_engine as re_

SCAM = {"title": "Data Entry Executive", "company": "", "salary": "", "url": "u",
        "description": "Earn Rs 5000 per day working from home! No interview needed. Pay Rs 999 registration fee "
                       "to confirm your seat. Contact HR on WhatsApp only. Send resume to hrjobs@gmail.com. "
                       "Hurry, only 10 seats left.",
        "contacts": {"emails": ["hrjobs@gmail.com"], "urls": [], "phones": []}}

BIASED = {"title": "Sales Rockstar", "company": "Acme Pvt Ltd", "salary": "Not disclosed",
          "description": "We want a young and energetic rockstar with an aggressive personality. Must work late nights "
                         "and be available 24x7. Unmarried girls preferred. " * 3, "contacts": {}}

CLEAN = {"title": "Software Engineer", "company": "Acme Technologies", "salary": "INR 8,00,000 - 12,00,000 per year",
         "description": ("Build and maintain backend services in Python. Our aggressive growth targets need careful planning. "
                         "Salary: INR 8,00,000 to 12,00,000 per year. We offer parental leave, hybrid work and are an equal "
                         "opportunity employer. Career break returners are welcome. Working hours are 9:30 to 6:00. " * 2),
         "contacts": {"emails": ["careers@acmetech.com"], "urls": [], "phones": []}}

INTERN = {"title": "Marketing Intern", "company": "Beta Co", "salary": "",
          "description": "Fresher role. Requires 5+ years of experience. Other duties as assigned. " * 5, "contacts": {}}


class Rules(unittest.TestCase):
    def test_scam_listing_is_likely_scam(self):
        out = re_.analyze_rules_only(SCAM)
        self.assertEqual(out["scam"]["risk"], "high")
        self.assertEqual(out["verdict"], "Likely scam")
        self.assertLessEqual(out["trustScore"], 30)
        why = " ".join(s["why"] for s in out["scam"]["signals"]).lower()
        for word in ("fee", "whatsapp", "interview", "free email", "company name"):
            self.assertIn(word, why)

    def test_bias_flags_and_types(self):
        out = re_.analyze_rules(BIASED)
        types = {f["type"] for f in out["inclusivity"]["flags"]}
        self.assertTrue({"gendered", "age", "availability"} <= types)
        self.assertLess(out["inclusivity"]["score"], 50)
        self.assertTrue(all(f["rewrite"] for f in out["inclusivity"]["flags"]))

    def test_aggressive_context(self):
        good = re_.analyze_rules({"description": "We have aggressive growth targets."})
        bad = re_.analyze_rules({"description": "Looking for an aggressive personality."})
        self.assertEqual(good["inclusivity"]["flags"], [])
        self.assertEqual(len(bad["inclusivity"]["flags"]), 1)

    def test_clean_listing_looks_ok(self):
        out = re_.analyze_rules_only(CLEAN)
        self.assertEqual(out["verdict"], "Looks OK")
        self.assertTrue(out["transparency"]["salaryListed"])
        self.assertEqual(out["scam"]["signals"], [])
        self.assertIn("Parental leave mentioned", out["transparency"]["greenFlags"])
        self.assertEqual(out["inclusivity"]["flags"], [])

    def test_heavily_biased_listing_is_not_looks_ok(self):
        listing = dict(BIASED, company="Acme Pvt Ltd", salary="INR 6,00,000 per year")
        out = re_.analyze_rules_only(listing)
        self.assertEqual(out["scam"]["risk"], "low")
        self.assertLess(out["inclusivity"]["score"], 60)
        self.assertEqual(out["verdict"], "Apply with caution")

    def test_no_fee_is_not_flagged(self):
        out = re_.analyze_rules({"company": "Acme", "description": "There is no registration fee for candidates."})
        self.assertEqual(out["scam"]["signals"], [])

    def test_transparency_red_flags(self):
        out = re_.analyze_rules(INTERN)["transparency"]
        self.assertFalse(out["salaryListed"])
        joined = " ".join(out["redFlags"]).lower()
        for word in ("salary", "vague", "5+ years"):
            self.assertIn(word, joined)
        self.assertIn("salary", out["missing"])

    def test_contract_shape(self):
        out = re_.analyze_rules_only(CLEAN)
        for key in ("trustScore", "verdict", "reasons", "scam", "inclusivity", "transparency", "company", "history"):
            self.assertIn(key, out)
        self.assertTrue(0 <= out["trustScore"] <= 100)
        self.assertTrue(2 <= len(out["reasons"]) <= 3)

    def test_empty_and_none_payload_do_not_crash(self):
        for payload in ({}, None, {"description": None, "title": None, "contacts": None}):
            self.assertIn("verdict", re_.analyze_rules_only(payload))

    def test_bad_regex_is_skipped(self):
        self.assertIsNone(re_._compile("([unclosed", "test"))


# ---------- Severity-driven scoring fixtures ----------

FREE_EMAIL_ONLY = {
    "title": "Marketing Executive",
    "company": "Acme Corp",
    "salary": "INR 5,00,000 - 8,00,000",
    "description": ("Looking for a marketing executive. Good communication skills required. "
                     "Contact hr.acme@gmail.com for more details. "
                     "We offer health insurance and flexible hours. " * 5),
    "contacts": {"emails": ["hr.acme@gmail.com"], "urls": [], "phones": []},
}

FEE_DEMAND = {
    "title": "Data Entry Operator",
    "company": "Quick Jobs Pvt Ltd",
    "salary": "Rs 30,000/month",
    "description": ("Work from home data entry. Pay Rs 2000 registration fee to start. "
                     "Great earning potential. " * 5),
    "contacts": {"emails": ["careers@quickjobs.com"], "urls": [], "phones": []},
}

SALARY_MISMATCH = {
    "title": "Backend Developer",
    "company": "TechCo Pvt Ltd",
    "salary": "40-50 Lacs",
    "description": ("Build scalable APIs. Salary: 2.5 to 4.5 Lakhs per annum. "
                     "We offer great benefits and learning opportunities. " * 5),
    "contacts": {"emails": ["careers@techco.com"], "urls": [], "phones": []},
}

SALARY_CONSISTENT = {
    "title": "Backend Developer",
    "company": "TechCo Pvt Ltd",
    "salary": "INR 8,00,000 - 12,00,000",
    "description": ("Build scalable APIs. Salary: ₹8,00,000 to ₹12,00,000 per year. "
                     "We offer great benefits and learning opportunities. " * 5),
    "contacts": {"emails": ["careers@techco.com"], "urls": [], "phones": []},
}


class SeverityScoring(unittest.TestCase):
    def test_free_email_capped_at_74_and_caution(self):
        out = re_.analyze_rules_only(FREE_EMAIL_ONLY)
        self.assertLessEqual(out["trustScore"], 74)
        self.assertEqual(out["verdict"], "Apply with caution")

    def test_fee_demand_capped_at_30_and_likely_scam(self):
        out = re_.analyze_rules_only(FEE_DEMAND)
        self.assertLessEqual(out["trustScore"], 30)
        self.assertEqual(out["verdict"], "Likely scam")

    def test_clean_listing_still_looks_ok(self):
        out = re_.analyze_rules_only(CLEAN)
        self.assertEqual(out["verdict"], "Looks OK")
        self.assertGreater(out["trustScore"], 74)

    def test_salary_mismatch_flagged(self):
        out = re_.analyze_rules(SALARY_MISMATCH)
        joined = " ".join(out["transparency"]["redFlags"]).lower()
        self.assertIn("salary figures", joined)
        self.assertIn("do not match", joined)

    def test_salary_no_mismatch_not_flagged(self):
        out = re_.analyze_rules(SALARY_CONSISTENT)
        joined = " ".join(out["transparency"]["redFlags"]).lower()
        self.assertNotIn("salary figures", joined)


if __name__ == "__main__":
    unittest.main()
