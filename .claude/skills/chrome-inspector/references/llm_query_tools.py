"""
Chrome Inspector — LLM Query Tools
====================================
GROQ query templates and tool definitions that Claude uses to
search, retrieve, and analyze fused account/contact data in Sanity.

These queries are designed for the Sanity MCP tool `query_documents`
with project ql62wkk2, dataset production.

Each tool function returns:
  - The GROQ query string
  - The params dict
  - A description of what the query does (for Claude's context)

Claude calls these as part of its reasoning chain when the user asks
questions about prospects, accounts, or contacts.
"""

from typing import Optional


# ---------------------------------------------------------------------------
# Project Config
# ---------------------------------------------------------------------------

SANITY_PROJECT = "ql62wkk2"
SANITY_DATASET = "production"


# ---------------------------------------------------------------------------
# 1. Search Accounts
# ---------------------------------------------------------------------------

GROQ_SEARCH_ACCOUNTS = """
*[_type == "account" && (
  legalName.value match $query ||
  domain.value match $query ||
  industry.value match $query ||
  description.value match $query
)] | order(_updatedAt desc) [0...$limit] {
  _id,
  _updatedAt,
  "name": legalName.value,
  "nameConfidence": legalName.confidence,
  "domain": domain.value,
  "industry": industry.value,
  "headcount": headcount.value,
  "hqCity": hqCity.value,
  "stage": stage.value,
  "accountType": accountType.value,
  "ownerName": ownerName.value,
  "needsReview": needsReview,
  "fusionVersion": fusionVersion,
  "sourceCount": count(sources),
  "sources": sources[].name,
}
"""


def search_accounts(query: str, limit: int = 10) -> dict:
    """
    Search accounts by name, domain, industry, or description.

    Usage: When user asks "what companies do we know about?" or
    "find accounts in cybersecurity" or "search for rapid7"
    """
    return {
        "query": GROQ_SEARCH_ACCOUNTS,
        "params": {"query": f"*{query}*", "limit": limit},
        "project_id": SANITY_PROJECT,
        "dataset": SANITY_DATASET,
        "description": f"Search accounts matching '{query}'",
    }


# ---------------------------------------------------------------------------
# 2. Get Account Detail
# ---------------------------------------------------------------------------

GROQ_GET_ACCOUNT = """
*[_type == "account" && (domain.value == $domain || _id == $id)][0] {
  _id,
  _createdAt,
  _updatedAt,

  // Core fields with confidence
  "name": legalName { value, confidence, certain, source, updated },
  "domain": domain { value, confidence, source },
  "industry": industry { value, confidence, source },
  "headcount": headcount { value, confidence, source, conflictingValues },
  "hqCity": hqCity { value, confidence, source },
  "description": description { value, confidence, source },
  "stage": stage { value, confidence, source },
  "accountType": accountType { value, confidence, source },
  "annualRevenue": annualRevenue { value, confidence, source },
  "phone": phone { value, confidence, source },
  "ownerName": ownerName { value, confidence, source },
  "websiteUrl": websiteUrl { value, confidence, source },
  "linkedinUrl": linkedinUrl { value, confidence, source },

  // Fusion metadata
  fusionVersion,
  needsReview,
  uncertainFields,
  "sourceCount": count(sources),
  sources[] { name, firstSeen, lastSeen, signalCount },

  // Relationships
  "contacts": *[_type == "contact" && account._ref == ^._id] {
    _id,
    "name": fullName.value,
    "title": jobTitle.value,
    "email": email.value,
    "confidence": email.confidence,
  } | order(jobTitle.value asc) [0..9],

  // Activity signals
  "lastSlackMention": lastMentionedInSlack.value,
  "lastEmailContact": lastEmailContact.value,
  "lastMeetingDate": lastMeetingDate.value,
  "nextMeetingDate": nextMeetingDate.value,
  "slackSentiment": slackSentiment.value,
  "engagementScore": engagementScore.value,
}
"""


def get_account(domain: str = None, sanity_id: str = None) -> dict:
    """
    Get full account detail with all confidence data, contacts, and activity.

    Usage: When user asks "tell me about rapid7.com" or
    "what do we know about Rapid7?" or "show account detail"
    """
    return {
        "query": GROQ_GET_ACCOUNT,
        "params": {
            "domain": domain or "",
            "id": sanity_id or "",
        },
        "project_id": SANITY_PROJECT,
        "dataset": SANITY_DATASET,
        "description": f"Get full detail for account {domain or sanity_id}",
    }


# ---------------------------------------------------------------------------
# 3. Get Contact Detail
# ---------------------------------------------------------------------------

