"""
Chrome Inspector — Entity Resolver
====================================
Resolves incoming signals to existing Sanity documents (or determines
that a new entity should be created).

Resolution strategies (in priority order):
  1. Domain match (accounts) — strongest signal
  2. Salesforce ID match — deterministic
  3. Email domain match (contacts → accounts)
  4. Exact name + company match (contacts)
  5. Fuzzy name match with company context

Each match returns a resolution:
  {
    "match_type": "domain" | "salesforce_id" | "email" | "name_exact" | "name_fuzzy" | "new",
    "confidence": float,     # 0.0 - 1.0
    "sanity_id": str | None, # Existing document ID if matched
    "entity_id": str,        # Deterministic ID (account-{domain} or contact-{slug})
  }

GROQ Queries:
  Resolution queries are designed to be fast lookups against the
  Content Lake using indexed fields.
"""

import re
import unicodedata
from typing import Any, Optional


# ---------------------------------------------------------------------------
# Deterministic ID Generation
# ---------------------------------------------------------------------------

def slugify(text: str) -> str:
    """Create a URL-safe slug from text."""
    if not text:
        return ""
    text = unicodedata.normalize("NFKD", text)
    text = text.encode("ascii", "ignore").decode("ascii")
    text = re.sub(r"[^\w\s-]", "", text.lower())
    text = re.sub(r"[-\s]+", "-", text).strip("-")
    return text


def make_account_id(domain: str) -> str:
    """Deterministic account ID from domain."""
    clean = domain.lower().strip()
    clean = re.sub(r"^www\.", "", clean)
    return f"account-{slugify(clean)}"


def make_contact_id(name: str, company_domain: str = None) -> str:
    """Deterministic contact ID from name + optional company."""
    slug = slugify(name)
    if company_domain:
        domain_slug = slugify(company_domain.replace(".", "-"))
        return f"contact-{slug}-{domain_slug}"
    return f"contact-{slug}"


# ---------------------------------------------------------------------------
# GROQ Query Templates for Entity Lookup
# ---------------------------------------------------------------------------

# Find account by domain (fastest, most reliable)
GROQ_FIND_ACCOUNT_BY_DOMAIN = """
*[_type == "account" && domain.value == $domain][0]{
  _id,
  "name": legalName.value,
  "domain": domain.value,
  "salesforceId": coalesce(salesforceId.value, salesforceId),
  _updatedAt
}
"""

# Find account by Salesforce ID
GROQ_FIND_ACCOUNT_BY_SF_ID = """
*[_type == "account" && (salesforceId.value == $sfId || salesforceId == $sfId)][0]{
  _id,
  "name": legalName.value,
  "domain": domain.value,
  _updatedAt
}
"""

# Find account by name (fuzzy — use when domain not available)
GROQ_FIND_ACCOUNT_BY_NAME = """
*[_type == "account" && legalName.value match $namePattern]{
  _id,
  "name": legalName.value,
  "domain": domain.value,
  _updatedAt
}[0..4]
"""

# Find contact by email (strongest contact match)
GROQ_FIND_CONTACT_BY_EMAIL = """
*[_type == "contact" && email.value == $email][0]{
  _id,
  "name": fullName.value,
  "email": email.value,
  "company": companyName.value,
  "accountRef": account->{ _id, "name": legalName.value, "domain": domain.value },
  _updatedAt
}
"""

# Find contact by name + company
GROQ_FIND_CONTACT_BY_NAME_COMPANY = """
*[_type == "contact" && fullName.value == $fullName && companyName.value == $company][0]{
  _id,
  "name": fullName.value,
  "email": email.value,
  "company": companyName.value,
  "accountRef": account->{ _id, "name": legalName.value, "domain": domain.value },
  _updatedAt
}
"""

# Find contacts at a domain (for account linkage)
GROQ_FIND_CONTACTS_AT_DOMAIN = """
*[_type == "contact" && email.value match ("*@" + $domain)]{
  _id,
  "name": fullName.value,
  "email": email.value,
  _updatedAt
}[0..19]
"""

# Check for potential duplicates (same name, different IDs)
GROQ_FIND_POTENTIAL_DUPES = """
*[_type == $entityType && (
  legalName.value == $name ||
  fullName.value == $name
) && _id != $excludeId]{
  _id,
  "name": coalesce(legalName.value, fullName.value),
  "domain": domain.value,
  "email": email.value,
  _updatedAt
}[0..9]
"""


