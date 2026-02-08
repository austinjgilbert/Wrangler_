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
    { name: 'name', title: 'Name', type: 'string' },
    { name: 'title', title: 'Current Title', type: 'string' },
    { name: 'headline', title: 'LinkedIn Headline', type: 'string' },
    { name: 'linkedinUrl', title: 'LinkedIn URL', type: 'url' },
    { name: 'linkedInUrl', title: 'LinkedIn URL (alt casing)', type: 'url', hidden: true },
    { name: 'location', title: 'Location', type: 'string' },
    { name: 'about', title: 'About', type: 'text' },

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
