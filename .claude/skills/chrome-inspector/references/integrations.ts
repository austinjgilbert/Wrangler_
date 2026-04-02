/**
 * integrations.ts — Chrome Inspector Integration Layer Reference
 *
 * Defines how scan_page.py profiles map to:
 * 1. Sanity Content Lake (Prospect 360) — persistent storage
 * 2. Common Room — enrichment data pull
 * 3. Slack — notifications and summaries
 *
 * Target Sanity project: ql62wkk2 (Prospect 360), dataset: production
 */

// ============================================================================
// SANITY INTEGRATION
// ============================================================================

/**
 * Sanity document types (schemaless — no deploy needed):
 * - companyProfile: Company/org account profiles
 * - personProfile: Individual contact profiles
 *
 * Document ID convention:
 *   companyProfile: company-{slugified-domain-or-name}
 *   personProfile:  person-{slugified-name-company}
 *
 * This ensures idempotent upserts — scanning the same entity
 * twice updates the same document instead of creating duplicates.
 */

const SANITY_CONFIG = {
  projectId: "ql62wkk2",
  dataset: "production",
};

/**
 * Transform a scan_page.py CompanyProfile output into a Sanity document.
 *
 * The scan_page.py output is a StoredProfile JSON with this shape:
 * {
 *   entity_type: "company",
 *   profile: { name, domain, description, industry, employee_count, ... },
 *   completeness: 0.65,
 *   gaps: [{ field, priority, suggestion }],
 *   sources: [{ name, url, scanned_at, fields_extracted }],
 *   last_updated, scan_count
 * }
 */
interface SanityCompanyDocument {
  _type: "companyProfile";
  _id: string; // deterministic from domain or name
  name: string;
  domain?: string;
  description?: string;
  industry?: string;
  employeeCount?: string;
  founded?: string;
  headquarters?: {
    _type: "location";
    city?: string;
    state?: string;
    country?: string;
  };
  funding?: {
    _type: "funding";
    totalRaised?: string;
    lastRound?: string;
    lastRoundDate?: string;
    investors?: string[];
  };
  social?: {
    _type: "socialLinks";
    linkedin?: string;
    twitter?: string;
    github?: string;
    crunchbase?: string;
  };
  revenue?: {
    _type: "revenueSignals";
    estimatedRevenue?: string;
    revenueSource?: string;
    fiscalYearEnd?: string;
  };
  engagement?: {
    _type: "engagementSignals";
    isSanityCustomer?: boolean;
    currentCms?: string[];
    techStack?: string[];
    recentActivity?: string[];
    intent_signals?: string[];
  };
  linkedinUrl?: string;
  crunchbaseUrl?: string;
  websiteUrl?: string;
  completeness?: number;
  gaps?: Array<{
    _type: "gapItem";
    _key: string;
    field: string;
    priority: string;
    suggestion: string;
  }>;
  sources?: Array<{
    _type: "dataSource";
    _key: string;
    name: string;
    url?: string;
    scannedAt?: string;
    fieldsExtracted?: string[];
  }>;
  lastUpdated?: string;
  scanCount?: number;
}

/**
 * MAPPING: scan_page.py output → Sanity companyProfile document
 *
 * Python field                  → Sanity field
 * ─────────────────────────────────────────────
 * profile.name                  → name
 * profile.domain                → domain
 * profile.description           → description
 * profile.industry              → industry
 * profile.employee_count        → employeeCount
 * profile.founded               → founded
 * profile.headquarters.city     → headquarters.city
 * profile.headquarters.state    → headquarters.state
 * profile.headquarters.country  → headquarters.country
 * profile.funding.total_raised  → funding.totalRaised
 * profile.funding.last_round    → funding.lastRound
 * profile.funding.last_round_date → funding.lastRoundDate
 * profile.funding.investors     → funding.investors
 * profile.social.linkedin       → social.linkedin
 * profile.social.twitter        → social.twitter
 * profile.social.github         → social.github
 * profile.social.crunchbase     → social.crunchbase
 * profile.revenue.estimated_revenue → revenue.estimatedRevenue
 * profile.linkedin_url          → linkedinUrl
 * profile.crunchbase_url        → crunchbaseUrl
 * profile.website_url           → websiteUrl (or "https://{domain}")
 * completeness                  → completeness (×100 for %)
 * gaps[]                        → gaps[] (add _type, _key)
 * sources[]                     → sources[] (add _type, _key, camelCase)
 * last_updated                  → lastUpdated
 * scan_count                    → scanCount
 */