# ---------------------------------------------------------------------------
# Resolution Logic
# ---------------------------------------------------------------------------

class EntityResolver:
    """
    Resolves signals to existing or new entities.

    In production, this class calls Sanity GROQ queries via the MCP tool.
    For reference/testing, it can work with a local entity index.
    """

    def __init__(self, local_index: dict = None):
        """
        local_index: optional dict simulating Sanity state for testing.
        {
          "accounts": {
            "account-rapid7-com": {
              "_id": "drafts.abc123",
              "domain": "rapid7.com",
              "name": "Rapid7",
              "salesforceId": "001XXX",
            },
            ...
          },
          "contacts": {
            "contact-corey-thomas-rapid7-com": {
              "_id": "drafts.def456",
              "email": "cthomas@rapid7.com",
              "name": "Corey Thomas",
              "company": "Rapid7",
            },
            ...
          }
        }
        """
        self.index = local_index or {"accounts": {}, "contacts": {}}

    def resolve_account(self, signal: dict) -> dict:
        """
        Resolve an account signal to an existing or new entity.

        Resolution priority:
          1. Domain match → highest confidence
          2. Salesforce ID match → high confidence
          3. Name match → medium confidence
          4. New entity → no match found
        """
        hint = signal.get("entity_hint", {})
        fields = signal.get("fields", {})

        domain = hint.get("domain") or fields.get("domain")
        name = hint.get("name") or fields.get("legalName")
        sf_id = fields.get("salesforceId")

        # Strategy 1: Domain match
        if domain:
            entity_id = make_account_id(domain)
            existing = self.index["accounts"].get(entity_id)
            if existing:
                return {
                    "match_type": "domain",
                    "confidence": 0.98,
                    "sanity_id": existing["_id"],
                    "entity_id": entity_id,
                    "matched_on": {"domain": domain},
                }

        # Strategy 2: Salesforce ID match
        if sf_id:
            for eid, acc in self.index["accounts"].items():
                if acc.get("salesforceId") == sf_id:
                    return {
                        "match_type": "salesforce_id",
                        "confidence": 0.99,
                        "sanity_id": acc["_id"],
                        "entity_id": eid,
                        "matched_on": {"salesforceId": sf_id},
                    }

        # Strategy 3: Name match
        if name:
            name_lower = name.lower().strip()
            for eid, acc in self.index["accounts"].items():
                if acc.get("name", "").lower().strip() == name_lower:
                    return {
                        "match_type": "name_exact",
                        "confidence": 0.75,
                        "sanity_id": acc["_id"],
                        "entity_id": eid,
                        "matched_on": {"name": name},
                    }

        # No match — new entity
        entity_id = make_account_id(domain) if domain else f"account-{slugify(name or 'unknown')}"
        return {
            "match_type": "new",
            "confidence": 1.0,
            "sanity_id": None,
            "entity_id": entity_id,
        }

    def resolve_contact(self, signal: dict) -> dict:
        """
        Resolve a contact signal to an existing or new entity.

        Resolution priority:
          1. Email exact match → highest confidence
          2. Name + company match → high confidence
          3. Name + domain match → medium confidence
          4. New entity
        """
        hint = signal.get("entity_hint", {})
        fields = signal.get("fields", {})

        email = hint.get("email") or fields.get("email")
        name = hint.get("name") or fields.get("fullName")
        company = hint.get("company") or fields.get("companyName")
        domain = hint.get("domain") or (email.split("@")[-1] if email and "@" in email else None)

        # Strategy 1: Email match
        if email:
            email_lower = email.lower().strip()
            for eid, con in self.index["contacts"].items():
                if con.get("email", "").lower().strip() == email_lower:
                    return {
                        "match_type": "email",
                        "confidence": 0.97,
                        "sanity_id": con["_id"],
                        "entity_id": eid,
                        "matched_on": {"email": email},
                    }

        # Strategy 2: Name + company match
        if name and company:
            name_lower = name.lower().strip()
            company_lower = company.lower().strip()
            for eid, con in self.index["contacts"].items():
                if (con.get("name", "").lower().strip() == name_lower and
                    con.get("company", "").lower().strip() == company_lower):
                    return {
                        "match_type": "name_company",
                        "confidence": 0.85,
                        "sanity_id": con["_id"],
                        "entity_id": eid,
                        "matched_on": {"name": name, "company": company},
                    }

        # Strategy 3: Name + domain
        if name and domain:
            name_lower = name.lower().strip()
            for eid, con in self.index["contacts"].items():
                con_email = con.get("email", "")
                con_domain = con_email.split("@")[-1].lower() if "@" in con_email else ""
                if con.get("name", "").lower().strip() == name_lower and con_domain == domain.lower():
                    return {
                        "match_type": "name_domain",
                        "confidence": 0.80,
                        "sanity_id": con["_id"],
                        "entity_id": eid,
                        "matched_on": {"name": name, "domain": domain},
                    }

        # No match — new entity
        entity_id = make_contact_id(name or "unknown", domain)
        return {
            "match_type": "new",
            "confidence": 1.0,
            "sanity_id": None,
            "entity_id": entity_id,
        }

    def resolve(self, signal: dict) -> dict:
        """Dispatch to correct resolver based on entity type."""
        entity_type = signal.get("entity_type", "account")
        if entity_type == "account":
            return self.resolve_account(signal)
        elif entity_type == "contact":
            return self.resolve_contact(signal)
        else:
            raise ValueError(f"Unknown entity type: {entity_type}")

    def register(self, entity_type: str, entity_id: str, sanity_id: str, data: dict):
        """Register a newly created or updated entity in the local index."""
        bucket = "accounts" if entity_type == "account" else "contacts"
        self.index[bucket][entity_id] = {
            "_id": sanity_id,
            **data,
        }


