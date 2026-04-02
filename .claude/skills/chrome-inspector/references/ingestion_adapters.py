"""
Chrome Inspector — Ingestion Adapters
======================================
Transforms raw MCP tool output into standardized Signal dicts
that the fusion engine consumes.

Each adapter:
  1. Takes raw tool output (JSON/dict from an MCP call)
  2. Extracts relevant fields
  3. Normalizes values using fusion_engine normalizers
  4. Returns a Signal dict: { source, timestamp, entity_type, entity_hint, fields }

Signal schema:
  {
    "source": str,          # e.g. "linkedin", "salesforce", "apollo"
    "timestamp": str,       # ISO 8601 UTC
    "entity_type": str,     # "account" | "contact"
    "entity_hint": {        # For entity resolution
      "domain": str | None,
      "name": str | None,
      "email": str | None,
    },
    "fields": {             # Flat dict of field_name → raw_value
      "legalName": str,
      "domain": str,
      ...
    }
  }
"""

from datetime import datetime, timezone
from typing import Any, Optional
import re
import json


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _safe_get(data: dict, *keys, default=None):
    """Safely traverse nested dicts."""
    current = data
    for k in keys:
        if isinstance(current, dict):
            current = current.get(k, default)
        else:
            return default
    return current if current is not None else default


def _extract_domain(url: str) -> Optional[str]:
    """Extract clean domain from URL or email."""
    if not url:
        return None
    # From email
    if "@" in url:
        return url.split("@")[-1].lower().strip()
    # From URL
    url = url.lower().strip()
    url = re.sub(r"^https?://", "", url)
    url = re.sub(r"^www\.", "", url)
    url = url.split("/")[0].split("?")[0]
    return url if url else None


def _clean_string(val: Any) -> Optional[str]:
    if val is None:
        return None
    s = str(val).strip()
    return s if s else None


# ---------------------------------------------------------------------------
# 1. Chrome Scan Adapter (from scan_page.py output)
# ---------------------------------------------------------------------------

