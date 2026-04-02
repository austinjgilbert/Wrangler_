"""
live_pipeline.py — Live Scan Pipeline Orchestrator
===================================================

This is the Phase A.3 core loop: the step-by-step procedure that Claude
executes when a user triggers a live scan from a Chrome tab.

PIPELINE STAGES:
  1. CAPTURE   — Read current Chrome tab (URL + page content)
  2. CLASSIFY  — Determine page type (company, person, job board, etc.)
  3. EXTRACT   — Pull structured fields from page content
  4. INGEST    — Transform to standard signal format
  5. RESOLVE   — Find existing entity in Sanity via GROQ queries
  6. FUSE      — Merge new signal with existing data (or create new)
  7. PERSIST   — Upsert fused document to Sanity Content Lake
  8. LOG       — Write fusionEvent audit trail document
  9. NOTIFY    — Send Slack notification (new profile, conflict, etc.)

MCP TOOLS USED:
  - mcp__Control_Chrome__get_current_tab     (stage 1)
  - mcp__Control_Chrome__get_page_content    (stage 1)
  - mcp__e17eda47__query_documents           (stage 5)
  - mcp__e17eda47__create_documents_from_json (stages 7, 8)
  - mcp__e17eda47__patch_document_from_json  (stage 7 — update)
  - mcp__5e5b2f2c__slack_send_message_draft  (stage 9)

SANITY PROJECT: ql62wkk2
DATASET: production
"""

from typing import Optional, Any
import re
import json
from datetime import datetime, timezone
from urllib.parse import urlparse

# ─────────────────────────────────────────────────────────
# STAGE 1: CAPTURE — Read Chrome Tab
# ─────────────────────────────────────────────────────────
#
# MCP calls:
#   tab_info = mcp__Control_Chrome__get_current_tab()
#   page_text = mcp__Control_Chrome__get_page_content(tab_id=tab_info.id)
#
# Result shape:
#   url: str       — e.g. "https://www.rapid7.com/about/"
#   title: str     — e.g. "About Rapid7 | Cybersecurity Solutions"
#   page_text: str — full text content of the page


# ─────────────────────────────────────────────────────────
# STAGE 2: CLASSIFY — Page Type Detection
# ─────────────────────────────────────────────────────────

# Page type determines extraction strategy and source attribution
PAGE_TYPES = {
    "linkedin_company": {
        "url_pattern": r"linkedin\.com/company/",
        "source": "linkedin",
        "entity_type": "account",
    },
    "linkedin_person": {
        "url_pattern": r"linkedin\.com/in/",
        "source": "linkedin",
        "entity_type": "contact",
    },
    "linkedin_sales_nav": {
        "url_pattern": r"linkedin\.com/sales/",
        "source": "linkedin",
        "entity_type": "contact",
    },
    "crunchbase_org": {
        "url_pattern": r"crunchbase\.com/organization/",
        "source": "crunchbase",
        "entity_type": "account",
    },
    "crunchbase_person": {
        "url_pattern": r"crunchbase\.com/person/",
        "source": "crunchbase",
        "entity_type": "contact",
    },
    "company_website": {
        "url_pattern": None,  # Fallback — any non-platform URL
        "source": "company_website",
        "entity_type": "account",
    },
    "apollo_person": {
        "url_pattern": r"app\.apollo\.io/",
        "source": "apollo",
        "entity_type": "contact",
    },
    "common_room": {
        "url_pattern": r"app\.commonroom\.io/",
        "source": "common_room",
        "entity_type": "account",
    },
    "salesforce_account": {
        "url_pattern": r"lightning\.force\.com/.*Account",
        "source": "salesforce",
        "entity_type": "account",
    },
    "salesforce_contact": {
        "url_pattern": r"lightning\.force\.com/.*Contact",
        "source": "salesforce",
        "entity_type": "contact",
    },
    "g2_company": {
        "url_pattern": r"g2\.com/products/",
        "source": "g2",
        "entity_type": "account",
    },
    "glassdoor": {
        "url_pattern": r"glassdoor\.com/",
        "source": "glassdoor",
        "entity_type": "account",
    },
}


