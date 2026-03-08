/**
 * Evidence Pack
 *
 * Persisted research evidence extracted from a page or source and linked back
 * to accounts for explainable reasoning.
 */
export default {
  name: 'evidencePack',
  title: 'Evidence Pack',
  type: 'document',
  fields: [
    { name: 'url', title: 'URL', type: 'url' },
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
    { name: 'finalUrl', title: 'Final URL', type: 'url' },
    { name: 'title', title: 'Title', type: 'string' },
    { name: 'siteName', title: 'Site Name', type: 'string' },
    { name: 'fetchedAt', title: 'Fetched At', type: 'datetime' },
    { name: 'mainText', title: 'Main Text', type: 'text' },
    { name: 'excerpts', title: 'Excerpts', type: 'array', of: [{ type: 'text' }] },
    { name: 'entities', title: 'Entities', type: 'array', of: [{ type: 'object', fields: [{ name: 'value', type: 'text', hidden: true }] }] },
    { name: 'signals', title: 'Signals', type: 'array', of: [{ type: 'object', fields: [{ name: 'value', type: 'text', hidden: true }] }] },
    { name: 'claims', title: 'Claims', type: 'array', of: [{ type: 'object', fields: [{ name: 'value', type: 'text', hidden: true }] }] },
    { name: 'meta', title: 'Meta', type: 'object', fields: [{ name: 'value', type: 'text', hidden: true }] },
    { name: 'contentHash', title: 'Content Hash', type: 'string' },
    { name: 'relatedAccountKey', title: 'Related Account Key', type: 'string' },
    { name: 'metadata', title: 'Metadata', type: 'object', fields: [{ name: 'value', type: 'text', hidden: true }] },
  ],
};
