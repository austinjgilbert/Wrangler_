/**
 * Sanity Schema: networkDailyBriefing
 */

export default {
  name: 'networkDailyBriefing',
  title: 'Network Daily Briefing',
  type: 'document',
  fields: [
    { name: 'date', title: 'Date', type: 'datetime' },
    { name: 'summaryJson', title: 'Summary JSON', type: 'object', fields: [{ name: 'value', type: 'text', title: 'Value', hidden: true }] },
    { name: 'summaryMarkdown', title: 'Summary Markdown', type: 'text' },
    {
      name: 'starterRefs',
      title: 'Starter References',
      type: 'array',
      of: [{ type: 'reference', to: [{ type: 'conversationStarter' }] }],
    },
  ],
};
