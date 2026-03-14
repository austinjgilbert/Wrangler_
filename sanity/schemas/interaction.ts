/**
 * Sanity Schema: interaction
 */

export default {
  name: 'interaction',
  title: 'Interaction',
  type: 'document',
  fields: [
    { name: 'interactionId', title: 'Interaction ID', type: 'string' },
    { name: 'sessionId', title: 'Session Ref', type: 'reference', to: [{ type: 'session' }] },
    { name: 'userPrompt', title: 'User Prompt', type: 'text' },
    { name: 'gptResponse', title: 'GPT Response', type: 'text' },
    { name: 'timestamp', title: 'Timestamp', type: 'datetime' },
    { name: 'referencedAccounts', title: 'Referenced Accounts', type: 'array', of: [{ type: 'reference', to: [{ type: 'account' }] }] },
    { name: 'referencedBriefs', title: 'Referenced Briefs', type: 'array', of: [{ type: 'reference', to: [{ type: 'molt.strategyBrief' }] }] },
    { name: 'referencedPeople', title: 'Referenced People', type: 'array', of: [{ type: 'reference', to: [{ type: 'person' }] }] },
    { name: 'referencedEvidence', title: 'Referenced Evidence', type: 'array', of: [{ type: 'reference', to: [{ type: 'crawl.snapshot' }] }] },
    { name: 'contextTags', title: 'Context Tags', type: 'array', of: [{ type: 'string' }] },
    { name: 'importance', title: 'Importance', type: 'number' },
    { name: 'followUpNeeded', title: 'Follow Up Needed', type: 'boolean' },
    { name: 'followUpNotes', title: 'Follow Up Notes', type: 'text' },
    { name: 'derivedInsight', title: 'Derived Insight', type: 'boolean' },
    { name: 'linkedInteractions', title: 'Linked Interactions', type: 'array', of: [{ type: 'reference', to: [{ type: 'interaction' }] }] },
    { name: 'source', title: 'Source', type: 'string', description: 'Originating system for this interaction' },
    { name: 'pageSource', title: 'Page Source', type: 'string', description: 'Specific page/app type captured by the extension' },
    { name: 'domain', title: 'Domain', type: 'string', description: 'Primary domain this interaction relates to' },
    { name: 'url', title: 'URL', type: 'url', description: 'Captured page URL' },
    { name: 'title', title: 'Title', type: 'string', description: 'Captured page title' },
    { name: 'companyName', title: 'Company Name', type: 'string', description: 'Inferred company name for the interaction' },
    { name: 'accountKey', title: 'Account Key', type: 'string', description: 'Resolved account key for cross-referencing' },
    { name: 'requestId', title: 'Request ID', type: 'string' },
    { name: 'createdAt', title: 'Created At', type: 'datetime' },
    { name: 'updatedAt', title: 'Updated At', type: 'datetime' },
    // Event summary for audit: what changed, who, when, which areas of the account data model
    { name: 'eventSummary', title: 'Event Summary', type: 'text', description: 'Short summary of the event' },
    { name: 'dataAdded', title: 'Data Added', type: 'array', of: [{ type: 'string' }], description: 'Fields or entities added in this interaction' },
    { name: 'dataDeleted', title: 'Data Deleted', type: 'array', of: [{ type: 'string' }], description: 'Fields or entities removed' },
    { name: 'dataMerged', title: 'Data Merged', type: 'array', of: [{ type: 'string' }], description: 'Entities or records merged' },
    { name: 'dataModified', title: 'Data Modified', type: 'array', of: [{ type: 'string' }], description: 'Fields or entities updated' },
    { name: 'userId', title: 'User ID', type: 'string', description: 'User who performed the action' },
    { name: 'influencedAreas', title: 'Influenced Areas', type: 'array', of: [{ type: 'string' }], description: 'Areas of the account data model influenced (e.g. leadership, technologies, painPoints)' },
  ],
};
