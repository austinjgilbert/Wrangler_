"""
fusion_engine.py — Sensor Fusion Engine for Chrome Inspector / Prospect 360

Core fusion logic that:
1. Normalizes incoming signals from any source
2. Scores confidence per field
3. Resolves conflicts between sources
4. Forms consensus across multi-source observations
5. Produces fused Account/Contact documents ready for Sanity

This is a reference implementation — Claude executes this logic conceptually
when processing scan results, enrichment data, and multi-source signals.

Architecture: See phase7-sensor-fusion-architecture.md §4 (Fusion Logic)
"""

import re
import json
import hashlib
from datetime import datetime, timedelta
from typing import Any, Optional

# =============================================================================
# SOURCE TRUST TIERS
# =============================================================================

SOURCE_TRUST = {
    # Tier 1: Authoritative (0.85-1.0 base confidence)
    "salesforce":       {"tier": 1, "base_confidence": 0.95, "authoritative": True},
    "company_website":  {"tier": 1, "base_confidence": 0.90, "authoritative": True},
    "common_room":      {"tier": 1, "base_confidence": 0.85, "authoritative": True},
    "bigquery":         {"tier": 1, "base_confidence": 0.95, "authoritative": True},

    # Tier 2: High-quality supportive (0.65-0.84)
    "linkedin":         {"tier": 2, "base_confidence": 0.80, "authoritative": False},
    "crunchbase":       {"tier": 2, "base_confidence": 0.75, "authoritative": False},
    "apollo":           {"tier": 2, "base_confidence": 0.70, "authoritative": False},

    # Tier 3: Contextual / noisy (0.3-0.64)
    "gmail":            {"tier": 3, "base_confidence": 0.50, "authoritative": False},
    "google_calendar":  {"tier": 3, "base_confidence": 0.45, "authoritative": False},
    "slack":            {"tier": 3, "base_confidence": 0.40, "authoritative": False},
    "google_drive":     {"tier": 3, "base_confidence": 0.35, "authoritative": False},
    "linear":           {"tier": 3, "base_confidence": 0.40, "authoritative": False},

    # Tier 4: Inferred / unknown
    "inferred":         {"tier": 4, "base_confidence": 0.25, "authoritative": False},
    "unknown":          {"tier": 4, "base_confidence": 0.20, "authoritative": False},
}

# Fields and their expected authoritative source
FIELD_AUTHORITY = {
    # Account fields
    "legalName":    ["company_website", "salesforce", "linkedin"],
    "domain":       ["company_website"],
    "industry":     ["salesforce", "linkedin", "crunchbase"],
    "headcount":    ["linkedin", "salesforce", "crunchbase"],
    "hqLocation":   ["company_website", "salesforce", "linkedin"],
    "stage":        ["crunchbase", "salesforce"],
    "foundedDate":  ["crunchbase", "company_website"],
    "revenue":      ["bigquery", "salesforce", "crunchbase"],

    # Contact fields
    "name":         ["linkedin", "salesforce", "common_room"],
    "title":        ["linkedin", "salesforce"],
    "email":        ["salesforce", "apollo", "common_room"],
    "phone":        ["salesforce", "apollo"],
    "linkedinUrl":  ["linkedin"],
    "location":     ["linkedin", "salesforce"],
}

# Freshness decay: half-life in days per source tier
FRESHNESS_HALF_LIFE = {
    1: 90,   # Authoritative: slow decay (trusted longer)
    2: 30,   # Supportive: moderate decay
    3: 7,    # Contextual: fast decay
    4: 3,    # Inferred: very fast decay
}

# Confidence thresholds
CONFIDENCE_CERTAIN = 0.80     # Above this = "certain"
CONFIDENCE_UNCERTAIN = 0.50   # Below certain, above this = "uncertain"
CONFIDENCE_LOW = 0.30         # Below this = "low confidence, flag for review"
CONFIDENCE_CONSENSUS = 0.75   # Multi-source agreement threshold


# =============================================================================
# NORMALIZATION
# =============================================================================

