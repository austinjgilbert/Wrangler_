"""
Chrome Inspector — Notification Pipeline
==========================================
Formats and dispatches Slack notifications for fusion events:
  - New account/contact created
  - Significant field updates (high-confidence changes)
  - Conflict detection (needs human review)
  - Enrichment completed
  - Stale data warnings

All messages use Slack mrkdwn format and respect the config:
  - useDraft: true → slack_send_message_draft (default, safer)
  - useDraft: false → slack_send_message (direct send)
  - defaultChannel: null → DM to user
  - dmUserId: "U079FFJ9D63"

Each formatter returns a dict ready for the Slack MCP tool:
  {
    "channel": str,        # Channel ID or user ID for DM
    "text": str,           # Plain text fallback
    "blocks": list[dict],  # Slack Block Kit blocks (optional)
    "mrkdwn": str,         # mrkdwn formatted message
    "use_draft": bool,     # Whether to use draft mode
  }
"""

from typing import Any, Optional
from datetime import datetime, timezone


# ---------------------------------------------------------------------------
# Config Defaults
# ---------------------------------------------------------------------------

DEFAULT_CONFIG = {
    "defaultChannel": None,
    "dmUserId": "U079FFJ9D63",
    "useDraft": True,
    "notifyOnScan": False,
    "notifyOnEnrichment": False,
    "notifyOnConflict": True,
    "notifyOnNewProfile": True,
}


def _get_channel(config: dict = None, channel_override: str = None) -> str:
    """Determine target channel. Override > config > DM to user."""
    if channel_override:
        return channel_override
    cfg = config or DEFAULT_CONFIG
    return cfg.get("defaultChannel") or cfg.get("dmUserId", "U079FFJ9D63")


def _use_draft(config: dict = None) -> bool:
    cfg = config or DEFAULT_CONFIG
    return cfg.get("useDraft", True)


# ---------------------------------------------------------------------------
# 1. New Account Created
# ---------------------------------------------------------------------------

def notify_new_account(account: dict, config: dict = None, channel: str = None) -> dict:
    """
    Notify when a new account is created in the Content Lake.

    account shape:
    {
      "name": str,
      "domain": str,
      "industry": str,
      "headcount": int | str,
      "source": str,
      "confidence": float,
      "sanity_id": str,
      "field_count": int,
      "gap_count": int,
    }
    """
    name = account.get("name", "Unknown")
    domain = account.get("domain", "")
    industry = account.get("industry", "—")
    headcount = account.get("headcount", "—")
    source = account.get("source", "unknown")
    confidence = account.get("confidence", 0)
    field_count = account.get("field_count", 0)
    gap_count = account.get("gap_count", 0)

    conf_emoji = "🟢" if confidence > 0.8 else "🟡" if confidence > 0.5 else "🔴"

    mrkdwn = (
        f"*🏢 New Account: {name}*\n"
        f"Domain: `{domain}` | Industry: {industry}\n"
        f"Headcount: {headcount} | Source: {source}\n"
        f"{conf_emoji} Confidence: {confidence:.0%} | Fields: {field_count} | Gaps: {gap_count}\n"
    )

    if gap_count > 3:
        mrkdwn += f"\n⚠️ {gap_count} data gaps — consider enrichment with `/chrome-inspector enrich {domain}`"

    return {
        "channel": _get_channel(config, channel),
        "text": f"New account created: {name} ({domain})",
        "mrkdwn": mrkdwn,
        "use_draft": _use_draft(config),
        "event_type": "new_account",
    }


# ---------------------------------------------------------------------------
# 2. New Contact Created
# ---------------------------------------------------------------------------