def from_chrome_scan(scan_result: dict) -> list[dict]:
    """
    Transform a Chrome Inspector scan result into signals.

    scan_result comes from scan_page.py and has shape:
    {
      "page_type": "linkedin_company" | "linkedin_person" | "crunchbase_org" | ...,
      "url": str,
      "extracted": { ... fields ... },
      "gaps": [...],
      "timestamp": str
    }

    Returns 1+ signals (usually 1, but a LinkedIn person page might
    yield both a contact signal and an account signal).
    """
    signals = []
    page_type = scan_result.get("page_type", "unknown")
    extracted = scan_result.get("extracted", {})
    url = scan_result.get("url", "")
    ts = scan_result.get("timestamp", _now_iso())

    # Determine source name from page type
    source_map = {
        "linkedin_company": "linkedin",
        "linkedin_person": "linkedin",
        "salesforce_account": "salesforce",
        "salesforce_contact": "salesforce",
        "crunchbase_org": "crunchbase",
        "company_website": "company_website",
        "common_room_account": "common_room",
        "common_room_person": "common_room",
    }
    source = source_map.get(page_type, "chrome_scan")

    # --- Company / Account pages ---
    if page_type in ("linkedin_company", "crunchbase_org", "company_website",
                      "salesforce_account", "common_room_account"):
        fields = {}
        field_map = {
            "name": "legalName",
            "company_name": "legalName",
            "description": "description",
            "industry": "industry",
            "employee_count": "headcount",
            "employees": "headcount",
            "headcount": "headcount",
            "headquarters": "hqCity",
            "hq": "hqCity",
            "location": "hqCity",
            "website": "websiteUrl",
            "domain": "domain",
            "url": "websiteUrl",
            "founded": "foundedYear",
            "founded_year": "foundedYear",
            "funding": "lastFundingRound",
            "funding_total": "totalFunding",
            "stage": "stage",
            "type": "accountType",
            "owner": "ownerName",
            "phone": "phone",
            "linkedin_url": "linkedinUrl",
            "annual_revenue": "annualRevenue",
            "revenue": "annualRevenue",
        }

        for raw_key, target_key in field_map.items():
            val = extracted.get(raw_key)
            if val is not None and val != "" and val != "N/A":
                fields[target_key] = val

        # Normalize domain: extract from URL if needed
        if "domain" in fields:
            fields["domain"] = _extract_domain(fields["domain"])
        if "domain" not in fields and "websiteUrl" in fields:
            fields["domain"] = _extract_domain(fields["websiteUrl"])
        if "domain" not in fields and url:
            # Try to infer domain from the scanned page URL for company websites
            if page_type == "company_website":
                fields["domain"] = _extract_domain(url)

        if fields:
            signals.append({
                "source": source,
                "timestamp": ts,
                "entity_type": "account",
                "entity_hint": {
                    "domain": fields.get("domain"),
                    "name": fields.get("legalName"),
                },
                "fields": fields,
            })

    # --- Person / Contact pages ---
    if page_type in ("linkedin_person", "salesforce_contact", "common_room_person"):
        fields = {}
        person_map = {
            "name": "fullName",
            "full_name": "fullName",
            "first_name": "firstName",
            "last_name": "lastName",
            "title": "jobTitle",
            "job_title": "jobTitle",
            "role": "jobTitle",
            "company": "companyName",
            "company_name": "companyName",
            "email": "email",
            "phone": "phone",
            "location": "location",
            "linkedin_url": "linkedinUrl",
            "bio": "bio",
            "headline": "headline",
            "department": "department",
        }

        for raw_key, target_key in person_map.items():
            val = extracted.get(raw_key)
            if val is not None and val != "" and val != "N/A":
                fields[target_key] = val

        # Split full name if first/last not provided
        if "fullName" in fields and "firstName" not in fields:
            parts = fields["fullName"].strip().split()
            if len(parts) >= 2:
                fields["firstName"] = parts[0]
                fields["lastName"] = " ".join(parts[1:])
            elif len(parts) == 1:
                fields["firstName"] = parts[0]

        if fields:
            # Entity hint for contacts includes company domain if available
            company = fields.get("companyName")
            email = fields.get("email")
            signals.append({
                "source": source,
                "timestamp": ts,
                "entity_type": "contact",
                "entity_hint": {
                    "name": fields.get("fullName"),
                    "email": email,
                    "domain": _extract_domain(email) if email else None,
                    "company": company,
                },
                "fields": fields,
            })

            # If we got company info from a person page, also emit an account signal
            if company:
                account_fields = {"legalName": company}
                if email:
                    account_fields["domain"] = _extract_domain(email)
                signals.append({
                    "source": source,
                    "timestamp": ts,
                    "entity_type": "account",
                    "entity_hint": {
                        "domain": account_fields.get("domain"),
                        "name": company,
                    },
                    "fields": account_fields,
                })

    return signals


# ---------------------------------------------------------------------------
# 2. Common Room Adapter
# ---------------------------------------------------------------------------

def from_common_room(cr_data: dict, entity_type: str = "account") -> list[dict]:
    """
    Transform Common Room API/skill output into signals.

    Common Room returns rich engagement data. Shape varies by endpoint:

    Account (organization):
    {
      "name": str,
      "domain": str,
      "industry": str,
      "employee_count": int,
      "signals": [...],
      "engagement_score": float,
      "members": [...],
      ...
    }

    Contact (member):
    {
      "full_name": str,
      "email": str,
      "organization": str,
      "title": str,
      "signals": [...],
      ...
    }
    """
    signals = []
    ts = _now_iso()

    if entity_type == "account":
        fields = {}
        if cr_data.get("name"):
            fields["legalName"] = cr_data["name"]
        if cr_data.get("domain"):
            fields["domain"] = _extract_domain(cr_data["domain"])
        if cr_data.get("industry"):
            fields["industry"] = cr_data["industry"]
        if cr_data.get("employee_count"):
            fields["headcount"] = cr_data["employee_count"]
        if cr_data.get("engagement_score") is not None:
            fields["engagementScore"] = cr_data["engagement_score"]
        if cr_data.get("description"):
            fields["description"] = cr_data["description"]
        if cr_data.get("location"):
            fields["hqCity"] = cr_data["location"]
        if cr_data.get("website"):
            fields["websiteUrl"] = cr_data["website"]
            if "domain" not in fields:
                fields["domain"] = _extract_domain(cr_data["website"])

        # Extract signal summaries
        cr_signals = cr_data.get("signals", [])
        if cr_signals:
            fields["recentSignals"] = [
                {
                    "type": s.get("type", "unknown"),
                    "description": s.get("description", ""),
                    "timestamp": s.get("timestamp", ts),
                }
                for s in cr_signals[:10]  # Cap at 10 most recent
            ]

        if fields:
            signals.append({
                "source": "common_room",
                "timestamp": ts,
                "entity_type": "account",
                "entity_hint": {
                    "domain": fields.get("domain"),
                    "name": fields.get("legalName"),
                },
                "fields": fields,
            })

    elif entity_type == "contact":
        fields = {}
        if cr_data.get("full_name"):
            fields["fullName"] = cr_data["full_name"]
            parts = cr_data["full_name"].strip().split()
            if len(parts) >= 2:
                fields["firstName"] = parts[0]
                fields["lastName"] = " ".join(parts[1:])
        if cr_data.get("email"):
            fields["email"] = cr_data["email"]
        if cr_data.get("title"):
            fields["jobTitle"] = cr_data["title"]
        if cr_data.get("organization"):
            fields["companyName"] = cr_data["organization"]
        if cr_data.get("location"):
            fields["location"] = cr_data["location"]
        if cr_data.get("linkedin_url"):
            fields["linkedinUrl"] = cr_data["linkedin_url"]

        cr_signals = cr_data.get("signals", [])
        if cr_signals:
            fields["recentSignals"] = [
                {"type": s.get("type"), "description": s.get("description"), "timestamp": s.get("timestamp", ts)}
                for s in cr_signals[:10]
            ]

        if fields:
            email = fields.get("email")
            signals.append({
                "source": "common_room",
                "timestamp": ts,
                "entity_type": "contact",
                "entity_hint": {
                    "name": fields.get("fullName"),
                    "email": email,
                    "domain": _extract_domain(email) if email else None,
                    "company": fields.get("companyName"),
                },
                "fields": fields,
            })

    return signals


