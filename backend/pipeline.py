"""
pipeline.py - ties Step 4 together. main.py calls run_analysis(payload, rule_result).

rule_result must be contract-shaped: {"scam": {...}, "inclusivity": {...}, "transparency": {...}}.
Returns the full /analyze contract. The "company" block is a placeholder until Step 5.
Results are cached by URL for one hour (in memory).
"""
import copy
import logging
import time
import uuid
from datetime import datetime, timezone

from domain_checks import check_domains
from llm import analyze_with_llm
from scoring import build_reasons, compute_trust, merge_results, verdict_for

log = logging.getLogger("fairhire.pipeline")
_CACHE = {}          # url -> (timestamp, result)
CACHE_SECONDS = 3600


def _history():
    return {"id": uuid.uuid4().hex, "timestamp": datetime.now(timezone.utc).isoformat()}


def run_analysis(payload, rule_result):
    url = (payload.get("url") or "").strip()
    if url and url in _CACHE and time.time() - _CACHE[url][0] < CACHE_SECONDS:
        cached = copy.deepcopy(_CACHE[url][1])
        cached["history"] = _history()
        return cached

    try:
        domain = check_domains(payload.get("contacts"))
    except Exception as exc:
        log.warning("domain checks crashed: %s", exc)
        domain = {}
    try:
        llm = analyze_with_llm(payload, rule_result)
    except Exception as exc:
        log.warning("llm crashed: %s", exc)
        llm = None

    scam, incl, trans = merge_results(rule_result, llm, domain)
    trust = compute_trust(scam["score"], scam["risk"], incl["score"], trans["score"], signals=scam["signals"])
    result = {
        "trustScore": trust,
        "verdict": verdict_for(trust, scam["risk"], incl["score"], trans["score"], signals=scam["signals"]),
        "reasons": build_reasons(scam, incl, trans, (llm or {}).get("reasons")),
        "scam": scam,
        "inclusivity": incl,
        "transparency": trans,
        "company": {"name": payload.get("company") or "", "tier": 3, "type": "Unknown",
                    "facts": {}, "news": [], "reviewLinks": [], "community": []},
        "history": _history(),
        "analysisSource": "ai" if llm else "rules_only",
    }
    if url:
        _CACHE[url] = (time.time(), copy.deepcopy(result))
    return result