// How Claude should create/update a company profile in Sanity:
//
// STEP 1: Query for existing document by domain
//   GROQ: *[_type == "companyProfile" && domain == $domain][0]
//   params: { domain: profile.domain }
//
// STEP 2: If exists → patch (merge new data)
//   Use patch_document_from_json with the document ID
//   Only update fields that have new non-null values
//
// STEP 3: If not exists → create
//   Use create_documents_from_json with deterministic _id
//   _id format: "company-" + slugify(domain || name)

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function generateCompanyId(profile: any): string {
  const key = profile.domain || profile.name;
  return `company-${slugify(key)}`;
}

function generatePersonId(profile: any): string {
  const key = `${profile.name}-${profile.company || "unknown"}`;
  return `person-${slugify(key)}`;
}

/**
 * Transform scan_page.py StoredProfile JSON → Sanity document content.
 * This is what gets passed to create_documents_from_json.
 */
function storedProfileToSanityCompany(stored: any): any {
  const p = stored.profile;
  const doc: any = {
    name: p.name,
    domain: p.domain,
    description: p.description,
    industry: p.industry,
    employeeCount: p.employee_count,
    founded: p.founded,
    linkedinUrl: p.linkedin_url,
    crunchbaseUrl: p.crunchbase_url,
    websiteUrl: p.website_url || (p.domain ? `https://${p.domain}` : undefined),
    completeness: Math.round((stored.completeness || 0) * 100),
    lastUpdated: stored.last_updated,
    scanCount: stored.scan_count,
  };

  // Nested objects — only include if any field is present
  if (p.headquarters) {
    const hq = p.headquarters;
    if (hq.city || hq.state || hq.country) {
      doc.headquarters = {
        _type: "location",
        city: hq.city,
        state: hq.state,
        country: hq.country,
      };
    }
  }

  if (p.funding) {
    const f = p.funding;
    if (f.total_raised || f.last_round || f.investors?.length) {
      doc.funding = {
        _type: "funding",
        totalRaised: f.total_raised,
        lastRound: f.last_round,
        lastRoundDate: f.last_round_date,
        investors: f.investors,
      };
    }
  }

  if (p.social) {
    const s = p.social;
    if (s.linkedin || s.twitter || s.github || s.crunchbase) {
      doc.social = {
        _type: "socialLinks",
        linkedin: s.linkedin,
        twitter: s.twitter,
        github: s.github,
        crunchbase: s.crunchbase,
      };
    }
  }

  if (p.revenue) {
    const r = p.revenue;
    if (r.estimated_revenue) {
      doc.revenue = {
        _type: "revenueSignals",
        estimatedRevenue: r.estimated_revenue,
        revenueSource: r.revenue_source,
        fiscalYearEnd: r.fiscal_year_end,
      };
    }
  }

  if (p.engagement) {
    const e = p.engagement;
    doc.engagement = {
      _type: "engagementSignals",
      isSanityCustomer: e.is_sanity_customer,
      currentCms: e.current_cms,
      techStack: e.tech_stack,
      recentActivity: e.recent_activity,
      intent_signals: e.intent_signals,
    };
  }

  // Arrays with _key for Sanity
  if (stored.gaps?.length) {
    doc.gaps = stored.gaps.map((g: any, i: number) => ({
      _type: "gapItem",
      _key: `gap-${i}`,
      field: g.field,
      priority: g.priority,
      suggestion: g.suggestion,
    }));
  }

  if (stored.sources?.length) {
    doc.sources = stored.sources.map((s: any, i: number) => ({
      _type: "dataSource",
      _key: `src-${i}`,
      name: s.name,
      url: s.url,
      scannedAt: s.scanned_at,
      fieldsExtracted: s.fields_extracted,
    }));
  }

  // Strip undefined/null values
  return JSON.parse(JSON.stringify(doc));
}

// Person profile follows same pattern with personProfile type