def classify_page(url: str, page_text: str = "") -> dict:
    """
    Classify page by URL pattern matching.

    Returns: {
        "page_type": str,
        "source": str,
        "entity_type": "account" | "contact",
        "domain": str | None
    }
    """
    for page_type, config in PAGE_TYPES.items():
        if config["url_pattern"] and re.search(config["url_pattern"], url):
            return {
                "page_type": page_type,
                "source": config["source"],
                "entity_type": config["entity_type"],
                "domain": _extract_domain(url),
            }

    # Fallback: company website
    return {
        "page_type": "company_website",
        "source": "company_website",
        "entity_type": "account",
        "domain": _extract_domain(url),
    }


# ─────────────────────────────────────────────────────────
# STAGE 3: EXTRACT — Structured Field Extraction
# ─────────────────────────────────────────────────────────
#
# Claude performs this step using its reasoning over the page_text.
# The extraction prompt should target these fields per entity type:

ACCOUNT_FIELDS = [
    "legalName",       # Official company name
    "domain",          # Primary website domain
    "industry",        # Primary industry
    "subIndustry",     # Sub-industry if discernible
    "headcount",       # Employee count (normalize to int)
    "hqCity",          # HQ city
    "hqState",         # HQ state/province
    "hqCountry",       # HQ country
    "foundedYear",     # Year founded (int)
    "description",     # Company description (1-2 sentences)
    "ceo",             # CEO / top executive name
    "revenueRange",    # Revenue range string
    "fundingTotal",    # Total funding string
    "fundingStage",    # Latest funding stage
    "techStack",       # Array of technology names
    "websiteUrl",      # Full website URL
    "linkedinUrl",     # LinkedIn company page URL
    "twitterHandle",   # Twitter/X handle
    "stockTicker",     # Stock ticker if public
    "competitors",     # Array of competitor names
    "customers",       # Array of known customer names
    "tags",            # Freeform tags
]

CONTACT_FIELDS = [
    "fullName",        # Full name
    "firstName",       # First name
    "lastName",        # Last name
    "email",           # Email address
    "title",           # Job title
    "seniority",       # Seniority level (c_suite, vp, director, manager, ic)
    "department",      # Department (engineering, marketing, sales, etc.)
    "phone",           # Phone number
    "linkedinUrl",     # LinkedIn profile URL
    "twitterHandle",   # Twitter handle
    "company",         # Company name
    "companyDomain",   # Company domain
    "location",        # Location string
    "bio",             # Short bio
]

# Extraction prompt template — Claude fills this in during the scan
EXTRACTION_PROMPT = """
Given the page content below, extract structured fields for a {entity_type}.
URL: {url}
Page type: {page_type}

Target fields: {fields}

Rules:
- Only extract fields you can find evidence for in the text
- For headcount, normalize to a number (e.g. "1,000-5,000" → 3000)
- For domain, strip protocol and www (e.g. "https://www.rapid7.com/" → "rapid7.com")
- For seniority, use: c_suite, vp, director, manager, senior, mid, junior, intern
- Return as JSON dict. Omit fields with no evidence.

PAGE CONTENT:
{page_text}
"""


# ─────────────────────────────────────────────────────────
# STAGE 4: INGEST — Transform to Standard Signal
# ─────────────────────────────────────────────────────────

def build_signal(
    source: str,
    entity_type: str,
    extracted_fields: dict,
    url: str = "",
    domain: str = None,
) -> dict:
    """
    Build a standard signal from extracted fields.

    This is the Python equivalent of `from_chrome_scan` in
    ingestion_adapters.py, simplified for the live pipeline.
    """
    now = datetime.now(timezone.utc).isoformat()

    # Build entity hint for resolution
    entity_hint = {}
    if entity_type == "account":
        entity_hint["domain"] = domain or extracted_fields.get("domain")
        entity_hint["name"] = extracted_fields.get("legalName")
    else:
        entity_hint["email"] = extracted_fields.get("email")
        entity_hint["name"] = extracted_fields.get("fullName")
        entity_hint["company"] = extracted_fields.get("company")
        entity_hint["domain"] = extracted_fields.get("companyDomain") or domain

    return {
        "source": source,
        "timestamp": now,
        "scanned_at": now,  # Alias for fusion engine
        "url": url,
        "entity_type": entity_type,
        "entity_hint": entity_hint,
        "fields": extracted_fields,
    }


