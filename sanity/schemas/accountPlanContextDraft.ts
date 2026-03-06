/**
 * Account Plan Context Draft — stores generated context blocks
 * for the Account Plan Template builder.
 */
export default {
  name: 'accountPlanContextDraft',
  title: 'Account Plan Context Draft',
  type: 'document',
  fields: [
    { name: 'accountName', title: 'Account Name', type: 'string' },
    { name: 'rawInputText', title: 'Raw Input Text', type: 'text' },
    { name: 'extractedTextFromScreenshots', title: 'Extracted Text from Screenshots', type: 'text' },
    {
      name: 'capturedSources',
      title: 'Captured Sources',
      type: 'array',
      of: [
        {
          type: 'object',
          fields: [
            { name: 'type', title: 'Type', type: 'string', description: 'url | selected_text | note | screenshot' },
            { name: 'value', title: 'Value', type: 'text' },
            { name: 'title', title: 'Title', type: 'string' },
            { name: 'ts', title: 'Timestamp', type: 'datetime' },
          ],
        },
      ],
    },
    // ── Structured data extracted by Chrome extension ──
    { name: 'sourceType', title: 'Source Type', type: 'string', description: 'linkedin | salesforce | hubspot | outreach | website | manual' },
    { name: 'extractedAccounts', title: 'Extracted Accounts (JSON lines)', type: 'text', description: 'One JSON object per line from content.js accounts[]' },
    { name: 'extractedPeople', title: 'Extracted People (JSON lines)', type: 'text', description: 'One JSON object per line from content.js people[]' },
    {
      name: 'extractedTechnologies',
      title: 'Extracted Technologies',
      type: 'array',
      of: [{ type: 'string' }],
      description: 'Tech stack detected by content.js',
    },
    { name: 'extractedSignals', title: 'Extracted Signals (JSON lines)', type: 'text', description: 'One JSON object per line from content.js signals[]' },
    { name: 'pageMetadata', title: 'Page Metadata (JSON)', type: 'text', description: 'OG tags, description, canonical, etc.' },
    // ── Generated output ──
    { name: 'outputSalesNavigator', title: 'Output: Sales Navigator', type: 'text' },
    { name: 'outputIntentSignals', title: 'Output: Intent Signals', type: 'text' },
    { name: 'outputStakeholders', title: 'Output: Stakeholders', type: 'text' },
    { name: 'outputAdditionalContext', title: 'Output: Additional Context', type: 'text' },
    { name: 'templatePlanId', title: 'Template Plan ID', type: 'string' },
    { name: 'screenshotDataUrl', title: 'Screenshot Data URL', type: 'text', hidden: true },
    { name: 'createdAt', title: 'Created At', type: 'datetime' },
    { name: 'updatedAt', title: 'Updated At', type: 'datetime' },
  ],
  preview: {
    select: { title: 'accountName', subtitle: 'createdAt' },
  },
};