# ---------------------------------------------------------------------------
# 3. Apollo Adapter
# ---------------------------------------------------------------------------

def from_apollo(apollo_data: dict, entity_type: str = "contact") -> list[dict]:
    """
    Transform Apollo enrichment output into signals.

    Apollo returns contact-centric data with org attached:
    {
      "first_name": str,
      "last_name": str,
      "email": str,
      "title": str,
      "phone_numbers": [...],
      "linkedin_url": str,
      "organization": {
        "name": str,
        "domain": str,
        "industry": str,
        "employee_count": int,
        "annual_revenue": float,
        ...
      }
    }
    """
    signals = []
    ts = _now_iso()

    if entity_type == "contact" or "first_name" in apollo_data or "email" in apollo_data:
        fields = {}
        if apollo_data.get("first_name"):
            fields["firstName"] = apollo_data["first_name"]
        if apollo_data.get("last_name"):
            fields["lastName"] = apollo_data["last_name"]
        if apollo_data.get("first_name") and apollo_data.get("last_name"):
            fields["fullName"] = f"{apollo_data['first_name']} {apollo_data['last_name']}"
        if apollo_data.get("email"):
            fields["email"] = apollo_data["email"].lower().strip()
        if apollo_data.get("title"):
            fields["jobTitle"] = apollo_data["title"]
        if apollo_data.get("linkedin_url"):
            fields["linkedinUrl"] = apollo_data["linkedin_url"]
        if apollo_data.get("city"):
            fields["location"] = apollo_data["city"]
        if apollo_data.get("state"):
            fields["location"] = f"{fields.get('location', '')}, {apollo_data['state']}".strip(", ")
        if apollo_data.get("department"):
            fields["department"] = apollo_data["department"]

        # Phone
        phones = apollo_data.get("phone_numbers", [])
        if phones:
            fields["phone"] = phones[0].get("number") if isinstance(phones[0], dict) else phones[0]

        # Company name from org
        org = apollo_data.get("organization", {})
        if org.get("name"):
            fields["companyName"] = org["name"]

        if fields:
            email = fields.get("email")
            signals.append({
                "source": "apollo",
                "timestamp": ts,
                "entity_type": "contact",
                "entity_hint": {
                    "name": fields.get("fullName"),
                    "email": email,
                    "domain": _extract_domain(email) if email else None,
                    "company": fields.get("companyName"),
                },
                "fields": fields,
            })

    # Also extract org-level account signal if present
    org = apollo_data.get("organization", {})
    if org and (org.get("name") or org.get("domain")):
        account_fields = {}
        if org.get("name"):
            account_fields["legalName"] = org["name"]
        if org.get("domain"):
            account_fields["domain"] = _extract_domain(org["domain"])
        if org.get("industry"):
            account_fields["industry"] = org["industry"]
        if org.get("employee_count"):
            account_fields["headcount"] = org["employee_count"]
        if org.get("annual_revenue"):
            account_fields["annualRevenue"] = org["annual_revenue"]
        if org.get("founded_year"):
            account_fields["foundedYear"] = org["founded_year"]
        if org.get("short_description"):
            account_fields["description"] = org["short_description"]

        if account_fields:
            signals.append({
                "source": "apollo",
                "timestamp": ts,
                "entity_type": "account",
                "entity_hint": {
                    "domain": account_fields.get("domain"),
                    "name": account_fields.get("legalName"),
                },
                "fields": account_fields,
            })

    return signals