# ---------------------------------------------------------------------------
# Account-Contact Linkage
# ---------------------------------------------------------------------------

def link_contact_to_account(contact_signal: dict, resolver: EntityResolver) -> Optional[str]:
    """
    Determine which account a contact should be linked to.

    Returns the account entity_id if found, None otherwise.
    Uses email domain as primary linkage strategy.
    """
    hint = contact_signal.get("entity_hint", {})
    fields = contact_signal.get("fields", {})

    # Try email domain first
    email = hint.get("email") or fields.get("email")
    if email and "@" in email:
        domain = email.split("@")[-1].lower()
        # Skip common email providers
        free_domains = {"gmail.com", "yahoo.com", "hotmail.com", "outlook.com",
                        "aol.com", "icloud.com", "protonmail.com", "mail.com"}
        if domain not in free_domains:
            account_id = make_account_id(domain)
            if account_id in resolver.index["accounts"]:
                return account_id

    # Try company name
    company = hint.get("company") or fields.get("companyName")
    if company:
        company_lower = company.lower().strip()
        for eid, acc in resolver.index["accounts"].items():
            if acc.get("name", "").lower().strip() == company_lower:
                return eid

    return None


# ---------------------------------------------------------------------------
# Deduplication Check
# ---------------------------------------------------------------------------

def find_potential_duplicates(entity_id: str, entity_type: str, resolver: EntityResolver) -> list[dict]:
    """
    Find entities that might be duplicates of the given entity.
    Returns a list of potential matches with similarity scores.
    """
    bucket = "accounts" if entity_type == "account" else "contacts"
    entity = resolver.index[bucket].get(entity_id)
    if not entity:
        return []

    dupes = []
    name = entity.get("name", "").lower().strip()

    for eid, other in resolver.index[bucket].items():
        if eid == entity_id:
            continue

        other_name = other.get("name", "").lower().strip()

        # Exact name match but different ID = potential dupe
        if name and other_name and name == other_name:
            dupes.append({
                "entity_id": eid,
                "sanity_id": other.get("_id"),
                "name": other.get("name"),
                "similarity": 0.90,
                "reason": "exact_name_match",
            })
            continue

        # One name contains the other
        if name and other_name:
            if name in other_name or other_name in name:
                dupes.append({
                    "entity_id": eid,
                    "sanity_id": other.get("_id"),
                    "name": other.get("name"),
                    "similarity": 0.70,
                    "reason": "substring_name_match",
                })

    return dupes


# ---------------------------------------------------------------------------
# GROQ Query Builder for Production Use
# ---------------------------------------------------------------------------

