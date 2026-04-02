---
name: chrome-inspector
description: >
  Passively read and interpret any page open in the user's Chrome browser — safely,
  without triggering bot detection on Cloudflare, LinkedIn, Salesforce, or any
  protected site. Extracts structured account and contact data, normalizes it into
  profiles, identifies gaps, and suggests enrichment. Use this skill whenever you
  need to see what a page looks like, read page content, extract data from a web app,
  build or update an account profile from a page, enrich account data, or understand
  any web page. Works across all sites the user has open: SaaS dashboards (Salesforce,
  Outreach, Common Room), social platforms (LinkedIn), Cloudflare-protected pages,
  SPAs, internal tools, and company websites.
  Triggers on: read this page, what does this show, screenshot, page inspection,
  extract from page, scrape this, DOM reading, visual verification, check the page,
  what do you see, grab the content, pull data from this tab, HTML interpretation,
  build account profile, enrich this account, what do we know about this company,
  update account, scan this page, profile this company, who is this person.
---

# Chrome Inspector — Page Intelligence & Account Enrichment

Read any page the user already has open in Chrome, extract structured data, build
account profiles, and identify enrichment opportunities — all without API access.

The key principle: you are reading from an already-authenticated, already-loaded
browser session — not making new HTTP requests. Cloudflare challenges, LinkedIn
gates, and login walls are irrelevant because the user already passed them.

---

## Part 1: Safe Page Reading

### Safety Rules for Protected Sites

These rules prevent triggering anti-bot systems on sites like LinkedIn, Salesforce,
Cloudflare-gated pages, and banking/financial sites.

**Always safe** (read from the already-rendered page, no new requests):
- `mcp__Claude_in_Chrome__read_page` — reads the accessibility tree from memory
- `mcp__Claude_in_Chrome__get_page_text` — extracts visible text
- `mcp__Control_Chrome__get_current_tab` — reads URL/title metadata
- `mcp__Control_Chrome__get_page_content` — reads rendered text content
- osascript to get tab URL/title

**Safe with care** (executes JS in the page context — keep it read-only):
- `mcp__Control_Chrome__execute_javascript` — OK for property reads
- `mcp__Claude_in_Chrome__javascript_tool` — OK for property reads

When using JavaScript on protected sites:

1. **Never make fetch/XHR/network requests** from injected JS. This triggers WAFs.
2. **Never modify the DOM** (no innerHTML=, no appendChild, no setAttribute).
3. **Never automate clicks, scrolling, or form fills** unless the user explicitly asks.
4. **Keep scripts small** — a single IIFE that returns a string. Long-running
   scripts or scripts that set up intervals/observers look suspicious.
5. **Never access document.cookie, localStorage, or sessionStorage** — some
   sites monitor this as a fingerprinting signal.
6. **On LinkedIn specifically**: prefer get_page_text or read_page over any JS.
   LinkedIn's anti-automation detects MutationObserver, scroll events, and DOM
   traversal patterns. The accessibility tree gives you everything you need.

### Tool Priority (try in this order)

#### Tier 1: Claude in Chrome (richest data, safest)

The accessibility tree is the single best tool — it gives you the page structure,
text content, interactive elements, and ARIA labels without executing any JavaScript.

```
Step 1: mcp__Claude_in_Chrome__tabs_context_mcp (get tab IDs)
Step 2: mcp__Claude_in_Chrome__read_page (tabId, filter: "all")
```

Options for read_page:
- filter: "all" — full accessibility tree (headings, text, images, containers)
- filter: "interactive" — just buttons, links, inputs, selects
- depth: 5 — limit tree depth for huge pages (default 15)
- ref_id: "abc" — zoom into a specific subtree when output is too large
- max_chars: 80000 — increase output cap for data-heavy pages

If the tree is too large, use get_page_text for a flat text dump instead:
```
mcp__Claude_in_Chrome__get_page_text (tabId)
```

For a visual screenshot (when you need to see layout, colors, images):
```
mcp__Claude_in_Chrome__computer (action: "screenshot")
```

If the extension says "not connected", move to Tier 2.

#### Tier 2: Control Chrome MCP (reliable, slightly less rich)

```
mcp__Control_Chrome__get_current_tab   -> URL + title
mcp__Control_Chrome__get_page_content  -> full visible text
mcp__Control_Chrome__list_tabs         -> find the right tab
```

If you need structure beyond flat text, use safe read-only JS via
`mcp__Control_Chrome__execute_javascript`:

**Safe DOM summary** — read-only, no network, no mutations:
```javascript
(function(){
  var r = [];
  document.querySelectorAll('h1,h2,h3,h4,h5,h6,p,li,td,th,button,a,[role]').forEach(function(el){
    var t = (el.textContent||'').trim();
    if(t && t.length < 300){
      var tag = el.tagName.toLowerCase();
      var role = el.getAttribute('role');
      r.push((role ? '['+role+'] ' : '') + tag + ': ' + t.slice(0,150));
    }
  });
  return r.slice(0,200).join('\n');
})()
```

**Data table extraction** — for pages with tabular data:
```javascript
(function(){
  var tables = document.querySelectorAll('table');
  if(!tables.length) return 'No tables found';
  var result = [];
  tables.forEach(function(tbl, i){
    var rows = [];
    tbl.querySelectorAll('tr').forEach(function(tr){
      var cells = [];
      tr.querySelectorAll('th,td').forEach(function(c){ cells.push(c.textContent.trim()); });
      if(cells.length) rows.push(cells.join(' | '));
    });
    result.push('Table '+(i+1)+':\n'+rows.slice(0,50).join('\n'));
  });
  return result.join('\n\n');
})()
```

#### Tier 3: osascript (last resort — Mac only)

When both Chrome MCPs are unreachable:

```applescript
tell application "Google Chrome"
  set tabURL to URL of active tab of first window
  set tabTitle to title of active tab of first window
  return tabURL & " | " & tabTitle
end tell
```

This only gets URL and title. If stuck at this tier, tell the user the Chrome
extensions are not responding and ask them to copy-paste or take a screenshot.

### Handling Different Site Types

**SaaS Dashboards** (Salesforce, Outreach, HubSpot, Nooks): Heavy SPAs with shadow
DOM and iframes. The accessibility tree handles this best. Stick to read_page.