def notify_new_contact(contact: dict, config: dict = None, channel: str = None) -> dict:
    """
    Notify when a new contact is created.

    contact shape:
    {
      "name": str,
      "email": str,
      "title": str,
      "company": str,
      "source": str,
      "confidence": float,
      "account_domain": str,
    }
    """
    name = contact.get("name", "Unknown")
    email = contact.get("email", "—")
    title = contact.get("title", "—")
    company = contact.get("company", "—")
    source = contact.get("source", "unknown")
    confidence = contact.get("confidence", 0)

    conf_emoji = "🟢" if confidence > 0.8 else "🟡" if confidence > 0.5 else "🔴"

    mrkdwn = (
        f"*👤 New Contact: {name}*\n"
        f"Title: {title} @ {company}\n"
        f"Email: `{email}` | Source: {source}\n"
        f"{conf_emoji} Email confidence: {confidence:.0%}\n"
    )

    return {
        "channel": _get_channel(config, channel),
        "text": f"New contact created: {name} ({email})",
        "mrkdwn": mrkdwn,
        "use_draft": _use_draft(config),
        "event_type": "new_contact",
    }


# ---------------------------------------------------------------------------
# 3. Field Updated
# ---------------------------------------------------------------------------

def notify_field_update(update: dict, config: dict = None, channel: str = None) -> dict:
    """
    Notify when a significant field is updated on an existing account.

    update shape:
    {
      "entity_name": str,
      "entity_domain": str,
      "field_name": str,
      "old_value": Any,
      "new_value": Any,
      "old_confidence": float,
      "new_confidence": float,
      "source": str,
      "resolution": str,  # "accept", "reject", "flag"
    }
    """
    name = update.get("entity_name", "Unknown")
    domain = update.get("entity_domain", "")
    field = update.get("field_name", "unknown")
    old_val = update.get("old_value", "—")
    new_val = update.get("new_value", "—")
    old_conf = update.get("old_confidence", 0)
    new_conf = update.get("new_confidence", 0)
    source = update.get("source", "unknown")
    resolution = update.get("resolution", "accept")

    conf_delta = new_conf - old_conf
    delta_emoji = "📈" if conf_delta > 0 else "📉" if conf_delta < 0 else "↔️"

    mrkdwn = (
        f"*🔄 Field Updated: {name}* (`{domain}`)\n"
        f"Field: `{field}`\n"
        f"• Old: {old_val} ({old_conf:.0%})\n"
        f"• New: {new_val} ({new_conf:.0%}) {delta_emoji}\n"
        f"Source: {source} | Resolution: {resolution}\n"
    )

    return {
        "channel": _get_channel(config, channel),
        "text": f"Field '{field}' updated on {name}: {old_val} → {new_val}",
        "mrkdwn": mrkdwn,
        "use_draft": _use_draft(config),
        "event_type": "field_update",
    }


# ---------------------------------------------------------------------------
# 4. Conflict Detected
# ---------------------------------------------------------------------------

def notify_conflict(conflict: dict, config: dict = None, channel: str = None) -> dict:
    """
    Notify when a data conflict is detected that needs human review.

    conflict shape:
    {
      "entity_name": str,
      "entity_domain": str,
      "field_name": str,
      "values": [
        {"value": Any, "source": str, "confidence": float},
        {"value": Any, "source": str, "confidence": float},
      ],
      "reason": str,
    }
    """
    name = conflict.get("entity_name", "Unknown")
    domain = conflict.get("entity_domain", "")
    field = conflict.get("field_name", "unknown")
    values = conflict.get("values", [])
    reason = conflict.get("reason", "similar confidence from different sources")

    value_lines = "\n".join(
        f"  • {v.get('source', '?')}: {v.get('value', '?')} ({v.get('confidence', 0):.0%})"
        for v in values
    )

    mrkdwn = (
        f"*⚠️ Data Conflict: {name}* (`{domain}`)\n"
        f"Field: `{field}`\n"
        f"Conflicting values:\n{value_lines}\n"
        f"Reason: {reason}\n\n"
        f"Review with `/chrome-inspector view {domain}`"
    )

    return {
        "channel": _get_channel(config, channel),
        "text": f"Data conflict on {name}: {field} has conflicting values",
        "mrkdwn": mrkdwn,
        "use_draft": _use_draft(config),
        "event_type": "conflict",
    }


# ---------------------------------------------------------------------------
# 5. Enrichment Completed
# ---------------------------------------------------------------------------