GROQ_GET_CONTACT = """
*[_type == "contact" && (email.value == $email || _id == $id)][0] {
  _id,
  _createdAt,
  _updatedAt,

  "fullName": fullName { value, confidence, source },
  "firstName": firstName { value, confidence, source },
  "lastName": lastName { value, confidence, source },
  "email": email { value, confidence, source },
  "jobTitle": jobTitle { value, confidence, source },
  "phone": phone { value, confidence, source },
  "linkedinUrl": linkedinUrl { value, confidence, source },
  "department": department { value, confidence, source },
  "location": location { value, confidence, source },
  "companyName": companyName { value, confidence, source },

  // Account linkage
  "account": account-> {
    _id,
    "name": legalName.value,
    "domain": domain.value,
    "industry": industry.value,
  },

  // Fusion metadata
  fusionVersion,
  needsReview,
  uncertainFields,
  sources[] { name, firstSeen, lastSeen, signalCount },

  // Activity
  "lastMeetingDate": lastMeetingDate.value,
  "lastEmailContact": lastEmailContact.value,
}
"""


def get_contact(email: str = None, sanity_id: str = None) -> dict:
    """
    Get full contact detail with confidence data and account linkage.

    Usage: When user asks "who is cthomas@rapid7.com?" or
    "show me Corey Thomas's profile"
    """
    return {
        "query": GROQ_GET_CONTACT,
        "params": {
            "email": email or "",
            "id": sanity_id or "",
        },
        "project_id": SANITY_PROJECT,
        "dataset": SANITY_DATASET,
        "description": f"Get full detail for contact {email or sanity_id}",
    }


# ---------------------------------------------------------------------------
# 4. Find Contacts at Account
# ---------------------------------------------------------------------------

GROQ_CONTACTS_AT_ACCOUNT = """
*[_type == "contact" && (
  account._ref == $accountId ||
  email.value match ("*@" + $domain)
)] | order(jobTitle.value asc) {
  _id,
  "name": fullName.value,
  "title": jobTitle.value,
  "email": email.value,
  "emailConfidence": email.confidence,
  "phone": phone.value,
  "department": department.value,
  "linkedinUrl": linkedinUrl.value,
  "lastMeeting": lastMeetingDate.value,
  "sourceCount": count(sources),
} [0...$limit]
"""


def get_contacts_at_account(domain: str = None, account_id: str = None, limit: int = 20) -> dict:
    """
    Find all contacts linked to an account.

    Usage: When user asks "who do we know at rapid7?" or
    "list contacts at Rapid7"
    """
    return {
        "query": GROQ_CONTACTS_AT_ACCOUNT,
        "params": {
            "accountId": account_id or "",
            "domain": domain or "",
            "limit": limit,
        },
        "project_id": SANITY_PROJECT,
        "dataset": SANITY_DATASET,
        "description": f"Find contacts at {domain or account_id}",
    }


# ---------------------------------------------------------------------------
# 5. Accounts Needing Review
# ---------------------------------------------------------------------------

GROQ_ACCOUNTS_NEEDING_REVIEW = """
*[_type == "account" && needsReview == true] | order(_updatedAt desc) [0...$limit] {
  _id,
  "name": legalName.value,
  "domain": domain.value,
  "uncertainFields": uncertainFields,
  "headcountConflict": headcount.conflictingValues,
  "sourceCount": count(sources),
  "sources": sources[].name,
  _updatedAt,
}
"""


def accounts_needing_review(limit: int = 20) -> dict:
    """
    Find accounts with conflicts or low-confidence data needing human review.

    Usage: When user asks "which accounts need attention?" or
    "show me accounts with data conflicts"
    """
    return {
        "query": GROQ_ACCOUNTS_NEEDING_REVIEW,
        "params": {"limit": limit},
        "project_id": SANITY_PROJECT,
        "dataset": SANITY_DATASET,
        "description": "Find accounts needing human review",
    }


# ---------------------------------------------------------------------------
# 6. Stale Accounts
# ---------------------------------------------------------------------------

GROQ_STALE_ACCOUNTS = """
*[_type == "account" && _updatedAt < $cutoffDate] | order(_updatedAt asc) [0...$limit] {
  _id,
  "name": legalName.value,
  "domain": domain.value,
  "industry": industry.value,
  "lastUpdated": _updatedAt,
  "daysSinceUpdate": dateDiff(now(), _updatedAt, "day"),
  "sourceCount": count(sources),
}
"""


