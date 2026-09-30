"""Offline tests for Step 4 (no network, no API key). Run inside backend/:  python -m unittest test_step4 -v"""
import unittest
from unittest import mock

import domain_checks
import llm
import pipeline
import scoring


def rule_fixture(scam_score=20, incl_score=80, trans_score=70):
    return {
        "scam": {"risk": "low", "score": scam_score, "signals": [], "domainChecks": []},
        "inclusivity": {"score": incl_score, "flags": [
            {"phrase": "aggressive growth targets", "type": "gendered", "severity": "medium", "why": "x", "rewrite": "y"}]},
        "transparency": {"score": trans_score, "salaryListed": False, "redFlags": [], "greenFlags": [], "missing": ["salary"]},
    }


class LlmParsing(unittest.TestCase):
    def test_fenced_json(self):
        self.assertEqual(llm.parse_json_safely('```json\n{"a": 1}\n```'), {"a": 1})

    def test_garbage_returns_none(self):
        self.assertIsNone(llm.parse_json_safely("sorry, I cannot"))

    def test_invented_phrase_is_dropped(self):
        data = {"scamSignals": [{"phrase": "pay 5000 fee", "why": "fee"}, {"phrase": "not in text", "why": "x"}]}
        out = llm.clean_llm_output(data, "Please pay 5000 fee to join")
        self.assertEqual([s["phrase"] for s in out["scamSignals"]], ["pay 5000 fee"])

    def test_bad_enums_are_fixed(self):
        data = {"inclusivityFlags": [{"phrase": "ninja", "type": "weird", "severity": "huge", "why": "w", "rewrite": "r"}]}
        flag = llm.clean_llm_output(data, "We need a ninja")["inclusivityFlags"][0]
        self.assertEqual((flag["type"], flag["severity"]), ("other", "medium"))

    def test_no_key_returns_none(self):
        with mock.patch.dict("os.environ", {"GROQ_API_KEY": "", "LLM_PROVIDER": "groq"}):
            self.assertIsNone(llm.analyze_with_llm({"description": "hi"}, rule_fixture()))


class Domains(unittest.TestCase):
    def test_split_contacts(self):
        doms, free = domain_checks.split_contacts(
            {"emails": ["hr@gmail.com", "jobs@acme.co.in"], "urls": ["https://www.naukri.com/x", "acme-careers.com/apply"]})
        self.assertEqual(free, ["hr@gmail.com"])
        self.assertEqual(doms, ["acme.co.in", "acme-careers.com"])

    def test_young_domain_signal(self):
        with mock.patch.object(domain_checks, "rdap_age_days", return_value=20), \
             mock.patch.object(domain_checks, "safe_browsing_flagged", return_value=[]):
            out = domain_checks.check_domains({"emails": ["a@newfirm.com"], "urls": []})
        self.assertTrue(out["youngDomain"])
        self.assertEqual(out["domainChecks"][0]["ageDays"], 20)

    def test_failed_lookup_is_null(self):
        with mock.patch.object(domain_checks, "rdap_age_days", return_value=None), \
             mock.patch.object(domain_checks, "safe_browsing_flagged", return_value=[]):
            out = domain_checks.check_domains({"emails": ["a@somefirm.com"], "urls": []})
        self.assertIsNone(out["domainChecks"][0]["ageDays"])


class Scoring(unittest.TestCase):
    def test_high_risk_caps_trust_and_verdict(self):
        trust = scoring.compute_trust(90, "high", 100, 100)
        self.assertLessEqual(trust, 30)
        self.assertEqual(scoring.verdict_for(trust, "high"), "Likely scam")

    def test_clean_listing_looks_ok(self):
        trust = scoring.compute_trust(5, "low", 95, 90)
        self.assertEqual(scoring.verdict_for(trust, "low"), "Looks OK")

    def test_llm_can_dismiss_inclusivity_but_not_scam(self):
        rule = rule_fixture()
        rule["scam"]["signals"] = [{"phrase": "registration fee", "why": "fee"}]
        llm_out = {"dismissPhrases": ["aggressive growth targets", "registration fee"]}
        scam, incl, _ = scoring.merge_results(rule, llm_out, {})
        self.assertEqual(incl["flags"], [])
        self.assertEqual(incl["score"], 87)
        self.assertEqual(len(scam["signals"]), 1)

    def test_dedupe_by_phrase(self):
        rule = rule_fixture()
        rule["scam"]["signals"] = [{"phrase": "WhatsApp", "why": "w"}]
        scam, _, _ = scoring.merge_results(rule, {"scamSignals": [{"phrase": "whatsapp", "why": "again"}]}, {})
        self.assertEqual(len(scam["signals"]), 1)


class Pipeline(unittest.TestCase):
    def test_full_contract_and_llm_failure_fallback(self):
        pipeline._CACHE.clear()
        with mock.patch.object(pipeline, "analyze_with_llm", return_value=None), \
             mock.patch.object(pipeline, "check_domains", return_value={}):
            out = pipeline.run_analysis({"title": "t", "company": "Acme", "description": "d", "url": "u1"}, rule_fixture())
        for key in ("trustScore", "verdict", "reasons", "scam", "inclusivity", "transparency", "company", "history"):
            self.assertIn(key, out)
        self.assertIn(out["verdict"], ("Looks OK", "Apply with caution", "Likely scam"))
        self.assertTrue(2 <= len(out["reasons"]) <= 3)

    def test_cache_by_url(self):
        pipeline._CACHE.clear()
        with mock.patch.object(pipeline, "analyze_with_llm", return_value=None) as m, \
             mock.patch.object(pipeline, "check_domains", return_value={}):
            pipeline.run_analysis({"url": "same", "description": "d"}, rule_fixture())
            pipeline.run_analysis({"url": "same", "description": "d"}, rule_fixture())
        self.assertEqual(m.call_count, 1)


if __name__ == "__main__":
    unittest.main()