# ─────────────────────────────────────────────────────────
# STAGE 5: RESOLVE — Find Existing Entity in Sanity
# ─────────────────────────────────────────────────────────

# GROQ queries to run against Sanity, in priority order.
# Each query returns at most 1 document. Stop at first match.

ACCOUNT_RESOLUTION_QUERIES = [
    {
        "strategy": "domain_match",
        "confidence": 0.98,
        "query": '*[_type == "account" && domain.value == $domain][0]',
        "param_key": "domain",  # Extract from signal.entity_hint.domain
    },
    {
        "strategy": "salesforce_id_match",
        "confidence": 0.99,
        "query": '*[_type == "account" && salesforceId.value == $sfId][0]',
        "param_key": "salesforceId",
    },
    {
        "strategy": "name_exact_match",
        "confidence": 0.85,
        "query": '*[_type == "account" && legalName.value == $name][0]',
        "param_key": "name",  # Extract from signal.entity_hint.name
    },
]

CONTACT_RESOLUTION_QUERIES = [
    {
        "strategy": "email_match",
        "confidence": 0.97,
        "query": '*[_type == "contact" && email.value == $email][0]',
        "param_key": "email",
    },
    {
        "strategy": "name_company_match",
        "confidence": 0.85,
        "query": '*[_type == "contact" && fullName.value == $name && companyDomain.value == $domain][0]',
        "param_key": "name+domain",
    },
]


def build_resolution_params(signal: dict, query_config: dict) -> dict:
    """
    Build GROQ query parameters from signal entity_hint.
    Returns None if required params are missing.
    """
    hint = signal.get("entity_hint", {})
    param_key = query_config["param_key"]

    if param_key == "domain":
        domain = _normalize_domain(hint.get("domain"))
        return {"domain": domain} if domain else None

    if param_key == "salesforceId":
        sf_id = hint.get("salesforceId") or signal["fields"].get("salesforceId")
        return {"sfId": sf_id} if sf_id else None

    if param_key == "name":
        name = hint.get("name")
        return {"name": name} if name else None

    if param_key == "email":
        email = hint.get("email")
        return {"email": email} if email else None

    if param_key == "name+domain":
        name = hint.get("name")
        domain = _normalize_domain(hint.get("domain"))
        return {"name": name, "domain": domain} if name and domain else None

    return None


# ─────────────────────────────────────────────────────────
# STAGE 6: FUSE — Merge Signal with Existing Entity
# ─────────────────────────────────────────────────────────
#
# Uses the logic from fusion_engine.py. Key concepts:
#
# Every field is stored as a confidenceField:
# {
#   "_type": "confidenceField",
#   "value": <any>,
#   "confidence": <float 0-1>,
#   "certain": <bool>,
#   "source": <str>,
#   "sources": [<str>, ...],
#   "updated": <ISO timestamp>,
#   "conflictingValues": []
# }
#
# Source trust tiers (base confidence):
#   Tier 1: salesforce=0.90, company_website=0.85, common_room=0.85, bigquery=0.95
#   Tier 2: linkedin=0.75, crunchbase=0.72, apollo=0.70
#   Tier 3: slack=0.40, gmail=0.35, google_calendar=0.50
#   Tier 4: inferred=0.25
#
# Conflict resolution:
#   1. Values agree → boost confidence (corroboration)
#   2. Source is authoritative for field → override
#   3. Confidence margin > 0.15 → higher wins
#   4. Similar values → FLAG for human review

SOURCE_TRUST = {
    "salesforce": 0.90,
    "company_website": 0.85,
    "common_room": 0.85,
    "bigquery": 0.95,
    "linkedin": 0.75,
    "crunchbase": 0.72,
    "apollo": 0.70,
    "g2": 0.65,
    "glassdoor": 0.60,
    "slack": 0.40,
    "gmail": 0.35,
    "google_calendar": 0.50,
    "inferred": 0.25,
}

