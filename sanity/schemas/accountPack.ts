/**
 * Sanity Schema: accountPack
 *
 * Legacy but still-active raw artifact store for scans, research sets,
 * competitor payloads, and enrichment history linked to an account.
 */

export default {
  name: 'accountPack',
  title: 'Account Pack',
  type: 'document',
  fields: [
    { name: 'accountKey', title: 'Account Key', type: 'string' },
    { name: 'canonicalUrl', title: 'Canonical URL', type: 'url' },
    { name: 'domain', title: 'Domain', type: 'string' },
    { name: 'payload', title: 'Payload', type: 'object', fields: [{ name: 'value', type: 'string', hidden: true }] },
    { name: 'history', title: 'History', type: 'array', of: [{ type: 'object', fields: [{ name: 'type', type: 'string' }, { name: 'storedAt', type: 'datetime' }] }] },
    { name: 'meta', title: 'Meta', type: 'object', fields: [{ name: 'storedBy', type: 'string' }] },
    { name: 'createdAt', title: 'Created At', type: 'datetime' },
    { name: 'updatedAt', title: 'Updated At', type: 'datetime' },
  ],
};
