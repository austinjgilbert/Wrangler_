/**
 * account-schema.ts — Canonical data models for company and person profiles.
 *
 * These types define the structure of stored profiles. When Claude extracts
 * data from a page, it maps into these shapes. Fields are all optional —
 * profiles are built incrementally across multiple page scans.
 */

// ---------------------------------------------------------------------------
// Company Profile
// ---------------------------------------------------------------------------

export interface CompanyProfile {
  name?: string
  domain?: string
  industry?: string
  sub_industry?: string
  description?: string
  employee_count?: string          // exact or range: "51-200", "500"
  employee_count_source?: string   // "linkedin", "crunchbase", "website"
  founded_year?: number
  headquarters?: {
    city?: string
    state?: string
    country?: string
  }
  funding?: {
    total_raised?: string
    last_round?: string            // "Series B", "Seed"
    last_round_amount?: string
    last_round_date?: string
    investors?: string[]
  }
  tech_stack?: string[]
  social?: {
    linkedin_url?: string
    twitter_url?: string
    github_url?: string
    facebook_url?: string
  }
  revenue_signals?: {
    estimated_arr?: string
    pricing_model?: string         // "freemium", "enterprise", "usage-based"
    pricing_url?: string
    has_free_tier?: boolean
  }
  competitors?: string[]
  customers?: string[]             // notable customers if visible
  tags?: string[]
}

// ---------------------------------------------------------------------------
// Person Profile
// ---------------------------------------------------------------------------

export interface PersonProfile {
  name?: string
  title?: string
  company?: string
  company_domain?: string
  email?: string
  phone?: string
  linkedin_url?: string
  location?: {
    city?: string
    state?: string
    country?: string
  }
  seniority?: 'C-Level' | 'VP' | 'Director' | 'Manager' | 'IC' | 'Unknown'
  department?: string              // "Engineering", "Sales", "Marketing", etc.
  previous_companies?: Array<{
    name: string
    title?: string
    duration?: string
  }>
  skills?: string[]
  bio?: string
  mutual_connections?: string[]
}

// ---------------------------------------------------------------------------
// Engagement Signals (from CRM / activity feeds)
// ---------------------------------------------------------------------------

export interface EngagementSignals {
  last_activity_date?: string
  engagement_score?: number
  recent_signals?: Array<{
    type: string                   // "page_visit", "email_open", "event_attend"
    date: string
    detail: string
  }>
  deal_stage?: string
  deal_value?: string
  next_steps?: string[]
  open_opportunities?: number
  owner?: string                   // account owner / rep
}

// ---------------------------------------------------------------------------
// Source Tracking
// ---------------------------------------------------------------------------

export interface DataSource {
  url: string
  page_type: string
  extracted_at: string             // ISO 8601
  fields_extracted: string[]
}

// ---------------------------------------------------------------------------
// Stored Profile (what gets written to disk)
// ---------------------------------------------------------------------------

export interface StoredProfile {
  entity_type: 'company' | 'person'
  primary_key: string              // domain for companies, linkedin slug for people
  display_name: string
  profile: CompanyProfile | PersonProfile
  engagement?: EngagementSignals
  sources: DataSource[]
  gaps: string[]                   // list of empty field paths
  enrichment_suggestions: Array<{
    field: string
    suggestion: string
    url_hint?: string
  }>
  completeness: number             // 0-100 percentage
  last_updated: string
  created_at: string
}

// ---------------------------------------------------------------------------
// Gap Priority
// ---------------------------------------------------------------------------

export type GapPriority = 'critical' | 'high' | 'medium' | 'low'

export const COMPANY_FIELD_PRIORITIES: Record<string, GapPriority> = {
  'name': 'critical',
  'domain': 'critical',
  'industry': 'critical',
  'employee_count': 'critical',
  'description': 'high',
  'headquarters': 'high',
  'funding.total_raised': 'high',
  'funding.last_round': 'high',
  'revenue_signals.estimated_arr': 'high',
  'revenue_signals.pricing_model': 'high',
  'tech_stack': 'high',
  'competitors': 'medium',
  'social.linkedin_url': 'medium',
  'social.github_url': 'medium',
  'social.twitter_url': 'low',
  'founded_year': 'low',
  'customers': 'low',
  'tags': 'low',
}

export const PERSON_FIELD_PRIORITIES: Record<string, GapPriority> = {
  'name': 'critical',
  'title': 'critical',
  'company': 'critical',
  'seniority': 'critical',
  'department': 'critical',
  'email': 'high',
  'linkedin_url': 'high',
  'location': 'high',
  'phone': 'medium',
  'previous_companies': 'medium',
  'skills': 'low',
  'bio': 'low',
}

// ---------------------------------------------------------------------------
// Enrichment Lookup Table
// ---------------------------------------------------------------------------

export const ENRICHMENT_SUGGESTIONS: Record<string, (entity: string, domain?: string) => { suggestion: string; url_hint?: string }> = {
  'funding': (name, _domain) => ({
    suggestion: `Check Crunchbase for ${name}`,
    url_hint: `https://crunchbase.com/organization/${name.toLowerCase().replace(/\s+/g, '-')}`,
  }),
  'tech_stack': (_name, domain) => ({
    suggestion: `Check BuiltWith or Wappalyzer for ${domain}`,
    url_hint: `https://builtwith.com/${domain}`,
  }),
  'employee_count': (name) => ({
    suggestion: `Check LinkedIn company page for ${name}`,
    url_hint: `https://linkedin.com/company/${name.toLowerCase().replace(/\s+/g, '-')}`,
  }),
  'revenue_signals': (_name, domain) => ({
    suggestion: `Check pricing page`,
    url_hint: `https://${domain}/pricing`,
  }),
  'competitors': (name) => ({
    suggestion: `Search G2 for ${name} alternatives`,
    url_hint: `https://g2.com/search?query=${encodeURIComponent(name)}`,
  }),
  'email': (name) => ({
    suggestion: `Look up on Hunter.io or check company contact page`,
  }),
  'linkedin_url': (name) => ({
    suggestion: `Search LinkedIn for ${name}`,
    url_hint: `https://linkedin.com/search/results/people/?keywords=${encodeURIComponent(name)}`,
  }),
  'headquarters': (name) => ({
    suggestion: `LinkedIn company page shows HQ location for ${name}`,
  }),
  'github_url': (name) => ({
    suggestion: `Search GitHub organizations for ${name}`,
    url_hint: `https://github.com/search?q=${encodeURIComponent(name)}&type=orgs`,
  }),
  'social.linkedin_url': (name) => ({
    suggestion: `Search LinkedIn for ${name} company page`,
    url_hint: `https://linkedin.com/search/results/companies/?keywords=${encodeURIComponent(name)}`,
  }),
}

// ---------------------------------------------------------------------------
// Completeness calculation
// ---------------------------------------------------------------------------

const TOTAL_COMPANY_FIELDS = Object.keys(COMPANY_FIELD_PRIORITIES).length
const TOTAL_PERSON_FIELDS = Object.keys(PERSON_FIELD_PRIORITIES).length

export function calculateCompleteness(
  entityType: 'company' | 'person',
  filledFields: string[],
): number {
  const total = entityType === 'company' ? TOTAL_COMPANY_FIELDS : TOTAL_PERSON_FIELDS
  return Math.round((filledFields.length / total) * 100)
}