**LinkedIn**: Use ONLY read_page or get_page_text. Never execute JavaScript.
LinkedIn tracks DOM access patterns and will flag the session.

**Cloudflare-Protected Sites**: Already bypassed — the user loaded the page.
All reading tools work normally. Do not make new network requests from injected JS.

**Google Workspace** (Docs, Sheets, Drive): Complex iframe structures. read_page
works but may return the iframe chrome. Prefer native MCP when one exists.

**Sanity Studio / Custom React Apps**: Full access via any tier. No anti-bot concerns.

**Banking / Financial Sites**: Read-only tools only. Never inject JS.

---

## Part 2: Page Intelligence — Detect, Extract, Normalize

After reading a page, classify what kind of page it is and extract structured data.

### Page Type Detection

Identify the page type from the URL and content. The main categories:

| Page Type | URL Signals | Content Signals |
|-----------|------------|-----------------|
| **Company Website** | Custom domain, /about, /team | Company name in title, product descriptions, team bios |
| **LinkedIn Company** | linkedin.com/company/ | Followers, employees, industry, headquarters |
| **LinkedIn Person** | linkedin.com/in/ | Name, title, company, experience, connections |
| **Salesforce Account** | *.my.salesforce.com, /Account/ | Account name, industry, revenue, contacts |
| **Salesforce Contact** | *.my.salesforce.com, /Contact/ | Name, title, account, email, phone |
| **CRM Record** | app.hubspot.com, app.outreach.io | Contact/company fields, activity timeline |
| **Common Room Profile** | app.commonroom.io | Community signals, engagement score |
| **G2/Review Site** | g2.com, capterra.com | Ratings, reviews, competitor comparisons |
| **News/Blog Article** | /blog/, /news/, press releases | Company mentions, funding, product launches |
| **Job Board** | greenhouse.io, lever.co, careers page | Open roles, tech stack, team size signals |
| **GitHub Org/Repo** | github.com/org | Tech stack, activity, contributors |
| **Crunchbase** | crunchbase.com/organization/ | Funding, investors, employee count, industry |

### Data Extraction Templates

For each page type, extract into a normalized structure. Here is what to look for:

#### Company Data (extract from any company-related page)
```
company:
  name: string
  domain: string                 # primary website domain
  industry: string
  sub_industry: string
  description: string            # one-line summary
  employee_count: string         # exact or range ("51-200")
  employee_count_source: string  # where this number came from
  founded_year: number
  headquarters:
    city: string
    state: string
    country: string
  funding:
    total_raised: string
    last_round: string           # "Series B"
    last_round_amount: string
    last_round_date: string
  tech_stack: string[]           # technologies mentioned or detected
  social:
    linkedin_url: string
    twitter_url: string
    github_url: string
  revenue_signals:
    estimated_arr: string
    pricing_model: string        # "freemium", "enterprise", "usage-based"
  competitors: string[]
  tags: string[]                 # industry tags, categories
```

#### Person/Contact Data (extract from any person-related page)
```
person:
  name: string
  title: string
  company: string
  company_domain: string
  email: string                  # only if visible on page
  phone: string                  # only if visible on page
  linkedin_url: string
  location:
    city: string
    state: string
    country: string
  seniority: string              # "C-Level", "VP", "Director", "Manager", "IC"
  department: string             # "Engineering", "Sales", "Marketing", etc.
  previous_companies: string[]
  skills: string[]
  bio: string                    # short professional summary
```

#### Engagement/Signal Data (extract from CRM, Common Room, activity feeds)
```
signals:
  last_activity_date: string
  engagement_score: number
  recent_signals:
    - type: string               # "page_visit", "content_download", "event_attend"
      date: string
      detail: string
  deal_stage: string             # if visible in CRM
  deal_value: string
  next_steps: string[]
  open_opportunities: number
```

### Extraction Process

When the user says "scan this page" or "build a profile":

1. **Read the page** using the Tier 1/2/3 approach above
2. **Detect page type** from URL + content signals
3. **Extract data** into the relevant template fields
4. **Identify the entity** — which company or person is this about?
5. **Present the extracted data** as structured output
6. **Note confidence levels** — mark fields as "confirmed" (explicitly on page)
   vs "inferred" (derived from context)
7. **Flag gaps** — list which template fields are empty

### Normalization Rules

When merging data from multiple pages about the same entity:

- **Company matching**: Match on domain first, then exact name match
- **Person matching**: Match on LinkedIn URL first, then name + company combo
- **Conflict resolution**: More specific beats less specific. CRM data beats
  website data for revenue/deal info. LinkedIn beats website for person titles.
  Most recent timestamp wins for time-sensitive data.
- **Deduplication**: Same fact from multiple sources gets one entry with
  multiple source citations

---

## Part 3: Account Profiles & Gap Analysis

### Profile Storage

Store profiles as JSON files on the user's machine. Location:
```
~/.chrome-inspector/profiles/
  companies/
    {domain}.json          # one file per company, keyed by domain
  people/
    {linkedin-slug}.json   # one file per person, keyed by LinkedIn slug
    {name--company}.json   # fallback if no LinkedIn URL
  index.json               # maps names/domains to profile files
```

Each profile JSON follows this structure:
```json
{
  "entity_type": "company",
  "primary_key": "acme.com",
  "display_name": "Acme Corp",
  "profile": { /* company data fields from template above */ },
  "sources": [
    {
      "url": "https://linkedin.com/company/acme",
      "page_type": "linkedin_company",
      "extracted_at": "2026-04-01T18:30:00Z",
      "fields_extracted": ["name", "industry", "employee_count", "headquarters"]
    }
  ],
  "gaps": ["revenue_signals", "funding", "tech_stack", "competitors"],
  "enrichment_suggestions": [
    {
      "field": "funding",
      "suggestion": "Check Crunchbase page for Acme Corp",
      "url_hint": "https://crunchbase.com/organization/acme"
    }
  ],
  "last_updated": "2026-04-01T18:30:00Z",
  "created_at": "2026-04-01T18:30:00Z"
}
```

### Gap Analysis

After extracting data from a page, run gap analysis:

1. **Load existing profile** for the entity (if one exists)
2. **Merge new data** into the profile (new fields fill gaps, conflicts use
   recency + specificity rules)
3. **Compute gaps** — which template fields are still empty?
4. **Prioritize gaps** by importance:
   - **Critical** (needed for outreach/qualification): domain, employee_count,
     industry, person title, seniority
   - **High** (needed for account scoring): funding, revenue_signals, tech_stack,
     deal_stage
   - **Medium** (enriches context): competitors, previous_companies, social links
   - **Low** (nice to have): founded_year, bio, skills
5. **Generate enrichment suggestions** — where could the user go to fill each gap?

### Enrichment Suggestions

For each gap, suggest a specific action the user can take (no API needed):

| Missing Field | Suggestion |
|--------------|------------|
| funding | "Open Crunchbase page for {company}" |
| tech_stack | "Check BuiltWith or Wappalyzer for {domain}" |
| employee_count | "Check LinkedIn company page — shows employee count" |
| revenue_signals | "Look at pricing page at {domain}/pricing" |
| competitors | "Search G2 for {company} alternatives" |
| person email | "Check company contact page or Hunter.io" |
| person title | "Open their LinkedIn profile" |
| headquarers | "LinkedIn company page shows HQ location" |
| github_url | "Search GitHub for {company} organization" |
| open_opportunities | "Check Salesforce account record" |

When suggesting enrichment, prefer pages the user likely already has access to.
Order suggestions by: (1) fastest to check, (2) most likely to have the data,
(3) least likely to require a new login.

---

## Part 4: Workflow

### Single Page Scan

User says: "Scan this page" or "What can you tell me about this company?"

1. Read the current tab (Tier 1 → 2 → 3)
2. Detect page type
3. Extract structured data
4. Check if a profile exists for this entity
5. If yes: merge new data, highlight what's new
6. If no: create new profile
7. Show the profile with gaps highlighted
8. Suggest top 3 enrichment actions

### Multi-Page Profile Building

User browses multiple pages about the same company/person:

1. Each "scan" adds to the same profile (matched by domain or LinkedIn URL)
2. Show a running tally: "Profile for Acme Corp: 14/22 fields filled (64%)"
3. After each scan, show what was added and what gaps remain
4. Suggest which tab to visit next for maximum gap coverage

### Account Research Session

User says: "Research this account" or "Build me a full profile"

1. Scan the current page
2. List all gaps with enrichment suggestions
3. User navigates to suggested pages
4. User says "scan" on each new page
5. Profile builds incrementally
6. Session ends when user is satisfied or all critical gaps are filled

---

## Part 5: Output Format

When presenting extracted data, use this format:

```
## {Company/Person Name} — Profile

**Source**: {page URL} ({page type})
**Profile completeness**: {X}% ({filled}/{total} fields)

### What we found on this page
- Industry: SaaS / Developer Tools ✓
- Employees: 201-500 (LinkedIn) ✓
- HQ: San Francisco, CA ✓
- Founded: 2018 ✓

### Added to existing profile
- [NEW] Tech stack: React, Node.js, PostgreSQL
- [UPDATED] Employee count: 201-500 (was: 51-200, source: website — LinkedIn is more current)

### Gaps remaining (by priority)
🔴 Critical: revenue_signals, deal_stage
🟡 High: funding, competitors
🟢 Medium: github_url, twitter_url

### Suggested next steps
1. Check their pricing page → {domain}/pricing (revenue signals)
2. Open Crunchbase → crunchbase.com/organization/{slug} (funding)
3. Search G2 → g2.com/products/{name} (competitors, reviews)
```

---

## Part 6: Important Notes

- **No API calls**: This system works entirely from what's visible in the browser.
  No external API calls, no background enrichment services. Everything comes from
  pages the user navigates to.
- **Privacy**: Profile data is stored locally on the user's machine only.
- **Accuracy**: Always mark confidence level. Data read directly from a page is
  "confirmed". Data inferred from context is "inferred". Never fabricate data.
- **Future**: This skill is designed to later interface with CRM APIs, enrichment
  APIs, and the Sanity data platform. The profile JSON schema is intentionally
  compatible with common CRM object models. When API access is added, the same
  profiles can be pushed/pulled from external systems.


---

## Part 7: System Integrations

When connected MCPs are available, the chrome-inspector can push profiles to
external systems and pull enrichment data. These integrations are optional —
the core scan/extract/store workflow works without them.

### 7a. Sanity Content Lake (Prospect 360)

**Project:** `ql62wkk2` (Prospect 360), dataset: `production`
**Document types:** `companyProfile`, `personProfile` (schemaless)

After scanning a page and building a profile:

1. **Query for existing document** by domain (company) or name+company (person):
   ```
   GROQ: *[_type == "companyProfile" && domain == $domain][0]
   GROQ: *[_type == "personProfile" && name == $name && company == $company][0]
   ```

