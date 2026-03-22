/**
 * Person — individuals connected to accounts.
 *
 * People are linked to accounts via the leadership array on the account
 * document AND via companyRef here (bidirectional).  The enrichment pipeline
 * populates experience, skills, and influence data from LinkedIn and web
 * research.
 */

export default {
  name: 'person',
  title: 'Person',
  type: 'document',
  fields: [
    // ── Identity ──────────────────────────────────────────────────────
    { name: 'personKey', title: 'Person Key', type: 'string' },
    { name: 'observedAt', title: 'Observed At', type: 'datetime' },
    { name: 'lastValidatedAt', title: 'Last Validated At', type: 'datetime' },
    { name: 'staleAfter', title: 'Stale After', type: 'datetime' },
    { name: 'refreshPriority', title: 'Refresh Priority', type: 'number' },
    {
      name: 'uncertaintyState',
      title: 'Uncertainty State',
      type: 'string',
      options: { list: ['confirmed', 'likely', 'weakly_inferred', 'contradictory', 'stale', 'needs_validation'] },
    },
    { name: 'name', title: 'Name', type: 'string' },
    { name: 'title', title: 'Current Title', type: 'string' },
    { name: 'headline', title: 'LinkedIn Headline', type: 'string' },
    { name: 'linkedinUrl', title: 'LinkedIn URL', type: 'url' },
    { name: 'linkedInUrl', title: 'LinkedIn URL (alt casing)', type: 'url', hidden: true },
    { name: 'email', title: 'Email (Primary)', type: 'string', description: 'Primary email — synced from highest-confidence contactEmails[] entry' },
    { name: 'phone', title: 'Phone (Primary)', type: 'string', description: 'Primary phone — synced from highest-confidence contactPhones[] entry' },
    { name: 'location', title: 'Location', type: 'string' },

    // ── Multi-Source Contact Data ─────────────────────────────────────
    {
      name: 'contactEmails',
      title: 'Contact Emails',
      type: 'array',
      description: 'All known email addresses with source provenance and consensus scoring',
      of: [{
        type: 'object',
        fields: [
          { name: 'value', type: 'string', title: 'Email Address', validation: (Rule: any) => Rule.required() },
          { name: 'source', type: 'string', title: 'Source', description: 'salesforce, hubspot, linkedin, outreach, nooks, commonroom, google, extension, enrichment, legacy, user_override' },
          { name: 'firstSeenAt', type: 'datetime', title: 'First Seen' },
          { name: 'lastSeenAt', type: 'datetime', title: 'Last Seen' },
          { name: 'confidence', type: 'number', title: 'Confidence', description: '0-1, computed by consensus engine' },
          { name: 'isPrimary', type: 'boolean', title: 'Primary?', description: 'Highest-confidence or user-pinned entry' },
          { name: 'userPinned', type: 'boolean', title: 'User Pinned?', description: 'True if user explicitly chose this as primary — consensus engine will not override' },
        ],
        preview: {
          select: { title: 'value', subtitle: 'source' },
        },
      }],
    },
    {
      name: 'contactPhones',
      title: 'Contact Phones',
      type: 'array',
      description: 'All known phone numbers with source provenance and consensus scoring',
      of: [{
        type: 'object',
        fields: [
          { name: 'value', type: 'string', title: 'Phone Number', validation: (Rule: any) => Rule.required() },
          { name: 'source', type: 'string', title: 'Source', description: 'salesforce, hubspot, linkedin, outreach, nooks, commonroom, google, extension, enrichment, legacy, user_override' },
          { name: 'firstSeenAt', type: 'datetime', title: 'First Seen' },
          { name: 'lastSeenAt', type: 'datetime', title: 'Last Seen' },
          { name: 'confidence', type: 'number', title: 'Confidence', description: '0-1, computed by consensus engine' },
          { name: 'isPrimary', type: 'boolean', title: 'Primary?', description: 'Highest-confidence or user-pinned entry' },
          { name: 'userPinned', type: 'boolean', title: 'User Pinned?', description: 'True if user explicitly chose this as primary — consensus engine will not override' },
        ],
        preview: {
          select: { title: 'value', subtitle: 'source' },
        },
      }],
    },
    { name: 'about', title: 'About', type: 'text' },
    { name: 'sourceSystems', title: 'Source Systems', type: 'array', of: [{ type: 'string' }] },

    // ── Company Link ──────────────────────────────────────────────────
    { name: 'companyRef', title: 'Primary Company', type: 'reference', to: [{ type: 'account' }] },
    { name: 'currentCompany', title: 'Current Company Name', type: 'string' },
    { name: 'currentTitle', title: 'Current Title (from LinkedIn)', type: 'string' },
    { name: 'relatedAccountKey', title: 'Related Account Key', type: 'string' },
    { name: 'rootDomain', title: 'Root Domain', type: 'string' },

    // ── Role & Influence ──────────────────────────────────────────────
    { name: 'roleCategory', title: 'Role Category', type: 'string', description: 'engineering, marketing, digital-product, it-security, executive, sales, operations' },
    { name: 'seniorityLevel', title: 'Seniority Level', type: 'string', description: 'c-suite, vp, director, manager, ic' },
    { name: 'isDecisionMaker', title: 'Decision Maker?', type: 'boolean' },
    { name: 'buyerPersona', title: 'Buyer Persona', type: 'string', description: 'Primary buyer persona: technical, business, executive' },

    // ── Experience & Skills ───────────────────────────────────────────
    {
      name: 'experience',
      title: 'Experience',
      type: 'array',
      of: [{
        type: 'object',
        fields: [
          { name: 'company', type: 'string', title: 'Company' },
          { name: 'title', type: 'string', title: 'Title' },
          { name: 'duration', type: 'string', title: 'Duration' },
          { name: 'description', type: 'text', title: 'Description' },
          { name: 'isCurrent', type: 'boolean', title: 'Current Role' },
        ],
      }],
    },
    {
      name: 'education',
      title: 'Education',
      type: 'array',
      of: [{
        type: 'object',
        fields: [
          { name: 'school', type: 'string', title: 'School' },
          { name: 'degree', type: 'string', title: 'Degree' },
          { name: 'field', type: 'string', title: 'Field of Study' },
        ],
      }],
    },
    { name: 'skills', title: 'Skills', type: 'array', of: [{ type: 'string' }] },
    { name: 'signals', title: 'Signals', type: 'array', of: [{ type: 'string' }] },

    // ── LinkedIn Intelligence ─────────────────────────────────────────
    { name: 'connections', title: 'Connections', type: 'number' },
    { name: 'followers', title: 'Followers', type: 'number' },
    {
      name: 'workPatterns',
      title: 'Work Patterns',
      type: 'object',
      fields: [
        { name: 'avgTenure', type: 'string', title: 'Avg Tenure' },
        { name: 'industryFocus', type: 'string', title: 'Industry Focus' },
        { name: 'careerTrajectory', type: 'string', title: 'Career Trajectory' },
      ],
    },
    {
      name: 'trajectory',
      title: 'Career Trajectory',
      type: 'object',
      fields: [
        { name: 'direction', type: 'string', title: 'Direction' },
        { name: 'velocity', type: 'string', title: 'Velocity' },
      ],
    },
    { name: 'network', title: 'Network', type: 'object', fields: [{ name: 'value', type: 'string', title: 'Value', hidden: true }] },

    // ── Relationship & Engagement ─────────────────────────────────────
    { name: 'relationshipStrength', title: 'Relationship Strength', type: 'number' },
    { name: 'lastTouchedAt', title: 'Last Touched At', type: 'datetime' },
    { name: 'tags', title: 'Tags', type: 'array', of: [{ type: 'string' }] },

    // ── Metadata ──────────────────────────────────────────────────────
    { name: 'scannedAt', title: 'Scanned At', type: 'datetime' },
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
  ],
};
