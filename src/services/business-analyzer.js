/**
 * Business Analysis Service
 * Analyzes business scale, units, and digital goals
 */

/**
 * Analyze business scale
 * @param {string} html - HTML content
 * @param {object} headers - HTTP headers
 * @param {Array<string>} scriptSrcs - Script source URLs
 * @param {Array<string>} linkHrefs - Link href URLs
 * @param {Array<object>} sitemapChecks - Sitemap check results
 * @param {object} businessUnits - Business units data
 * @returns {object} - Business scale analysis
 */
export function analyzeBusinessScale(html, headers, scriptSrcs, linkHrefs, sitemapChecks, businessUnits) {
  const safeScriptSrcs = Array.isArray(scriptSrcs) ? scriptSrcs : [];
  const safeLinkHrefs = Array.isArray(linkHrefs) ? linkHrefs : [];
  const scale = {
    trafficIndicators: [],
    revenueIndicators: [],
    costIndicators: [],
    monetizationMethods: [],
    businessScale: 'Unknown',
    estimatedMonthlyTraffic: null,
    estimatedAnnualRevenue: null,
    estimatedInfrastructureCosts: null,
    scaleScore: 0,
  };

  const htmlLower = html.toLowerCase();
  const allScripts = safeScriptSrcs.join(' ').toLowerCase();
  const allLinks = safeLinkHrefs.join(' ').toLowerCase();
  const allContent = (htmlLower + ' ' + allScripts + ' ' + allLinks).toLowerCase();

  // Traffic Indicators - Analytics Platforms
  const analyticsPatterns = {
    'Google Analytics': [/google.*analytics/i, /ga\(/i, /gtag/i, /googletagmanager/i, /google-analytics/i, /analytics\.js/i, /gtm\.js/i],
    'Adobe Analytics': [/adobe.*analytics/i, /omniture/i, /sitecatalyst/i, /adobe.*marketing.*cloud/i],
    'Mixpanel': [/mixpanel/i, /mixpanel\.com/i],
    'Amplitude': [/amplitude/i, /amplitude\.com/i],
    'Segment': [/segment\.com/i, /segment\.io/i],
    'Hotjar': [/hotjar/i, /hotjar\.com/i],
    'FullStory': [/fullstory/i, /fullstory\.com/i],
    'Pendo': [/pendo/i, /pendo\.io/i],
    'Heap': [/heap\.io/i, /heap-analytics/i],
  };

  for (const [analytics, patterns] of Object.entries(analyticsPatterns)) {
    for (const pattern of patterns) {
      if (pattern.test(allContent)) {
        scale.trafficIndicators.push(analytics);
        scale.scaleScore += 5;
        break;
      }
    }
  }

  // Revenue Indicators - E-commerce Platforms
  const ecommercePatterns = {
    'Shopify': [/shopify/i, /shopifycdn/i, /cdn\.shopify\.com/i, /myshopify\.com/i],
    'WooCommerce': [/woocommerce/i, /wc-api/i],
    'Magento': [/magento/i, /magento\.com/i],
    'BigCommerce': [/bigcommerce/i, /bigcommerce\.com/i],
    'Salesforce Commerce Cloud': [/demandware/i, /salesforce.*commerce/i],
    'Squarespace Commerce': [/squarespace.*commerce/i, /squarespace.*shop/i],
    'Wix Stores': [/wix.*store/i, /wix.*ecommerce/i],
  };

  for (const [platform, patterns] of Object.entries(ecommercePatterns)) {
    for (const pattern of patterns) {
      if (pattern.test(allContent)) {
        scale.revenueIndicators.push(platform);
        scale.monetizationMethods.push('E-commerce');
        scale.scaleScore += 10;
        break;
      }
    }
  }

  // Determine business scale
  if (scale.scaleScore >= 30) {
    scale.businessScale = 'Enterprise';
    scale.estimatedMonthlyTraffic = '1M+';
    scale.estimatedAnnualRevenue = '$10M+';
  } else if (scale.scaleScore >= 15) {
    scale.businessScale = 'Mid-Market';
    scale.estimatedMonthlyTraffic = '100K-1M';
    scale.estimatedAnnualRevenue = '$1M-$10M';
  } else if (scale.scaleScore >= 5) {
    scale.businessScale = 'Small Business';
    scale.estimatedMonthlyTraffic = '10K-100K';
    scale.estimatedAnnualRevenue = '$100K-$1M';
  } else {
    scale.businessScale = 'Unknown';
  }

  // Infrastructure cost estimates
  if (scale.businessScale === 'Enterprise') {
    scale.estimatedInfrastructureCosts = '$50K-$500K/year';
  } else if (scale.businessScale === 'Mid-Market') {
    scale.estimatedInfrastructureCosts = '$10K-$50K/year';
  } else if (scale.businessScale === 'Small Business') {
    scale.estimatedInfrastructureCosts = '$1K-$10K/year';
  }

  return scale;
}

/**
 * Detect business units from HTML and navigation
 * @param {string} html - HTML content
 * @param {Array<object>} navigationLinks - Navigation links
 * @param {string} baseUrl - Base URL
 * @returns {object} - Business units analysis
 */
export function detectBusinessUnits(html, navigationLinks, baseUrl) {
  const safeNavigationLinks = Array.isArray(navigationLinks) ? navigationLinks : [];
  const units = {
    detectedAreas: [],
    subdomains: [],
    separateProperties: [],
    siloIndicators: [],
    totalAreas: 0,
  };

  const htmlLower = html.toLowerCase();
  const navText = safeNavigationLinks.map(link => link.text?.toLowerCase() || '').join(' ');

  // Common business unit patterns
  const unitPatterns = {
    'Legal': [/legal/i, /terms/i, /privacy/i, /compliance/i],
    'Support': [/support/i, /help/i, /customer.*service/i, /contact/i],
    'Localization': [/language/i, /locale/i, /translation/i, /i18n/i],
    'Marketing': [/marketing/i, /blog/i, /news/i, /press/i],
    'Product': [/product/i, /features/i, /solutions/i],
    'Customer Portal': [/portal/i, /account/i, /dashboard/i, /login/i],
    'Hosted Services': [/api/i, /services/i, /platform/i],
  };

  for (const [unit, patterns] of Object.entries(unitPatterns)) {
    for (const pattern of patterns) {
      if (pattern.test(htmlLower) || pattern.test(navText)) {
        units.detectedAreas.push(unit);
        break;
      }
    }
  }

  // Detect subdomains from links
  try {
    const baseUrlObj = new URL(baseUrl);
    const subdomainSet = new Set();
    
    for (const link of safeNavigationLinks) {
      if (link.href) {
        try {
          const linkUrl = new URL(link.href, baseUrl);
          if (linkUrl.hostname !== baseUrlObj.hostname && linkUrl.hostname.endsWith('.' + baseUrlObj.hostname.replace(/^www\./, ''))) {
            subdomainSet.add(linkUrl.hostname);
          }
        } catch {
          // Invalid URL
        }
      }
    }
    
    units.subdomains = Array.from(subdomainSet);
  } catch {
    // Base URL invalid
  }

  // Silo indicators
  if (units.subdomains.length > 3) {
    units.siloIndicators.push('Multiple subdomains suggest siloed architecture');
  }
  if (units.detectedAreas.length > 5) {
    units.siloIndicators.push('Many business units may indicate siloed management');
  }

  units.totalAreas = units.detectedAreas.length + units.subdomains.length;

  return units;
}

/**
 * Detect future digital goals
 * @param {string} html - HTML content
 * @param {string} baseUrl - Base URL
 * @returns {object} - Digital goals analysis
 */
export function detectFutureDigitalGoals(html, baseUrl) {
  const goals = {
    initiatives: [],
    technologyFocus: [],
    growthIndicators: [],
    strategicProjects: [],
    digitalTransformationSignals: [],
  };

  const htmlLower = html.toLowerCase();

  // Initiative patterns
  const initiativePatterns = [
    /digital.*transformation/i,
    /cloud.*migration/i,
    /api.*first/i,
    /headless/i,
    /microservices/i,
    /ai.*initiative/i,
    /machine.*learning/i,
    /automation/i,
  ];

  for (const pattern of initiativePatterns) {
    const matches = htmlLower.match(new RegExp(pattern.source + '[^.]{0,100}', 'gi'));
    if (matches) {
      goals.initiatives.push(...matches.slice(0, 3).map(m => m.trim()));
    }
  }

  // Technology focus
  const techFocusPatterns = [
    /modern.*stack/i,
    /react|vue|angular/i,
    /next\.js|nuxt|gatsby/i,
    /cloud.*native/i,
    /serverless/i,
  ];

  for (const pattern of techFocusPatterns) {
    if (pattern.test(htmlLower)) {
      goals.technologyFocus.push(pattern.source.replace(/[\\^$.*+?()[\]{}|]/g, ''));
    }
  }

  // Growth indicators
  if (/hiring|careers|join.*team/i.test(htmlLower)) {
    goals.growthIndicators.push('Active hiring');
  }
  if (/expanding|growth|scaling/i.test(htmlLower)) {
    goals.growthIndicators.push('Growth signals');
  }

  // Digital transformation signals
  if (/transformation|modernization|migration/i.test(htmlLower)) {
    goals.digitalTransformationSignals.push('Digital transformation initiative');
  }

  return goals;
}