def stale_accounts(days_old: int = 30, limit: int = 20) -> dict:
    """
    Find accounts that haven't been updated recently.

    Usage: When user asks "which accounts are stale?" or
    "show profiles that need refreshing"
    """
    from datetime import datetime, timezone, timedelta
    cutoff = (datetime.now(timezone.utc) - timedelta(days=days_old)).strftime("%Y-%m-%dT%H:%M:%SZ")
    return {
        "query": GROQ_STALE_ACCOUNTS,
        "params": {"cutoffDate": cutoff, "limit": limit},
        "project_id": SANITY_PROJECT,
        "dataset": SANITY_DATASET,
        "description": f"Find accounts not updated in {days_old}+ days",
    }


# ---------------------------------------------------------------------------
# 7. High Confidence Accounts
# ---------------------------------------------------------------------------

GROQ_HIGH_CONFIDENCE_ACCOUNTS = """
*[_type == "account" && legalName.confidence > $minConfidence && needsReview != true]
  | order(legalName.confidence desc) [0...$limit] {
  _id,
  "name": legalName.value,
  "nameConfidence": legalName.confidence,
  "domain": domain.value,
  "industry": industry.value,
  "headcount": headcount.value,
  "sourceCount": count(sources),
  "sources": sources[].name,
  fusionVersion,
}
"""


def high_confidence_accounts(min_confidence: float = 0.8, limit: int = 20) -> dict:
    """
    Find accounts with high-confidence data (well-corroborated).

    Usage: When user asks "which accounts have the best data?" or
    "show me our most complete profiles"
    """
    return {
        "query": GROQ_HIGH_CONFIDENCE_ACCOUNTS,
        "params": {"minConfidence": min_confidence, "limit": limit},
        "project_id": SANITY_PROJECT,
        "dataset": SANITY_DATASET,
        "description": f"Find accounts with confidence > {min_confidence}",
    }


# ---------------------------------------------------------------------------
# 8. Account Activity Summary
# ---------------------------------------------------------------------------

GROQ_ACCOUNT_ACTIVITY = """
*[_type == "account" && domain.value == $domain][0] {
  _id,
  "name": legalName.value,
  "domain": domain.value,

  // Communication signals
  "lastSlackMention": lastMentionedInSlack.value,
  "slackSentiment": slackSentiment.value,
  "slackContext": slackMentionContext.value,
  "lastEmail": lastEmailContact.value,
  "emailDirection": select(
    defined(lastEmailContact) => "check email for details",
    "no email data"
  ),

  // Meeting signals
  "lastMeeting": lastMeetingDate.value,
  "nextMeeting": nextMeetingDate.value,
  "meetingSummary": meetingSummary.value,

  // Engagement
  "engagementScore": engagementScore.value,
  "recentSignals": recentSignals[0..4],

  // Key contacts with recent activity
  "activeContacts": *[_type == "contact" && account._ref == ^._id && defined(lastMeetingDate.value)] {
    "name": fullName.value,
    "title": jobTitle.value,
    "lastMeeting": lastMeetingDate.value,
    "email": email.value,
  } | order(lastMeetingDate.value desc) [0..4],
}
"""


def account_activity(domain: str) -> dict:
    """
    Get activity summary for an account — recent comms, meetings, engagement.

    Usage: When user asks "what's the latest with rapid7?" or
    "any recent activity for this account?"
    """
    return {
        "query": GROQ_ACCOUNT_ACTIVITY,
        "params": {"domain": domain},
        "project_id": SANITY_PROJECT,
        "dataset": SANITY_DATASET,
        "description": f"Get activity summary for {domain}",
    }


# ---------------------------------------------------------------------------
# 9. Pipeline Stats
# ---------------------------------------------------------------------------

GROQ_PIPELINE_STATS = """
{
  "totalAccounts": count(*[_type == "account"]),
  "totalContacts": count(*[_type == "contact"]),
  "needsReview": count(*[_type == "account" && needsReview == true]),
  "highConfidence": count(*[_type == "account" && legalName.confidence > 0.8]),
  "multiSource": count(*[_type == "account" && count(sources) > 1]),
  "recentlyUpdated": count(*[_type == "account" && _updatedAt > $recentCutoff]),
  "topIndustries": *[_type == "account" && defined(industry.value)] {
    "industry": industry.value
  } | order(industry.value asc),
}
"""


def pipeline_stats() -> dict:
    """
    Get overall pipeline statistics.

    Usage: When user asks "how's the pipeline looking?" or
    "show system status" or "/chrome-inspector status"
    """
    from datetime import datetime, timezone, timedelta
    recent = (datetime.now(timezone.utc) - timedelta(days=7)).strftime("%Y-%m-%dT%H:%M:%SZ")
    return {
        "query": GROQ_PIPELINE_STATS,
        "params": {"recentCutoff": recent},
        "project_id": SANITY_PROJECT,
        "dataset": SANITY_DATASET,
        "description": "Get pipeline stats and system health",
    }