# ---------------------------------------------------------------------------
# 4. Salesforce Adapter
# ---------------------------------------------------------------------------

def from_salesforce(sf_data: dict, entity_type: str = "account") -> list[dict]:
    """
    Transform Salesforce record data into signals.

    For Account:
    {
      "Name": str,
      "Website": str,
      "Industry": str,
      "NumberOfEmployees": int,
      "Type": str,
      "BillingCity": str,
      "BillingState": str,
      "BillingCountry": str,
      "AnnualRevenue": float,
      "Description": str,
      "Phone": str,
      "OwnerId": str,
      "Owner": { "Name": str },
      ...
    }

    For Contact:
    {
      "FirstName": str,
      "LastName": str,
      "Email": str,
      "Title": str,
      "Phone": str,
      "Account": { "Name": str, "Website": str },
      ...
    }
    """
    signals = []
    ts = _now_iso()

    if entity_type == "account":
        fields = {}
        if sf_data.get("Name"):
            fields["legalName"] = sf_data["Name"]
        if sf_data.get("Website"):
            fields["websiteUrl"] = sf_data["Website"]
            fields["domain"] = _extract_domain(sf_data["Website"])
        if sf_data.get("Industry"):
            fields["industry"] = sf_data["Industry"]
        if sf_data.get("NumberOfEmployees"):
            fields["headcount"] = sf_data["NumberOfEmployees"]
        if sf_data.get("Type"):
            fields["accountType"] = sf_data["Type"]
        if sf_data.get("AnnualRevenue"):
            fields["annualRevenue"] = sf_data["AnnualRevenue"]
        if sf_data.get("Description"):
            fields["description"] = sf_data["Description"]
        if sf_data.get("Phone"):
            fields["phone"] = sf_data["Phone"]
        if sf_data.get("BillingCity"):
            hq_parts = [sf_data.get("BillingCity"), sf_data.get("BillingState"), sf_data.get("BillingCountry")]
            fields["hqCity"] = ", ".join(p for p in hq_parts if p)
        if _safe_get(sf_data, "Owner", "Name"):
            fields["ownerName"] = sf_data["Owner"]["Name"]
        if sf_data.get("OwnerId"):
            fields["ownerId"] = sf_data["OwnerId"]

        # Salesforce-specific fields
        if sf_data.get("Id"):
            fields["salesforceId"] = sf_data["Id"]

        if fields:
            signals.append({
                "source": "salesforce",
                "timestamp": ts,
                "entity_type": "account",
                "entity_hint": {
                    "domain": fields.get("domain"),
                    "name": fields.get("legalName"),
                },
                "fields": fields,
            })

    elif entity_type == "contact":
        fields = {}
        if sf_data.get("FirstName"):
            fields["firstName"] = sf_data["FirstName"]
        if sf_data.get("LastName"):
            fields["lastName"] = sf_data["LastName"]
        if sf_data.get("FirstName") and sf_data.get("LastName"):
            fields["fullName"] = f"{sf_data['FirstName']} {sf_data['LastName']}"
        if sf_data.get("Email"):
            fields["email"] = sf_data["Email"].lower().strip()
        if sf_data.get("Title"):
            fields["jobTitle"] = sf_data["Title"]
        if sf_data.get("Phone"):
            fields["phone"] = sf_data["Phone"]
        if sf_data.get("Department"):
            fields["department"] = sf_data["Department"]

        # Company from Account relationship
        account = sf_data.get("Account", {})
        if account.get("Name"):
            fields["companyName"] = account["Name"]

        if sf_data.get("Id"):
            fields["salesforceId"] = sf_data["Id"]

        if fields:
            email = fields.get("email")
            signals.append({
                "source": "salesforce",
                "timestamp": ts,
                "entity_type": "contact",
                "entity_hint": {
                    "name": fields.get("fullName"),
                    "email": email,
                    "domain": _extract_domain(email) if email else None,
                    "company": fields.get("companyName"),
                },
                "fields": fields,
            })

    return signals