function storedProfileToSanityPerson(stored: any): any {
  const p = stored.profile;
  const doc: any = {
    name: p.name,
    title: p.title,
    company: p.company,
    email: p.email,
    phone: p.phone,
    linkedinUrl: p.linkedin_url,
    bio: p.bio,
    completeness: Math.round((stored.completeness || 0) * 100),
    lastUpdated: stored.last_updated,
    scanCount: stored.scan_count,
  };

  if (p.location) {
    const l = p.location;
    if (l.city || l.state || l.country) {
      doc.location = {
        _type: "location",
        city: l.city,
        state: l.state,
        country: l.country,
      };
    }
  }

  if (p.social) {
    const s = p.social;
    if (s.linkedin || s.twitter || s.github) {
      doc.social = {
        _type: "socialLinks",
        linkedin: s.linkedin,
        twitter: s.twitter,
        github: s.github,
      };
    }
  }

  if (stored.gaps?.length) {
    doc.gaps = stored.gaps.map((g: any, i: number) => ({
      _type: "gapItem",
      _key: `gap-${i}`,
      field: g.field,
      priority: g.priority,
      suggestion: g.suggestion,
    }));
  }

  if (stored.sources?.length) {
    doc.sources = stored.sources.map((s: any, i: number) => ({
      _type: "dataSource",
      _key: `src-${i}`,
      name: s.name,
      url: s.url,
      scannedAt: s.scanned_at,
      fieldsExtracted: s.fields_extracted,
    }));
  }

  return JSON.parse(JSON.stringify(doc));
}


// ============================================================================
// COMMON ROOM INTEGRATION
// ============================================================================

/**
 * Common Room enrichment flow:
 *
 * After scanning a page and extracting a company/person profile,
 * use Common Room MCP to pull additional data:
 *
 * For companies:
 *   1. Search by domain: common_room.account_research(domain)
 *   2. Extract: employee count, industry, signals, contacts
 *   3. Merge into existing profile (Common Room fills gaps)
 *
 * For people:
 *   1. Search by name+company: common_room.contact_research(name, company)
 *   2. Extract: email, title, social links, activity signals
 *   3. Merge into existing profile
 *
 * Common Room MCP tools available:
 *   - account-research: Research a company by name/domain
 *   - contact-research: Research a person by name/email
 *   - prospect: Build lists matching criteria
 *
 * Enrichment priority (what to pull from Common Room):
 *   CRITICAL: email, phone (for personProfile)
 *   HIGH: employee_count, industry, tech_stack
 *   MEDIUM: intent_signals, recent_activity
 *   LOW: social links (usually already have from LinkedIn)
 */

// Common Room enrichment is invoked by Claude as a skill, not as code.
// The chrome-inspector SKILL.md should instruct Claude:
//
// AFTER scanning a page and saving a profile:
//   1. Check gaps[] for critical/high priority items
//   2. If gaps exist that Common Room can fill:
//      - For companies: use common-room:account-research skill with domain
//      - For people: use common-room:contact-research skill with name
//   3. Merge Common Room data into the profile
//   4. Re-run gap analysis
//   5. Update Sanity document with enriched profile


// ============================================================================
// SLACK INTEGRATION
// ============================================================================

/**
 * Slack notification flow:
 *
 * After a profile is created/updated, post a summary to a Slack channel.
 *
 * Message format for company profiles:
 * ───────────────────────────────────
 * 🏢 *{company_name}* — Profile {Created|Updated}
 *
 * *Industry:* {industry}
 * *Employees:* {employee_count}
 * *HQ:* {city, state, country}
 * *Domain:* {domain}
 * *Completeness:* {completeness}%
 *
 * *Sources:* {source_count} ({source_names})
 * *Gaps:* {critical_count} critical, {high_count} high
 *
 * *Top gaps:*
 * • {gap_1.field} ({gap_1.priority}) — {gap_1.suggestion}
 * • {gap_2.field} ({gap_2.priority}) — {gap_2.suggestion}
 *
 * Message format for person profiles:
 * ────────────────────────────────────
 * 👤 *{name}* — Profile {Created|Updated}
 *
 * *Title:* {title}
 * *Company:* {company}
 * *Email:* {email}
 * *Location:* {city, country}
 * *Completeness:* {completeness}%
 *
 * *Sources:* {source_count} ({source_names})
 * *Gaps:* {critical_count} critical, {high_count} high
 *
 * Slack MCP tools:
 *   - slack_send_message: Post to a channel
 *   - slack_send_message_draft: Create a draft for review first
 *   - slack_search_channels: Find the right channel
 *
 * Target channel: To be configured. Suggestions:
 *   - #prospect-intel — for new prospect profiles
 *   - #account-research — for enriched account data
 *   - DM to the user — for personal scan results
 */