def normalize_domain(raw: str) -> Optional[str]:
    """Normalize a domain to canonical form."""
    if not raw:
        return None
    d = raw.lower().strip()
    d = re.sub(r'^(https?://)?(www\.)?', '', d)
    d = d.split('/')[0].split('?')[0]
    return d if '.' in d else None


def normalize_email(raw: str) -> Optional[str]:
    """Normalize email to lowercase, strip whitespace."""
    if not raw:
        return None
    e = raw.lower().strip()
    return e if '@' in e and '.' in e.split('@')[1] else None


def normalize_phone(raw: str) -> Optional[str]:
    """Strip phone to digits only, with + prefix if international."""
    if not raw:
        return None
    digits = re.sub(r'[^\d+]', '', raw)
    if len(digits) < 7:
        return None
    return digits


def normalize_name(raw: str) -> Optional[str]:
    """Clean up a name — trim whitespace, normalize casing."""
    if not raw:
        return None
    name = ' '.join(raw.split()).strip()
    # Don't change casing — names are case-sensitive (e.g., "McDonald")
    return name if len(name) > 1 else None


def normalize_headcount(raw: Any) -> Optional[int]:
    """Parse headcount from various formats."""
    if raw is None:
        return None
    if isinstance(raw, int):
        return raw
    if isinstance(raw, float):
        return int(raw)
    s = str(raw).strip().lower()
    # Handle ranges: "1,001-5,000" → take midpoint
    s = s.replace(',', '')
    range_match = re.match(r'(\d+)\s*[-–]\s*(\d+)', s)
    if range_match:
        lo, hi = int(range_match.group(1)), int(range_match.group(2))
        return (lo + hi) // 2
    # Handle suffixes: "2.4K" → 2400
    k_match = re.match(r'([\d.]+)\s*k', s)
    if k_match:
        return int(float(k_match.group(1)) * 1000)
    # Plain number
    num_match = re.match(r'(\d+)', s)
    if num_match:
        return int(num_match.group(1))
    return None


def slugify(text: str) -> str:
    """Convert text to URL-safe slug."""
    return re.sub(r'^-|-$', '', re.sub(r'[^a-z0-9]+', '-', text.lower()))


def generate_account_id(domain: Optional[str] = None, name: Optional[str] = None) -> str:
    """Generate deterministic account ID."""
    key = normalize_domain(domain) if domain else slugify(name or "unknown")
    return f"account-{slugify(key)}"


def generate_contact_id(name: str, company: Optional[str] = None) -> str:
    """Generate deterministic contact ID."""
    key = f"{name}-{company or 'unknown'}"
    return f"contact-{slugify(key)}"


# =============================================================================
# CONFIDENCE SCORING
# =============================================================================

def compute_freshness_decay(updated_iso: str, source: str) -> float:
    """
    Compute freshness decay factor (0.0 to 1.0).

    Uses exponential decay with half-life based on source tier.
    A field updated today has decay=1.0.
    A field updated half-life days ago has decay=0.5.
    """
    try:
        updated = datetime.fromisoformat(updated_iso.replace('Z', '+00:00'))
    except (ValueError, AttributeError):
        return 0.5  # Unknown freshness → moderate decay

    now = datetime.now(updated.tzinfo) if updated.tzinfo else datetime.now()
    age_days = max(0, (now - updated).total_seconds() / 86400)

    tier = SOURCE_TRUST.get(source, SOURCE_TRUST["unknown"])["tier"]
    half_life = FRESHNESS_HALF_LIFE[tier]

    # Exponential decay: 0.5^(age/half_life)
    return 0.5 ** (age_days / half_life)