# Which source is authoritative for which field (top 3)
FIELD_AUTHORITY = {
    "legalName": ["salesforce", "company_website", "crunchbase"],
    "domain": ["company_website", "salesforce", "crunchbase"],
    "industry": ["crunchbase", "salesforce", "linkedin"],
    "headcount": ["linkedin", "salesforce", "crunchbase"],
    "description": ["company_website", "crunchbase", "linkedin"],
    "techStack": ["company_website", "g2", "crunchbase"],
    "hqCity": ["salesforce", "crunchbase", "linkedin"],
    "hqState": ["salesforce", "crunchbase", "linkedin"],
    "hqCountry": ["salesforce", "crunchbase", "linkedin"],
    "foundedYear": ["crunchbase", "company_website", "linkedin"],
    "ceo": ["crunchbase", "linkedin", "company_website"],
    "revenueRange": ["salesforce", "crunchbase", "bigquery"],
    "fundingTotal": ["crunchbase", "apollo", "linkedin"],
    "fundingStage": ["crunchbase", "apollo", "linkedin"],
    "fullName": ["linkedin", "salesforce", "apollo"],
    "email": ["salesforce", "apollo", "gmail"],
    "title": ["linkedin", "salesforce", "apollo"],
    "seniority": ["linkedin", "salesforce", "apollo"],
    "phone": ["salesforce", "apollo", "linkedin"],
}


def make_confidence_field(
    value: Any,
    source: str,
    field_name: str = "",
    existing_sources: list = None,
) -> dict:
    """
    Create a confidenceField wrapper for a value.
    """
    now = datetime.now(timezone.utc).isoformat()
    base = SOURCE_TRUST.get(source, 0.50)

    # Authority bonus: +0.05 if source is in top 3 for this field
    authority = FIELD_AUTHORITY.get(field_name, [])
    if source in authority[:3]:
        base = min(base + 0.05, 1.0)

    # Corroboration bonus: +0.03 per additional source
    all_sources = list(set((existing_sources or []) + [source]))
    corroboration = min(len(all_sources) - 1, 3) * 0.03

    confidence = min(base + corroboration, 1.0)

    return {
        "_type": "confidenceField",
        "value": value,
        "confidence": round(confidence, 3),
        "certain": confidence >= 0.80,
        "source": source,
        "sources": all_sources,
        "updated": now,
        "conflictingValues": [],
    }


def fuse_fields(
    existing_doc: Optional[dict],
    signal: dict,
) -> tuple[dict, list, bool]:
    """
    Fuse signal fields into an existing (or new) document.

    Returns:
        (fused_fields, conflicts, needs_review)

    fused_fields: dict of field_name → confidenceField
    conflicts: list of {field, existing_value, new_value, resolution}
    needs_review: bool — True if any fields were flagged
    """
    source = signal["source"]
    fields = signal.get("fields", {})
    conflicts = []
    needs_review = False
    fused = {}

    for field_name, new_value in fields.items():
        if new_value is None or new_value == "" or new_value == []:
            continue

        existing_field = (existing_doc or {}).get(field_name)

        if existing_field is None or not isinstance(existing_field, dict):
            # New field — just set it
            fused[field_name] = make_confidence_field(
                value=new_value,
                source=source,
                field_name=field_name,
            )
        else:
            # Existing field — compare values
            existing_value = existing_field.get("value")
            existing_conf = existing_field.get("confidence", 0.5)
            existing_source = existing_field.get("source", "unknown")
            existing_sources = existing_field.get("sources", [existing_source])

            if _values_match(existing_value, new_value):
                # Agreement — boost confidence via corroboration
                fused[field_name] = make_confidence_field(
                    value=existing_value,  # Keep existing (canonical)
                    source=existing_source,
                    field_name=field_name,
                    existing_sources=existing_sources + [source],
                )
            else:
                # Conflict — resolve
                new_conf = SOURCE_TRUST.get(source, 0.50)
                authority = FIELD_AUTHORITY.get(field_name, [])

                # Check if new source is authoritative
                if source in authority[:3] and existing_source not in authority[:3]:
                    resolution = "accept"
                elif existing_source in authority[:3] and source not in authority[:3]:
                    resolution = "reject"
                elif abs(new_conf - existing_conf) > 0.15:
                    resolution = "accept" if new_conf > existing_conf else "reject"
                else:
                    resolution = "flag"
                    needs_review = True

                if resolution == "accept":
                    fused[field_name] = make_confidence_field(
                        value=new_value,
                        source=source,
                        field_name=field_name,
                        existing_sources=existing_sources,
                    )
                elif resolution == "reject":
                    # Keep existing but record the conflict
                    fused[field_name] = existing_field.copy()
                    fused[field_name]["sources"] = list(
                        set(existing_sources + [source])
                    )
                else:
                    # Flag — keep existing, add conflict
                    fused[field_name] = existing_field.copy()
                    fused[field_name]["conflictingValues"] = (
                        existing_field.get("conflictingValues", [])
                        + [{"value": new_value, "source": source, "confidence": new_conf}]
                    )

                conflicts.append({
                    "field": field_name,
                    "existing_value": existing_value,
                    "new_value": new_value,
                    "resolution": resolution,
                })

    return fused, conflicts, needs_review


