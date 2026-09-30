"""
domain_checks.py - optional external scam checks (Step 4)

Each check is optional and fails safe (returns None / nothing) so the panel never breaks:
  - free-email detection (gmail / yahoo / outlook ...) for recruiter contact
  - RDAP domain-age lookup (public registry data, no key needed)
  - Google Safe Browsing (only if GOOGLE_SAFE_BROWSING_KEY is set in .env)
Standard library only.
"""
import json
import logging
import os
import re
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from urllib.parse import urlparse

log = logging.getLogger("fairhire.domains")

FREE_EMAIL_DOMAINS = {
    "gmail.com", "googlemail.com", "yahoo.com", "yahoo.in", "yahoo.co.in", "outlook.com",
    "hotmail.com", "live.com", "rediffmail.com", "proton.me", "protonmail.com", "icloud.com",
}
# Big sites we never treat as "the recruiter's domain"
IGNORE_DOMAINS = {
    "naukri.com", "internshala.com", "linkedin.com", "google.com", "facebook.com", "instagram.com",
    "youtube.com", "twitter.com", "x.com", "wa.me", "t.me", "whatsapp.com", "telegram.org",
    "bit.ly", "forms.gle", "docs.google.com",
}
TWO_PART_SUFFIXES = {"co.in", "org.in", "net.in", "ac.in", "gov.in", "co.uk", "com.au"}
YOUNG_DOMAIN_DAYS = 180
_age_cache = {}


def registered_domain(host):
    """'careers.acme.co.in' -> 'acme.co.in' (simple version, good enough for a demo)."""
    parts = [p for p in (host or "").lower().strip(".").split(".") if p]
    if len(parts) < 2:
        return ""
    if ".".join(parts[-2:]) in TWO_PART_SUFFIXES and len(parts) >= 3:
        return ".".join(parts[-3:])
    return ".".join(parts[-2:])


def split_contacts(contacts):
    """Return (business_domains, free_emails) found in the listing's emails and URLs."""
    contacts = contacts or {}
    domains, free_emails = [], []
    for email in contacts.get("emails") or []:
        if "@" not in str(email):
            continue
        dom = registered_domain(str(email).split("@")[-1])
        if dom in FREE_EMAIL_DOMAINS:
            free_emails.append(str(email))
        elif dom and dom not in IGNORE_DOMAINS and dom not in domains:
            domains.append(dom)
    for url in contacts.get("urls") or []:
        url = str(url)
        host = urlparse(url if "//" in url else "http://" + url).hostname
        dom = registered_domain(host)
        if dom and dom not in IGNORE_DOMAINS and dom not in FREE_EMAIL_DOMAINS and dom not in domains:
            domains.append(dom)
    return domains, free_emails


def rdap_age_days(domain):
    """Domain age in days from public RDAP data, or None if it cannot be checked."""
    if domain in _age_cache:
        return _age_cache[domain]
    age = None
    try:
        timeout = float(os.getenv("RDAP_TIMEOUT_SECONDS", "4"))
        req = urllib.request.Request("https://rdap.org/domain/" + domain,
                                     headers={"Accept": "application/rdap+json", "User-Agent": "Fairhire/1.0"})
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        for event in data.get("events", []):
            if event.get("eventAction") == "registration":
                registered = datetime.fromisoformat(event["eventDate"].replace("Z", "+00:00"))
                if registered.tzinfo is None:
                    registered = registered.replace(tzinfo=timezone.utc)
                age = max((datetime.now(timezone.utc) - registered).days, 0)
                break
    except Exception as exc:
        log.info("RDAP lookup failed for %s: %s", domain, exc)
    _age_cache[domain] = age
    return age


def safe_browsing_flagged(urls):
    """Return the list of URLs Google Safe Browsing flags. Empty list if no key or on any error."""
    key = os.getenv("GOOGLE_SAFE_BROWSING_KEY", "").strip()
    if not key or not urls:
        return []
    try:
        body = {
            "client": {"clientId": "fairhire", "clientVersion": "1.0"},
            "threatInfo": {
                "threatTypes": ["MALWARE", "SOCIAL_ENGINEERING", "UNWANTED_SOFTWARE"],
                "platformTypes": ["ANY_PLATFORM"], "threatEntryTypes": ["URL"],
                "threatEntries": [{"url": u} for u in urls[:10]],
            },
        }
        req = urllib.request.Request(
            "https://safebrowsing.googleapis.com/v4/threatMatches:find?key=" + key,
            data=json.dumps(body).encode("utf-8"),
            headers={"Content-Type": "application/json", "User-Agent": "Fairhire/1.0"}, method="POST")
        with urllib.request.urlopen(req, timeout=float(os.getenv("RDAP_TIMEOUT_SECONDS", "4"))) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        return [m["threat"]["url"] for m in data.get("matches", [])]
    except Exception as exc:
        log.info("Safe Browsing check failed: %s", exc)
        return []


def check_domains(contacts):
    """
    Returns {"domainChecks": [{domain, ageDays, note}], "signals": [{phrase, why}],
             "youngDomain": bool, "unsafeUrl": bool}
    Never raises.
    """
    result = {"domainChecks": [], "signals": [], "youngDomain": False, "unsafeUrl": False}
    try:
        domains, free_emails = split_contacts(contacts)
        for email in free_emails[:2]:
            result["signals"].append({
                "phrase": email,
                "why": "Recruiter contact uses a free email address instead of a company domain.",
            })
        domains = domains[:3]
        with ThreadPoolExecutor(max_workers=3) as pool:
            ages = list(pool.map(rdap_age_days, domains))
        for domain, age in zip(domains, ages):
            if age is None:
                note = "Domain age could not be checked."
            elif age < YOUNG_DOMAIN_DAYS:
                note = "Registered only %d days ago. Very new domain." % age
                result["youngDomain"] = True
                result["signals"].append({"phrase": domain,
                                          "why": "This domain was registered only %d days ago." % age})
            elif age < 365:
                note = "Registered %d days ago (less than a year)." % age
            else:
                note = "Registered about %d years ago." % (age // 365)
            result["domainChecks"].append({"domain": domain, "ageDays": age, "note": note})
        bad = safe_browsing_flagged([u for u in (contacts or {}).get("urls") or []])
        for url in bad:
            result["unsafeUrl"] = True
            result["signals"].append({"phrase": url, "why": "Google Safe Browsing flags this link as unsafe."})
    except Exception as exc:
        log.warning("Domain checks failed: %s", exc)
    return result