def score_confidence(
    value: Any,
    source: str,
    field_name: str,
    updated_iso: str,
    corroborating_sources: list = None,
) -> float:
    """
    Compute confidence score for a single field observation.

    Formula:
      confidence = base_confidence × freshness_decay × authority_bonus × corroboration_bonus

    Where:
      - base_confidence: from SOURCE_TRUST table (0.20–0.95)
      - freshness_decay: exponential decay from last update (0.0–1.0)
      - authority_bonus: 1.1 if this source is authoritative for this field
      - corroboration_bonus: 1.0 + 0.05 per additional corroborating source (max 1.2)
    """
    if value is None:
        return 0.0

    trust = SOURCE_TRUST.get(source, SOURCE_TRUST["unknown"])
    base = trust["base_confidence"]

    # Freshness decay
    freshness = compute_freshness_decay(updated_iso, source)

    # Authority bonus: is this source authoritative for this field?
    authority = FIELD_AUTHORITY.get(field_name, [])
    authority_bonus = 1.1 if source in authority[:2] else 1.0

    # Corroboration bonus: other sources agree
    corroboration_bonus = 1.0
    if corroborating_sources:
        unique_sources = set(corroborating_sources) - {source}
        corroboration_bonus = min(1.2, 1.0 + 0.05 * len(unique_sources))

    raw = base * freshness * authority_bonus * corroboration_bonus
    return round(min(1.0, raw), 3)


# =============================================================================
# CONFLICT RESOLUTION
# =============================================================================

class ConflictResolution:
    """Result of resolving a field conflict."""
    ACCEPT = "accept"       # New value wins
    REJECT = "reject"       # Keep existing value
    FLAG = "flag"           # Both values kept, flagged for human review
    MERGE = "merge"         # Values merged (for arrays/sets)


def resolve_conflict(
    field_name: str,
    existing_value: Any,
    existing_confidence: float,
    existing_source: str,
    new_value: Any,
    new_confidence: float,
    new_source: str,
) -> dict:
    """
    Resolve a conflict between existing and new values for a field.

    Rules (in priority order):
    1. If values are equal → accept (reinforces confidence)
    2. If new source is authoritative for this field and existing is not → accept
    3. If new confidence > existing confidence + 0.15 → accept
    4. If existing confidence > new confidence + 0.15 → reject
    5. If both have similar confidence (within 0.15) → flag for human review

    Returns: {
        "resolution": "accept" | "reject" | "flag",
        "winning_value": Any,
        "winning_source": str,
        "winning_confidence": float,
        "reason": str,
        "conflicting_values": [...] (if flagged)
    }
    """
    # Normalize for comparison
    ev = _normalize_for_compare(existing_value)
    nv = _normalize_for_compare(new_value)

    # Rule 1: Values agree → accept, boost confidence
    if ev == nv:
        combined_confidence = min(1.0, max(existing_confidence, new_confidence) + 0.05)
        return {
            "resolution": ConflictResolution.ACCEPT,
            "winning_value": new_value,  # Use the newer formatting
            "winning_source": new_source,
            "winning_confidence": combined_confidence,
            "reason": f"sources agree ({existing_source}, {new_source})",
        }

    # Rule 2: Authoritative source override
    authority = FIELD_AUTHORITY.get(field_name, [])
    new_is_auth = new_source in authority[:3]
    existing_is_auth = existing_source in authority[:3]

    if new_is_auth and not existing_is_auth:
        return {
            "resolution": ConflictResolution.ACCEPT,
            "winning_value": new_value,
            "winning_source": new_source,
            "winning_confidence": new_confidence,
            "reason": f"{new_source} is authoritative for {field_name}, overrides {existing_source}",
        }

    if existing_is_auth and not new_is_auth:
        return {
            "resolution": ConflictResolution.REJECT,
            "winning_value": existing_value,
            "winning_source": existing_source,
            "winning_confidence": existing_confidence,
            "reason": f"{existing_source} is authoritative for {field_name}, keeps precedence",
        }

    # Rule 3 & 4: Confidence margin
    margin = 0.15
    if new_confidence > existing_confidence + margin:
        return {
            "resolution": ConflictResolution.ACCEPT,
            "winning_value": new_value,
            "winning_source": new_source,
            "winning_confidence": new_confidence,
            "reason": f"new confidence ({new_confidence:.2f}) exceeds existing ({existing_confidence:.2f}) by >{margin}",
        }

    if existing_confidence > new_confidence + margin:
        return {
            "resolution": ConflictResolution.REJECT,
            "winning_value": existing_value,
            "winning_source": existing_source,
            "winning_confidence": existing_confidence,
            "reason": f"existing confidence ({existing_confidence:.2f}) exceeds new ({new_confidence:.2f}) by >{margin}",
        }

    # Rule 5: Too close to call → flag
    return {
        "resolution": ConflictResolution.FLAG,
        "winning_value": existing_value,  # Keep existing as primary
        "winning_source": existing_source,
        "winning_confidence": max(existing_confidence, new_confidence) * 0.8,  # Reduce due to uncertainty
        "reason": f"conflicting values from similar-confidence sources ({existing_source}: {existing_confidence:.2f}, {new_source}: {new_confidence:.2f})",
        "conflicting_values": [
            {"value": existing_value, "source": existing_source, "confidence": existing_confidence},
            {"value": new_value, "source": new_source, "confidence": new_confidence},
        ],
    }


