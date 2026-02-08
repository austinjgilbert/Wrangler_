/**
 * Sanity Schema: molt.strategyBrief
 */

export default {
  name: 'molt.strategyBrief',
  title: 'Molt Strategy Brief',
  type: 'document',
  fields: [
    { name: 'date', title: 'Date', type: 'datetime' },
    { name: 'cadence', title: 'Cadence', type: 'string' },
    { name: 'markdown', title: 'Markdown', type: 'text' },
    { name: 'doubleDown', title: 'Double Down', type: 'array', of: [{ type: 'string' }] },
    { name: 'stopDoing', title: 'Stop Doing', type: 'array', of: [{ type: 'string' }] },
    { name: 'nextSkillFocus', title: 'Next Skill Focus', type: 'string' },
    { name: 'generatedAt', title: 'Generated At', type: 'datetime' },
  ],
};
