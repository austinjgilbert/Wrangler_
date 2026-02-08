/**
 * Technology — a reusable entity representing a specific technology.
 *
 * Technologies are shared across accounts via references.  This enables
 * powerful queries like "find all accounts using Contentful" or "which
 * accounts have legacy CMS systems?"
 *
 * The enrichment pipeline auto-creates technology documents when new
 * technologies are detected during scans.
 */

export default {
  name: 'technology',
  title: 'Technology',
  type: 'document',
  fields: [
    { name: 'name', title: 'Name', type: 'string' },
    { name: 'slug', title: 'Slug', type: 'string', description: 'URL-safe key, e.g. "contentful" or "react"' },
    { name: 'category', title: 'Category', type: 'string', description: 'cms, framework, analytics, cdp, crm, ecommerce, hosting, cdn, marketing-automation, dxp, dam, pim, lms, legacy' },
    { name: 'vendor', title: 'Vendor', type: 'string' },
    { name: 'website', title: 'Website', type: 'url' },
    { name: 'description', title: 'Description', type: 'text' },
    { name: 'isLegacy', title: 'Is Legacy?', type: 'boolean' },
    { name: 'isMigrationTarget', title: 'Is Migration Target?', type: 'boolean', description: 'A technology Sanity can replace' },
    {
      name: 'detectionSignals',
      title: 'Detection Signals',
      type: 'array',
      of: [{ type: 'string' }],
      description: 'HTML/header patterns that indicate this technology is in use',
    },
    {
      name: 'accountCount',
      title: 'Account Count',
      type: 'number',
      description: 'Denormalized count of accounts using this technology',
    },
    { name: 'tags', title: 'Tags', type: 'array', of: [{ type: 'string' }] },
    { name: 'lastEnrichedAt', title: 'Last Enriched At', type: 'datetime' },
    { name: 'dataQualityFlags', title: 'Data Quality Flags', type: 'array', of: [{ type: 'string' }] },
  ],
};