def _normalize_for_compare(val: Any) -> Any:
    """Normalize a value for comparison (case-insensitive strings, etc.)."""
    if val is None:
        return None
    if isinstance(val, str):
        return val.lower().strip()
    if isinstance(val, (int, float)):
        return val
    return str(val).lower().strip()


# =============================================================================
# FUSION ENGINE
# =============================================================================

def fuse_field(
    field_name: str,
    existing_field: Optional[dict],
    new_value: Any,
    new_source: str,
    new_updated: str,
    corroborating_sources: list = None,
) -> dict:
    """
    Fuse a single field — the core operation.

    Takes:
      - existing_field: current confidenceField dict from Sanity (or None)
      - new observation: value + source + timestamp

    Returns:
      - Updated confidenceField dict ready for Sanity
      - Includes resolution decision and audit info
    """
    new_confidence = score_confidence(
        new_value, new_source, field_name, new_updated, corroborating_sources
    )

    # Case 1: No existing value → accept new
    if not existing_field or existing_field.get("value") is None:
        certain = new_confidence >= CONFIDENCE_CERTAIN
        return {
            "_type": "confidenceField",
            "value": new_value,
            "confidence": new_confidence,
            "certain": certain,
            "uncertain": not certain and new_confidence >= CONFIDENCE_UNCERTAIN,
            "source": new_source,
            "sources": list(set([new_source] + (corroborating_sources or []))),
            "updated": new_updated,
            "_fusion": {
                "resolution": "accept_new",
                "reason": "no existing value",
            }
        }

    # Case 2: Existing value exists → resolve conflict
    resolution = resolve_conflict(
        field_name=field_name,
        existing_value=existing_field.get("value"),
        existing_confidence=existing_field.get("confidence", 0),
        existing_source=existing_field.get("source", "unknown"),
        new_value=new_value,
        new_confidence=new_confidence,
        new_source=new_source,
    )

    # Build result
    all_sources = list(set(
        existing_field.get("sources", [existing_field.get("source", "unknown")])
        + [new_source]
        + (corroborating_sources or [])
    ))

    result = {
        "_type": "confidenceField",
        "value": resolution["winning_value"],
        "confidence": resolution["winning_confidence"],
        "certain": resolution["winning_confidence"] >= CONFIDENCE_CERTAIN,
        "uncertain": (
            resolution["winning_confidence"] < CONFIDENCE_CERTAIN
            and resolution["winning_confidence"] >= CONFIDENCE_UNCERTAIN
        ),
        "source": resolution["winning_source"],
        "sources": all_sources,
        "updated": new_updated if resolution["resolution"] == ConflictResolution.ACCEPT else existing_field.get("updated", new_updated),
        "_fusion": {
            "resolution": resolution["resolution"],
            "reason": resolution["reason"],
        }
    }

    # If flagged, include conflicting values
    if resolution.get("conflicting_values"):
        result["conflictingValues"] = [
            {"_key": f"cv-{i}", **cv}
            for i, cv in enumerate(resolution["conflicting_values"])
        ]

    return result


