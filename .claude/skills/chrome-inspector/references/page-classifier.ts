/**
 * page-classifier.ts — Detect page type from URL and content signals.
 *
 * This is a reference implementation. When the skill runs, Claude uses these
 * patterns to classify pages without executing this code directly.
 */

export type PageType =
  | 'linkedin_company'
  | 'linkedin_person'
  | 'salesforce_account'
  | 'salesforce_contact'
  | 'salesforce_opportunity'
  | 'hubspot_company'
  | 'hubspot_contact'
  | 'outreach_prospect'
  | 'common_room_profile'
  | 'crunchbase_org'
  | 'g2_product'
  | 'github_org'
  | 'github_repo'
  | 'company_website'
  | 'company_careers'
  | 'company_pricing'
  | 'company_blog'
  | 'news_article'
  | 'job_posting'
  | 'unknown'

interface ClassificationResult {
  pageType: PageType
  confidence: 'high' | 'medium' | 'low'
  entityHint: {
    type: 'company' | 'person' | 'unknown'
    name?: string
    domain?: string
  }
}

/** URL-based rules — fast, high confidence */
const URL_RULES: Array<{ pattern: RegExp; type: PageType; entity: 'company' | 'person' }> = [
  { pattern: /linkedin\.com\/company\/([^/?#]+)/, type: 'linkedin_company', entity: 'company' },
  { pattern: /linkedin\.com\/in\/([^/?#]+)/, type: 'linkedin_person', entity: 'person' },
  { pattern: /\.my\.salesforce\.com\/.*\/Account\//, type: 'salesforce_account', entity: 'company' },
  { pattern: /\.my\.salesforce\.com\/.*\/Contact\//, type: 'salesforce_contact', entity: 'person' },
  { pattern: /\.my\.salesforce\.com\/.*\/Opportunity\//, type: 'salesforce_opportunity', entity: 'company' },
  { pattern: /app\.hubspot\.com\/contacts\/.*\/company\//, type: 'hubspot_company', entity: 'company' },
  { pattern: /app\.hubspot\.com\/contacts\/.*\/contact\//, type: 'hubspot_contact', entity: 'person' },
  { pattern: /app\.outreach\.io\/.*\/prospects\//, type: 'outreach_prospect', entity: 'person' },
  { pattern: /app\.commonroom\.io/, type: 'common_room_profile', entity: 'company' },
  { pattern: /crunchbase\.com\/organization\/([^/?#]+)/, type: 'crunchbase_org', entity: 'company' },
  { pattern: /g2\.com\/products\/([^/?#]+)/, type: 'g2_product', entity: 'company' },
  { pattern: /github\.com\/([^/?#]+)\/?$/, type: 'github_org', entity: 'company' },
  { pattern: /github\.com\/([^/?#]+)\/([^/?#]+)/, type: 'github_repo', entity: 'company' },
  { pattern: /\/(careers|jobs|openings|positions)/, type: 'company_careers', entity: 'company' },
  { pattern: /\/pricing/, type: 'company_pricing', entity: 'company' },
  { pattern: /\/(blog|news|press|articles)\//, type: 'company_blog', entity: 'company' },
  { pattern: /greenhouse\.io\//, type: 'job_posting', entity: 'company' },
  { pattern: /lever\.co\//, type: 'job_posting', entity: 'company' },
]

/** Content-based signals — used when URL rules don't match */
const CONTENT_SIGNALS: Record<string, { type: PageType; entity: 'company' | 'person' }> = {
  'followers on LinkedIn': { type: 'linkedin_company', entity: 'company' },
  'employees on LinkedIn': { type: 'linkedin_company', entity: 'company' },
  'Experience': { type: 'linkedin_person', entity: 'person' },
  'Account Owner': { type: 'salesforce_account', entity: 'company' },
  'Annual Revenue': { type: 'salesforce_account', entity: 'company' },
  'Total Funding': { type: 'crunchbase_org', entity: 'company' },
  'Founded Date': { type: 'crunchbase_org', entity: 'company' },
}

export function classifyPage(url: string, pageText: string): ClassificationResult {
  // Try URL rules first
  for (const rule of URL_RULES) {
    const match = url.match(rule.pattern)
    if (match) {
      return {
        pageType: rule.type,
        confidence: 'high',
        entityHint: {
          type: rule.entity,
          name: match[1]?.replace(/-/g, ' '),
          domain: rule.entity === 'company' ? extractDomain(url) : undefined,
        },
      }
    }
  }

  // Try content signals
  for (const [signal, result] of Object.entries(CONTENT_SIGNALS)) {
    if (pageText.includes(signal)) {
      return {
        pageType: result.type,
        confidence: 'medium',
        entityHint: { type: result.entity },
      }
    }
  }

  // Fallback: if it's a regular domain with company-like content
  if (looksLikeCompanyWebsite(url, pageText)) {
    return {
      pageType: 'company_website',
      confidence: 'low',
      entityHint: {
        type: 'company',
        domain: extractDomain(url),
      },
    }
  }

  return {
    pageType: 'unknown',
    confidence: 'low',
    entityHint: { type: 'unknown' },
  }
}

function extractDomain(url: string): string | undefined {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return undefined
  }
}

function looksLikeCompanyWebsite(url: string, text: string): boolean {
  const companySignals = ['About Us', 'Our Team', 'Contact Us', 'Products', 'Solutions', 'Customers']
  const matchCount = companySignals.filter((s) => text.includes(s)).length
  return matchCount >= 2
}
