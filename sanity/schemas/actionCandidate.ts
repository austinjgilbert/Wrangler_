/**
 * Action Candidate
 *
 * Represents a recommended SDR action produced from fused signals and evidence.
 * It is intentionally additive so the system can queue, rank, draft, expire,
 * and learn from execution without mutating the source account/person records.
 */
export default {
  name: 'actionCandidate',
  title: 'Action Candidate',
  type: 'document',
  fields: [
    { name: 'id', title: 'Action Candidate ID', type: 'string' },
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
    { name: 'account', title: 'Account', type: 'reference', to: [{ type: 'account' }] },
    { name: 'person', title: 'Person', type: 'reference', to: [{ type: 'person' }] },
    { name: 'signals', title: 'Signals', type: 'array', of: [{ type: 'string' }] },
    { name: 'signalRefs', title: 'Signal References', type: 'array', of: [{ type: 'reference', to: [{ type: 'signal' }] }] },
    { name: 'patternMatch', title: 'Pattern Match', type: 'string' },
    { name: 'scoringVersion', title: 'Scoring Version', type: 'string' },
    { name: 'patternVersion', title: 'Pattern Version', type: 'string' },
    { name: 'draftPolicyVersion', title: 'Draft Policy Version', type: 'string' },
    { name: 'strategyVersion', title: 'Strategy Version', type: 'string' },
    { name: 'rankingPolicyVersion', title: 'Ranking Policy Version', type: 'string' },
    { name: 'scenarioFixtureId', title: 'Scenario Fixture ID', type: 'string' },
    { name: 'opportunityScore', title: 'Opportunity Score', type: 'number' },
    { name: 'confidence', title: 'Confidence', type: 'number' },
    {
      name: 'confidenceBreakdown',
      title: 'Confidence Breakdown',
      type: 'object',
      fields: [
        { name: 'dataConfidence', title: 'Data Confidence', type: 'number' },
        { name: 'entityConfidence', title: 'Entity Confidence', type: 'number' },
        { name: 'patternConfidence', title: 'Pattern Confidence', type: 'number' },
        { name: 'actionConfidence', title: 'Action Confidence', type: 'number' },
        { name: 'draftConfidence', title: 'Draft Confidence', type: 'number' },
        { name: 'updatedAt', title: 'Updated At', type: 'datetime' },
      ],
    },
    {
      name: 'actionType',
      title: 'Action Type',
      type: 'string',
      options: {
        list: [
          'send_email',
          'send_linkedin_message',
          'make_call',
          'create_followup_task',
          'run_targeted_research',
        ],
      },
    },
    {
      name: 'urgency',
      title: 'Urgency',
      type: 'string',
      options: { list: ['low', 'medium', 'high', 'critical'] },
    },
    { name: 'whyNow', title: 'Why Now', type: 'text' },
    { name: 'evidence', title: 'Evidence', type: 'array', of: [{ type: 'string' }] },
    { name: 'evidenceRefs', title: 'Evidence References', type: 'array', of: [{ type: 'reference', to: [{ type: 'accountPack' }, { type: 'crawl.snapshot' }, { type: 'evidencePack' }] }] },
    {
      name: 'draftStatus',
      title: 'Draft Status',
      type: 'string',
      options: { list: ['not_started', 'ready', 'drafted', 'approved', 'expired'] },
    },
    { name: 'recommendedNextStep', title: 'Recommended Next Step', type: 'text' },
    { name: 'missingData', title: 'Missing Data', type: 'array', of: [{ type: 'string' }] },
    { name: 'expirationTime', title: 'Expiration Time', type: 'datetime' },
    { name: 'latestOutcomeEventId', title: 'Latest Outcome Event ID', type: 'string' },
    {
      name: 'lifecycleStatus',
      title: 'Lifecycle Status',
      type: 'string',
      options: { list: ['active', 'expired', 'completed'] },
    },
    { name: 'createdAt', title: 'Created At', type: 'datetime' },
    { name: 'updatedAt', title: 'Updated At', type: 'datetime' },
  ],
  preview: {
    select: {
      title: 'recommendedNextStep',
      subtitle: 'actionType',
      score: 'opportunityScore',
      urgency: 'urgency',
    },
    prepare(selection: Record<string, any>) {
      const score = selection.score != null ? ` | score ${selection.score}` : '';
      const urgency = selection.urgency ? ` | ${selection.urgency}` : '';
      return {
        title: selection.title || 'Action Candidate',
        subtitle: `${selection.subtitle || 'unknown'}${score}${urgency}`,
      };
    },
  },
};
