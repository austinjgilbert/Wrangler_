/**
 * Sanity Schema: call.task
 */

export default {
  name: 'call.task',
  title: 'Call Task',
  type: 'document',
  fields: [
    {
      name: 'sessionRef',
      title: 'Session',
      type: 'reference',
      to: [{ type: 'call.session' }],
    },
    { name: 'owner', title: 'Owner', type: 'string' },
    { name: 'taskText', title: 'Task Text', type: 'text' },
    { name: 'dueDate', title: 'Due Date', type: 'datetime' },
    { name: 'systemTarget', title: 'System Target', type: 'string' },
    { name: 'status', title: 'Status', type: 'string' },
  ],
};