# ---------------------------------------------------------------------------
# 5. Slack Signal Adapter
# ---------------------------------------------------------------------------

def from_slack_mention(message_data: dict, company_or_person: str = None) -> list[dict]:
    """
    Transform a Slack message mentioning a company/person into a contextual signal.

    Slack signals are Tier 3 (contextual) — they provide intel hints
    but not authoritative field values. Primarily used for:
    - Recent activity mentions (deal discussions, support issues)
    - Sentiment signals
    - Relationship context

    message_data shape:
    {
      "text": str,
      "user": str,
      "channel": str,
      "ts": str,
      "thread_ts": str | None,
      "permalink": str | None,
    }
    """
    signals = []
    text = message_data.get("text", "")
    ts = _now_iso()

    if not text or not company_or_person:
        return signals

    fields = {
        "lastMentionedInSlack": ts,
        "slackMentionContext": text[:500],  # Cap at 500 chars
        "slackMentionChannel": message_data.get("channel", ""),
        "slackMentionUser": message_data.get("user", ""),
    }

    if message_data.get("permalink"):
        fields["slackMentionLink"] = message_data["permalink"]

    # Simple sentiment detection
    positive_words = {"great", "excited", "love", "amazing", "won", "closed", "deal", "signed"}
    negative_words = {"issue", "problem", "churn", "risk", "angry", "frustrated", "cancel", "lost"}
    words = set(text.lower().split())

    pos_count = len(words & positive_words)
    neg_count = len(words & negative_words)

    if pos_count > neg_count:
        fields["slackSentiment"] = "positive"
    elif neg_count > pos_count:
        fields["slackSentiment"] = "negative"
    else:
        fields["slackSentiment"] = "neutral"

    signals.append({
        "source": "slack",
        "timestamp": ts,
        "entity_type": "account",  # Slack mentions are usually account-level
        "entity_hint": {
            "name": company_or_person,
            "domain": None,
        },
        "fields": fields,
    })

    return signals


# ---------------------------------------------------------------------------
# 6. Gmail Signal Adapter
# ---------------------------------------------------------------------------

def from_gmail(email_data: dict, entity_domain: str = None) -> list[dict]:
    """
    Transform Gmail message metadata into a contextual signal.

    Like Slack, this is Tier 3 — relationship and communication intel.

    email_data shape:
    {
      "subject": str,
      "from": str,
      "to": [str],
      "cc": [str],
      "date": str,
      "snippet": str,
      "thread_id": str,
    }
    """
    signals = []
    ts = _now_iso()

    sender = email_data.get("from", "")
    sender_domain = _extract_domain(sender)

    # Determine which domain this signal is about
    target_domain = entity_domain or sender_domain
    if not target_domain:
        return signals

    fields = {
        "lastEmailContact": email_data.get("date", ts),
        "emailSubject": email_data.get("subject", "")[:200],
        "emailDirection": "inbound" if sender_domain == target_domain else "outbound",
    }

    # Count participants from the target domain
    all_participants = [sender] + email_data.get("to", []) + email_data.get("cc", [])
    domain_contacts = [p for p in all_participants if _extract_domain(p) == target_domain]
    if domain_contacts:
        fields["knownContacts"] = list(set(domain_contacts))

    signals.append({
        "source": "gmail",
        "timestamp": ts,
        "entity_type": "account",
        "entity_hint": {
            "domain": target_domain,
            "name": None,
        },
        "fields": fields,
    })

    return signals


# ---------------------------------------------------------------------------
# 7. Calendar Signal Adapter
# ---------------------------------------------------------------------------

