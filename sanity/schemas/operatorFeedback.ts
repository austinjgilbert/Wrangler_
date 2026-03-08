/**
 * Operator Feedback
 *
 * Captures outcome-bearing SDR feedback on action candidates so the system can
 * learn from sends, edits, ignores, correctness flags, and meetings booked.
 */
const FEEDBACK_TYPES = [
  { value: 'sent_draft', title: 'Sent draft' },
  { value: 'edited_draft', title: 'Edited draft' },
  { value: 'ignored_action', title: 'Ignored action' },
  { value: 'marked_incorrect', title: 'Marked incorrect' },
  { value: 'booked_meeting', title: 'Booked meeting' },
] as const;

export default {
  name: 'operatorFeedback',
  title: 'Operator Feedback',
  type: 'document',
  fields: [
    {
      name: 'actionCandidate',
      title: 'Action Candidate',
      type: 'reference',
      to: [{ type: 'actionCandidate' }],
      description: 'Reference to the action candidate this feedback applies to.',
    },
    {
      name: 'actionCandidateId',
      title: 'Action Candidate ID',
      type: 'string',
      description: 'Sanity _id of the action candidate this feedback applies to.',
      validation: (Rule: any) => Rule.required(),
    },
    { name: 'idempotencyKey', title: 'Idempotency Key', type: 'string' },
    { name: 'scoringVersion', title: 'Scoring Version', type: 'string' },
    { name: 'patternVersion', title: 'Pattern Version', type: 'string' },
    { name: 'draftPolicyVersion', title: 'Draft Policy Version', type: 'string' },
    { name: 'strategyVersion', title: 'Strategy Version', type: 'string' },
    {
      name: 'feedbackType',
      title: 'Feedback Type',
      type: 'string',
      description: 'What the SDR did: sent draft, edited draft, ignored, marked incorrect, or booked a meeting.',
      options: { list: FEEDBACK_TYPES },
      validation: (Rule: any) => Rule.required().valid(FEEDBACK_TYPES.map((t) => t.value)),
    },
    {
      name: 'operatorEdit',
      title: 'Operator Edit',
      type: 'text',
      description: 'For edited_draft: the SDR’s revised copy, used to retrain draft tone and phrasing.',
    },
    {
      name: 'timestamp',
      title: 'Timestamp',
      type: 'datetime',
      description: 'When the feedback was recorded (ISO 8601).',
      validation: (Rule: any) => Rule.required(),
    },
    {
      name: 'outcome',
      title: 'Outcome',
      type: 'string',
      description: 'Optional free-text outcome (e.g. "meeting scheduled", "no reply").',
    },
  ],
  preview: {
    select: {
      title: 'feedbackType',
      subtitle: 'actionCandidateId',
      outcome: 'outcome',
    },
    prepare(selection: Record<string, any>) {
      const outcome = selection.outcome ? ` | ${selection.outcome}` : '';
      return {
        title: selection.title || 'Operator Feedback',
        subtitle: `${selection.subtitle || 'unknown'}${outcome}`,
      };
    },
  },
};