# ---------------------------------------------------------------------------
# 10. Semantic Search (if embeddings index exists)
# ---------------------------------------------------------------------------

GROQ_SEMANTIC_SEARCH_FALLBACK = """
*[_type == "account" && (
  legalName.value match $query ||
  description.value match $query ||
  industry.value match $query
)] | score(
  boost(legalName.value match $query, 5),
  boost(industry.value match $query, 3),
  boost(description.value match $query, 1)
) | order(_score desc) [0...$limit] {
  _id,
  _score,
  "name": legalName.value,
  "domain": domain.value,
  "industry": industry.value,
  "description": description.value,
  "headcount": headcount.value,
  "sourceCount": count(sources),
}
"""


def smart_search(query: str, limit: int = 10) -> dict:
    """
    Boosted relevance search with scoring.

    Usage: When user asks a broad question like
    "find cybersecurity companies with over 1000 employees"
    """
    return {
        "query": GROQ_SEMANTIC_SEARCH_FALLBACK,
        "params": {"query": f"*{query}*", "limit": limit},
        "project_id": SANITY_PROJECT,
        "dataset": SANITY_DATASET,
        "description": f"Smart search for '{query}' with relevance scoring",
    }


# ---------------------------------------------------------------------------
# Tool Registry — Claude reads this to know what's available
# ---------------------------------------------------------------------------

TOOL_REGISTRY = {
    "search_accounts": {
        "function": search_accounts,
        "description": "Search accounts by name, domain, industry, or description",
        "triggers": ["find accounts", "search companies", "look up", "which accounts"],
        "params": {"query": "str (required)", "limit": "int (default 10)"},
    },
    "get_account": {
        "function": get_account,
        "description": "Get full account detail with confidence scores, contacts, and activity",
        "triggers": ["tell me about", "account detail", "show account", "what do we know about"],
        "params": {"domain": "str", "sanity_id": "str"},
    },
    "get_contact": {
        "function": get_contact,
        "description": "Get full contact detail with confidence and account linkage",
        "triggers": ["who is", "contact detail", "show contact", "look up person"],
        "params": {"email": "str", "sanity_id": "str"},
    },
    "get_contacts_at_account": {
        "function": get_contacts_at_account,
        "description": "Find all contacts linked to an account",
        "triggers": ["who do we know at", "list contacts at", "people at"],
        "params": {"domain": "str", "account_id": "str", "limit": "int (default 20)"},
    },
    "accounts_needing_review": {
        "function": accounts_needing_review,
        "description": "Find accounts with data conflicts needing human review",
        "triggers": ["needs attention", "data conflicts", "review queue", "needs review"],
        "params": {"limit": "int (default 20)"},
    },
    "stale_accounts": {
        "function": stale_accounts,
        "description": "Find accounts not updated recently",
        "triggers": ["stale", "outdated", "needs refresh", "old data"],
        "params": {"days_old": "int (default 30)", "limit": "int (default 20)"},
    },
    "high_confidence_accounts": {
        "function": high_confidence_accounts,
        "description": "Find well-corroborated accounts with high confidence data",
        "triggers": ["best data", "most complete", "high confidence", "reliable profiles"],
        "params": {"min_confidence": "float (default 0.8)", "limit": "int (default 20)"},
    },
    "account_activity": {
        "function": account_activity,
        "description": "Get recent activity for an account — Slack, email, meetings, engagement",
        "triggers": ["latest with", "recent activity", "what's happening with", "any updates on"],
        "params": {"domain": "str (required)"},
    },
    "pipeline_stats": {
        "function": pipeline_stats,
        "description": "Get overall pipeline statistics and system health",
        "triggers": ["pipeline", "status", "system health", "how many accounts"],
        "params": {},
    },
    "smart_search": {
        "function": smart_search,
        "description": "Boosted relevance search with scoring",
        "triggers": ["find companies that", "search for", "broad search"],
        "params": {"query": "str (required)", "limit": "int (default 10)"},
    },
}


# ---------------------------------------------------------------------------
# Query Dispatcher — select the right tool based on user intent
# ---------------------------------------------------------------------------

