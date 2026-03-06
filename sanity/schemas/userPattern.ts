/**
 * Sanity Schema: userPattern
 *
 * Captures how the operator works so the system can improve suggestions,
 * workflows, and next-step recommendations over time.
 */

export default {
  name: 'userPattern',
  title: 'User Pattern',
  type: 'document',
  fields: [
    { name: 'userId', title: 'User ID', type: 'string' },
    { name: 'userSegment', title: 'User Segment', type: 'string' },
    { name: 'timestamp', title: 'Timestamp', type: 'datetime' },
    { name: 'action', title: 'Action', type: 'string' },
    { name: 'approach', title: 'Approach', type: 'text' },
    {
      name: 'context',
      title: 'Context',
      type: 'object',
      fields: [
        { name: 'accountKey', type: 'string', title: 'Account Key' },
        { name: 'accountDomain', type: 'string', title: 'Account Domain' },
        { name: 'intent', type: 'string', title: 'Intent' },
        { name: 'persona', type: 'string', title: 'Persona' },
      ],
    },
    { name: 'outcome', title: 'Outcome', type: 'string' },
    { name: 'timeSpent', title: 'Time Spent', type: 'number' },
    { name: 'toolsUsed', title: 'Tools Used', type: 'array', of: [{ type: 'string' }] },
    { name: 'sequence', title: 'Sequence', type: 'array', of: [{ type: 'string' }] },
    { name: 'thinking', title: 'Thinking', type: 'text' },
    { name: 'metadata', title: 'Metadata', type: 'object', fields: [{ name: 'value', type: 'string', hidden: true }] },
  ],
};
