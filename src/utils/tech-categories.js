/**
 * Technology categorization — maps detected tech names to schema categories.
 *
 * Categories align with content-os-enrichment.js CATEGORY_MAP:
 *   cms, framework, analytics, ecommerce, hosting, marketing, chat,
 *   search, monitoring, payments, css-framework, auth, cdn-media,
 *   legacy, pim, dam, lms, migration-target
 *
 * Used by:
 *   - src/routes/extension.ts (P0-5: categorize flat tech arrays from Chrome extension)
 *   - src/services/content-os-enrichment.js (could replace inline CATEGORY_MAP)
 */

// Lowercase tech name → category
const TECH_CATEGORY_LOOKUP = {
  // CMS
  'wordpress': 'cms',
  'drupal': 'cms',
  'contentful': 'cms',
  'sanity': 'cms',
  'sitecore': 'cms',
  'adobe experience manager': 'cms',
  'optimizely cms': 'cms',
  'kentico': 'cms',
  'umbraco': 'cms',

  // Frameworks
  'react': 'framework',
  'vue.js': 'framework',
  'angular': 'framework',
  'svelte': 'framework',
  'next.js': 'framework',
  'nuxt': 'framework',
  'gatsby': 'framework',
  'jquery': 'framework',

  // Analytics
  'google analytics': 'analytics',
  'segment': 'analytics',
  'hotjar': 'analytics',
  'amplitude': 'analytics',
  'mixpanel': 'analytics',
  'pendo': 'analytics',
  'optimizely': 'analytics',

  // Ecommerce
  'shopify': 'ecommerce',
  'woocommerce': 'ecommerce',
  'magento': 'ecommerce',
  'bigcommerce': 'ecommerce',

  // Hosting / CDN
  'cloudflare': 'hosting',
  'vercel': 'hosting',
  'netlify': 'hosting',
  'aws': 'hosting',
  'azure': 'hosting',

  // Marketing / CRM
  'salesforce': 'marketing',
  'hubspot': 'marketing',
  'marketo': 'marketing',

  // Chat / Support
  'intercom': 'chat',
  'drift': 'chat',
  'zendesk': 'chat',

  // Search
  'algolia': 'search',
  'elasticsearch': 'search',

  // Monitoring
  'datadog': 'monitoring',

  // Payments
  'stripe': 'payments',

  // Communications
  'twilio': 'marketing',

  // CSS Frameworks
  'tailwind css': 'css-framework',
  'bootstrap': 'css-framework',

  // Feature flags (analytics-adjacent)
  'launchdarkly': 'analytics',
};

/**
 * Categorize a single technology name.
 *
 * @param {string} name - Technology name (e.g., 'React', 'WordPress')
 * @returns {string} Category string matching content-os-enrichment.js categories
 */
export function categorizeTechnology(name) {
  if (!name || typeof name !== 'string') return 'detected';
  return TECH_CATEGORY_LOOKUP[name.toLowerCase().trim()] || 'detected';
}

/**
 * Categorize an array of technology names.
 *
 * @param {string[]} techs - Array of technology names
 * @returns {Map<string, string>} Map of tech name → category
 */
export function categorizeTechnologies(techs) {
  const result = new Map();
  for (const tech of techs) {
    const name = typeof tech === 'string' ? tech.trim() : tech?.name?.trim();
    if (name) {
      result.set(name, categorizeTechnology(name));
    }
  }
  return result;
}