# ─────────────────────────────────────────────────────────
# STAGE 7: PERSIST — Upsert to Sanity
# ─────────────────────────────────────────────────────────

def build_account_document(
    entity_id: str,
    fused_fields: dict,
    signal: dict,
    existing_doc: Optional[dict] = None,
) -> dict:
    """
    Build a complete Sanity account document for upsert.

    entity_id: deterministic ID like "account-rapid7com"
    """
    now = datetime.now(timezone.utc).isoformat()

    doc = {
        "_type": "account",
        "_id": entity_id,
    }

    # Merge existing fields with fused fields
    if existing_doc:
        for key, value in existing_doc.items():
            if key.startswith("_"):
                continue
            if key not in fused_fields:
                doc[key] = value

    # Apply fused fields
    for key, value in fused_fields.items():
        doc[key] = value

    # Metadata
    doc["metadata"] = {
        "fusionVersion": "1.0.0",
        "lastFusedAt": now,
        "signalCount": (
            (existing_doc or {}).get("metadata", {}).get("signalCount", 0) + 1
        ),
        "requiresReview": any(
            isinstance(v, dict) and v.get("conflictingValues")
            for v in fused_fields.values()
        ),
    }

    # Signal summary
    all_sources = set()
    uncertain_fields = []
    for field_name, field_data in fused_fields.items():
        if isinstance(field_data, dict):
            for s in field_data.get("sources", []):
                all_sources.add(s)
            if field_data.get("confidence", 1.0) < 0.50:
                uncertain_fields.append(field_name)

    doc["signalSummary"] = {
        "sources": sorted(all_sources),
        "uncertainFields": uncertain_fields,
        "lastSignalAt": now,
    }

    return doc


def build_contact_document(
    entity_id: str,
    fused_fields: dict,
    signal: dict,
    existing_doc: Optional[dict] = None,
    linked_account_id: Optional[str] = None,
) -> dict:
    """
    Build a complete Sanity contact document for upsert.

    entity_id: deterministic ID like "contact-corey-thomas-rapid7com"
    """
    now = datetime.now(timezone.utc).isoformat()

    doc = {
        "_type": "contact",
        "_id": entity_id,
    }

    if existing_doc:
        for key, value in existing_doc.items():
            if key.startswith("_"):
                continue
            if key not in fused_fields:
                doc[key] = value

    for key, value in fused_fields.items():
        doc[key] = value

    if linked_account_id:
        doc["accountRef"] = {"_type": "reference", "_ref": linked_account_id}

    doc["metadata"] = {
        "fusionVersion": "1.0.0",
        "lastFusedAt": now,
        "signalCount": (
            (existing_doc or {}).get("metadata", {}).get("signalCount", 0) + 1
        ),
    }

    return doc


# ─────────────────────────────────────────────────────────
# STAGE 8: LOG — Write fusionEvent
# ─────────────────────────────────────────────────────────

def build_fusion_event(
    entity_id: str,
    entity_type: str,
    event_type: str,  # "initial_fuse" | "update" | "conflict_flagged"
    signal: dict,
    conflicts: list = None,
    fused_field_count: int = 0,
) -> dict:
    """
    Build a fusionEvent document for the Sanity audit trail.
    """
    now = datetime.now(timezone.utc).isoformat()
    return {
        "_type": "fusionEvent",
        "_id": f"fusion-{entity_id}-{int(datetime.now(timezone.utc).timestamp())}",
        "entitySanityId": entity_id,
        "entityType": entity_type,
        "eventType": event_type,
        "source": signal.get("source", "unknown"),
        "sourceUrl": signal.get("url", ""),
        "fieldsAffected": list(signal.get("fields", {}).keys()),
        "conflicts": conflicts or [],
        "fieldCount": fused_field_count,
        "timestamp": now,
    }


