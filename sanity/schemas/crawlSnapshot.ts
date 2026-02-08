/**
 * Sanity Schema: crawl.snapshot
 */

export default {
  name: 'crawl.snapshot',
  title: 'Crawl Snapshot',
  type: 'document',
  fields: [
    { name: 'url', title: 'URL', type: 'url' },
    { name: 'status', title: 'Status', type: 'number' },
    { name: 'snippet', title: 'Snippet', type: 'text' },
    { name: 'fetchedAt', title: 'Fetched At', type: 'datetime' },
    { name: 'robotsAllowed', title: 'Robots Allowed', type: 'boolean' },
    { name: 'traceId', title: 'Trace ID', type: 'string' },
  ],
};