2. **If exists** → patch with new data (merge, don't overwrite)
   Use `patch_document_from_json` with the existing document ID

3. **If not exists** → create new document
   Use `create_documents_from_json` with the profile data

**Field mapping (Python snake_case → Sanity camelCase):**
- `employee_count` → `employeeCount`
- `linkedin_url` → `linkedinUrl`
- `crunchbase_url` → `crunchbaseUrl`
- `website_url` → `websiteUrl`
- `last_updated` → `lastUpdated`
- `scan_count` → `scanCount`
- Nested objects need `_type` field (e.g., `{"_type": "location", "city": "Boston"}`)
- Array items need `_key` field (e.g., `{"_type": "gapItem", "_key": "gap-0", ...}`)
- Completeness stored as integer 0-100 (multiply Python float by 100)

### 7b. Common Room Enrichment

After saving a profile, check gaps for fields Common Room can fill:

| Gap Field | Common Room Skill | What to Pull |
|-----------|------------------|-------------|
| employee_count | account-research | Company size |
| industry | account-research | Industry classification |
| tech_stack | account-research | Technologies used |
| intent_signals | account-research | Buying signals |
| email | contact-research | Contact email |
| phone | contact-research | Phone number |
| title | contact-research | Current job title |

**Enrichment workflow:**
1. Check `gaps[]` for critical/high priority items
2. For companies: use `common-room:account-research` with domain
3. For people: use `common-room:contact-research` with name
4. Merge returned data into the profile (new data fills empty fields)
5. Re-run gap analysis and update completeness score
6. Update both local JSON and Sanity document

### 7c. Slack Notifications

After creating or updating a profile, post a summary to Slack.

**User Slack ID:** `U079FFJ9D63` (Austin Gilbert)
**Default:** DM to user. Can override with `--notify #channel-name`.

**Company profile message format:**
```
🏢 *{name}* — Profile {Created|Updated}

*Industry:* {industry}
*Employees:* {employee_count}
*HQ:* {city, state, country}
*Domain:* {domain}
*Completeness:* {completeness}%

*Sources:* {count} ({source_names})
*Gaps:* {critical} critical, {high} high

*Top gaps:*
• {field} ({priority}) — {suggestion}
```

**Person profile message format:**
```
👤 *{name}* — Profile {Created|Updated}

*Title:* {title}
*Company:* {company}
*Completeness:* {completeness}%

*Gaps:* {critical} critical, {high} high
```

Use `slack_send_message_draft` for review, `slack_send_message` for auto-post.

### 7d. Full Workflow

The complete scan-to-notify pipeline:

```
1. READ PAGE        → Chrome MCP (accessibility tree preferred)
2. CLASSIFY         → URL rules + content signals
3. EXTRACT          → Page-type-specific extraction
4. GAP ANALYSIS     → Priority scoring + enrichment suggestions
5. STORE LOCAL      → ~/.chrome-inspector/profiles/{companies,people}/
6. PUSH TO SANITY   → Prospect 360 (ql62wkk2/production)
7. ENRICH           → Common Room (if gaps exist, optional)
8. NOTIFY SLACK     → DM or channel (optional)
```

**Trigger flags:**
- Default: steps 1-6 (scan + store + push to Sanity)
- `--enrich`: also run step 7 (Common Room enrichment)
- `--notify` or `--notify #channel`: also run step 8 (Slack)
- `--full`: run all steps 1-8

### 7e. Reference Files

| File | Purpose |
|------|---------|
| `references/scan_page.py` | Full extraction pipeline (Python, 1182 lines) |
| `references/page-classifier.ts` | URL rules + content signals for page type detection |
| `references/account-schema.ts` | TypeScript interfaces for profile types |
| `references/profile-store.ts` | Local JSON storage + merge logic |
| `references/integrations.ts` | Sanity/CommonRoom/Slack integration mappings |


---

## Part 8: Commands & Interface

### 8a. Primary Commands

```
/chrome-inspector scan
```
Scan the current Chrome tab. Reads page → classifies → extracts → gap analysis → saves locally → pushes to Sanity.

```
/chrome-inspector scan --enrich
```
Same as above, then queries Common Room for gap-filling enrichment data.

```
/chrome-inspector scan --notify #channel-name
/chrome-inspector scan --notify
```
Same as scan, then posts a Slack summary. No channel = DM to user.

```
/chrome-inspector scan --full
```
Runs all 8 pipeline steps: scan + store + push + enrich + notify.

```
/chrome-inspector profiles
```
List all locally stored profiles with name, type, completeness, last updated.

```
/chrome-inspector profiles companies
/chrome-inspector profiles people
```
Filter stored profiles by entity type.

```
/chrome-inspector view <domain-or-name>
```
Display full profile for a specific entity. Shows all fields, gaps, sources, and Sanity sync status.

```
/chrome-inspector push <domain-or-name>
```
Push a specific local profile to Sanity without re-scanning.

```
/chrome-inspector enrich <domain-or-name>
```
Run Common Room enrichment on a stored profile without re-scanning.

```
/chrome-inspector merge <source-domain> <target-domain>
```
Merge two company profiles (e.g., when same company was scanned from LinkedIn and Crunchbase separately).

```
/chrome-inspector delete <domain-or-name>
```
Delete a local profile. Does NOT delete from Sanity.

```
/chrome-inspector status
```
Show system health: Chrome MCP connection, Sanity connectivity, Common Room availability, profile counts, last scan time.

### 8b. Command Shortcuts

Claude should also recognize natural language equivalents:
- "scan this page" → `/chrome-inspector scan`
- "who is this company?" → `/chrome-inspector scan` (on a company page)
- "enrich this profile" → `/chrome-inspector scan --enrich`
- "send to slack" → `/chrome-inspector scan --notify`
- "show my profiles" → `/chrome-inspector profiles`
- "what do we know about {company}?" → `/chrome-inspector view {company}`

---

## Part 9: Configuration

### 9a. Configuration File

Store at `~/.chrome-inspector/config.json`:

```json
{
  "sanity": {
    "projectId": "ql62wkk2",
    "dataset": "production",
    "publishImmediately": false
  },
  "slack": {
    "defaultChannel": null,
    "dmUserId": "U079FFJ9D63",
    "notifyOnScan": false,
    "useDraft": true
  },
  "enrichment": {
    "autoEnrich": false,
    "enrichOnCriticalGaps": true,
    "minGapPriority": "high"
  },
  "extraction": {
    "preferAccessibilityTree": true,
    "maxPageReadDepth": 15,
    "enabledPageTypes": [
      "linkedin_company", "linkedin_person",
      "salesforce_account", "crunchbase_org",
      "company_website", "common_room_account"
    ]
  },
  "storage": {
    "profileDir": "~/.chrome-inspector/profiles",
    "maxProfileAge": "90d",
    "autoMerge": true
  },
  "notifications": {
    "completenessThreshold": 50,
    "notifyOnNewProfile": true,
    "notifyOnEnrichment": false
  }
}
```

### 9b. Configuration Precedence

1. Command-line flags (highest priority)
2. `~/.chrome-inspector/config.json`
3. Built-in defaults (lowest priority)

### 9c. Default Values

If no config file exists, use these defaults:
- Sanity: project `ql62wkk2`, dataset `production`, drafts only
- Slack: DM to user, drafts (not direct send), notify disabled by default
- Enrichment: manual only (not auto)
- Storage: `~/.chrome-inspector/profiles/`, 90-day max age, auto-merge enabled

---

## Part 10: Error Handling & Edge Cases

### 10a. Chrome MCP Disconnected

**Detection:** `tabs_context_mcp` returns connection error or times out.

**Behavior:**
1. Log: "Chrome MCP not connected"
2. Offer alternatives:
   - "Open Chrome and ensure the Claude extension is active"
   - "Paste a URL and I'll try to fetch it via web tools instead"
   - "Work with an existing stored profile: `/chrome-inspector profiles`"
3. If user provides a URL, attempt `WebFetch` as fallback (reduced extraction quality)
4. Never silently fail — always tell the user what happened

### 10b. Page Doesn't Match Any Classifier

**Detection:** `classify_page()` returns `unknown` or confidence < 0.3.

**Behavior:**
1. Attempt generic company website extraction as fallback
2. Extract whatever structured data is visible (name, description, contact info)
3. Flag the profile with `classification_confidence: "low"` and `page_type: "unknown"`
4. Warn user: "This page type isn't recognized. I extracted what I could, but the profile may be incomplete."
5. Still save locally — partial data is better than none

### 10c. Sanity Push Fails

**Detection:** `create_documents_from_json` or `patch_document_from_json` returns error.

**Behavior:**
1. Log the error type:
   - `401/403`: Permission issue → "I don't have write access to Prospect 360. Check API token permissions."
   - `429`: Rate limited → Retry after backoff (2s, 4s, 8s, max 3 retries)
   - `5xx`: Server error → Retry once, then fail gracefully
   - Network timeout → Retry once
2. Always save to local storage regardless of Sanity outcome
3. Mark profile with `sanitySyncStatus: "failed"` and `sanitySyncError: "<error message>"`
4. Offer: "Profile saved locally. You can retry with `/chrome-inspector push <name>`"

### 10d. Slack Notification Fails

**Detection:** `slack_send_message` or `slack_send_message_draft` returns error or times out.

**Behavior:**
1. This is non-critical — never block the pipeline for Slack
2. Log: "Slack notification failed, but profile was saved successfully"
3. Common errors:
   - `channel_not_found`: Wrong channel ID → suggest using `slack_search_channels`
   - `not_in_channel`: Bot not in channel → tell user to invite the bot
   - Timeout: Transient → note it and move on
4. Profile is still valid even without Slack notification

### 10e. Common Room Enrichment Fails

**Detection:** Common Room skill returns no data or errors.

**Behavior:**
1. Non-critical — profile remains valid with existing data
2. Log which enrichment fields were attempted
3. Keep existing gaps as-is (don't clear them)
4. Mark: `enrichmentStatus: "failed"` with timestamp
5. Offer: "Enrichment unavailable. You can retry later with `/chrome-inspector enrich <name>`"

### 10f. No Extractable Data on Page

**Detection:** All extraction functions return empty/null for key fields.

**Behavior:**
1. Don't create an empty profile
2. Tell user: "I couldn't extract any structured profile data from this page."
3. Suggest:
   - "Try scanning a different page for this entity"
   - "Navigate to their LinkedIn or company website"
4. If at least a name was found, offer to create a minimal profile as a starting point

### 10g. Duplicate Entity Detection

**Detection:** Local profile already exists for this domain/name when scanning.

**Behavior:**
1. Auto-merge by default (configurable)
2. Merge strategy: newer values override older, but never overwrite present data with null
3. Increment `scan_count`
4. Append new source to `sources[]` array
5. Re-run gap analysis after merge
6. Log: "Merged with existing profile for {name}. Scan count: {n}"

### 10h. Stale Profile Data

**Detection:** Profile `lastUpdated` is older than `maxProfileAge` (default 90 days).

**Behavior:**
1. When viewing: warn "This profile hasn't been updated in {n} days"
2. When pushing to Sanity: warn but allow
3. When enriching: proceed normally (enrichment refreshes data)
4. Mark stale profiles in listings with age indicator

---

## Part 11: Profile Management

### 11a. Profile Listing

`/chrome-inspector profiles` output format:

```
Company Profiles (3):
  rapid7.com          Rapid7              45%  2 sources  5 gaps  2d ago
  acme.com            Acme Corp           72%  3 sources  2 gaps  1h ago
  example.com         Example Inc         28%  1 source   7 gaps  14d ago

Person Profiles (2):
  jane-doe-acme       Jane Doe @ Acme     72%  1 source   3 gaps  1h ago
  john-smith-rapid7   John Smith @ Rapid7  55%  2 sources  4 gaps  3d ago
```

### 11b. Profile Merge Logic

When merging two profiles for the same entity:

1. **Identify merge candidates:** Same domain (companies) or same name+company (people)
2. **Field resolution:** For each field:
   - If only one profile has the value → use it
   - If both have the same value → use it
   - If both have different non-null values → prefer the newer source
3. **Sources:** Concatenate source arrays, dedup by URL
4. **Gaps:** Re-run gap analysis on merged profile
5. **Metadata:** Keep earliest `firstScanned`, update `lastUpdated` to now, sum `scanCount`

### 11c. Profile Deletion

- Local only: removes from `~/.chrome-inspector/profiles/`
- Does NOT delete Sanity document (that requires separate Sanity admin action)
- Requires confirmation: "Delete local profile for {name}? This won't affect Sanity."

### 11d. Profile Export

Profiles can be exported as:
- JSON (raw stored profile format)
- Sanity document JSON (transformed per integrations.ts mapping)
- Slack message format (for manual sharing)

---

## Part 12: Testing Checklist

### 12a. Page Type Coverage

Test each supported page type with a real URL:

| Page Type | Example URL | Key Fields to Verify |
|-----------|------------|---------------------|
| LinkedIn Company | linkedin.com/company/sanity-io | name, industry, employee_count, HQ, description |
| LinkedIn Person | linkedin.com/in/someone | name, title, company, location, bio |
| Salesforce Account | *.lightning.force.com/lightning/r/Account/* | name, industry, type, address, owner |
| Crunchbase Org | crunchbase.com/organization/* | name, funding, investors, employee_count |
| Company Website | sanity.io, rapid7.com | name, description, industry signals |
| Common Room Account | app.commonroom.io/community/*/members/* | name, signals, activity |

### 12b. Pipeline Step Verification

For each test scan, verify:
- [ ] Page read succeeded (accessibility tree or fallback to text)
- [ ] Classification returned correct page type with confidence > 0.5
- [ ] Extraction populated expected fields
- [ ] Gap analysis identified correct missing fields
- [ ] Local save created/updated JSON file
- [ ] Sanity push created document with correct _type, nested objects, array keys
- [ ] GROQ query returns the pushed document
- [ ] Slack message formats correctly with mrkdwn
- [ ] Merge works when re-scanning same entity

### 12c. Error Scenario Verification

- [ ] Chrome disconnected → graceful fallback message
- [ ] Unknown page type → generic extraction + warning
- [ ] Sanity timeout → local save still works
- [ ] Slack timeout → pipeline continues
- [ ] Empty page → no empty profile created
- [ ] Duplicate scan → merge works, scan count increments

---

## Part 13: Reference File Index

| File | Lines | Size | Purpose |
|------|-------|------|---------|
| `SKILL.md` | ~750 | ~28KB | Full skill instructions (Parts 1-13) |
| `references/scan_page.py` | 1182 | 43KB | Python extraction pipeline |
| `references/integrations.ts` | 561 | 17KB | Sanity/CommonRoom/Slack integration mappings |
| `references/page-classifier.ts` | ~130 | 5KB | URL rules + content signals |
| `references/account-schema.ts` | ~200 | 8KB | Profile type definitions + gap priorities |
| `references/profile-store.ts` | ~160 | 6KB | Local JSON storage + merge logic |

**Total skill size:** ~112KB across 6 files

---


## Part 14: Sensor Fusion System

### 14a. Overview

The sensor fusion system combines data from 7+ sources into high-confidence, deduplicated Account and Contact documents in Sanity. Every field carries a confidence score (0.0-1.0) that reflects how trustworthy the data is based on source authority, freshness, and cross-source corroboration.

**Pipeline flow:**
```
Source Data → Ingestion Adapter → Entity Resolution → Fusion Engine → Sanity Document → Notifications
```

### 14b. Source Trust Tiers

| Tier | Sources | Base Confidence | Role |
|------|---------|----------------|------|
| 1 — Authoritative | Salesforce, Company Website, Common Room | 0.85 - 0.95 | Ground truth for core fields |
| 2 — Supportive | LinkedIn, Crunchbase, Apollo | 0.70 - 0.80 | Corroborates and fills gaps |
| 3 — Contextual | Slack, Gmail, Calendar | 0.35 - 0.50 | Activity signals and relationship intel |
| 4 — Inferred | AI inference | 0.20 - 0.25 | Derived data, always flagged |

### 14c. Confidence Scoring

Each field's confidence is calculated as:
```
confidence = base_trust × freshness_decay × authority_bonus × corroboration_bonus
```

- **base_trust**: From SOURCE_TRUST table (e.g., salesforce = 0.95)
- **freshness_decay**: Exponential decay based on data age. Half-lives: Tier 1 = 90d, Tier 2 = 30d, Tier 3 = 7d
- **authority_bonus**: 1.1x if source is authoritative for this specific field (see FIELD_AUTHORITY)
- **corroboration_bonus**: 1.05x for each additional source that agrees

### 14d. Conflict Resolution Rules

When two sources disagree on a field value:

1. **Values agree** → Accept, boost confidence by 0.05
2. **Authoritative source override** → Accept the authoritative source's value
3. **Confidence margin > 0.15** → Higher confidence wins
4. **Similar confidence (within 0.15)** → FLAG for human review

Flagged conflicts are stored in `conflictingValues[]` on the field and the document is marked `requiresReview: true`.

### 14e. Field Authority Map

Certain sources are authoritative for specific fields:

- **legalName**: salesforce, company_website, crunchbase
- **domain**: company_website, salesforce
- **industry**: salesforce, linkedin, crunchbase
- **headcount**: linkedin, salesforce, crunchbase
- **hqCity**: salesforce, company_website
- **annualRevenue**: salesforce, crunchbase
- **stage**: crunchbase, salesforce

---

## Part 15: Entity Resolution

### 15a. Account Resolution

Resolution priority (first match wins):
1. **Domain match** (confidence: 0.98) — strongest, most reliable
2. **Salesforce ID match** (confidence: 0.99) — deterministic
3. **Exact name match** (confidence: 0.75) — used when domain unavailable
4. **New entity** — no match found, create new document

Deterministic ID format: `account-{slugified-domain}` (e.g., `account-rapid7com`)

### 15b. Contact Resolution

Resolution priority:
1. **Email exact match** (confidence: 0.97)
2. **Name + company match** (confidence: 0.85)
3. **Name + domain match** (confidence: 0.80)
4. **New entity**

Deterministic ID format: `contact-{slugified-name}-{slugified-domain}`

### 15c. Account-Contact Linkage

Contacts are linked to accounts via:
1. Email domain → account domain match (primary)
2. Company name → account name match (fallback)
3. Free email domains (gmail, yahoo, etc.) are skipped — no auto-linkage

### 15d. Deduplication

When scanning the same entity from multiple pages, the system:
1. Resolves to existing entity via domain/email/name
2. Merges new signal data into existing document
3. Increments fusion version
4. Re-evaluates confidence on all fields
5. Detects potential duplicates (same name, different IDs) and flags them

---

## Part 16: Ingestion Adapters

### 16a. Signal Format

Every source adapter produces signals in this standard format:
```json
{
  "source": "linkedin",
  "timestamp": "2026-04-01T10:00:00Z",
  "entity_type": "account",
  "entity_hint": {
    "domain": "rapid7.com",
    "name": "Rapid7"
  },
  "fields": {
    "legalName": "Rapid7",
    "domain": "rapid7.com",
    "industry": "Computer & Network Security",
    "headcount": "2,400"
  }
}
```

### 16b. Available Adapters

| Adapter | Source | Entity Types | Key Fields |
|---------|--------|-------------|------------|
| `from_chrome_scan` | Chrome Inspector scan | account, contact | All extracted fields from page |
| `from_common_room` | Common Room API | account, contact | Engagement score, signals, org data |
| `from_apollo` | Apollo enrichment | contact + account | Email, phone, title, org data |
| `from_salesforce` | Salesforce CRM | account, contact | Owner, type, revenue, SF ID |
| `from_slack_mention` | Slack messages | account | Sentiment, context, channel |
| `from_gmail` | Gmail threads | account | Email direction, subject, contacts |
| `from_calendar` | Google Calendar | account + contacts | Meeting dates, attendees |
| `from_sanity_document` | Existing Sanity docs | account, contact | Re-ingest for reprocessing |

### 16c. Universal Dispatch

```python
from ingestion_adapters import ingest
signals = ingest("chrome_scan", scan_result)
signals = ingest("apollo", apollo_data, entity_type="contact")
signals = ingest("slack", message, company_or_person="Rapid7")
```

---

## Part 17: LLM Query Tools

### 17a. Available Tools

When the user asks about accounts or contacts, Claude should use these GROQ queries against Sanity (project: `ql62wkk2`, dataset: `production`):

| Tool | Trigger Phrases | Returns |
|------|----------------|---------|
| `search_accounts` | "find accounts", "search companies" | Matching accounts with confidence, sources |
| `get_account` | "tell me about", "what do we know about" | Full account detail with all confidence data |
| `get_contact` | "who is", "contact detail" | Full contact with account linkage |
| `get_contacts_at_account` | "who do we know at" | All contacts linked to an account |
| `accounts_needing_review` | "needs attention", "data conflicts" | Flagged accounts with conflict details |
| `stale_accounts` | "stale", "outdated" | Accounts not updated recently |
| `high_confidence_accounts` | "best data", "most complete" | Well-corroborated profiles |
| `account_activity` | "latest with", "recent activity" | Slack, email, meeting signals |
| `pipeline_stats` | "status", "how many accounts" | Overall system health |
| `smart_search` | Broad queries | Boosted relevance scoring |

### 17b. Confidence Field Access in GROQ

All core fields use the `confidenceField` type. Access patterns:

```groq
// Get just the value
"name": legalName.value

// Get value with confidence
"name": legalName { value, confidence, source }

// Get conflicts
"headcountConflict": headcount.conflictingValues

// Filter by confidence
*[_type == "account" && legalName.confidence > 0.8]
```

---

## Part 18: Notification Pipeline

### 18a. Notification Types

| Event | Default | Description |
|-------|---------|-------------|
| `new_account` | ON | New account created in Sanity |
| `new_contact` | ON | New contact created |
| `field_update` | ON | Significant field change |
| `conflict` | ON | Data conflict needs human review |
| `enrichment` | OFF | Enrichment completed |
| `scan` | OFF | Chrome scan completed |
| `batch` | ON | Batch operation summary |

### 18b. Configuration

Notifications respect `~/.chrome-inspector/config.json`:
- `useDraft: true` (default) → sends via `slack_send_message_draft` (safer)
- `useDraft: false` → sends via `slack_send_message` (immediate)
- `defaultChannel: null` → DMs to user (`dmUserId: "U079FFJ9D63"`)
- Channel can be overridden per-command with `--notify #channel`

### 18c. Notification Format

All notifications use Slack mrkdwn with:
- Entity name and domain in header
- Key field values
- Confidence indicators (green/yellow/red emoji)
- Actionable next steps (e.g., "Review with `/chrome-inspector view {domain}`")

---

## Updated Reference File Index

| File | Lines | Size | Purpose |
|------|-------|------|---------|
| `SKILL.md` | ~1150 | ~42KB | Full skill instructions (Parts 1-18) |
| `references/scan_page.py` | 1182 | 43KB | Python extraction pipeline |
| `references/integrations.ts` | 561 | 17KB | Sanity/CommonRoom/Slack integration mappings |
| `references/page-classifier.ts` | ~130 | 5KB | URL rules + content signals |
| `references/account-schema.ts` | ~200 | 8KB | Profile type definitions + gap priorities |
| `references/profile-store.ts` | ~160 | 6KB | Local JSON storage + merge logic |
| `references/fusion_engine.py` | ~930 | 34KB | Confidence scoring, conflict resolution, fusion |
| `references/ingestion_adapters.py` | ~640 | 39KB | 8 source adapters + universal dispatch |
| `references/entity_resolver.py` | ~480 | 19KB | Entity resolution, linkage, dedup |
| `references/llm_query_tools.py` | ~520 | 19KB | 10 GROQ query tools for LLM access |
| `references/notification_pipeline.py` | ~430 | 16KB | 7 notification types + Slack formatting |
| `references/e2e_test.py` | ~430 | 17KB | Full pipeline integration test |

**Total skill size:** ~260KB across 12 files

---


---

## Part 19: Live Scan Pipeline Orchestration

Reference: `references/live_pipeline.py`

### When to Execute

Run this pipeline when the user says:
- "scan this page"
- "scan this tab"
- "prospect scan"
- "ingest this"
- "add this to Sanity"

### Pipeline Steps

Execute these steps in order. Stop and report on failure.

#### Step 1 — Capture Chrome Tab

```
tab = mcp__Control_Chrome__get_current_tab()
page_text = mcp__Control_Chrome__get_page_content(tab_id=tab.id)
```

Save `tab.url`, `tab.title`, and `page_text`.

#### Step 2 — Classify Page

Match `tab.url` against PAGE_TYPES (see live_pipeline.py):

| URL Pattern | Page Type | Source | Entity Type |
|---|---|---|---|
| `linkedin.com/company/` | linkedin_company | linkedin | account |
| `linkedin.com/in/` | linkedin_person | linkedin | contact |
| `linkedin.com/sales/` | linkedin_sales_nav | linkedin | contact |
| `crunchbase.com/organization/` | crunchbase_org | crunchbase | account |
| `crunchbase.com/person/` | crunchbase_person | crunchbase | contact |
| `app.apollo.io/` | apollo_person | apollo | contact |
| `app.commonroom.io/` | common_room | common_room | account |
| `lightning.force.com/.*Account` | salesforce_account | salesforce | account |
| `lightning.force.com/.*Contact` | salesforce_contact | salesforce | contact |
| `g2.com/products/` | g2_company | g2 | account |
| `glassdoor.com/` | glassdoor | glassdoor | account |
| (fallback) | company_website | company_website | account |

#### Step 3 — Extract Fields

Use Claude reasoning over `page_text` to extract structured fields.

**Account fields** (extract what's available):
`legalName`, `domain`, `industry`, `subIndustry`, `headcount`, `hqCity`, `hqState`, `hqCountry`, `foundedYear`, `description`, `ceo`, `revenueRange`, `fundingTotal`, `fundingStage`, `techStack`, `websiteUrl`, `linkedinUrl`, `twitterHandle`, `stockTicker`, `competitors`, `customers`, `tags`

**Contact fields** (extract what's available):
`fullName`, `firstName`, `lastName`, `email`, `title`, `seniority`, `department`, `phone`, `linkedinUrl`, `twitterHandle`, `company`, `companyDomain`, `location`, `bio`

Rules:
- Only extract fields with clear evidence in the text
- Normalize `headcount` to integer
- Strip protocol/www from `domain`
- Use seniority values: `c_suite`, `vp`, `director`, `manager`, `senior`, `mid`, `junior`, `intern`
- Return as JSON dict, omit fields with no evidence

#### Step 4 — Build Signal

```python
signal = {
    "source": classification.source,
    "timestamp": now_iso,
    "scanned_at": now_iso,
    "url": tab.url,
    "entity_type": classification.entity_type,
    "entity_hint": {
        # account: { domain, name }
        # contact: { email, name, company, domain }
    },
    "fields": extracted_fields,
}
```

#### Step 5 — Resolve Entity in Sanity

Run GROQ queries in priority order. Stop at first match.

**Account resolution** (try in order):
```groq
// 1. Domain match (0.98 confidence)
*[_type == "account" && domain.value == $domain][0]

// 2. Salesforce ID match (0.99)
*[_type == "account" && salesforceId.value == $sfId][0]

// 3. Name exact match (0.85)
*[_type == "account" && legalName.value == $name][0]
```

**Contact resolution** (try in order):
```groq
// 1. Email match (0.97)
*[_type == "contact" && email.value == $email][0]

// 2. Name + company domain match (0.85)
*[_type == "contact" && fullName.value == $name && companyDomain.value == $domain][0]
```

MCP call:
```
mcp__e17eda47__query_documents(
    resource={projectId: "ql62wkk2", dataset: "production"},
    query=<groq_query>,
    params=<params>,
    single=true
)
```

#### Step 6 — Generate Entity ID

Deterministic IDs using slugify (strips periods, lowercases, spaces→hyphens):

- Account: `account-{slugify(domain)}` → e.g. `account-rapid7com`
- Contact: `contact-{slugify(name)}-{slugify(domain)}` → e.g. `contact-corey-thomas-rapid7com`

#### Step 7 — Fuse Fields

Every field wrapped as `confidenceField`:
```json
{
    "_type": "confidenceField",
    "value": <any>,
    "confidence": <0-1>,
    "certain": <bool>,
    "source": "<source_name>",
    "sources": ["<source1>", "<source2>"],
    "updated": "<ISO timestamp>",
    "conflictingValues": []
}
```

**Source trust tiers:**
- Tier 1: salesforce=0.90, company_website=0.85, common_room=0.85, bigquery=0.95
- Tier 2: linkedin=0.75, crunchbase=0.72, apollo=0.70
- Tier 3: g2=0.65, glassdoor=0.60, slack=0.40, gmail=0.35
- Tier 4: inferred=0.25

**Confidence formula:** `base_trust + authority_bonus(0.05) + corroboration_bonus(0.03/source)`

**Conflict resolution (in order):**
1. Values match → corroborate (boost confidence)
2. New source is authoritative for field, existing is not → accept new
3. Existing source is authoritative, new is not → reject new
4. Confidence margin > 0.15 → higher wins
5. Otherwise → FLAG for human review (add to `conflictingValues`)

**Field authority map** (top 3 sources per field — see `FIELD_AUTHORITY` in live_pipeline.py):
- `legalName`: salesforce, company_website, crunchbase
- `domain`: company_website, salesforce, crunchbase
- `headcount`: linkedin, salesforce, crunchbase
- `email`: salesforce, apollo, gmail
- `title`: linkedin, salesforce, apollo

#### Step 8 — Build Document

Build the full Sanity document with:
- All fused fields
- Preserved existing fields not in this signal
- `metadata`: `{ fusionVersion, lastFusedAt, signalCount, requiresReview }`
- `signalSummary`: `{ sources[], uncertainFields[], lastSignalAt }`

#### Step 9 — Persist to Sanity

**New entity:**
```
mcp__e17eda47__create_documents_from_json(
    resource={projectId: "ql62wkk2", dataset: "production"},
    documents=[document]
)
```

**Existing entity (update):**
```
mcp__e17eda47__patch_document_from_json(
    resource={projectId: "ql62wkk2", dataset: "production"},
    documentId=entity_id,
    patch={ set: { ...fused_fields, metadata, signalSummary } }
)
```

#### Step 10 — Log Fusion Event

```
event = {
    _type: "fusionEvent",
    _id: "fusion-{entity_id}-{timestamp}",
    entitySanityId, entityType, eventType,
    source, sourceUrl, fieldsAffected[],
    conflicts[], fieldCount, timestamp
}

mcp__e17eda47__create_documents_from_json(
    resource={projectId: "ql62wkk2", dataset: "production"},
    documents=[event]
)
```

#### Step 11 — Slack Notification

```
mcp__5e5b2f2c__slack_send_message_draft(
    channel="U079FFJ9D63",
    text=<formatted message>
)
```

Message format:
```
🆕 *Account: Rapid7, Inc.*          (or 🔄 for updates)
Source: `company_website` • Fields: 13
<url|View source page>
⚠️ Conflicts: headcount, legalName   (if any)
🔴 *Requires human review*           (if flagged)
```

### Error Handling

- If Chrome tab read fails → report "Cannot read tab. Is Chrome connected?"
- If page_text is empty → still classify by URL, extract from title
- If no entity resolution match → create new entity (initial_fuse)
- If Sanity upsert fails → report error, do NOT log fusionEvent
- If Slack fails → log warning but don't fail the pipeline

### Quick Reference

```
Sanity Project: ql62wkk2
Dataset: production
Slack DM: U079FFJ9D63
ID format: account-{slug} / contact-{name}-{domain}
```