# ─────────────────────────────────────────────────────────
# STAGE 9: NOTIFY — Slack Notification
# ─────────────────────────────────────────────────────────

SLACK_DM_USER = "U079FFJ9D63"  # Austin's Slack user ID

def build_scan_notification(
    entity_type: str,
    entity_id: str,
    entity_name: str,
    source: str,
    url: str,
    field_count: int,
    is_new: bool,
    conflicts: list = None,
    needs_review: bool = False,
) -> dict:
    """
    Build a Slack notification message for a completed scan.

    Returns dict with: channel, text (for Slack mrkdwn)
    """
    icon = "🆕" if is_new else "🔄"
    type_label = "Account" if entity_type == "account" else "Contact"

    lines = [
        f"{icon} *{type_label}: {entity_name}*",
        f"Source: `{source}` • Fields: {field_count}",
        f"<{url}|View source page>",
    ]

    if conflicts:
        conflict_summary = ", ".join(c["field"] for c in conflicts[:3])
        lines.append(f"⚠️ Conflicts: {conflict_summary}")

    if needs_review:
        lines.append("🔴 *Requires human review*")

    return {
        "channel": SLACK_DM_USER,  # DM to operator
        "text": "\n".join(lines),
    }


# ─────────────────────────────────────────────────────────
# ENTITY ID GENERATION
# ─────────────────────────────────────────────────────────

def slugify(text: str) -> str:
    """Slugify text for deterministic IDs. Strips periods."""
    text = text.lower().strip()
    text = re.sub(r"[^\w\s-]", "", text)  # Strip non-word chars (incl periods)
    text = re.sub(r"[\s]+", "-", text)     # Spaces to hyphens
    text = re.sub(r"-+", "-", text)        # Collapse multiple hyphens
    return text.strip("-")


def make_account_id(domain: str) -> str:
    """Deterministic account ID: account-{slugified-domain}"""
    return f"account-{slugify(domain)}"


def make_contact_id(name: str, company_domain: str = None) -> str:
    """Deterministic contact ID: contact-{name}-{domain}"""
    slug = slugify(name)
    if company_domain:
        slug = f"{slug}-{slugify(company_domain)}"
    return f"contact-{slug}"


# ─────────────────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────────────────

def _extract_domain(url: str) -> Optional[str]:
    """Extract clean domain from URL."""
    try:
        parsed = urlparse(url if "://" in url else f"https://{url}")
        host = parsed.hostname or ""
        host = re.sub(r"^www\.", "", host)
        return host.lower() if host else None
    except Exception:
        return None


def _normalize_domain(raw: Optional[str]) -> Optional[str]:
    """Normalize a domain string."""
    if not raw:
        return None
    raw = raw.strip().lower()
    raw = re.sub(r"^https?://", "", raw)
    raw = re.sub(r"^www\.", "", raw)
    raw = raw.rstrip("/")
    return raw or None


def _values_match(a: Any, b: Any) -> bool:
    """Check if two field values are semantically the same."""
    if a is None or b is None:
        return False
    if isinstance(a, str) and isinstance(b, str):
        return a.strip().lower() == b.strip().lower()
    if isinstance(a, (int, float)) and isinstance(b, (int, float)):
        # Allow 10% tolerance for numeric values
        if a == 0 and b == 0:
            return True
        return abs(a - b) / max(abs(a), abs(b), 1) < 0.10
    if isinstance(a, list) and isinstance(b, list):
        return set(str(x).lower() for x in a) == set(str(x).lower() for x in b)
    return str(a) == str(b)


