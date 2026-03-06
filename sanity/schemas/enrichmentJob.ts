/**
 * Sanity Schema: enrichmentJob
 *
 * Legacy pipeline job document still used by parts of the worker.
 * Kept in Studio so active background jobs are visible and debuggable.
 */

export default {
  name: 'enrichmentJob',
  title: 'Enrichment Job (Legacy)',
  type: 'document',
  fields: [
    { name: 'jobId', title: 'Job ID', type: 'string' },
    { name: 'accountKey', title: 'Account Key', type: 'string' },
    { name: 'canonicalUrl', title: 'Canonical URL', type: 'url' },
    { name: 'status', title: 'Status', type: 'string' },
    { name: 'currentStage', title: 'Current Stage', type: 'string' },
    { name: 'goalKey', title: 'Goal Key', type: 'string' },
    { name: 'priority', title: 'Priority', type: 'number' },
    { name: 'completedStages', title: 'Completed Stages', type: 'array', of: [{ type: 'string' }] },
    { name: 'failedStages', title: 'Failed Stages', type: 'array', of: [{ type: 'object', fields: [{ name: 'stage', type: 'string' }, { name: 'error', type: 'text' }, { name: 'timestamp', type: 'datetime' }] }] },
    { name: 'results', title: 'Results', type: 'object', fields: [{ name: 'value', type: 'string', hidden: true }] },
    { name: 'options', title: 'Options', type: 'object', fields: [{ name: 'value', type: 'string', hidden: true }] },
    { name: 'metadata', title: 'Metadata', type: 'object', fields: [{ name: 'value', type: 'string', hidden: true }] },
    { name: 'startedAt', title: 'Started At', type: 'datetime' },
    { name: 'updatedAt', title: 'Updated At', type: 'datetime' },
  ],
};