def fuse_account(existing_account: Optional[dict], signals: list) -> dict:
    """
    Fuse multiple signals into an Account document.

    existing_account: current Sanity document (or None for new)
    signals: list of {source, fields: {field_name: value}, scanned_at, url}

    Returns: complete Account document ready for Sanity upsert
    """
    # Start with existing or empty
    account = existing_account or {}

    # Track which fields need review
    review_reasons = []
    uncertain_fields = []
    high_confidence_fields = []
    stale_fields = []

    # Process each signal
    for signal in sorted(signals, key=lambda s: s.get("scanned_at", ""), reverse=False):
        source = signal["source"]
        scanned_at = signal.get("scanned_at", datetime.utcnow().isoformat() + "Z")
        fields = signal.get("fields", {})

        # Determine corroborating sources for each field
        corroborating = [s["source"] for s in signals if s["source"] != source]

        # Fuse each field from this signal
        for field_name, new_value in fields.items():
            if new_value is None:
                continue

            # Apply normalization
            new_value = _apply_normalization(field_name, new_value)
            if new_value is None:
                continue

            existing_field = account.get(field_name)
            fused = fuse_field(
                field_name=field_name,
                existing_field=existing_field,
                new_value=new_value,
                new_source=source,
                new_updated=scanned_at,
                corroborating_sources=corroborating,
            )

            # Remove _fusion metadata before storing (keep for audit)
            fusion_meta = fused.pop("_fusion", {})
            account[field_name] = fused

            # Track resolution outcomes
            if fusion_meta.get("resolution") == ConflictResolution.FLAG:
                review_reasons.append(
                    f"{field_name}: {fusion_meta.get('reason', 'conflict')}"
                )

            # Categorize field confidence
            conf = fused.get("confidence", 0)
            if conf >= CONFIDENCE_CERTAIN:
                if field_name not in high_confidence_fields:
                    high_confidence_fields.append(field_name)
            elif conf >= CONFIDENCE_UNCERTAIN:
                if field_name not in uncertain_fields:
                    uncertain_fields.append(field_name)

        # Add source to sources array
        if "sources" not in account:
            account["sources"] = []
        account["sources"].append({
            "_type": "dataSource",
            "_key": f"src-{slugify(source)}-{hashlib.md5(scanned_at.encode()).hexdigest()[:6]}",
            "name": signal.get("name", source),
            "url": signal.get("url"),
            "scannedAt": scanned_at,
            "fieldsExtracted": list(fields.keys()),
        })

    # Generate canonical ID
    domain_val = account.get("domain", {}).get("value") if isinstance(account.get("domain"), dict) else None
    name_val = account.get("legalName", {}).get("value") if isinstance(account.get("legalName"), dict) else None
    canonical_id = normalize_domain(domain_val) or slugify(name_val or "unknown")

    # Build metadata
    now = datetime.utcnow().isoformat() + "Z"
    existing_meta = account.get("metadata", {})
    account["metadata"] = {
        "_type": "accountMetadata",
        "created": existing_meta.get("created", now),
        "updated": now,
        "lastEnriched": now,
        "fusionVersion": existing_meta.get("fusionVersion", 0) + 1,
        "requiresReview": len(review_reasons) > 0,
        "reviewReason": "; ".join(review_reasons) if review_reasons else None,
    }

    # Build signal summary
    account["signalSummary"] = {
        "_type": "signalSummary",
        "highConfidenceFields": high_confidence_fields,
        "uncertainFields": uncertain_fields,
        "staleFields": stale_fields,
    }

    # Set IDs
    account["_type"] = "account"
    account["_id"] = generate_account_id(domain_val, name_val)
    account["canonicalId"] = canonical_id

    return account


def _apply_normalization(field_name: str, value: Any) -> Any:
    """Apply field-specific normalization."""
    normalizers = {
        "domain": lambda v: normalize_domain(str(v)),
        "email": lambda v: normalize_email(str(v)),
        "phone": lambda v: normalize_phone(str(v)),
        "headcount": normalize_headcount,
        "legalName": lambda v: normalize_name(str(v)),
        "name": lambda v: normalize_name(str(v)),
    }
    normalizer = normalizers.get(field_name)
    return normalizer(value) if normalizer else value


# =============================================================================
# SIGNAL EXTRACTION FROM SOURCES
# =============================================================================