def notify_enrichment(enrichment: dict, config: dict = None, channel: str = None) -> dict:
    """
    Notify when enrichment adds new data to a profile.

    enrichment shape:
    {
      "entity_name": str,
      "entity_domain": str,
      "source": str,
      "fields_added": list[str],
      "fields_updated": list[str],
      "gaps_remaining": int,
      "new_confidence_avg": float,
    }
    """
    name = enrichment.get("entity_name", "Unknown")
    domain = enrichment.get("entity_domain", "")
    source = enrichment.get("source", "unknown")
    added = enrichment.get("fields_added", [])
    updated = enrichment.get("fields_updated", [])
    gaps = enrichment.get("gaps_remaining", 0)
    avg_conf = enrichment.get("new_confidence_avg", 0)

    added_str = ", ".join(f"`{f}`" for f in added[:5]) if added else "none"
    updated_str = ", ".join(f"`{f}`" for f in updated[:5]) if updated else "none"

    mrkdwn = (
        f"*✨ Enrichment: {name}* (`{domain}`)\n"
        f"Source: {source}\n"
        f"• Added: {added_str}\n"
        f"• Updated: {updated_str}\n"
        f"• Remaining gaps: {gaps}\n"
        f"• Avg confidence: {avg_conf:.0%}\n"
    )

    return {
        "channel": _get_channel(config, channel),
        "text": f"Enrichment completed for {name}: {len(added)} fields added, {len(updated)} updated",
        "mrkdwn": mrkdwn,
        "use_draft": _use_draft(config),
        "event_type": "enrichment",
    }


# ---------------------------------------------------------------------------
# 6. Scan Summary
# ---------------------------------------------------------------------------

def notify_scan_summary(scan: dict, config: dict = None, channel: str = None) -> dict:
    """
    Summary notification after a Chrome page scan.

    scan shape:
    {
      "entity_name": str,
      "entity_domain": str,
      "page_type": str,
      "url": str,
      "fields_extracted": int,
      "gaps_found": int,
      "is_new": bool,
      "conflicts": int,
      "pushed_to_sanity": bool,
    }
    """
    name = scan.get("entity_name", "Unknown")
    domain = scan.get("entity_domain", "")
    page_type = scan.get("page_type", "unknown")
    url = scan.get("url", "")
    fields = scan.get("fields_extracted", 0)
    gaps = scan.get("gaps_found", 0)
    is_new = scan.get("is_new", False)
    conflicts = scan.get("conflicts", 0)
    pushed = scan.get("pushed_to_sanity", False)

    status = "🆕 New profile" if is_new else "🔄 Updated"
    push_status = "✅ Synced to Sanity" if pushed else "💾 Local only"
    conflict_note = f"\n⚠️ {conflicts} field conflict(s) detected — review needed" if conflicts > 0 else ""

    mrkdwn = (
        f"*🔍 Scan Complete: {name}*\n"
        f"{status} | {push_status}\n"
        f"Source: {page_type} | Fields: {fields} | Gaps: {gaps}\n"
        f"URL: {url[:80]}"
        f"{conflict_note}"
    )

    return {
        "channel": _get_channel(config, channel),
        "text": f"Scan complete: {name} ({page_type}) - {fields} fields, {gaps} gaps",
        "mrkdwn": mrkdwn,
        "use_draft": _use_draft(config),
        "event_type": "scan",
    }


# ---------------------------------------------------------------------------
# 7. Batch Summary (end of multi-scan or scheduled job)
# ---------------------------------------------------------------------------

