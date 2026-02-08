/**
 * Account — the core entity in the Content OS.
 *
 * An account represents a company/website being researched.  It acts as the
 * hub connecting technologies, people, competitors, evidence, and enrichment
 * data into a single queryable document.
 *
 * Fields are intentionally optional so partial data can be stored early and
 * filled in by the background enrichment pipeline.
 */

export default {
  name: 'account',
  title: 'Account',
  type: 'document',
  fields: [
    // ── Identity ──────────────────────────────────────────────────────
    { name: 'name', title: 'Name', type: 'string' },
    { name: 'domain', title: 'Domain', type: 'string' },
    { name: 'accountKey', title: 'Account Key', type: 'string' },
    { name: 'canonicalUrl', title: 'Canonical URL', type: 'url' },
    { name: 'rootDomain', title: 'Root Domain', type: 'string' },
    { name: 'companyName', title: 'Company Name', type: 'string' },

    // ── Classification ────────────────────────────────────────────────
    { name: 'industry', title: 'Industry', type: 'string' },
    {
      name: 'classification',
      title: 'Classification',
      type: 'object',
      fields: [
        { name: 'industry', type: 'string', title: 'Industry' },
        { name: 'segment', type: 'string', title: 'Segment' },
        { name: 'tags', type: 'array', title: 'Tags', of: [{ type: 'string' }] },
        { name: 'aiReadinessTier', type: 'string', title: 'AI Readiness Tier' },
        { name: 'opportunityTier', type: 'string', title: 'Opportunity Tier' },
        { name: 'classifiedAt', type: 'datetime', title: 'Classified At' },
      ],
    },
    { name: 'tags', title: 'Tags', type: 'array', of: [{ type: 'string' }] },

    // ── Technology Stack ──────────────────────────────────────────────
    { name: 'techStack', title: 'Tech Stack (legacy flat)', type: 'array', of: [{ type: 'string' }] },
    {
      name: 'technologyStack',
      title: 'Technology Stack (structured)',
      type: 'object',
      fields: [
        { name: 'cms', type: 'array', title: 'CMS', of: [{ type: 'string' }] },
        { name: 'frameworks', type: 'array', title: 'Frameworks', of: [{ type: 'string' }] },
        { name: 'legacySystems', type: 'array', title: 'Legacy Systems', of: [{ type: 'string' }] },
        { name: 'pimSystems', type: 'array', title: 'PIM Systems', of: [{ type: 'string' }] },
        { name: 'damSystems', type: 'array', title: 'DAM Systems', of: [{ type: 'string' }] },
        { name: 'lmsSystems', type: 'array', title: 'LMS Systems', of: [{ type: 'string' }] },
        { name: 'migrationOpportunities', type: 'array', title: 'Migration Opportunities', of: [{ type: 'string' }] },
        { name: 'painPoints', type: 'array', title: 'Tech Pain Points', of: [{ type: 'string' }] },
      ],
    },
    {
      name: 'technologies',
      title: 'Technologies (references)',
      type: 'array',
      of: [{ type: 'reference', to: [{ type: 'technology' }] }],
      description: 'Structured references to technology documents — enables querying "all accounts using Technology X"',
    },

    // ── Leadership & People ───────────────────────────────────────────
    {
      name: 'leadership',
      title: 'Leadership Team',
      type: 'array',
      of: [{ type: 'reference', to: [{ type: 'person' }] }],
      description: 'Key decision-makers at this account — CTO, VP Eng, CMO, etc.',
    },

    // ── Pain Points ───────────────────────────────────────────────────
    {
      name: 'painPoints',
      title: 'Pain Points',
      type: 'array',
      of: [{
        type: 'object',
        fields: [
          { name: 'category', type: 'string', title: 'Category', description: 'e.g. content-ops, tech-debt, performance, scalability, security' },
          { name: 'description', type: 'text', title: 'Description' },
          { name: 'severity', type: 'string', title: 'Severity', description: 'high / medium / low' },
          { name: 'source', type: 'string', title: 'Source', description: 'Where this was detected: scan, crawl, brief, evidence, linkedin' },
          { name: 'confidence', type: 'string', title: 'Confidence', description: 'high / medium / low' },
        ],
      }],
    },

    // ── Competitors ───────────────────────────────────────────────────
    {
      name: 'competitors',
      title: 'Competitors (references)',
      type: 'array',
      of: [{ type: 'reference', to: [{ type: 'account' }] }],
      description: 'Accounts identified as competitors in the same space',
    },
    {
      name: 'competitorResearch',
      title: 'Competitor Research',
      type: 'object',
      fields: [
        { name: 'count', type: 'number', title: 'Count' },
        { name: 'researchedAt', type: 'datetime', title: 'Researched At' },
      ],
    },

    // ── Benchmarks ────────────────────────────────────────────────────
    {
      name: 'benchmarks',
      title: 'Benchmarks',
      type: 'object',
      fields: [
        { name: 'estimatedRevenue', type: 'string', title: 'Estimated Revenue' },
        { name: 'estimatedEmployees', type: 'string', title: 'Estimated Employees' },
        { name: 'estimatedTraffic', type: 'string', title: 'Estimated Monthly Traffic' },
        { name: 'fundingStage', type: 'string', title: 'Funding Stage' },
        { name: 'yearFounded', type: 'number', title: 'Year Founded' },
        { name: 'headquarters', type: 'string', title: 'Headquarters' },
        { name: 'publicOrPrivate', type: 'string', title: 'Public or Private' },
        { name: 'stockTicker', type: 'string', title: 'Stock Ticker' },
        { name: 'updatedAt', type: 'datetime', title: 'Updated At' },
      ],
    },

    // ── Scores & Signals ──────────────────────────────────────────────
    { name: 'opportunityScore', title: 'Opportunity Score', type: 'number' },
    {
      name: 'aiReadiness',
      title: 'AI Readiness',
      type: 'object',
      fields: [{ name: 'score', type: 'number', title: 'Score' }],
    },
    {
      name: 'performance',
      title: 'Performance',
      type: 'object',
      fields: [{ name: 'performanceScore', type: 'number', title: 'Performance Score' }],
    },
    {
      name: 'businessScale',
      title: 'Business Scale',
      type: 'object',
      fields: [
        { name: 'businessScale', type: 'string', title: 'Scale' },
        { name: 'estimatedAnnualRevenue', type: 'string', title: 'Est. Revenue' },
        { name: 'estimatedMonthlyTraffic', type: 'string', title: 'Est. Traffic' },
      ],
    },
    { name: 'businessUnits', title: 'Business Units', type: 'object', fields: [{ name: 'companyName', type: 'string', title: 'Company Name' }] },
    { name: 'signals', title: 'Signals', type: 'array', of: [{ type: 'string' }] },

    // ── Profile Completeness ──────────────────────────────────────────
    {
      name: 'profileCompleteness',
      title: 'Profile Completeness',
      type: 'object',
      fields: [
        { name: 'score', type: 'number', title: 'Score (0-100)' },
        { name: 'gaps', type: 'array', title: 'Gaps', of: [{ type: 'string' }] },
        { name: 'nextStages', type: 'array', title: 'Next Stages', of: [{ type: 'string' }] },
        { name: 'dimensionFlags', type: 'object', title: 'Dimension Flags', fields: [{ name: 'value', type: 'string', title: 'Value', hidden: true }] },
        { name: 'assessedAt', type: 'datetime', title: 'Assessed At' },
      ],
    },

    // ── Timestamps & Metadata ─────────────────────────────────────────
    { name: 'lastScannedAt', title: 'Last Scanned At', type: 'datetime' },
    { name: 'lastEnrichedAt', title: 'Last Enriched At', type: 'datetime' },
    { name: 'createdAt', title: 'Created At', type: 'datetime' },
    { name: 'updatedAt', title: 'Updated At', type: 'datetime' },
    { name: 'dataQualityFlags', title: 'Data Quality Flags', type: 'array', of: [{ type: 'string' }] },
    {
      name: 'evidenceRefs',
      title: 'Evidence Refs',
      type: 'array',
      of: [{ type: 'reference', to: [{ type: 'crawl.snapshot' }, { type: 'molt.event' }] }],
    },
    { name: 'sourceRefs', title: 'Source Refs', type: 'object', fields: [{ name: 'packId', type: 'string', title: 'Pack ID' }] },
  ],
};
