/**
 * Sanity Schema: signal
 */

export default {
  name: 'signal',
  title: 'Signal',
  type: 'document',
  fields: [
    { name: 'id', title: 'Signal ID', type: 'string' },
    { name: 'dedupeKey', title: 'Dedupe Key', type: 'string' },
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
    {
      name: 'source',
      title: 'Source',
      type: 'string',
      options: {
        list: [
          'website_scan',
          'linkedin_sales_navigator',
          'mql_event',
          'intent_platform',
          'product_signup',
          'slack_alert',
          'leandata_routing',
          'manual_operator_note',
        ],
      },
    },
    { name: 'signalType', title: 'Signal Type', type: 'string' },
    {
      name: 'account',
      title: 'Account',
      type: 'reference',
      to: [{ type: 'account' }],
    },
    {
      name: 'person',
      title: 'Person',
      type: 'reference',
      to: [{ type: 'person' }],
    },
    { name: 'strength', title: 'Strength', type: 'number' },
    { name: 'timestamp', title: 'Timestamp', type: 'datetime' },
    {
      name: 'metadata',
      title: 'Metadata',
      type: 'object',
      fields: [
        { name: 'summary', title: 'Summary', type: 'text' },
        { name: 'sourceUrl', title: 'Source URL', type: 'url' },
        { name: 'pageTitle', title: 'Page Title', type: 'string' },
        { name: 'halfLifeHours', title: 'Half Life Hours', type: 'number' },
        { name: 'baseStrength', title: 'Base Strength', type: 'number' },
        { name: 'decayedStrength', title: 'Decayed Strength', type: 'number' },
        { name: 'keywords', title: 'Keywords', type: 'array', of: [{ type: 'string' }] },
      ],
    },

    // Legacy fields kept for compatibility with current dashboards and queries.
    { name: 'type', title: 'Type', type: 'string' },
    {
      name: 'companyRef',
      title: 'Company',
      type: 'reference',
      to: [{ type: 'company' }, { type: 'account' }],
    },
    {
      name: 'personRefs',
      title: 'People',
      type: 'array',
      of: [{ type: 'reference', to: [{ type: 'networkPerson' }, { type: 'person' }] }],
    },
    { name: 'sourceUrl', title: 'Source URL', type: 'url' },
    { name: 'date', title: 'Date', type: 'datetime' },
    { name: 'summary', title: 'Summary', type: 'text' },
    { name: 'keywords', title: 'Keywords', type: 'array', of: [{ type: 'string' }] },
    {
      name: 'citations',
      title: 'Citations',
      type: 'array',
      of: [
        {
          type: 'object',
          fields: [
            { name: 'url', title: 'URL', type: 'url' },
            { name: 'title', title: 'Title', type: 'string' },
            { name: 'source', title: 'Source', type: 'string' },
          ],
        },
      ],
    },
  ],
  preview: {
    select: {
      title: 'signalType',
      subtitle: 'source',
      strength: 'strength',
    },
    prepare(selection: Record<string, any>) {
      const strength = selection.strength != null ? ` | strength ${selection.strength}` : '';
      return {
        title: selection.title || 'Signal',
        subtitle: `${selection.subtitle || 'unknown'}${strength}`,
      };
    },
  },
};
