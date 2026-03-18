export default {
  name: 'storageDashboard',
  title: 'Storage Dashboard',
  type: 'document',
  fields: [
    {
      name: 'title',
      title: 'Title',
      type: 'string',
      initialValue: 'Storage Governance Dashboard',
    },
    {
      name: 'notes',
      title: 'Notes',
      type: 'text',
      rows: 4,
    },
  ],
};