def notify_batch_summary(batch: dict, config: dict = None, channel: str = None) -> dict:
    """
    Summary of a batch operation (multiple scans, enrichments, etc.)

    batch shape:
    {
      "operation": str,  # "scan", "enrichment", "refresh"
      "total": int,
      "succeeded": int,
      "failed": int,
      "new_accounts": int,
      "new_contacts": int,
      "conflicts_found": int,
      "duration_seconds": float,
    }
    """
    op = batch.get("operation", "batch")
    total = batch.get("total", 0)
    succeeded = batch.get("succeeded", 0)
    failed = batch.get("failed", 0)
    new_accts = batch.get("new_accounts", 0)
    new_contacts = batch.get("new_contacts", 0)
    conflicts = batch.get("conflicts_found", 0)
    duration = batch.get("duration_seconds", 0)

    success_rate = f"{succeeded}/{total}" if total > 0 else "0/0"
    conflict_note = f"\n⚠️ {conflicts} conflict(s) need review" if conflicts > 0 else ""

    mrkdwn = (
        f"*📊 Batch {op.title()} Complete*\n"
        f"Processed: {success_rate}"
        f"{f' ({failed} failed)' if failed > 0 else ''}\n"
        f"New accounts: {new_accts} | New contacts: {new_contacts}\n"
        f"Duration: {duration:.1f}s"
        f"{conflict_note}"
    )

    return {
        "channel": _get_channel(config, channel),
        "text": f"Batch {op} complete: {succeeded}/{total} succeeded",
        "mrkdwn": mrkdwn,
        "use_draft": _use_draft(config),
        "event_type": "batch",
    }


# ---------------------------------------------------------------------------
# Notification Dispatcher
# ---------------------------------------------------------------------------

NOTIFICATION_REGISTRY = {
    "new_account": notify_new_account,
    "new_contact": notify_new_contact,
    "field_update": notify_field_update,
    "conflict": notify_conflict,
    "enrichment": notify_enrichment,
    "scan": notify_scan_summary,
    "batch": notify_batch_summary,
}


def should_notify(event_type: str, config: dict = None) -> bool:
    """Check if notifications are enabled for this event type."""
    cfg = config or DEFAULT_CONFIG
    rules = {
        "new_account": cfg.get("notifyOnNewProfile", True),
        "new_contact": cfg.get("notifyOnNewProfile", True),
        "field_update": True,  # Always notify on field changes
        "conflict": cfg.get("notifyOnConflict", True),
        "enrichment": cfg.get("notifyOnEnrichment", False),
        "scan": cfg.get("notifyOnScan", False),
        "batch": True,  # Always notify on batch completion
    }
    return rules.get(event_type, False)


def dispatch_notification(event_type: str, data: dict, config: dict = None, channel: str = None) -> Optional[dict]:
    """
    Build a notification if the event type is enabled.
    Returns the formatted message dict or None if notifications are suppressed.
    """
    if not should_notify(event_type, config):
        return None

    formatter = NOTIFICATION_REGISTRY.get(event_type)
    if not formatter:
        return None

    return formatter(data, config=config, channel=channel)


# ---------------------------------------------------------------------------
# Self-Test
# ---------------------------------------------------------------------------