def from_calendar(event_data: dict, entity_domain: str = None) -> list[dict]:
    """
    Transform Google Calendar event into a contextual signal.

    Tier 3 — meeting activity context.

    event_data shape:
    {
      "summary": str,
      "start": str,  # ISO datetime
      "end": str,
      "attendees": [{"email": str, "displayName": str, "responseStatus": str}],
      "description": str,
      "location": str,
    }
    """
    signals = []
    ts = _now_iso()

    attendees = event_data.get("attendees", [])

    # If no entity_domain given, try to find external domain from attendees
    if not entity_domain:
        for att in attendees:
            att_domain = _extract_domain(att.get("email", ""))
            # Skip internal domains (sanity.io)
            if att_domain and att_domain != "sanity.io":
                entity_domain = att_domain
                break

    if not entity_domain:
        return signals

    # Find attendees from the target domain
    domain_attendees = []
    for att in attendees:
        if _extract_domain(att.get("email", "")) == entity_domain:
            domain_attendees.append({
                "email": att.get("email"),
                "name": att.get("displayName"),
                "status": att.get("responseStatus"),
            })

    fields = {
        "lastMeetingDate": event_data.get("start", ts),
        "meetingSummary": event_data.get("summary", "")[:200],
        "meetingAttendees": domain_attendees,
    }

    # Upcoming vs past
    try:
        event_start = datetime.fromisoformat(event_data.get("start", "").replace("Z", "+00:00"))
        if event_start > datetime.now(timezone.utc):
            fields["nextMeetingDate"] = event_data["start"]
        else:
            fields["lastMeetingDate"] = event_data["start"]
    except (ValueError, TypeError):
        pass

    signals.append({
        "source": "calendar",
        "timestamp": ts,
        "entity_type": "account",
        "entity_hint": {
            "domain": entity_domain,
            "name": None,
        },
        "fields": fields,
    })

    # Also emit contact signals for each attendee
    for att in domain_attendees:
        if att.get("email"):
            contact_fields = {
                "email": att["email"],
                "lastMeetingDate": event_data.get("start", ts),
            }
            if att.get("name"):
                contact_fields["fullName"] = att["name"]
                parts = att["name"].strip().split()
                if len(parts) >= 2:
                    contact_fields["firstName"] = parts[0]
                    contact_fields["lastName"] = " ".join(parts[1:])

            signals.append({
                "source": "calendar",
                "timestamp": ts,
                "entity_type": "contact",
                "entity_hint": {
                    "name": att.get("name"),
                    "email": att["email"],
                    "domain": entity_domain,
                },
                "fields": contact_fields,
            })

    return signals


# ---------------------------------------------------------------------------
# 8. Sanity Document Adapter (for re-ingesting existing Sanity docs)
# ---------------------------------------------------------------------------

def from_sanity_document(doc: dict) -> list[dict]:
    """
    Transform an existing Sanity Account or Contact document back into a signal.
    Used when re-processing or when Sanity is the source of truth for a field.

    Unwraps confidenceField { value, confidence, source, ... } back to raw values.
    """
    signals = []
    ts = _now_iso()
    doc_type = doc.get("_type", "")

    if doc_type == "account":
        fields = {}
        # Unwrap confidence fields
        for key in ["legalName", "domain", "industry", "headcount", "hqCity",
                     "description", "stage", "accountType", "annualRevenue",
                     "phone", "ownerName", "websiteUrl", "linkedinUrl"]:
            val = doc.get(key)
            if isinstance(val, dict) and "value" in val:
                fields[key] = val["value"]
            elif val is not None:
                fields[key] = val

        if fields:
            signals.append({
                "source": "sanity",
                "timestamp": doc.get("_updatedAt", ts),
                "entity_type": "account",
                "entity_hint": {
                    "domain": fields.get("domain"),
                    "name": fields.get("legalName"),
                },
                "fields": fields,
            })

    elif doc_type == "contact":
        fields = {}
        for key in ["fullName", "firstName", "lastName", "email", "jobTitle",
                     "phone", "linkedinUrl", "department", "location"]:
            val = doc.get(key)
            if isinstance(val, dict) and "value" in val:
                fields[key] = val["value"]
            elif val is not None:
                fields[key] = val

        if fields:
            email = fields.get("email")
            signals.append({
                "source": "sanity",
                "timestamp": doc.get("_updatedAt", ts),
                "entity_type": "contact",
                "entity_hint": {
                    "name": fields.get("fullName"),
                    "email": email,
                    "domain": _extract_domain(email) if email else None,
                },
                "fields": fields,
            })

    return signals


# ---------------------------------------------------------------------------
# Dispatch — route raw data to correct adapter
# ---------------------------------------------------------------------------

