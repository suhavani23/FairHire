"""
scoring.py - merge, dedupe, score and verdict (Step 4)

Input shapes are the /analyze contract shapes:
  rule   = {"scam": {...}, "inclusivity": {...}, "transparency": {...}}   (from rules_engine)
  llm    = cleaned dict from llm.analyze_with_llm(), or None
  domain = dict from domain_checks.check_domains()

Formula (keep docs/SCORING.md in sync with this file):
  trustScore = 0.4*(100 - scamScore) + 0.3*inclusivity + 0.3*transparency
  if scam risk is "high": trustScore is capped at 30
  scam risk:  score < 30 low, < 60 medium, else high
  verdict:    high scam risk            -> "Likely scam"
              medium risk or trust < 60 -> "Apply with caution"
              otherwise                 -> "Looks OK"

Adjustments made when merging (all small, all documented here):
  scam:         +10 per NEW signal from LLM or domain checks (max +30), +20 for a very new domain,
                +40 if Google Safe Browsing flags a link
  inclusivity:  minus 12/7/3 for each NEW high/medium/low flag from the LLM;
                the LLM may DISMISS a rule flag that is not biased in context (that penalty is added back)
  transparency: minus 5 per NEW red flag / missing item from the LLM (max -15)
Safety choice: the LLM can add scam signals but can never dismiss one.
"""
import copy

SEVERITY_PENALTY = {"high": 12, "medium": 7, "low": 3}


def clamp(value, low=0, high=100):
    return max(low, min(high, int(round(value))))


def risk_from_score(score):
    return "low" if score < 30 else ("medium" if score < 60 else "high")


def _key(text):
    return (text or "").strip().lower()


def merge_results(rule, llm, domain):
    """Combine rule, LLM and domain findings into scam / inclusivity / transparency dicts."""
    scam = copy.deepcopy(rule.get("scam") or {})
    incl = copy.deepcopy(rule.get("inclusivity") or {})
    trans = copy.deepcopy(rule.get("transparency") or {})
    scam.setdefault("signals", [])
    incl.setdefault("flags", [])
    for name in ("redFlags", "greenFlags", "missing"):
        trans.setdefault(name, [])
    trans.setdefault("salaryListed", False)
    scam_score = scam.get("score", 0)
    incl_score = incl.get("score", 100)
    trans_score = trans.get("score", 100)
    llm = llm or {}
    domain = domain or {}

    # 1) scam signals: add new ones from LLM and domain checks (deduped by phrase)
    seen = {_key(s.get("phrase")) for s in scam["signals"]}
    added = 0
    for sig in llm.get("scamSignals", []) + domain.get("signals", []):
        if _key(sig.get("phrase")) not in seen:
            scam["signals"].append(sig)
            seen.add(_key(sig.get("phrase")))
            added += 1
    scam_score += min(added, 3) * 10
    if domain.get("youngDomain"):
        scam_score += 20
    if domain.get("unsafeUrl"):
        scam_score += 40
    scam["score"] = clamp(scam_score)
    scam["risk"] = risk_from_score(scam["score"])
    scam["domainChecks"] = domain.get("domainChecks", scam.get("domainChecks", []))

    # 2) inclusivity: LLM can dismiss false positives, and add missed flags
    dismissed = {_key(p) for p in llm.get("dismissPhrases", [])}
    kept = []
    for flag in incl["flags"]:
        if _key(flag.get("phrase")) in dismissed:
            incl_score += SEVERITY_PENALTY.get(flag.get("severity"), 7)
        else:
            kept.append(flag)
    seen = {_key(f.get("phrase")) for f in kept}
    for flag in llm.get("inclusivityFlags", []):
        if _key(flag.get("phrase")) not in seen:
            kept.append(flag)
            seen.add(_key(flag.get("phrase")))
            incl_score -= SEVERITY_PENALTY.get(flag.get("severity"), 7)
    incl["flags"] = kept
    incl["score"] = clamp(incl_score)

    # 3) transparency: union of lists, small penalty for new problems
    penalty = 0
    for name in ("redFlags", "missing", "greenFlags"):
        seen = {_key(x) for x in trans[name]}
        source = {"redFlags": "redFlags", "missing": "missing", "greenFlags": "greenFlags"}[name]
        for item in llm.get(source, []):
            if _key(item) not in seen:
                trans[name].append(item)
                seen.add(_key(item))
                if name != "greenFlags":
                    penalty += 5
    trans["score"] = clamp(trans_score - min(penalty, 15))
    return scam, incl, trans


def compute_trust(scam_score, scam_risk, inclusivity, transparency):
    trust = 0.4 * (100 - scam_score) + 0.3 * inclusivity + 0.3 * transparency
    if scam_risk == "high":
        trust = min(trust, 30)
    return clamp(trust)


def verdict_for(trust, scam_risk):
    if scam_risk == "high":
        return "Likely scam"
    if scam_risk == "medium" or trust < 60:
        return "Apply with caution"
    return "Looks OK"


def build_reasons(scam, incl, trans, llm_reasons=None):
    """2-3 short bullets. Prefer the LLM's wording, else build from the strongest findings."""
    if llm_reasons:
        return llm_reasons[:3]
    reasons = []
    if scam["signals"]:
        s = scam["signals"][0]
        reasons.append("Scam warning: %s" % (s.get("why") or s.get("phrase")))
    if incl["flags"]:
        order = {"high": 0, "medium": 1, "low": 2}
        f = sorted(incl["flags"], key=lambda x: order.get(x.get("severity"), 1))[0]
        reasons.append("Language concern: %s" % (f.get("why") or f.get("phrase")))
    if not trans.get("salaryListed"):
        reasons.append("Salary is not listed.")
    elif trans["missing"]:
        reasons.append("Missing information: %s." % trans["missing"][0])
    if not reasons:
        reasons.append("No major warning signs found in the listing text.")
    if len(reasons) < 2:
        reasons.append("Always verify the company yourself before sharing documents or money.")
    return reasons[:3]
