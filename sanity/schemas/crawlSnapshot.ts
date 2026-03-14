/**
 * Sanity Schema: crawl.snapshot
 */

export default {
  name: 'crawl.snapshot',
  title: 'Crawl Snapshot',
  type: 'document',
  fields: [
    { name: 'accountRef', title: 'Account', type: 'reference', to: [{ type: 'account' }] },
    { name: 'accountKey', title: 'Account Key', type: 'string' },
    { name: 'snapshotClass', title: 'Snapshot Class', type: 'string', description: 'learn_mode, dq_enrichment, canonical_page, or other retention class' },
    { name: 'sourceType', title: 'Source Type', type: 'string' },
    { name: 'url', title: 'URL', type: 'url' },
    { name: 'status', title: 'Status', type: 'number' },
    { name: 'snippet', title: 'Snippet', type: 'text' },
    { name: 'fetchedAt', title: 'Fetched At', type: 'datetime' },
    { name: 'robotsAllowed', title: 'Robots Allowed', type: 'boolean' },
    { name: 'traceId', title: 'Trace ID', type: 'string' },
  ],
};
