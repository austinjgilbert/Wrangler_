/**
 * Sanity Schema: operatorDailyBriefing
 *
 * A nightly synthesis of operator activity, account signals, recommended
 * engineering improvements, and high-value targeting opportunities.
 */

export default {
  name: 'operatorDailyBriefing',
  title: 'Operator Daily Briefing',
  type: 'document',
  fields: [
    { name: 'date', title: 'Date', type: 'datetime' },
    { name: 'periodStart', title: 'Period Start', type: 'datetime' },
    { name: 'periodEnd', title: 'Period End', type: 'datetime' },
    { name: 'summaryMarkdown', title: 'Summary Markdown', type: 'text' },
    { name: 'summaryJson', title: 'Summary JSON', type: 'object', fields: [{ name: 'value', type: 'text', hidden: true }] },
    { name: 'suggestedCodeChanges', title: 'Suggested Code Changes', type: 'array', of: [{ type: 'string' }] },
    { name: 'suggestedWorkflowImprovements', title: 'Suggested Workflow Improvements', type: 'array', of: [{ type: 'string' }] },
    { name: 'accountRefs', title: 'Account References', type: 'array', of: [{ type: 'reference', to: [{ type: 'account' }] }] },
    { name: 'learningRefs', title: 'Learning References', type: 'array', of: [{ type: 'reference', to: [{ type: 'learning' }] }] },
    { name: 'patternRefs', title: 'Pattern References', type: 'array', of: [{ type: 'reference', to: [{ type: 'molt.pattern' }] }] },
  ],
};
