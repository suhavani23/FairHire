"""
rules_engine.py - rule layer for Fairhire (Step 3). Pure Python, no network, no API keys.

Reads the editable JSON files in data/rules/ (scam, bias, transparency, green_flags),
matches them against the listing text, and returns results in the /analyze contract shape:

  analyze_rules(payload)       -> {"scam": {...}, "inclusivity": {...}, "transparency": {...}}
  analyze_rules_only(payload)  -> the FULL /analyze response (rules only, no LLM)  <- Step 3 core loop

Editing rules: change the JSON files and restart the backend (or call reload_rules()).
A bad regex in a JSON file is skipped with a log warning, it never crashes the server.
"""
import json
import logging
import os
import re
import unicodedata
import uuid
from datetime import datetime, timezone

from scoring import build_reasons, clamp, compute_trust, risk_from_score, verdict_for

log = logging.getLogger("fairhire.rules")
RULES_DIR = os.getenv("RULES_DIR") or os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "..", "data", "rules")
EMAIL_RE = re.compile(r"[A-Za-z0-9._%+\-]+@([A-Za-z0-9.\-]+\.[A-Za-z]{2,})")
_RULES = {}


def _read(name):
    try:
        with open(os.path.join(RULES_DIR, name + ".json"), encoding="utf-8") as fh:
            return json.load(fh)
    except Exception as exc:
        log.warning("Could not read rules file %s: %s", name, exc)
        return {}


def _compile(pattern, rule_id="?"):
    try:
        return re.compile(pattern, re.I)
    except (re.error, TypeError) as exc:
        log.warning("Bad regex in rule %s skipped: %s", rule_id, exc)
        return None


def reload_rules():
    """(Re)load all rule files and pre-compile the regexes."""
    scam, bias = _read("scam"), _read("bias")
    trans, green = _read("transparency"), _read("green_flags")
    for rule in scam.get("rules", []) + bias.get("rules", []):
        rule["_re"] = _compile(rule.get("pattern", ""), rule.get("id"))
    for group in green.get("groups", []):
        group["_re"] = _compile(group.get("pattern", ""), group.get("id"))
    for key in ("salaryListedPattern", "salaryNotListedPattern", "unpaidPattern", "mandatorySkillsLinePattern",
                "entryLevelPattern", "experiencePattern"):
        trans["_" + key] = _compile(trans.get(key, ""), key)
    trans["_vague"] = [c for c in (_compile(p, "vague") for p in trans.get("vagueRolePatterns", [])) if c]
    scam["_missingCompany"] = _compile(scam.get("missingCompanyPattern", ""), "missingCompany")
    _RULES.update({"scam": scam, "bias": bias, "trans": trans, "green": green})


reload_rules()


# ---------- helpers ----------
def clean_text(text):
    """Normalise unicode, strip stray HTML tags, collapse spaces and blank lines."""
    text = unicodedata.normalize("NFKC", text or "")
    text = re.sub(r"</?[a-zA-Z][^>]*>", " ", text)
    text = text.replace("\u00a0", " ")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n\s*\n+", "\n", text)
    return text.strip()


def _phrase(match):
    """Matched text, whitespace collapsed and trimmed to 80 chars."""
    return re.sub(r"\s+", " ", match.group(0)).strip()[:80]


def _s(value):
    return value.strip() if isinstance(value, str) else ""


# ---------- scam ----------
def _scam(title, company, text, contacts):
    cfg = _RULES["scam"]
    signals, score, seen_ids = [], 0, set()
    for rule in cfg.get("rules", []):
        if rule["id"] in seen_ids or not rule.get("_re"):
            continue
        match = rule["_re"].search(text)
        if match:
            seen_ids.add(rule["id"])
            signals.append({"phrase": _phrase(match), "why": rule.get("why", "")})
            score += int(rule.get("weight", 10))

    free = {d.lower() for d in cfg.get("freeEmailDomains", [])}
    emails = list((contacts or {}).get("emails") or []) + [m.group(0) for m in EMAIL_RE.finditer(text)]
    for email in emails:
        if "@" in str(email) and str(email).split("@")[-1].lower() in free:
            signals.append({"phrase": str(email), "why": cfg.get("freeEmailWhy", "")})
            score += int(cfg.get("freeEmailWeight", 15))
            break  # count the free-email signal once

    if cfg.get("_missingCompany") and cfg["_missingCompany"].match(company or ""):
        signals.append({"phrase": "(company name missing)", "why": cfg.get("missingCompanyWhy", "")})
        score += int(cfg.get("missingCompanyWeight", 15))

    score = clamp(score)
    return {"risk": risk_from_score(score), "score": score, "signals": signals, "domainChecks": []}


# ---------- inclusivity ----------
def _green_groups(text):
    return [g for g in _RULES["green"].get("groups", []) if g.get("_re") and g["_re"].search(text)]


