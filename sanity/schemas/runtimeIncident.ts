export default {
  name: 'runtimeIncident',
  title: 'Runtime Incident',
  type: 'document',
  fields: [
    { name: 'incidentId', title: 'Incident ID', type: 'string' },
    { name: 'category', title: 'Category', type: 'string' },
    { name: 'severity', title: 'Severity', type: 'string', options: { list: ['low', 'medium', 'high', 'critical'] } },
    { name: 'status', title: 'Status', type: 'string', options: { list: ['open', 'repaired', 'quarantined', 'monitoring'] } },
    { name: 'summary', title: 'Summary', type: 'text' },
    { name: 'detectedAt', title: 'Detected At', type: 'datetime' },
    { name: 'flowId', title: 'Flow ID', type: 'string' },
    { name: 'scenarioId', title: 'Scenario ID', type: 'string' },
    { name: 'details', title: 'Details', type: 'object', fields: [{ name: 'value', title: 'Value', type: 'text', hidden: true }] },
  ],
};
