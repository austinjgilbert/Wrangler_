/**
 * Sanity Schema: moltbot.config
 */

export default {
  name: 'moltbot.config',
  title: 'MoltBot Config',
  type: 'document',
  fields: [
    { name: 'name', title: 'Name', type: 'string' },
    { name: 'mission', title: 'Mission', type: 'text' },
    { name: 'moltStage', title: 'Molt Stage', type: 'string' },
    { name: 'personaName', title: 'Persona Name', type: 'string' },
    {
      name: 'values',
      title: 'Values',
      type: 'array',
      of: [{ type: 'string' }],
    },
    {
      name: 'toneRules',
      title: 'Tone Rules',
      type: 'array',
      of: [{ type: 'string' }],
    },
    {
      name: 'forbiddenActions',
      title: 'Forbidden Actions',
      type: 'array',
      of: [{ type: 'string' }],
    },
    {
      name: 'operatingRules',
      title: 'Operating Rules',
      type: 'array',
      of: [{ type: 'string' }],
    },
    {
      name: 'toolRegistry',
      title: 'Tool Registry',
      type: 'array',
      of: [
        {
          type: 'object',
          fields: [
            { name: 'name', title: 'Name', type: 'string' },
            { name: 'description', title: 'Description', type: 'text' },
            { name: 'endpoint', title: 'Endpoint', type: 'url' },
            {
              name: 'riskLevel',
              title: 'Risk Level',
              type: 'string',
              options: { list: ['safe', 'restricted', 'dangerous'] },
            },
            {
              name: 'allowedActions',
              title: 'Allowed Actions',
              type: 'array',
              of: [{ type: 'string' }],
            },
            {
              name: 'approvalRequiredActions',
              title: 'Approval Required Actions',
              type: 'array',
              of: [{ type: 'string' }],
            },
            {
              name: 'inputSchema',
              title: 'Input Schema',
              type: 'object',
              fields: [{ name: 'value', type: 'string', title: 'Value', hidden: true }],
            },
            {
              name: 'outputSchema',
              title: 'Output Schema',
              type: 'object',
              fields: [{ name: 'value', type: 'string', title: 'Value', hidden: true }],
            },
            { name: 'timeoutMs', title: 'Timeout (ms)', type: 'number' },
            { name: 'retries', title: 'Retries', type: 'number' },
          ],
        },
      ],
    },
    {
      name: 'approvalPolicy',
      title: 'Approval Policy',
      type: 'object',
      fields: [
        {
          name: 'dangerousActionsRequireApproval',
          title: 'Dangerous Actions Require Approval',
          type: 'boolean',
        },
        {
          name: 'defaultWriteMode',
          title: 'Default Write Mode',
          type: 'string',
          options: { list: ['draft_only', 'auto'] },
        },
      ],
    },
    {
      name: 'schedulingPolicy',
      title: 'Scheduling Policy',
      type: 'object',
      fields: [
        { name: 'dailyBriefTime', title: 'Daily Brief Time', type: 'string' },
        { name: 'dqScanCadence', title: 'DQ Scan Cadence', type: 'string' },
        { name: 'enrichmentCadence', title: 'Enrichment Cadence', type: 'string' },
      ],
    },
  ],
};
