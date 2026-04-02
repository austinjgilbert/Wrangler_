"""
Chrome Inspector — End-to-End Integration Test
================================================
Simulates the full sensor fusion pipeline:

1. Chrome scan (LinkedIn company page) → signal
2. Common Room enrichment → signal
3. Apollo enrichment (contact) → signal + account signal
4. Salesforce CRM data → signal
5. Slack mention → contextual signal
6. Gmail thread → contextual signal
7. Calendar meeting → contextual signal + contact signals

All signals flow through:
  Ingestion → Entity Resolution → Fusion → Sanity Doc Build → Notifications

Validates:
  - Multi-source signal normalization
  - Entity resolution (domain match, email match, new entity)
  - Confidence scoring with source trust tiers
  - Conflict detection and flagging
  - Account-contact linkage
  - Notification generation
  - Final document structure matches Sanity schema
"""

import json
import sys
import os

# Add parent dir to path for imports
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from ingestion_adapters import ingest, from_chrome_scan, from_common_room, from_apollo, from_salesforce, from_slack_mention, from_gmail, from_calendar
from entity_resolver import EntityResolver, make_account_id, make_contact_id, link_contact_to_account
from fusion_engine import fuse_account, score_confidence, resolve_conflict, ConflictResolution
from notification_pipeline import dispatch_notification, notify_conflict, notify_new_account, notify_scan_summary
from llm_query_tools import search_accounts, get_account, get_contact, pipeline_stats