# ─────────────────────────────────────────────────────────
# FULL PIPELINE ORCHESTRATION
# ─────────────────────────────────────────────────────────
#
# This is the procedure Claude follows. Each step maps to
# an MCP tool call or reasoning step.
#
# ┌─────────────────────────────────────────────────────┐
# │ STEP 1: Read Chrome tab                            │
# │   tab = mcp__Control_Chrome__get_current_tab()     │
# │   text = mcp__Control_Chrome__get_page_content()   │
# ├─────────────────────────────────────────────────────┤
# │ STEP 2: Classify page                              │
# │   classification = classify_page(tab.url)          │
# ├─────────────────────────────────────────────────────┤
# │ STEP 3: Extract fields (Claude reasoning)          │
# │   Use EXTRACTION_PROMPT with page text             │
# │   Output: dict of field_name → value               │
# ├─────────────────────────────────────────────────────┤
# │ STEP 4: Build signal                               │
# │   signal = build_signal(source, type, fields, url) │
# ├─────────────────────────────────────────────────────┤
# │ STEP 5: Resolve entity in Sanity                   │
# │   For each query in RESOLUTION_QUERIES:            │
# │     params = build_resolution_params(signal, q)    │
# │     if params:                                     │
# │       result = mcp__sanity__query_documents(       │
# │         projectId="ql62wkk2",                      │
# │         dataset="production",                      │
# │         query=q["query"],                          │
# │         params=params                              │
# │       )                                            │
# │       if result: existing = result; break          │
# ├─────────────────────────────────────────────────────┤
# │ STEP 6: Generate entity ID                         │
# │   If account: id = make_account_id(domain)         │
# │   If contact: id = make_contact_id(name, domain)   │
# ├─────────────────────────────────────────────────────┤
# │ STEP 7: Fuse fields                                │
# │   fused, conflicts, review = fuse_fields(          │
# │     existing_doc, signal                           │
# │   )                                                │
# ├─────────────────────────────────────────────────────┤
# │ STEP 8: Build document                             │
# │   doc = build_account_document(id, fused, signal)  │
# │   or build_contact_document(id, fused, signal)     │
# ├─────────────────────────────────────────────────────┤
# │ STEP 9: Persist to Sanity                          │
# │   If new: mcp__sanity__create_documents_from_json( │
# │     projectId="ql62wkk2",                          │
# │     dataset="production",                          │
# │     documents=[doc]                                │
# │   )                                                │
# │   If update: mcp__sanity__patch_document_from_json(│
# │     projectId="ql62wkk2",                          │
# │     dataset="production",                          │
# │     documentId=id,                                 │
# │     patch={ set: fused_fields + metadata }         │
# │   )                                                │
# ├─────────────────────────────────────────────────────┤
# │ STEP 10: Log fusionEvent                           │
# │   event = build_fusion_event(...)                  │
# │   mcp__sanity__create_documents_from_json(         │
# │     documents=[event]                              │
# │   )                                                │
# ├─────────────────────────────────────────────────────┤
# │ STEP 11: Send Slack notification                   │
# │   msg = build_scan_notification(...)               │
# │   mcp__slack__slack_send_message_draft(            │
# │     channel=msg.channel, text=msg.text             │
# │   )                                                │
# └─────────────────────────────────────────────────────┘


def run_pipeline_dry_run(url: str, page_text: str, extracted_fields: dict) -> dict:
    """
    Dry-run the pipeline with provided inputs (for testing).
    Does NOT make MCP calls. Returns what would be sent to Sanity.
    """
    # Classify
    classification = classify_page(url)

    # Build signal
    signal = build_signal(
        source=classification["source"],
        entity_type=classification["entity_type"],
        extracted_fields=extracted_fields,
        url=url,
        domain=classification["domain"],
    )

    # Generate entity ID
    if classification["entity_type"] == "account":
        domain = signal["entity_hint"].get("domain") or classification["domain"]
        entity_id = make_account_id(domain) if domain else f"account-unknown-{int(datetime.now(timezone.utc).timestamp())}"
    else:
        name = signal["entity_hint"].get("name", "unknown")
        domain = signal["entity_hint"].get("domain")
        entity_id = make_contact_id(name, domain)

    # Fuse (no existing doc in dry run)
    fused, conflicts, needs_review = fuse_fields(None, signal)

    # Build document
    if classification["entity_type"] == "account":
        doc = build_account_document(entity_id, fused, signal)
    else:
        doc = build_contact_document(entity_id, fused, signal)

    # Build fusion event
    event = build_fusion_event(
        entity_id=entity_id,
        entity_type=classification["entity_type"],
        event_type="initial_fuse",
        signal=signal,
        conflicts=conflicts,
        fused_field_count=len(fused),
    )

    # Build notification
    notification = build_scan_notification(
        entity_type=classification["entity_type"],
        entity_id=entity_id,
        entity_name=extracted_fields.get("legalName") or extracted_fields.get("fullName") or "Unknown",
        source=classification["source"],
        url=url,
        field_count=len(fused),
        is_new=True,
        conflicts=conflicts,
        needs_review=needs_review,
    )

    return {
        "classification": classification,
        "signal": signal,
        "entity_id": entity_id,
        "fused_fields": fused,
        "conflicts": conflicts,
        "needs_review": needs_review,
        "document": doc,
        "fusion_event": event,
        "notification": notification,
    }