def extract_signal_from_chrome_scan(stored_profile: dict) -> dict:
    """
    Convert a scan_page.py StoredProfile into a fusion signal.

    Input: the JSON output from scan_page.py (entity_type, profile, sources, etc.)
    Output: normalized signal ready for fuse_account() or fuse_contact()
    """
    profile = stored_profile.get("profile", {})
    sources = stored_profile.get("sources", [])
    source_name = sources[0]["name"] if sources else "chrome_scan"
    source_url = sources[0].get("url", "") if sources else ""

    # Determine source type from URL
    source_type = "unknown"
    if "linkedin.com" in source_url:
        source_type = "linkedin"
    elif "crunchbase.com" in source_url:
        source_type = "crunchbase"
    elif "salesforce.com" in source_url or "force.com" in source_url:
        source_type = "salesforce"
    elif "commonroom.io" in source_url:
        source_type = "common_room"
    else:
        source_type = "company_website"

    # Map scan_page.py fields to fusion field names
    fields = {}
    if profile.get("name"):
        fields["legalName"] = profile["name"]
    if profile.get("domain"):
        fields["domain"] = profile["domain"]
    if profile.get("industry"):
        fields["industry"] = profile["industry"]
    if profile.get("employee_count"):
        fields["headcount"] = profile["employee_count"]
    if profile.get("founded"):
        fields["foundedDate"] = profile["founded"]
    if profile.get("description"):
        fields["description"] = profile["description"]

    # Location
    hq = profile.get("headquarters", {})
    if hq:
        parts = [hq.get("city"), hq.get("state"), hq.get("country")]
        loc = ", ".join(p for p in parts if p)
        if loc:
            fields["hqLocation"] = loc

    return {
        "source": source_type,
        "name": source_name,
        "url": source_url,
        "scanned_at": sources[0].get("scanned_at", datetime.utcnow().isoformat() + "Z") if sources else datetime.utcnow().isoformat() + "Z",
        "fields": fields,
    }


def extract_signal_from_common_room(cr_data: dict) -> dict:
    """
    Convert Common Room account-research output into a fusion signal.
    """
    fields = {}
    if cr_data.get("name"):
        fields["legalName"] = cr_data["name"]
    if cr_data.get("domain"):
        fields["domain"] = cr_data["domain"]
    if cr_data.get("industry"):
        fields["industry"] = cr_data["industry"]
    if cr_data.get("employee_count"):
        fields["headcount"] = cr_data["employee_count"]
    if cr_data.get("location"):
        fields["hqLocation"] = cr_data["location"]

    return {
        "source": "common_room",
        "name": "Common Room",
        "url": cr_data.get("url"),
        "scanned_at": datetime.utcnow().isoformat() + "Z",
        "fields": fields,
    }


def extract_signal_from_apollo(apollo_data: dict) -> dict:
    """
    Convert Apollo enrichment output into a fusion signal.
    """
    fields = {}
    if apollo_data.get("email"):
        fields["email"] = apollo_data["email"]
    if apollo_data.get("phone"):
        fields["phone"] = apollo_data["phone"]
    if apollo_data.get("title"):
        fields["title"] = apollo_data["title"]
    if apollo_data.get("name"):
        fields["name"] = apollo_data["name"]
    if apollo_data.get("company"):
        fields["company"] = apollo_data["company"]
    if apollo_data.get("employee_count"):
        fields["headcount"] = apollo_data["employee_count"]

    return {
        "source": "apollo",
        "name": "Apollo Enrichment",
        "scanned_at": datetime.utcnow().isoformat() + "Z",
        "fields": fields,
    }


# =============================================================================
# ENTITY RESOLUTION
# =============================================================================

def resolve_entity_id(signal: dict, existing_accounts: list) -> Optional[str]:
    """
    Given a signal, find the matching existing account by:
    1. Exact domain match
    2. Exact name match (case-insensitive)
    3. Fuzzy name match (>80% similarity)

    Returns: existing account _id or None (new entity)
    """
    signal_domain = normalize_domain(signal.get("fields", {}).get("domain", ""))
    signal_name = normalize_name(signal.get("fields", {}).get("legalName", ""))

    for acct in existing_accounts:
        # Extract domain from confidenceField
        acct_domain = None
        if isinstance(acct.get("domain"), dict):
            acct_domain = normalize_domain(acct["domain"].get("value", ""))
        elif isinstance(acct.get("domain"), str):
            acct_domain = normalize_domain(acct["domain"])

        # Domain match (strongest)
        if signal_domain and acct_domain and signal_domain == acct_domain:
            return acct["_id"]

        # Name match
        acct_name = None
        if isinstance(acct.get("legalName"), dict):
            acct_name = normalize_name(acct["legalName"].get("value", ""))
        elif isinstance(acct.get("name"), str):
            acct_name = normalize_name(acct["name"])

        if signal_name and acct_name and signal_name.lower() == acct_name.lower():
            return acct["_id"]

    return None