def dispatch_query(user_intent: str, **kwargs) -> dict:
    """
    Given a natural language intent, select and return the appropriate
    GROQ query tool result.

    This is a helper for Claude's reasoning — Claude can also call
    individual tool functions directly.
    """
    intent_lower = user_intent.lower()

    # Pattern match to tool
    if any(t in intent_lower for t in ["search", "find account", "look up compan"]):
        query = kwargs.get("query", user_intent)
        return search_accounts(query)

    if any(t in intent_lower for t in ["tell me about", "account detail", "what do we know"]):
        return get_account(domain=kwargs.get("domain"), sanity_id=kwargs.get("id"))

    if any(t in intent_lower for t in ["who is", "contact detail", "person"]):
        return get_contact(email=kwargs.get("email"), sanity_id=kwargs.get("id"))

    if any(t in intent_lower for t in ["who do we know at", "contacts at", "people at"]):
        return get_contacts_at_account(domain=kwargs.get("domain"))

    if any(t in intent_lower for t in ["needs review", "conflict", "attention"]):
        return accounts_needing_review()

    if any(t in intent_lower for t in ["stale", "outdated", "old"]):
        return stale_accounts(days_old=kwargs.get("days", 30))

    if any(t in intent_lower for t in ["best data", "high confidence", "complete"]):
        return high_confidence_accounts()

    if any(t in intent_lower for t in ["latest", "activity", "happening", "updates"]):
        return account_activity(domain=kwargs.get("domain", ""))

    if any(t in intent_lower for t in ["stats", "status", "pipeline", "how many"]):
        return pipeline_stats()

    # Fallback to smart search
    return smart_search(user_intent)


# ---------------------------------------------------------------------------
# Self-Test
# ---------------------------------------------------------------------------

def _self_test():
    print("=== LLM Query Tools Self-Test ===\n")

    # 1. Search accounts
    result = search_accounts("rapid7")
    assert result["project_id"] == SANITY_PROJECT
    assert "$query" in result["query"]
    assert result["params"]["query"] == "*rapid7*"
    print(f"✓ search_accounts: query={result['params']['query']}")

    # 2. Get account
    result = get_account(domain="rapid7.com")
    assert "domain.value == $domain" in result["query"]
    assert result["params"]["domain"] == "rapid7.com"
    print(f"✓ get_account: domain={result['params']['domain']}")

    # 3. Get contact
    result = get_contact(email="cthomas@rapid7.com")
    assert "email.value == $email" in result["query"]
    print(f"✓ get_contact: email={result['params']['email']}")

    # 4. Contacts at account
    result = get_contacts_at_account(domain="rapid7.com")
    assert "$domain" in result["query"]
    print(f"✓ get_contacts_at_account: domain={result['params']['domain']}")

    # 5. Accounts needing review
    result = accounts_needing_review()
    assert "needsReview == true" in result["query"]
    print(f"✓ accounts_needing_review: query built")

    # 6. Stale accounts
    result = stale_accounts(days_old=60)
    assert "cutoffDate" in result["params"]
    print(f"✓ stale_accounts: cutoff={result['params']['cutoffDate'][:10]}")

    # 7. High confidence
    result = high_confidence_accounts(min_confidence=0.9)
    assert result["params"]["minConfidence"] == 0.9
    print(f"✓ high_confidence_accounts: min={result['params']['minConfidence']}")

    # 8. Account activity
    result = account_activity("rapid7.com")
    assert "lastMeeting" in result["query"] or "lastMeetingDate" in result["query"]
    print(f"✓ account_activity: domain={result['params']['domain']}")

    # 9. Pipeline stats
    result = pipeline_stats()
    assert "totalAccounts" in result["query"]
    print(f"✓ pipeline_stats: query built")

    # 10. Smart search
    result = smart_search("cybersecurity")
    assert "score(" in result["query"]
    print(f"✓ smart_search: query={result['params']['query']}")

    # 11. Tool registry
    assert len(TOOL_REGISTRY) == 10
    for name, tool in TOOL_REGISTRY.items():
        assert "function" in tool
        assert "description" in tool
        assert "triggers" in tool
    print(f"✓ Tool registry: {len(TOOL_REGISTRY)} tools registered")

    # 12. Dispatch
    result = dispatch_query("search for cybersecurity companies", query="cybersecurity")
    assert "*cybersecurity*" in result["params"]["query"]
    print(f"✓ Dispatch: search → search_accounts")

    result = dispatch_query("what's the latest with rapid7?", domain="rapid7.com")
    assert result["params"]["domain"] == "rapid7.com"
    print(f"✓ Dispatch: activity → account_activity")

    result = dispatch_query("how many accounts do we have?")
    assert "totalAccounts" in result["query"]
    print(f"✓ Dispatch: stats → pipeline_stats")

    print("\n=== All LLM query tool tests passed ===")


if __name__ == "__main__":
    _self_test()