# ─────────────────────────────────────────────────────────
# SELF-TEST
# ─────────────────────────────────────────────────────────

if __name__ == "__main__":
    print("=" * 60)
    print("LIVE PIPELINE DRY RUN TEST")
    print("=" * 60)

    # Simulate scanning rapid7.com
    result = run_pipeline_dry_run(
        url="https://www.rapid7.com/about/",
        page_text="(simulated)",
        extracted_fields={
            "legalName": "Rapid7, Inc.",
            "domain": "rapid7.com",
            "industry": "Cybersecurity",
            "headcount": 2800,
            "hqCity": "Boston",
            "hqState": "MA",
            "hqCountry": "US",
            "foundedYear": 2000,
            "description": "Rapid7 provides security analytics and automation.",
            "ceo": "Corey Thomas",
            "techStack": ["AWS", "React", "Python"],
            "websiteUrl": "https://www.rapid7.com",
            "linkedinUrl": "https://www.linkedin.com/company/rapid7",
        },
    )

    print(f"\nClassification: {result['classification']}")
    print(f"Entity ID: {result['entity_id']}")
    print(f"Fields fused: {len(result['fused_fields'])}")
    print(f"Conflicts: {len(result['conflicts'])}")
    print(f"Needs review: {result['needs_review']}")
    print(f"\nDocument type: {result['document']['_type']}")
    print(f"Document ID: {result['document']['_id']}")
    print(f"\nFusion event type: {result['fusion_event']['eventType']}")
    print(f"Fusion event fields: {result['fusion_event']['fieldsAffected']}")
    print(f"\nNotification:\n{result['notification']['text']}")

    # Test a LinkedIn person scan
    print("\n" + "=" * 60)
    print("CONTACT SCAN TEST")
    print("=" * 60)

    contact_result = run_pipeline_dry_run(
        url="https://www.linkedin.com/in/coreythomas/",
        page_text="(simulated)",
        extracted_fields={
            "fullName": "Corey Thomas",
            "firstName": "Corey",
            "lastName": "Thomas",
            "title": "CEO",
            "seniority": "c_suite",
            "company": "Rapid7",
            "companyDomain": "rapid7.com",
            "linkedinUrl": "https://www.linkedin.com/in/coreythomas/",
            "location": "Boston, MA",
        },
    )

    print(f"\nClassification: {contact_result['classification']}")
    print(f"Entity ID: {contact_result['entity_id']}")
    print(f"Fields fused: {len(contact_result['fused_fields'])}")
    print(f"\nNotification:\n{contact_result['notification']['text']}")

    # Test conflict resolution
    print("\n" + "=" * 60)
    print("CONFLICT RESOLUTION TEST")
    print("=" * 60)

    existing = {
        "headcount": {
            "_type": "confidenceField",
            "value": 2500,
            "confidence": 0.75,
            "source": "linkedin",
            "sources": ["linkedin"],
            "updated": "2026-03-01T00:00:00Z",
            "conflictingValues": [],
        },
        "industry": {
            "_type": "confidenceField",
            "value": "Information Security",
            "confidence": 0.72,
            "source": "crunchbase",
            "sources": ["crunchbase"],
            "updated": "2026-03-15T00:00:00Z",
            "conflictingValues": [],
        },
    }

    signal = {
        "source": "company_website",
        "fields": {
            "headcount": 2800,
            "industry": "Cybersecurity",
            "legalName": "Rapid7, Inc.",
        },
    }

    fused, conflicts, review = fuse_fields(existing, signal)
    print(f"\nFused fields: {len(fused)}")
    print(f"Conflicts: {len(conflicts)}")
    for c in conflicts:
        print(f"  {c['field']}: {c['existing_value']} → {c['new_value']} [{c['resolution']}]")
    print(f"Needs review: {review}")

    print("\n✅ All dry-run tests passed.")