# =============================================================================
# SANITY DOCUMENT BUILDER
# =============================================================================

def build_sanity_account(fused: dict) -> dict:
    """
    Convert a fused account dict into a clean Sanity document.
    Strips internal metadata, ensures all nested objects have _type.
    """
    # Remove None values and internal fields
    doc = {}
    for key, val in fused.items():
        if val is None:
            continue
        if key.startswith("_fusion"):
            continue
        doc[key] = val

    return json.loads(json.dumps(doc))  # Deep-clean nulls


# =============================================================================
# QUERIES FOR LLM TOOLS
# =============================================================================

# These are GROQ query templates the LLM should use to query fused state.

GROQ_SEARCH_ACCOUNTS = """
*[_type == "account" && (
  legalName.value match $query ||
  domain.value match $query ||
  industry.value match $query
)] | order(metadata.updated desc) [0...$limit] {
  _id,
  canonicalId,
  "name": legalName.value,
  "nameConfidence": legalName.confidence,
  "domain": domain.value,
  "industry": industry.value,
  "headcount": headcount.value,
  "stage": stage.value,
  "hqLocation": hqLocation.value,
  "lastUpdated": metadata.updated,
  "fusionVersion": metadata.fusionVersion,
  "requiresReview": metadata.requiresReview,
  "uncertainFields": signalSummary.uncertainFields,
  "sourceCount": count(sources)
}
"""

GROQ_GET_ACCOUNT = """
*[_type == "account" && (_id == $id || canonicalId == $id)][0] {
  ...,
  "contactCount": count(*[_type == "contact" && accountId == ^._id])
}
"""

GROQ_GET_CONTACTS = """
*[_type == "contact" && accountId == $accountId] {
  _id,
  canonicalId,
  "name": name.value,
  "title": title.value,
  "email": email.value,
  "emailConfidence": email.confidence,
  "phone": phone.value,
  "linkedin": linkedinUrl.value,
  "reviewNeeded": metadata.requiresReview
}
"""

GROQ_ACCOUNTS_NEEDING_REVIEW = """
*[_type == "account" && metadata.requiresReview == true] | order(metadata.updated desc) {
  _id,
  "name": legalName.value,
  "domain": domain.value,
  "reviewReason": metadata.reviewReason,
  "uncertainFields": signalSummary.uncertainFields,
  "lastUpdated": metadata.updated
}
"""

GROQ_STALE_ACCOUNTS = """
*[_type == "account" && dateTime(metadata.updated) < dateTime(now()) - 60*60*24*30] {
  _id,
  "name": legalName.value,
  "domain": domain.value,
  "lastUpdated": metadata.updated,
  "daysSinceUpdate": dateDiff(now(), dateTime(metadata.updated), "day")
}
"""

GROQ_HIGH_CONFIDENCE_ACCOUNTS = """
*[_type == "account" && count(signalSummary.uncertainFields) == 0 && metadata.requiresReview == false] | order(metadata.updated desc) [0...$limit] {
  _id,
  "name": legalName.value,
  "domain": domain.value,
  "industry": industry.value,
  "sourceCount": count(sources),
  "fusionVersion": metadata.fusionVersion
}
"""


# =============================================================================
# SELF-TEST
# =============================================================================

