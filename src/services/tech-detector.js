/**
 * Technology Detection Service
 * Detects CMS, frameworks, legacy systems, PIM, DAM, LMS, and migration opportunities
 */

/**
 * Detect technology stack from HTML, headers, scripts, and links
 * @param {string} html - HTML content
 * @param {object} headers - HTTP headers
 * @param {Array<string>} scriptSrcs - Script source URLs
 * @param {Array<string>} linkHrefs - Link href URLs
 * @param {string|null} generator - Meta generator tag value
 * @returns {object} - Detected technology stack
 */
export function detectTechnologyStack(html, headers, scriptSrcs, linkHrefs, generator) {
  const safeScriptSrcs = Array.isArray(scriptSrcs) ? scriptSrcs : [];
  const safeLinkHrefs = Array.isArray(linkHrefs) ? linkHrefs : [];
  const detected = {
    cms: [],
    frameworks: [],
    legacySystems: [],
    pimSystems: [],
    damSystems: [],
    lmsSystems: [],
    systemDuplication: [],
    headlessIndicators: [],
    migrationOpportunities: [],
    painPoints: [],
    roiInsights: [],
    opportunityScore: 0,
  };

  const htmlLower = html.toLowerCase();
  const allScripts = safeScriptSrcs.join(' ').toLowerCase();
  const allLinks = safeLinkHrefs.join(' ').toLowerCase();
  const allHeaders = JSON.stringify(headers).toLowerCase();

  // Comprehensive Legacy Enterprise CMS Detection
  const legacyPatterns = {
    'Adobe Experience Manager (AEM)': [
      /\/etc\/clientlibs/i,
      /\.aem\./i,
      /granite\./i,
      /cq\./i,
      /x-powered-by.*aem/i,
      /adobe.*experience.*manager/i,
      /aem\.adobe/i,
    ],
    'Sitecore': [
      /sitecore/i,
      /\/sitecore\//i,
      /x-powered-by.*sitecore/i,
      /sc_layout/i,
      /sitecore\.com/i,
    ],
    'Drupal (Legacy)': [
      /drupal/i,
      /\/sites\/all\//i,
      /\/modules\//i,
      /x-powered-by.*drupal/i,
      /generator.*drupal/i,
      /drupal\.org/i,
    ],
    'WordPress (Legacy)': [
      /wp-content/i,
      /wp-includes/i,
      /wp-admin/i,
      /wordpress/i,
      /x-powered-by.*wordpress/i,
      /generator.*wordpress/i,
    ],
    'Joomla (Legacy)': [
      /joomla/i,
      /\/components\//i,
      /\/modules\//i,
      /x-powered-by.*joomla/i,
    ],
    'Magento (Legacy)': [
      /magento/i,
      /\/media\/js\//i,
      /\/skin\/frontend\//i,
      /magento\.com/i,
    ],
  };

  // Modern CMS Detection
  const modernCmsPatterns = {
    'Contentful': [
      /contentful/i,
      /contentful\.com/i,
      /cdn\.contentful\.com/i,
    ],
    'Sanity': [
      /sanity\.io/i,
      /cdn\.sanity\.io/i,
      /sanity-cms/i,
    ],
    'Strapi': [
      /strapi/i,
      /strapi\.io/i,
      /\/api\//i,
    ],
    'Prismic': [
      /prismic\.io/i,
      /\.prismic\.io/i,
    ],
    'Contentstack': [
      /contentstack/i,
      /contentstack\.io/i,
    ],
    'Storyblok': [
      /storyblok/i,
      /storyblok\.com/i,
    ],
    'Ghost': [
      /ghost/i,
      /ghost\.org/i,
    ],
  };

  // Framework Detection
  const frameworkPatterns = {
    'React': [
      /react/i,
      /react\.js/i,
      /react-dom/i,
      /\/react\//i,
    ],
    'Vue.js': [
      /vue\.js/i,
      /vuejs/i,
      /\/vue\//i,
    ],
    'Angular': [
      /angular/i,
      /angular\.js/i,
      /angularjs/i,
      /ng-app/i,
    ],
    'Next.js': [
      /next\.js/i,
      /_next\//i,
      /__next/i,
    ],
    'Nuxt.js': [
      /nuxt\.js/i,
      /_nuxt\//i,
    ],
    'Gatsby': [
      /gatsby/i,
      /gatsbyjs/i,
      /\/static\/chunk-manifest/i,
    ],
    'Svelte': [
      /svelte/i,
      /sveltejs/i,
    ],
    'Remix': [
      /remix/i,
      /remix\.run/i,
    ],
  };

  // PIM Systems
  const pimPatterns = {
    'Akeneo': [/akeneo/i, /akeneo\.com/i],
    'inRiver': [/inriver/i, /inriver\.com/i],
    'Pimcore': [/pimcore/i, /pimcore\.org/i],
    'Salsify': [/salsify/i, /salsify\.com/i],
    'Sanity (PIM)': [/sanity.*pim/i, /product.*sanity/i],
  };

  // DAM Systems
  const damPatterns = {
    'Adobe Experience Manager Assets': [/aem.*assets/i, /dam.*aem/i],
    'Bynder': [/bynder/i, /bynder\.com/i],
    'Cloudinary': [/cloudinary/i, /cloudinary\.com/i, /res\.cloudinary\.com/i],
    'ImageKit': [/imagekit/i, /imagekit\.io/i],
    'Sanity (DAM)': [/sanity.*dam/i, /asset.*sanity/i],
  };

  // LMS Systems
  const lmsPatterns = {
    'Moodle': [/moodle/i, /moodle\.org/i],
    'Canvas': [/canvas/i, /instructure\.com/i],
    'Blackboard': [/blackboard/i, /blackboard\.com/i],
    'Sanity (LMS)': [/sanity.*lms/i, /learning.*sanity/i],
  };

  // Detect legacy systems
  for (const [system, patterns] of Object.entries(legacyPatterns)) {
    for (const pattern of patterns) {
      if (pattern.test(htmlLower) || pattern.test(allScripts) || pattern.test(allLinks) || pattern.test(allHeaders)) {
        detected.legacySystems.push(system);
        detected.opportunityScore += 40;
        detected.migrationOpportunities.push({
          from: system,
          to: 'Headless CMS',
          reason: 'Legacy system limits agility and developer experience',
          roi: 'High',
        });
        break;
      }
    }
  }

  // Detect modern CMS
  for (const [cms, patterns] of Object.entries(modernCmsPatterns)) {
    for (const pattern of patterns) {
      if (pattern.test(htmlLower) || pattern.test(allScripts) || pattern.test(allLinks)) {
        detected.cms.push(cms);
        detected.headlessIndicators.push(`${cms} - API-first architecture`);
        break;
      }
    }
  }

  // Detect frameworks
  for (const [framework, patterns] of Object.entries(frameworkPatterns)) {
    for (const pattern of patterns) {
      if (pattern.test(htmlLower) || pattern.test(allScripts) || pattern.test(allLinks)) {
        detected.frameworks.push(framework);
        break;
      }
    }
  }

  // Detect PIM systems
  for (const [pim, patterns] of Object.entries(pimPatterns)) {
    for (const pattern of patterns) {
      if (pattern.test(htmlLower) || pattern.test(allScripts) || pattern.test(allLinks)) {
        detected.pimSystems.push(pim);
        break;
      }
    }
  }

  // Detect DAM systems
  for (const [dam, patterns] of Object.entries(damPatterns)) {
    for (const pattern of patterns) {
      if (pattern.test(htmlLower) || pattern.test(allScripts) || pattern.test(allLinks)) {
        detected.damSystems.push(dam);
        break;
      }
    }
  }

  // Detect LMS systems
  for (const [lms, patterns] of Object.entries(lmsPatterns)) {
    for (const pattern of patterns) {
      if (pattern.test(htmlLower) || pattern.test(allScripts) || pattern.test(allLinks)) {
        detected.lmsSystems.push(lms);
        break;
      }
    }
  }

  // System duplication detection
  if (detected.pimSystems.length > 1) {
    detected.systemDuplication.push('Multiple PIM systems detected');
    detected.painPoints.push('System duplication - multiple PIM systems increase complexity');
  }
  if (detected.damSystems.length > 1) {
    detected.systemDuplication.push('Multiple DAM systems detected');
    detected.painPoints.push('System duplication - multiple DAM systems increase costs');
  }
  if (detected.lmsSystems.length > 1) {
    detected.systemDuplication.push('Multiple LMS systems detected');
    detected.painPoints.push('System duplication - multiple LMS systems fragment learning');
  }

  // ROI insights
  if (detected.legacySystems.length > 0) {
    detected.roiInsights.push('Legacy systems limit agility and increase maintenance costs');
    detected.roiInsights.push('Modern headless CMS can reduce developer-dependent deployments');
  }
  if (detected.systemDuplication.length > 0) {
    detected.roiInsights.push('System duplication increases costs and complexity');
    detected.roiInsights.push('Consolidation can reduce licensing and maintenance costs');
  }
  if (detected.cms.some(cms => ['Sanity', 'Contentful', 'Strapi'].includes(cms))) {
    detected.roiInsights.push('Modern headless CMS provides API-first architecture');
  }

  return detected;
}