def _inclusivity(text):
    cfg = _RULES["bias"]
    penalty = cfg.get("severityPenalty", {"high": 15, "medium": 8, "low": 4})
    flags, seen, score = [], set(), 100
    for rule in cfg.get("rules", []):
        if not rule.get("_re"):
            continue
        for match in list(rule["_re"].finditer(text))[:3]:
            phrase = _phrase(match)
            if phrase.lower() in seen or len(flags) >= 12:
                continue
            seen.add(phrase.lower())
            flags.append({"phrase": phrase, "type": rule.get("type", "other"),
                          "severity": rule.get("severity", "medium"),
                          "why": rule.get("why", ""), "rewrite": rule.get("rewrite", "")})
            score -= penalty.get(rule.get("severity"), 8)
    green = _RULES["green"]
    bonus_groups = [g for g in _green_groups(text) if g.get("inclusivity")]
    score += min(len(bonus_groups) * green.get("inclusivityBonusEach", 5), green.get("maxInclusivityBonus", 10))
    return {"score": clamp(score), "flags": flags}


# ---------- transparency ----------
def _salary_listed(salary, text, cfg):
    salary = _s(salary)
    if cfg["_unpaidPattern"] and cfg["_unpaidPattern"].search(salary + " " + text[:400]):
        return True  # "unpaid" is at least honest about pay
    if salary:
        if cfg["_salaryNotListedPattern"] and cfg["_salaryNotListedPattern"].match(salary):
            return False
        if re.search(r"\d", salary):
            return True
    return bool(cfg["_salaryListedPattern"] and cfg["_salaryListedPattern"].search(text))


def _transparency(title, salary, text):
    cfg, pen = _RULES["trans"], _RULES["trans"].get("penalties", {})
    red, missing = [], []
    listed = _salary_listed(salary, text, cfg)
    score = 100
    if not listed:
        red.append("Salary or stipend is not listed")
        score -= pen.get("noSalary", 30)

    if any(p.search(text) for p in cfg["_vague"]):
        red.append("Role responsibilities are vague")
        score -= pen.get("redFlag", 12)

    if cfg["_mandatorySkillsLinePattern"]:
        count = 0
        for line in (m.group(0) for m in cfg["_mandatorySkillsLinePattern"].finditer(text)):
            count += len(re.findall(r",|/|;|\band\b|&", line))
        if count >= cfg.get("maxMandatorySkills", 10):
            red.append("Very long list of mandatory skills")
            score -= pen.get("redFlag", 12)

    if cfg["_entryLevelPattern"] and cfg["_experiencePattern"] and cfg["_entryLevelPattern"].search(title + " " + text[:300]):
        years = [int(g) for m in cfg["_experiencePattern"].finditer(text) for g in m.groups() if g]
        if years and max(years) >= cfg.get("inflatedYears", 3):
            red.append("Entry-level role asks for %d+ years of experience" % max(years))
            score -= pen.get("redFlag", 12)

    if len(text) < cfg.get("minDescriptionChars", 300):
        red.append("Listing text is very short, so this check is limited")
        score -= pen.get("shortDescription", 10)

    found = _green_groups(text)
    found_ids = {g["id"] for g in found}
    green = (["Salary listed"] if listed else []) + [g["label"] for g in found]
    for group in _RULES["green"].get("groups", []):
        label = group.get("missingLabel")
        if label and group["id"] not in found_ids:
            missing.append(label)
            score -= pen.get("missingSection", 5)
    if not listed:
        missing.insert(0, "salary")
    return {"score": clamp(score), "salaryListed": listed, "redFlags": red, "greenFlags": green, "missing": missing}


# ---------- public API ----------
def analyze_rules(payload):
    """Contract-shaped rule results. Feed this to pipeline.run_analysis() in Step 4."""
    payload = payload or {}
    title, company = _s(payload.get("title")), _s(payload.get("company"))
    text = clean_text(title + ". " + _s(payload.get("description")))
    contacts = payload.get("contacts") or {}
    return {
        "scam": _scam(title, company, text, contacts),
        "inclusivity": _inclusivity(text),
        "transparency": _transparency(title, payload.get("salary"), clean_text(_s(payload.get("description")))),
    }


def analyze_rules_only(payload):
    """Full /analyze response using rules only (Step 3 core loop, works with no keys and no internet)."""
    payload = payload or {}
    rules = analyze_rules(payload)
    scam, incl, trans = rules["scam"], rules["inclusivity"], rules["transparency"]
    trust = compute_trust(scam["score"], scam["risk"], incl["score"], trans["score"])
    return {
        "trustScore": trust,
        "verdict": verdict_for(trust, scam["risk"], incl["score"]),
        "reasons": build_reasons(scam, incl, trans),
        "scam": scam, "inclusivity": incl, "transparency": trans,
        "company": {"name": _s(payload.get("company")), "tier": 3, "type": "Unknown",
                    "facts": {}, "news": [], "reviewLinks": [], "community": []},
        "history": {"id": uuid.uuid4().hex, "timestamp": datetime.now(timezone.utc).isoformat()},
    }