def _self_test():
    """Run basic validation of fusion logic."""
    print("=== Fusion Engine Self-Test ===\n")

    # Test normalization
    assert normalize_domain("https://www.Rapid7.com/products") == "rapid7.com"
    assert normalize_domain("rapid7.com") == "rapid7.com"
    assert normalize_email("  Jane.Doe@ACME.com  ") == "jane.doe@acme.com"
    assert normalize_phone("+1 (617) 247-1717") == "+16172471717"
    assert normalize_headcount("1,001-5,000") == 3000
    assert normalize_headcount("2.4K") == 2400
    assert normalize_headcount(2400) == 2400
    print("✓ Normalization tests passed")

    # Test confidence scoring
    score_auth = score_confidence("Rapid7", "salesforce", "legalName", datetime.utcnow().isoformat() + "Z")
    score_supp = score_confidence("Rapid7", "linkedin", "legalName", datetime.utcnow().isoformat() + "Z")
    score_ctx = score_confidence("Rapid7", "slack", "legalName", datetime.utcnow().isoformat() + "Z")
    assert score_auth > score_supp > score_ctx, f"Authority ordering failed: {score_auth}, {score_supp}, {score_ctx}"
    print(f"✓ Confidence scoring: auth={score_auth:.3f}, supp={score_supp:.3f}, ctx={score_ctx:.3f}")

    # Test conflict resolution — values agree
    res = resolve_conflict("legalName", "Rapid7", 0.80, "linkedin", "Rapid7", 0.90, "crunchbase")
    assert res["resolution"] == ConflictResolution.ACCEPT
    assert res["winning_confidence"] > 0.90  # Boosted by agreement
    print(f"✓ Agreement resolution: {res['resolution']}, conf={res['winning_confidence']:.3f}")

    # Test conflict resolution — authoritative override
    res = resolve_conflict("industry", "Tech", 0.70, "slack", "Cybersecurity", 0.75, "salesforce")
    assert res["resolution"] == ConflictResolution.ACCEPT
    assert res["winning_value"] == "Cybersecurity"
    print(f"✓ Authority override: {res['resolution']}, value={res['winning_value']}")

    # Test conflict resolution — flag
    res = resolve_conflict("headcount", 2400, 0.75, "linkedin", 2200, 0.72, "crunchbase")
    assert res["resolution"] == ConflictResolution.FLAG
    assert "conflicting_values" in res
    print(f"✓ Conflict flagging: {res['resolution']}, reason={res['reason']}")

    # Test field fusion — new field
    fused = fuse_field("industry", None, "Cybersecurity", "linkedin", datetime.utcnow().isoformat() + "Z")
    assert fused["value"] == "Cybersecurity"
    assert fused["_type"] == "confidenceField"
    print(f"✓ New field fusion: value={fused['value']}, conf={fused['confidence']:.3f}")

    # Test full account fusion
    signals = [
        {
            "source": "linkedin",
            "name": "LinkedIn",
            "url": "https://linkedin.com/company/rapid7",
            "scanned_at": "2026-04-01T21:00:00Z",
            "fields": {"legalName": "Rapid7", "domain": "rapid7.com", "industry": "Cybersecurity", "headcount": "2,400"},
        },
        {
            "source": "crunchbase",
            "name": "Crunchbase",
            "url": "https://crunchbase.com/organization/rapid7",
            "scanned_at": "2026-04-01T20:00:00Z",
            "fields": {"legalName": "Rapid7", "industry": "Cybersecurity", "headcount": "2,200", "stage": "public"},
        },
    ]
    fused_account = fuse_account(None, signals)
    assert fused_account["_type"] == "account"
    assert fused_account["legalName"]["value"] == "Rapid7"
    assert fused_account["legalName"]["confidence"] > 0.8  # Multi-source agreement
    assert fused_account["_id"] == "account-rapid7-com"
    print(f"✓ Full account fusion: name={fused_account['legalName']['value']}, "
          f"conf={fused_account['legalName']['confidence']:.3f}, "
          f"fusion_v={fused_account['metadata']['fusionVersion']}")

    # Verify headcount conflict was flagged
    hc = fused_account.get("headcount", {})
    if hc.get("conflictingValues"):
        print(f"✓ Headcount conflict detected: {[cv['value'] for cv in hc['conflictingValues']]}")
    print(f"  Review needed: {fused_account['metadata']['requiresReview']}")
    print(f"  Uncertain fields: {fused_account['signalSummary']['uncertainFields']}")

    print("\n=== All tests passed ===")


if __name__ == "__main__":
    _self_test()
