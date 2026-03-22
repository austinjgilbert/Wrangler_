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

/**
 * Build a categorized technologyStack object from a flat array of tech names.
 * Returns { cms: ['WordPress'], analytics: ['Google Analytics'], ... }
 * matching the account schema's technologyStack shape.
 *
 * @param {string[]} techs - Flat array of technology names
 * @returns {Record<string, string[]>} Category → tech names
 */
export function buildTechStack(techs) {
  const stack = {};
  for (const tech of techs) {
    const name = typeof tech === 'string' ? tech.trim() : '';
    if (!name) continue;
    const category = categorizeTechnology(name);
    if (!stack[category]) stack[category] = [];
    if (!stack[category].includes(name)) stack[category].push(name);
  }
  return stack;
}

/**
 * Merge two categorized tech stacks, deduplicating within each category.
 * Existing categories are preserved; incoming techs are appended if not already present.
 *
 * @param {Record<string, any>} existing - Current technologyStack from Sanity
 * @param {Record<string, string[]>} incoming - New categorized stack from extension capture
 * @returns {Record<string, string[]>} Merged stack
 */
export function mergeTechStacks(existing, incoming) {
  const merged = {};
  for (const [cat, techs] of Object.entries(existing || {})) {
    if (Array.isArray(techs)) merged[cat] = [...techs];
  }
  for (const [cat, techs] of Object.entries(incoming)) {
    if (!merged[cat]) merged[cat] = [];
    for (const tech of techs) {
      if (!merged[cat].includes(tech)) merged[cat].push(tech);
    }
  }
  return merged;
}