def build_resolution_queries(signal: dict) -> list[dict]:
    """
    Build a prioritized list of GROQ queries to run against Sanity
    for entity resolution. Each query includes params.

    Returns: [{ "query": str, "params": dict, "strategy": str, "confidence": float }]
    """
    entity_type = signal.get("entity_type", "account")
    hint = signal.get("entity_hint", {})
    fields = signal.get("fields", {})
    queries = []

    if entity_type == "account":
        domain = hint.get("domain") or fields.get("domain")
        name = hint.get("name") or fields.get("legalName")
        sf_id = fields.get("salesforceId")

        if domain:
            queries.append({
                "query": GROQ_FIND_ACCOUNT_BY_DOMAIN,
                "params": {"domain": domain.lower().strip()},
                "strategy": "domain",
                "confidence": 0.98,
            })

        if sf_id:
            queries.append({
                "query": GROQ_FIND_ACCOUNT_BY_SF_ID,
                "params": {"sfId": sf_id},
                "strategy": "salesforce_id",
                "confidence": 0.99,
            })

        if name:
            queries.append({
                "query": GROQ_FIND_ACCOUNT_BY_NAME,
                "params": {"namePattern": f"{name}*"},
                "strategy": "name",
                "confidence": 0.75,
            })

    elif entity_type == "contact":
        email = hint.get("email") or fields.get("email")
        name = hint.get("name") or fields.get("fullName")
        company = hint.get("company") or fields.get("companyName")

        if email:
            queries.append({
                "query": GROQ_FIND_CONTACT_BY_EMAIL,
                "params": {"email": email.lower().strip()},
                "strategy": "email",
                "confidence": 0.97,
            })

        if name and company:
            queries.append({
                "query": GROQ_FIND_CONTACT_BY_NAME_COMPANY,
                "params": {"fullName": name, "company": company},
                "strategy": "name_company",
                "confidence": 0.85,
            })

    return queries


# ---------------------------------------------------------------------------
# Self-Test
# ---------------------------------------------------------------------------

