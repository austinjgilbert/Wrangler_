/**
 * Sanity Schema: networkPerson
 */

export default {
  name: 'networkPerson',
  title: 'Network Person',
  type: 'document',
  fields: [
    { name: 'name', title: 'Name', type: 'string' },
    { name: 'company', title: 'Company', type: 'string' },
    { name: 'title', title: 'Title', type: 'string' },
    { name: 'linkedinUrl', title: 'LinkedIn URL', type: 'url' },
    {
      name: 'personRef',
      title: 'Person Ref',
      type: 'reference',
      to: [{ type: 'person' }],
    },
    { name: 'tier', title: 'Tier', type: 'string' },
    { name: 'tags', title: 'Tags', type: 'array', of: [{ type: 'string' }] },
    { name: 'relationshipStrength', title: 'Relationship Strength', type: 'number' },
    { name: 'lastTouchedAt', title: 'Last Touched At', type: 'datetime' },
    { name: 'notes', title: 'Notes', type: 'text' },
  ],
};