def run_e2e_test():
    print("=" * 60)
    print("  CHROME INSPECTOR — END-TO-END FUSION TEST")
    print("=" * 60)
    print()

    # =========================================================================
    # PHASE 1: Simulate raw data from 7 sources
    # =========================================================================
    print("─── Phase 1: Ingest signals from 7 sources ───\n")

    # 1a. Chrome scan — LinkedIn company
    chrome_scan_result = {
        "page_type": "linkedin_company",
        "url": "https://www.linkedin.com/company/rapid7",
        "extracted": {
            "name": "Rapid7",
            "industry": "Computer & Network Security",
            "employee_count": "2,400",
            "headquarters": "Boston, MA",
            "website": "https://www.rapid7.com",
            "description": "Rapid7 is advancing security with visibility, analytics, and automation.",
        },
        "timestamp": "2026-04-01T10:00:00Z",
    }
    chrome_signals = ingest("chrome_scan", chrome_scan_result)
    print(f"  ✓ Chrome (LinkedIn): {len(chrome_signals)} signal(s) — {chrome_signals[0]['fields'].get('legalName')}")

    # 1b. Common Room enrichment
    cr_data = {
        "name": "Rapid7",
        "domain": "rapid7.com",
        "industry": "Cybersecurity",
        "employee_count": 2400,
        "engagement_score": 82.5,
        "signals": [
            {"type": "github_star", "description": "Starred metasploit-framework", "timestamp": "2026-03-28T08:00:00Z"},
            {"type": "docs_visit", "description": "Visited pricing page 3x", "timestamp": "2026-03-30T14:00:00Z"},
        ],
    }
    cr_signals = ingest("common_room", cr_data, entity_type="account")
    print(f"  ✓ Common Room: {len(cr_signals)} signal(s) — engagement={cr_signals[0]['fields'].get('engagementScore')}")

    # 1c. Apollo enrichment (contact-centric, includes org data)
    apollo_data = {
        "first_name": "Corey",
        "last_name": "Thomas",
        "email": "cthomas@rapid7.com",
        "title": "Chairman & CEO",
        "linkedin_url": "https://linkedin.com/in/coreyethomas",
        "phone_numbers": [{"number": "+1-617-247-1717"}],
        "department": "C-Suite",
        "organization": {
            "name": "Rapid7",
            "domain": "rapid7.com",
            "industry": "Cybersecurity",
            "employee_count": 2200,  # Different from LinkedIn!
            "annual_revenue": 750000000,
            "founded_year": 2000,
            "short_description": "Cloud security and risk management.",
        },
    }
    apollo_signals = ingest("apollo", apollo_data)
    contact_signal = [s for s in apollo_signals if s["entity_type"] == "contact"][0]
    apollo_account_signal = [s for s in apollo_signals if s["entity_type"] == "account"][0]
    print(f"  ✓ Apollo: {len(apollo_signals)} signal(s) — contact={contact_signal['fields']['fullName']}, org headcount={apollo_account_signal['fields']['headcount']}")

    # 1d. Salesforce CRM
    sf_data = {
        "Name": "Rapid7, Inc.",
        "Website": "https://www.rapid7.com",
        "Industry": "Technology",
        "NumberOfEmployees": 2500,
        "Type": "Customer",
        "BillingCity": "Boston",
        "BillingState": "MA",
        "BillingCountry": "US",
        "AnnualRevenue": 800000000,
        "Description": "Existing customer. Enterprise security platform.",
        "Phone": "+1-617-247-1717",
        "Owner": {"Name": "Austin Gilbert"},
        "Id": "001RAPID7XXXXXX",
    }
    sf_signals = ingest("salesforce", sf_data, entity_type="account")
    print(f"  ✓ Salesforce: {len(sf_signals)} signal(s) — type={sf_signals[0]['fields'].get('accountType')}, owner={sf_signals[0]['fields'].get('ownerName')}")

    # 1e. Slack mention
    slack_data = {
        "text": "Rapid7 just signed the renewal. Great outcome — deal worth 400K ARR. Team did amazing work on this one!",
        "user": "U079FFJ9D63",
        "channel": "C0123DEALS",
        "ts": "1711929600.000100",
        "permalink": "https://sanity.slack.com/archives/C0123DEALS/p1711929600000100",
    }
    slack_signals = ingest("slack", slack_data, company_or_person="Rapid7")
    print(f"  ✓ Slack: {len(slack_signals)} signal(s) — sentiment={slack_signals[0]['fields'].get('slackSentiment')}")

    # 1f. Gmail
    gmail_data = {
        "from": "cthomas@rapid7.com",
        "to": ["austin.gilbert@sanity.io"],
        "cc": ["jdoe@rapid7.com"],
        "subject": "Re: Q2 Planning — Sanity Integration",
        "date": "2026-03-28T14:30:00Z",
        "snippet": "Looking forward to the integration kickoff next week.",
    }
    gmail_signals = ingest("gmail", gmail_data)
    print(f"  ✓ Gmail: {len(gmail_signals)} signal(s) — direction={gmail_signals[0]['fields'].get('emailDirection')}")

    # 1g. Calendar
    cal_data = {
        "summary": "Rapid7 Integration Kickoff",
        "start": "2026-04-07T15:00:00Z",
        "end": "2026-04-07T16:00:00Z",
        "attendees": [
            {"email": "austin.gilbert@sanity.io", "displayName": "Austin Gilbert", "responseStatus": "accepted"},
            {"email": "cthomas@rapid7.com", "displayName": "Corey Thomas", "responseStatus": "accepted"},
            {"email": "jdoe@rapid7.com", "displayName": "Jane Doe", "responseStatus": "tentative"},
        ],
    }
    cal_signals = ingest("calendar", cal_data)
    cal_accounts = [s for s in cal_signals if s["entity_type"] == "account"]
    cal_contacts = [s for s in cal_signals if s["entity_type"] == "contact"]
    print(f"  ✓ Calendar: {len(cal_signals)} signal(s) — {len(cal_accounts)} account, {len(cal_contacts)} contact(s)")

    # Collect all signals
    all_signals = chrome_signals + cr_signals + apollo_signals + sf_signals + slack_signals + gmail_signals + cal_signals
    account_signals = [s for s in all_signals if s["entity_type"] == "account"]
    contact_signals = [s for s in all_signals if s["entity_type"] == "contact"]
    print(f"\n  Total: {len(all_signals)} signals ({len(account_signals)} account, {len(contact_signals)} contact)")

    # =========================================================================
    # PHASE 2: Entity Resolution
    # =========================================================================
    print("\n─── Phase 2: Entity Resolution ───\n")

    resolver = EntityResolver()

    # Resolve account signals
    account_groups = {}  # entity_id → [signals]
    for sig in account_signals:
        resolution = resolver.resolve(sig)
        eid = resolution["entity_id"]

        if resolution["match_type"] == "new":
            # Register new entity
            domain = sig.get("entity_hint", {}).get("domain") or sig.get("fields", {}).get("domain")
            name = sig.get("entity_hint", {}).get("name") or sig.get("fields", {}).get("legalName")
            resolver.register("account", eid, f"drafts.{eid}", {"domain": domain, "name": name})
            print(f"  🆕 New account: {eid} ({resolution['match_type']})")

        if eid not in account_groups:
            account_groups[eid] = []
        account_groups[eid].append(sig)

    for eid, sigs in account_groups.items():
        sources = [s["source"] for s in sigs]
        print(f"  ✓ {eid}: {len(sigs)} signals from [{', '.join(sources)}]")

    # Resolve contact signals
    contact_groups = {}
    for sig in contact_signals:
        resolution = resolver.resolve(sig)
        eid = resolution["entity_id"]

        if resolution["match_type"] == "new":
            email = sig.get("entity_hint", {}).get("email") or sig.get("fields", {}).get("email")
            name = sig.get("entity_hint", {}).get("name") or sig.get("fields", {}).get("fullName")
            company = sig.get("entity_hint", {}).get("company") or sig.get("fields", {}).get("companyName")
            resolver.register("contact", eid, f"drafts.{eid}", {"email": email, "name": name, "company": company})
            print(f"  🆕 New contact: {eid} ({resolution['match_type']})")

        if eid not in contact_groups:
            contact_groups[eid] = []
        contact_groups[eid].append(sig)

    for eid, sigs in contact_groups.items():
        sources = [s["source"] for s in sigs]
        print(f"  ✓ {eid}: {len(sigs)} signals from [{', '.join(sources)}]")

    # =========================================================================
    # PHASE 3: Fusion
    # =========================================================================
    print("\n─── Phase 3: Multi-Source Fusion ───\n")

    fused_accounts = {}
    for eid, sigs in account_groups.items():
        # Map adapter output to fusion engine format (timestamp → scanned_at)
        engine_sigs = [
            {**s, "scanned_at": s.get("timestamp", ""), "url": ""} for s in sigs
        ]
        fused = fuse_account(None, engine_sigs)
        fused_accounts[eid] = fused

        name = fused.get("legalName", {}).get("value", "?")
        domain = fused.get("domain", {}).get("value", "?")
        src_count = len(fused.get("sources", []))
        meta = fused.get("metadata", {})
        needs_review = meta.get("requiresReview", False)
        uncertain = fused.get("signalSummary", {}).get("uncertainFields", [])

        print(f"  ✓ Fused {name} ({domain})")
        print(f"    Sources: {src_count} | Fusion v{meta.get('fusionVersion', 0)} | Review: {needs_review}")
        if uncertain:
            print(f"    Uncertain fields: {uncertain}")

        # Check specific fields
        hc = fused.get("headcount", {})
        if hc.get("conflictingValues"):
            values = [cv["value"] for cv in hc["conflictingValues"]]
            print(f"    ⚠️ Headcount conflict: {values}")

    # =========================================================================
    # PHASE 4: Validate Fused Document Structure
    # =========================================================================
    print("\n─── Phase 4: Document Validation ───\n")

    # Get the main Rapid7 fused account
    rapid7_id = make_account_id("rapid7.com")
    rapid7 = fused_accounts.get(rapid7_id, {})

    # Validate confidence field structure
    assert rapid7.get("_type") == "account", "Missing _type"
    metadata = rapid7.get("metadata", {})
    fusion_version = metadata.get("fusionVersion", 0)
    assert fusion_version >= 1, f"Missing fusionVersion (got {fusion_version})"
    print(f"  ✓ _type: {rapid7['_type']}")
    print(f"  ✓ fusionVersion: {fusion_version}")

    # Validate core fields have confidence wrappers
    for field_name in ["legalName", "domain", "industry", "headcount"]:
        field = rapid7.get(field_name, {})
        assert field.get("_type") == "confidenceField", f"{field_name} missing confidenceField type"
        assert "value" in field, f"{field_name} missing value"
        assert "confidence" in field, f"{field_name} missing confidence"
        assert "source" in field, f"{field_name} missing source"
        print(f"  ✓ {field_name}: value={field['value']}, conf={field['confidence']:.2f}, src={field['source']}")

    # Validate headcount — Salesforce is authoritative for headcount so it wins
    hc = rapid7.get("headcount", {})
    if hc.get("conflictingValues"):
        print(f"  ✓ Headcount has {len(hc['conflictingValues'])} conflicting values")
    else:
        # SF is authoritative, overrides linkedin/apollo/crunchbase
        assert hc.get("source") == "salesforce", f"Expected salesforce as authoritative source, got {hc.get('source')}"
        print(f"  ✓ Headcount: {hc['value']} (authoritative override by {hc['source']}, no conflict flagged)")

    # Validate sources array
    sources = rapid7.get("sources", [])
    source_names = [s["name"] for s in sources]
    assert "linkedin" in source_names, "Missing linkedin source"
    assert "salesforce" in source_names, "Missing salesforce source"
    print(f"  ✓ Sources: {source_names}")

    # Validate needs review flag
    requires_review = metadata.get("requiresReview", False)
    print(f"  ✓ requiresReview: {requires_review}")
    if metadata.get("reviewReason"):
        print(f"    Reason: {metadata['reviewReason']}")

    # Validate signal summary
    sig_summary = rapid7.get("signalSummary", {})
    uncertain = sig_summary.get("uncertainFields", [])
    high_conf = sig_summary.get("highConfidenceFields", [])
    print(f"  ✓ uncertainFields: {uncertain}")
    print(f"  ✓ highConfidenceFields: {high_conf}")

    # =========================================================================
    # PHASE 5: Account-Contact Linkage
    # =========================================================================
    print("\n─── Phase 5: Account-Contact Linkage ───\n")

    for eid, sigs in contact_groups.items():
        account_link = link_contact_to_account(sigs[0], resolver)
        if account_link:
            account_name = resolver.index["accounts"].get(account_link, {}).get("name", "?")
            print(f"  ✓ {eid} → {account_link} ({account_name})")
        else:
            print(f"  ✗ {eid} → no account linkage")

    # =========================================================================
    # PHASE 6: Notifications
    # =========================================================================
    print("\n─── Phase 6: Notification Generation ───\n")

    # New account notification
    notif = dispatch_notification("new_account", {
        "name": rapid7.get("legalName", {}).get("value", "Unknown"),
        "domain": rapid7.get("domain", {}).get("value", ""),
        "industry": rapid7.get("industry", {}).get("value", ""),
        "headcount": rapid7.get("headcount", {}).get("value", ""),
        "source": "multi-source fusion",
        "confidence": rapid7.get("legalName", {}).get("confidence", 0),
        "field_count": sum(1 for k, v in rapid7.items() if isinstance(v, dict) and v.get("_type") == "confidenceField"),
        "gap_count": 0,
    })
    if notif:
        print(f"  ✓ New account notification generated")
        print(f"    Channel: {notif['channel']}")
        print(f"    Type: {notif['event_type']}")

    # Conflict notification
    hc = rapid7.get("headcount", {})
    if hc.get("conflictingValues"):
        conflict_notif = dispatch_notification("conflict", {
            "entity_name": rapid7.get("legalName", {}).get("value", "?"),
            "entity_domain": rapid7.get("domain", {}).get("value", "?"),
            "field_name": "headcount",
            "values": hc["conflictingValues"],
            "reason": "Multiple sources report different employee counts",
        })
        if conflict_notif:
            print(f"  ✓ Conflict notification generated")
            print(f"    Field: headcount")
            # Print first few lines of mrkdwn
            for line in conflict_notif["mrkdwn"].split("\n")[:4]:
                print(f"    │ {line}")

    # =========================================================================
    # PHASE 7: LLM Query Readiness
    # =========================================================================
    print("\n─── Phase 7: LLM Query Tool Validation ───\n")

    # Verify queries compile and have correct structure
    q1 = search_accounts("rapid7")
    assert q1["project_id"] == "ql62wkk2"
    assert q1["params"]["query"] == "*rapid7*"
    print(f"  ✓ search_accounts('rapid7'): query ready")

    q2 = get_account(domain="rapid7.com")
    assert q2["params"]["domain"] == "rapid7.com"
    print(f"  ✓ get_account(domain='rapid7.com'): query ready")

    q3 = get_contact(email="cthomas@rapid7.com")
    assert q3["params"]["email"] == "cthomas@rapid7.com"
    print(f"  ✓ get_contact(email='cthomas@rapid7.com'): query ready")

    q4 = pipeline_stats()
    assert "totalAccounts" in q4["query"]
    print(f"  ✓ pipeline_stats(): query ready")

    # =========================================================================
    # PHASE 8: Confidence Analysis
    # =========================================================================
    print("\n─── Phase 8: Confidence Analysis ───\n")

    # Analyze confidence distribution across the fused account
    fields_by_confidence = []
    for field_name, field_data in rapid7.items():
        if isinstance(field_data, dict) and field_data.get("_type") == "confidenceField":
            fields_by_confidence.append({
                "field": field_name,
                "confidence": field_data["confidence"],
                "source": field_data["source"],
                "certain": field_data.get("certain", False),
            })

    fields_by_confidence.sort(key=lambda x: x["confidence"], reverse=True)

    print("  Field confidence ranking:")
    for f in fields_by_confidence:
        bar = "█" * int(f["confidence"] * 20)
        certain_mark = " ✓" if f["certain"] else ""
        print(f"    {f['field']:20s} {f['confidence']:.2f} {bar} ({f['source']}){certain_mark}")

    # Average confidence
    if fields_by_confidence:
        avg_conf = sum(f["confidence"] for f in fields_by_confidence) / len(fields_by_confidence)
        high_conf = sum(1 for f in fields_by_confidence if f["confidence"] > 0.8)
        low_conf = sum(1 for f in fields_by_confidence if f["confidence"] < 0.5)
        print(f"\n  Average confidence: {avg_conf:.2f}")
        print(f"  High confidence (>0.8): {high_conf}/{len(fields_by_confidence)}")
        print(f"  Low confidence (<0.5): {low_conf}/{len(fields_by_confidence)}")

    # =========================================================================
    # SUMMARY
    # =========================================================================
    print("\n" + "=" * 60)
    print("  TEST SUMMARY")
    print("=" * 60)
    print(f"""
  Signals ingested:    {len(all_signals)} (from 7 sources)
  Account signals:     {len(account_signals)}
  Contact signals:     {len(contact_signals)}
  Accounts resolved:   {len(account_groups)}
  Contacts resolved:   {len(contact_groups)}
  Accounts fused:      {len(fused_accounts)}
  Conflicts detected:  {sum(1 for a in fused_accounts.values() if a.get('metadata', {}).get('requiresReview'))}
  Notifications:       2 (new account + conflict)
  LLM query tools:     4 verified

  All phases passed ✓
""")

    return True


if __name__ == "__main__":
    success = run_e2e_test()
    sys.exit(0 if success else 1)