def _self_test():
    print("=== Entity Resolver Self-Test ===\n")

    # Setup test index
    # Generate keys using the same ID functions the resolver uses
    rapid7_id = make_account_id("rapid7.com")
    acme_id = make_account_id("acme.com")
    corey_id = make_contact_id("Corey Thomas", "rapid7.com")
    jane_id = make_contact_id("Jane Doe", "rapid7.com")

    index = {
        "accounts": {
            rapid7_id: {
                "_id": "drafts.2c89fc5f-341d-4168-b2ee-942e814e91b8",
                "domain": "rapid7.com",
                "name": "Rapid7",
                "salesforceId": "001XXXXXXXXXXXX",
            },
            acme_id: {
                "_id": "drafts.acme-001",
                "domain": "acme.com",
                "name": "Acme Corp",
            },
        },
        "contacts": {
            corey_id: {
                "_id": "drafts.d77beb69-6390-4f1a-9ed1-372e27b32bc9",
                "email": "cthomas@rapid7.com",
                "name": "Corey Thomas",
                "company": "Rapid7",
            },
            jane_id: {
                "_id": "drafts.jane-001",
                "email": "jdoe@rapid7.com",
                "name": "Jane Doe",
                "company": "Rapid7",
            },
        },
    }

    resolver = EntityResolver(local_index=index)

    # 1. Account domain match
    signal = {
        "entity_type": "account",
        "entity_hint": {"domain": "rapid7.com", "name": "Rapid7"},
        "fields": {"legalName": "Rapid7", "domain": "rapid7.com"},
    }
    res = resolver.resolve(signal)
    assert res["match_type"] == "domain"
    assert res["confidence"] == 0.98
    assert res["sanity_id"] == "drafts.2c89fc5f-341d-4168-b2ee-942e814e91b8"
    print(f"✓ Account domain match: {res['match_type']}, conf={res['confidence']}, id={res['entity_id']}")

    # 2. Account SF ID match
    signal2 = {
        "entity_type": "account",
        "entity_hint": {"domain": None, "name": "Rapid7 Inc"},
        "fields": {"legalName": "Rapid7 Inc", "salesforceId": "001XXXXXXXXXXXX"},
    }
    res2 = resolver.resolve(signal2)
    assert res2["match_type"] == "salesforce_id"
    assert res2["confidence"] == 0.99
    print(f"✓ Account SF ID match: {res2['match_type']}, conf={res2['confidence']}")

    # 3. Account name match (no domain)
    signal3 = {
        "entity_type": "account",
        "entity_hint": {"domain": None, "name": "Acme Corp"},
        "fields": {"legalName": "Acme Corp"},
    }
    res3 = resolver.resolve(signal3)
    assert res3["match_type"] == "name_exact"
    assert res3["confidence"] == 0.75
    print(f"✓ Account name match: {res3['match_type']}, conf={res3['confidence']}")

    # 4. Account new entity
    signal4 = {
        "entity_type": "account",
        "entity_hint": {"domain": "newco.com", "name": "NewCo"},
        "fields": {"legalName": "NewCo", "domain": "newco.com"},
    }
    res4 = resolver.resolve(signal4)
    assert res4["match_type"] == "new"
    assert res4["sanity_id"] is None
    assert res4["entity_id"] == make_account_id("newco.com")
    print(f"✓ Account new entity: {res4['match_type']}, entity_id={res4['entity_id']}")

    # 5. Contact email match
    signal5 = {
        "entity_type": "contact",
        "entity_hint": {"email": "cthomas@rapid7.com", "name": "Corey Thomas"},
        "fields": {"email": "cthomas@rapid7.com"},
    }
    res5 = resolver.resolve(signal5)
    assert res5["match_type"] == "email"
    assert res5["confidence"] == 0.97
    assert res5["sanity_id"] == "drafts.d77beb69-6390-4f1a-9ed1-372e27b32bc9"
    print(f"✓ Contact email match: {res5['match_type']}, conf={res5['confidence']}")

    # 6. Contact name+company match
    signal6 = {
        "entity_type": "contact",
        "entity_hint": {"name": "Jane Doe", "company": "Rapid7"},
        "fields": {"fullName": "Jane Doe", "companyName": "Rapid7"},
    }
    res6 = resolver.resolve(signal6)
    assert res6["match_type"] == "name_company"
    assert res6["confidence"] == 0.85
    print(f"✓ Contact name+company match: {res6['match_type']}, conf={res6['confidence']}")

    # 7. Contact new entity
    signal7 = {
        "entity_type": "contact",
        "entity_hint": {"email": "new.person@newco.com", "name": "New Person"},
        "fields": {"email": "new.person@newco.com", "fullName": "New Person"},
    }
    res7 = resolver.resolve(signal7)
    assert res7["match_type"] == "new"
    assert res7["sanity_id"] is None
    print(f"✓ Contact new entity: {res7['match_type']}, entity_id={res7['entity_id']}")

    # 8. Account-Contact linkage
    contact_signal = {
        "entity_type": "contact",
        "entity_hint": {"email": "someone@rapid7.com", "name": "Someone"},
        "fields": {"email": "someone@rapid7.com"},
    }
    account_link = link_contact_to_account(contact_signal, resolver)
    assert account_link == rapid7_id
    print(f"✓ Contact→Account linkage: {account_link}")

    # 9. Linkage via company name (no email)
    contact_signal2 = {
        "entity_type": "contact",
        "entity_hint": {"name": "Bob", "company": "Acme Corp"},
        "fields": {"fullName": "Bob", "companyName": "Acme Corp"},
    }
    account_link2 = link_contact_to_account(contact_signal2, resolver)
    assert account_link2 == acme_id
    print(f"✓ Contact→Account linkage (by name): {account_link2}")

    # 10. No linkage for free email
    contact_signal3 = {
        "entity_type": "contact",
        "entity_hint": {"email": "someone@gmail.com"},
        "fields": {"email": "someone@gmail.com"},
    }
    account_link3 = link_contact_to_account(contact_signal3, resolver)
    assert account_link3 is None
    print(f"✓ Free email → no account linkage: correct")

    # 11. Deterministic IDs
    assert make_account_id("www.Rapid7.COM") == make_account_id("rapid7.com")
    assert make_contact_id("Corey Thomas", "rapid7.com") == corey_id
    print(f"✓ Deterministic IDs: consistent (account={rapid7_id}, contact={corey_id})")

    # 12. Dupe detection
    # Add a dupe with same name but different domain
    dupe_id = make_account_id("rapid7.net")
    resolver.register("account", dupe_id, "drafts.dupe-001", {
        "name": "Rapid7",
        "domain": "rapid7.net",
    })
    dupes = find_potential_duplicates(rapid7_id, "account", resolver)
    assert len(dupes) == 1
    assert dupes[0]["reason"] == "exact_name_match"
    print(f"✓ Dupe detection: found {len(dupes)} potential duplicate(s)")

    # 13. GROQ query builder
    queries = build_resolution_queries(signal)
    assert len(queries) >= 1
    assert queries[0]["strategy"] == "domain"
    print(f"✓ GROQ query builder: {len(queries)} queries for account resolution")

    queries_contact = build_resolution_queries(signal5)
    assert queries_contact[0]["strategy"] == "email"
    print(f"✓ GROQ query builder: {len(queries_contact)} queries for contact resolution")

    print("\n=== All entity resolver tests passed ===")


if __name__ == "__main__":
    _self_test()