function formatCompanySlackMessage(stored: any): string {
  const p = stored.profile;
  const gaps = stored.gaps || [];
  const criticalGaps = gaps.filter((g: any) => g.priority === "critical");
  const highGaps = gaps.filter((g: any) => g.priority === "high");
  const completePct = Math.round((stored.completeness || 0) * 100);

  const hq = p.headquarters;
  const hqStr = [hq?.city, hq?.state, hq?.country].filter(Boolean).join(", ");

  let msg = `🏢 *${p.name}* — Profile ${stored.scan_count > 1 ? "Updated" : "Created"}\n\n`;

  if (p.industry) msg += `*Industry:* ${p.industry}\n`;
  if (p.employee_count) msg += `*Employees:* ${p.employee_count}\n`;
  if (hqStr) msg += `*HQ:* ${hqStr}\n`;
  if (p.domain) msg += `*Domain:* ${p.domain}\n`;
  msg += `*Completeness:* ${completePct}%\n`;

  const sourceNames = (stored.sources || []).map((s: any) => s.name).join(", ");
  msg += `\n*Sources:* ${stored.sources?.length || 0} (${sourceNames})\n`;
  msg += `*Gaps:* ${criticalGaps.length} critical, ${highGaps.length} high\n`;

  const topGaps = gaps.slice(0, 3);
  if (topGaps.length) {
    msg += `\n*Top gaps:*\n`;
    topGaps.forEach((g: any) => {
      msg += `• ${g.field} (${g.priority}) — ${g.suggestion}\n`;
    });
  }

  return msg;
}

function formatPersonSlackMessage(stored: any): string {
  const p = stored.profile;
  const gaps = stored.gaps || [];
  const criticalGaps = gaps.filter((g: any) => g.priority === "critical");
  const highGaps = gaps.filter((g: any) => g.priority === "high");
  const completePct = Math.round((stored.completeness || 0) * 100);

  const loc = p.location;
  const locStr = [loc?.city, loc?.country].filter(Boolean).join(", ");

  let msg = `👤 *${p.name}* — Profile ${stored.scan_count > 1 ? "Updated" : "Created"}\n\n`;

  if (p.title) msg += `*Title:* ${p.title}\n`;
  if (p.company) msg += `*Company:* ${p.company}\n`;
  if (p.email) msg += `*Email:* ${p.email}\n`;
  if (locStr) msg += `*Location:* ${locStr}\n`;
  msg += `*Completeness:* ${completePct}%\n`;

  const sourceNames = (stored.sources || []).map((s: any) => s.name).join(", ");
  msg += `\n*Sources:* ${stored.sources?.length || 0} (${sourceNames})\n`;
  msg += `*Gaps:* ${criticalGaps.length} critical, ${highGaps.length} high\n`;

  const topGaps = gaps.slice(0, 3);
  if (topGaps.length) {
    msg += `\n*Top gaps:*\n`;
    topGaps.forEach((g: any) => {
      msg += `• ${g.field} (${g.priority}) — ${g.suggestion}\n`;
    });
  }

  return msg;
}


// ============================================================================
// FULL WORKFLOW — How Claude orchestrates the integrations
// ============================================================================

/**
 * WORKFLOW: scan → store → push → enrich → notify
 *
 * 1. SCAN PAGE (Phase 1-3)
 *    - Read page via Chrome MCP (accessibility tree preferred)
 *    - Classify page type
 *    - Extract structured data into CompanyProfile or PersonProfile
 *    - Run gap analysis
 *    - Save to local JSON (~/.chrome-inspector/profiles/)
 *
 * 2. PUSH TO SANITY (Phase 5b)
 *    - Transform StoredProfile → Sanity document
 *    - Query Sanity for existing doc (by domain or name)
 *    - Create or patch document in Prospect 360
 *    - Publish immediately (or keep as draft for review)
 *
 * 3. ENRICH FROM COMMON ROOM (Phase 5c)
 *    - Check gaps for enrichable fields
 *    - Query Common Room by domain/name
 *    - Merge enrichment data into profile
 *    - Update local JSON and Sanity document
 *
 * 4. NOTIFY VIA SLACK (Phase 5d)
 *    - Format profile summary as Slack message
 *    - Post to configured channel
 *    - Include completeness score and top gaps
 *
 * Claude should execute this workflow automatically when:
 *    /chrome-inspector scan
 *    /chrome-inspector scan --enrich
 *    /chrome-inspector scan --notify #channel-name
 */

export {
  SANITY_CONFIG,
  generateCompanyId,
  generatePersonId,
  storedProfileToSanityCompany,
  storedProfileToSanityPerson,
  formatCompanySlackMessage,
  formatPersonSlackMessage,
  slugify,
};