ADAPTER_REGISTRY = {
    "chrome_scan": from_chrome_scan,
    "common_room": from_common_room,
    "apollo": from_apollo,
    "salesforce": from_salesforce,
    "slack": from_slack_mention,
    "gmail": from_gmail,
    "calendar": from_calendar,
    "sanity": from_sanity_document,
}


def ingest(source_type: str, raw_data: dict, **kwargs) -> list[dict]:
    """
    Universal ingestion entry point.

    Usage:
      signals = ingest("chrome_scan", scan_result)
      signals = ingest("apollo", apollo_enrichment, entity_type="contact")
      signals = ingest("slack", message, company_or_person="Rapid7")
    """
    adapter = ADAPTER_REGISTRY.get(source_type)
    if not adapter:
        raise ValueError(f"Unknown source type: {source_type}. Available: {list(ADAPTER_REGISTRY.keys())}")
    return adapter(raw_data, **kwargs)


# ---------------------------------------------------------------------------
# Self-Test
# ---------------------------------------------------------------------------

def _self_test():
    print("=== Ingestion Adapters Self-Test ===\n")

    # 1. Chrome scan — LinkedIn company
    scan = {
        "page_type": "linkedin_company",
        "url": "https://www.linkedin.com/company/rapid7",
        "extracted": {
            "name": "Rapid7",
            "industry": "Computer & Network Security",
            "employee_count": "2,400",
            "headquarters": "Boston, MA",
            "website": "https://www.rapid7.com",
            "description": "Rapid7 provides cybersecurity solutions.",
        },
        "timestamp": "2026-04-01T10:00:00Z",
    }
    signals = from_chrome_scan(scan)
    assert len(signals) == 1
    s = signals[0]
    assert s["source"] == "linkedin"
    assert s["entity_type"] == "account"
    assert s["fields"]["legalName"] == "Rapid7"
    assert s["fields"]["domain"] == "rapid7.com"
    assert s["fields"]["headcount"] == "2,400"
    print(f"✓ Chrome scan (LinkedIn company): {s['fields']['legalName']}, domain={s['fields']['domain']}")

    # 2. Chrome scan — LinkedIn person (should emit contact + account)
    person_scan = {
        "page_type": "linkedin_person",
        "url": "https://www.linkedin.com/in/coreyethomas",
        "extracted": {
            "name": "Corey Thomas",
            "title": "CEO",
            "company": "Rapid7",
            "email": "cthomas@rapid7.com",
            "location": "Boston, MA",
        },
        "timestamp": "2026-04-01T10:00:00Z",
    }
    signals = from_chrome_scan(person_scan)
    assert len(signals) == 2  # contact + account
    contact = [s for s in signals if s["entity_type"] == "contact"][0]
    account = [s for s in signals if s["entity_type"] == "account"][0]
    assert contact["fields"]["fullName"] == "Corey Thomas"
    assert contact["fields"]["firstName"] == "Corey"
    assert account["fields"]["legalName"] == "Rapid7"
    assert account["entity_hint"]["domain"] == "rapid7.com"
    print(f"✓ Chrome scan (LinkedIn person): {contact['fields']['fullName']} + account {account['fields']['legalName']}")

    # 3. Common Room
    cr = {
        "name": "Rapid7",
        "domain": "rapid7.com",
        "industry": "Cybersecurity",
        "employee_count": 2400,
        "engagement_score": 82.5,
        "signals": [
            {"type": "github_star", "description": "Starred repo X", "timestamp": "2026-03-30T08:00:00Z"},
        ],
    }
    signals = from_common_room(cr, entity_type="account")
    assert len(signals) == 1
    assert signals[0]["fields"]["engagementScore"] == 82.5
    assert len(signals[0]["fields"]["recentSignals"]) == 1
    print(f"✓ Common Room (account): engagement={signals[0]['fields']['engagementScore']}, signals={len(signals[0]['fields']['recentSignals'])}")

    # 4. Apollo
    apollo = {
        "first_name": "Jane",
        "last_name": "Doe",
        "email": "jane.doe@rapid7.com",
        "title": "VP Engineering",
        "linkedin_url": "https://linkedin.com/in/janedoe",
        "phone_numbers": [{"number": "+1-555-0123"}],
        "organization": {
            "name": "Rapid7",
            "domain": "rapid7.com",
            "industry": "Cybersecurity",
            "employee_count": 2200,
            "annual_revenue": 500000000,
        },
    }
    signals = from_apollo(apollo)
    assert len(signals) == 2  # contact + account
    contact = [s for s in signals if s["entity_type"] == "contact"][0]
    account = [s for s in signals if s["entity_type"] == "account"][0]
    assert contact["fields"]["email"] == "jane.doe@rapid7.com"
    assert contact["fields"]["phone"] == "+1-555-0123"
    assert account["fields"]["headcount"] == 2200
    assert account["fields"]["annualRevenue"] == 500000000
    print(f"✓ Apollo: contact={contact['fields']['fullName']}, account headcount={account['fields']['headcount']}")

    # 5. Salesforce
    sf = {
        "Name": "Rapid7",
        "Website": "https://www.rapid7.com",
        "Industry": "Technology",
        "NumberOfEmployees": 2500,
        "Type": "Customer",
        "BillingCity": "Boston",
        "BillingState": "MA",
        "BillingCountry": "US",
        "AnnualRevenue": 600000000,
        "Owner": {"Name": "Austin Gilbert"},
        "Id": "001XXXXXXXXXXXX",
    }
    signals = from_salesforce(sf, entity_type="account")
    assert len(signals) == 1
    assert signals[0]["fields"]["ownerName"] == "Austin Gilbert"
    assert signals[0]["fields"]["salesforceId"] == "001XXXXXXXXXXXX"
    assert signals[0]["fields"]["hqCity"] == "Boston, MA, US"
    print(f"✓ Salesforce (account): owner={signals[0]['fields']['ownerName']}, hq={signals[0]['fields']['hqCity']}")

    # 6. Slack
    slack = {
        "text": "Rapid7 just signed the deal! Great news for the team.",
        "user": "U079FFJ9D63",
        "channel": "C0123DEALS",
        "ts": "1711929600.000100",
    }
    signals = from_slack_mention(slack, company_or_person="Rapid7")
    assert len(signals) == 1
    assert signals[0]["fields"]["slackSentiment"] == "positive"
    print(f"✓ Slack: sentiment={signals[0]['fields']['slackSentiment']}")

    # 7. Gmail
    gmail = {
        "from": "cthomas@rapid7.com",
        "to": ["austin.gilbert@sanity.io"],
        "subject": "Re: Partnership Discussion",
        "date": "2026-03-28T14:00:00Z",
        "snippet": "Looking forward to next steps...",
    }
    signals = from_gmail(gmail)
    assert len(signals) == 1
    assert signals[0]["fields"]["emailDirection"] == "inbound"
    assert signals[0]["entity_hint"]["domain"] == "rapid7.com"
    print(f"✓ Gmail: direction={signals[0]['fields']['emailDirection']}, domain={signals[0]['entity_hint']['domain']}")

    # 8. Calendar
    cal = {
        "summary": "Rapid7 Quarterly Review",
        "start": "2026-04-05T15:00:00Z",
        "end": "2026-04-05T16:00:00Z",
        "attendees": [
            {"email": "austin.gilbert@sanity.io", "displayName": "Austin Gilbert", "responseStatus": "accepted"},
            {"email": "cthomas@rapid7.com", "displayName": "Corey Thomas", "responseStatus": "accepted"},
            {"email": "jdoe@rapid7.com", "displayName": "Jane Doe", "responseStatus": "tentative"},
        ],
    }
    signals = from_calendar(cal)
    # Should produce 1 account signal + 2 contact signals (external attendees)
    accounts = [s for s in signals if s["entity_type"] == "account"]
    contacts = [s for s in signals if s["entity_type"] == "contact"]
    assert len(accounts) == 1
    assert len(contacts) == 2
    assert accounts[0]["entity_hint"]["domain"] == "rapid7.com"
    assert "nextMeetingDate" in accounts[0]["fields"]  # Future meeting
    print(f"✓ Calendar: domain={accounts[0]['entity_hint']['domain']}, contacts={len(contacts)}, next meeting found")

    # 9. Universal dispatch
    signals = ingest("chrome_scan", scan)
    assert len(signals) == 1
    assert signals[0]["source"] == "linkedin"
    print(f"✓ Universal ingest dispatch works")

    # 10. Unknown source
    try:
        ingest("unknown_source", {})
        assert False, "Should have raised"
    except ValueError as e:
        print(f"✓ Unknown source rejected: {e}")

    print("\n=== All adapter tests passed ===")


if __name__ == "__main__":
    _self_test()