def _self_test():
    print("=== Notification Pipeline Self-Test ===\n")

    # 1. New account
    msg = notify_new_account({
        "name": "Rapid7",
        "domain": "rapid7.com",
        "industry": "Cybersecurity",
        "headcount": 2400,
        "source": "linkedin",
        "confidence": 0.85,
        "field_count": 8,
        "gap_count": 4,
    })
    assert msg["event_type"] == "new_account"
    assert "Rapid7" in msg["mrkdwn"]
    assert "rapid7.com" in msg["mrkdwn"]
    assert msg["use_draft"] is True
    assert "enrichment" in msg["mrkdwn"]  # 4 gaps should trigger enrichment suggestion
    print(f"✓ New account notification: channel={msg['channel']}")

    # 2. New contact
    msg = notify_new_contact({
        "name": "Corey Thomas",
        "email": "cthomas@rapid7.com",
        "title": "CEO",
        "company": "Rapid7",
        "source": "apollo",
        "confidence": 0.6,
    })
    assert "Corey Thomas" in msg["mrkdwn"]
    assert "🟡" in msg["mrkdwn"]  # Medium confidence
    print(f"✓ New contact notification: {msg['text'][:50]}")

    # 3. Field update
    msg = notify_field_update({
        "entity_name": "Rapid7",
        "entity_domain": "rapid7.com",
        "field_name": "industry",
        "old_value": "Technology",
        "new_value": "Cybersecurity",
        "old_confidence": 0.60,
        "new_confidence": 0.85,
        "source": "salesforce",
        "resolution": "accept",
    })
    assert "Technology" in msg["mrkdwn"]
    assert "Cybersecurity" in msg["mrkdwn"]
    assert "📈" in msg["mrkdwn"]  # Confidence increased
    print(f"✓ Field update notification: industry changed")

    # 4. Conflict
    msg = notify_conflict({
        "entity_name": "Rapid7",
        "entity_domain": "rapid7.com",
        "field_name": "headcount",
        "values": [
            {"value": 2400, "source": "linkedin", "confidence": 0.75},
            {"value": 2200, "source": "crunchbase", "confidence": 0.72},
        ],
        "reason": "similar confidence from different sources",
    })
    assert "⚠️" in msg["mrkdwn"]
    assert "headcount" in msg["mrkdwn"]
    assert "linkedin" in msg["mrkdwn"]
    assert "crunchbase" in msg["mrkdwn"]
    print(f"✓ Conflict notification: headcount conflict flagged")

    # 5. Enrichment
    msg = notify_enrichment({
        "entity_name": "Rapid7",
        "entity_domain": "rapid7.com",
        "source": "common_room",
        "fields_added": ["engagementScore", "recentSignals"],
        "fields_updated": ["headcount"],
        "gaps_remaining": 2,
        "new_confidence_avg": 0.82,
    })
    assert "enrichment" in msg["event_type"]
    assert "`engagementScore`" in msg["mrkdwn"]
    print(f"✓ Enrichment notification: 2 added, 1 updated")

    # 6. Scan summary
    msg = notify_scan_summary({
        "entity_name": "Rapid7",
        "entity_domain": "rapid7.com",
        "page_type": "linkedin_company",
        "url": "https://linkedin.com/company/rapid7",
        "fields_extracted": 8,
        "gaps_found": 4,
        "is_new": True,
        "conflicts": 1,
        "pushed_to_sanity": True,
    })
    assert "🆕" in msg["mrkdwn"]
    assert "Synced to Sanity" in msg["mrkdwn"]
    assert "1 field conflict" in msg["mrkdwn"]
    print(f"✓ Scan summary notification: new profile with conflict")

    # 7. Batch summary
    msg = notify_batch_summary({
        "operation": "enrichment",
        "total": 10,
        "succeeded": 8,
        "failed": 2,
        "new_accounts": 3,
        "new_contacts": 5,
        "conflicts_found": 2,
        "duration_seconds": 45.3,
    })
    assert "8/10" in msg["mrkdwn"]
    assert "2 failed" in msg["mrkdwn"]
    assert "45.3s" in msg["mrkdwn"]
    print(f"✓ Batch summary notification: 8/10 succeeded")

    # 8. Should_notify respects config
    assert should_notify("conflict") is True  # Default on
    assert should_notify("enrichment") is False  # Default off
    assert should_notify("scan") is False  # Default off
    assert should_notify("new_account") is True  # Default on

    custom_config = {**DEFAULT_CONFIG, "notifyOnEnrichment": True, "notifyOnScan": True}
    assert should_notify("enrichment", custom_config) is True
    assert should_notify("scan", custom_config) is True
    print(f"✓ Config-based notification filtering works")

    # 9. Dispatch
    result = dispatch_notification("conflict", {
        "entity_name": "Test",
        "entity_domain": "test.com",
        "field_name": "industry",
        "values": [],
        "reason": "test",
    })
    assert result is not None
    print(f"✓ Dispatch: conflict → notification generated")

    # Enrichment suppressed by default
    result = dispatch_notification("enrichment", {"entity_name": "Test"})
    assert result is None
    print(f"✓ Dispatch: enrichment → suppressed (config)")

    # 10. Channel override
    msg = notify_new_account({"name": "Test", "domain": "test.com"}, channel="C0123TEST")
    assert msg["channel"] == "C0123TEST"
    print(f"✓ Channel override: {msg['channel']}")

    print("\n=== All notification pipeline tests passed ===")


if __name__ == "__main__":
    _self_test()
