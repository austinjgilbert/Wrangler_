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
    analytics: [],
    ecommerce: [],
    hosting: [],
    cssFrameworks: [],
    authProviders: [],
    searchTech: [],
    monitoring: [],
    payments: [],
    marketing: [],
    chat: [],
    cdnMedia: [],
    cicd: [],
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
      /x-powered-by.*strapi/i,
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

  // Analytics & Tag Management
  const analyticsPatterns = {
    'Google Analytics': [/google-analytics\.com/i, /googletagmanager\.com/i, /gtag\(/i, /ga\.js/i, /analytics\.js/i, /GA4/],
    'Google Tag Manager': [/googletagmanager\.com\/gtm/i, /gtm\.js/i, /GTM-/],
    'Segment': [/segment\.com/i, /analytics\.js.*segment/i, /cdn\.segment\.com/i],
    'Mixpanel': [/mixpanel\.com/i, /mixpanel/i],
    'Amplitude': [/amplitude\.com/i, /cdn\.amplitude\.com/i],
    'Heap': [/heap\.io/i, /heapanalytics/i, /heap-/i],
    'Hotjar': [/hotjar\.com/i, /static\.hotjar\.com/i],
    'FullStory': [/fullstory\.com/i, /fs\.js/i],
    'Pendo': [/pendo\.io/i, /cdn\.pendo\.io/i],
    'PostHog': [/posthog\.com/i, /posthog/i],
    'Plausible': [/plausible\.io/i],
    'Fathom': [/usefathom\.com/i],
    'Matomo': [/matomo/i, /piwik/i],
    'Adobe Analytics': [/omniture/i, /s_code/i, /adobe.*analytics/i, /demdex\.net/i],
    'Kissmetrics': [/kissmetrics/i],
    'Datadog RUM': [/datadog-rum/i, /dd-rum/i],
  };

  // E-commerce Platforms
  const ecommercePatterns = {
    'Shopify': [/shopify\.com/i, /cdn\.shopify\.com/i, /shopify/i, /\/shopify/i],
    'WooCommerce': [/woocommerce/i, /wc-ajax/i, /\/wc\//i],
    'BigCommerce': [/bigcommerce\.com/i, /bigcommerce/i],
    'Salesforce Commerce Cloud': [/demandware/i, /sfcc/i, /salesforce.*commerce/i],
    'Magento 2': [/magento2/i, /mage\/cookies/i, /requirejs/i],
    'Commercetools': [/commercetools/i],
    'Medusa': [/medusajs/i],
    'Swell': [/swell\.is/i],
    'Shopware': [/shopware/i],
  };

  // Hosting / CDN / Infrastructure
  const hostingPatterns = {
    'Vercel': [/vercel/i, /\.vercel\.app/i, /x-vercel/i],
    'Netlify': [/netlify/i, /\.netlify\.app/i, /x-nf-request-id/i],
    'Cloudflare': [/cloudflare/i, /cf-ray/i, /cf-cache-status/i, /cdnjs\.cloudflare/i],
    'AWS CloudFront': [/cloudfront\.net/i, /x-amz-cf/i],
    'AWS S3': [/s3\.amazonaws/i, /s3-website/i],
    'Fastly': [/fastly/i, /x-served-by.*cache/i, /x-fastly/i],
    'Akamai': [/akamai/i, /akam\//i, /akamaized\.net/i],
    'Google Cloud': [/googleapis\.com/i, /storage\.googleapis/i, /gstatic\.com/i],
    'Azure': [/azure/i, /\.azurewebsites\.net/i, /azureedge\.net/i],
    'Heroku': [/heroku/i, /\.herokuapp\.com/i],
    'DigitalOcean': [/digitalocean/i, /\.digitaloceanspaces/i],
    'Render': [/onrender\.com/i],
    'Railway': [/railway\.app/i],
    'Fly.io': [/fly\.io/i, /fly-request-id/i],
  };

  // CSS Frameworks
  const cssFrameworkPatterns = {
    'Tailwind CSS': [/tailwindcss/i, /tailwind/i],
    'Bootstrap': [/bootstrap/i, /bootstrap\.min/i, /getbootstrap/i],
    'Material UI': [/material-ui/i, /mui\.com/i, /MuiButton/i],
    'Chakra UI': [/chakra-ui/i],
    'Ant Design': [/antd/i, /ant-design/i],
    'Bulma': [/bulma/i, /bulma\.io/i],
    'Foundation': [/foundation\.zurb/i],
    'Styled Components': [/styled-components/i, /sc-/],
  };

  // Auth Providers
  const authPatterns = {
    'Auth0': [/auth0\.com/i, /auth0/i],
    'Okta': [/okta\.com/i, /okta/i],
    'Firebase Auth': [/firebase.*auth/i, /firebaseapp\.com/i, /firebase\.js/i],
    'Clerk': [/clerk\.dev/i, /clerk\.com/i],
    'Supabase Auth': [/supabase/i, /supabase\.co/i],
    'AWS Cognito': [/cognito/i, /amazoncognito/i],
    'WorkOS': [/workos/i],
    'Stytch': [/stytch\.com/i],
  };

  // Search Technology
  const searchPatterns = {
    'Algolia': [/algolia/i, /algolia\.com/i, /algolianet\.com/i],
    'Elasticsearch': [/elasticsearch/i],
    'Typesense': [/typesense/i],
    'Meilisearch': [/meilisearch/i],
    'Coveo': [/coveo/i, /coveo\.com/i],
    'SearchSpring': [/searchspring/i],
    'Swiftype': [/swiftype/i],
  };

  // Monitoring / Observability
  const monitoringPatterns = {
    'Datadog': [/datadog/i, /datadoghq\.com/i],
    'Sentry': [/sentry\.io/i, /sentry/i, /browser\.sentry-cdn/i],
    'New Relic': [/newrelic/i, /nr-data\.net/i],
    'LogRocket': [/logrocket/i, /logrocket\.com/i],
    'Bugsnag': [/bugsnag/i],
    'Rollbar': [/rollbar/i, /rollbar\.com/i],
    'Grafana': [/grafana/i],
    'Honeycomb': [/honeycomb\.io/i],
  };

  // Payments
  const paymentPatterns = {
    'Stripe': [/stripe\.com/i, /js\.stripe\.com/i, /stripe/i],
    'PayPal': [/paypal\.com/i, /paypal/i],
    'Braintree': [/braintree/i, /braintreegateway/i],
    'Square': [/squareup\.com/i, /square/i],
    'Adyen': [/adyen/i, /adyen\.com/i],
    'Recurly': [/recurly/i],
    'Chargebee': [/chargebee/i],
    'Paddle': [/paddle\.com/i, /paddle/i],
  };

  // Marketing Automation
  const marketingPatterns = {
    'HubSpot': [/hubspot\.com/i, /hubspot/i, /hs-scripts/i, /hbspt/i, /js\.hs-analytics/i],
    'Marketo': [/marketo/i, /munchkin\.js/i, /mkto/i],
    'Pardot': [/pardot/i, /pi\.pardot\.com/i],
    'Mailchimp': [/mailchimp/i, /mailchimp\.com/i],
    'ActiveCampaign': [/activecampaign/i],
    'Klaviyo': [/klaviyo/i, /klaviyo\.com/i],
    'Braze': [/braze/i, /appboy/i],
    'Customer.io': [/customer\.io/i, /customerio/i],
    'Iterable': [/iterable/i],
    'SendGrid': [/sendgrid/i],
    'Optimizely': [/optimizely/i, /optimizely\.com/i],
    'LaunchDarkly': [/launchdarkly/i],
    'VWO': [/visualwebsiteoptimizer/i, /vwo\.com/i],
    'Unbounce': [/unbounce/i],
  };

  // Chat & Support
  const chatPatterns = {
    'Intercom': [/intercom/i, /intercomcdn/i, /widget\.intercom\.io/i],
    'Drift': [/drift\.com/i, /drift/i, /js\.driftt\.com/i],
    'Zendesk': [/zendesk/i, /zdassets\.com/i],
    'Crisp': [/crisp\.chat/i],
    'LiveChat': [/livechatinc/i],
    'Freshdesk': [/freshdesk/i, /freshworks/i],
    'Olark': [/olark/i],
    'Tawk.to': [/tawk\.to/i],
    'HubSpot Chat': [/hubspot.*chat/i],
  };

  // CDN & Media Optimization
  const cdnMediaPatterns = {
    'Cloudinary': [/res\.cloudinary\.com/i, /cloudinary/i],
    'Imgix': [/imgix\.net/i, /imgix/i],
    'ImageKit': [/ik\.imagekit\.io/i],
    'Fastly Image Optimizer': [/fastly.*image/i],
    'Sanity Image CDN': [/cdn\.sanity\.io/i],
    'Contentful Images': [/images\.ctfassets\.net/i],
    'Uploadcare': [/uploadcare/i, /ucarecdn/i],
    'Bunny CDN': [/bunnycdn/i, /b-cdn\.net/i],
  };

  // Generic pattern detector
  function detectCategory(patterns, targetArray) {
    for (const [name, regexes] of Object.entries(patterns)) {
      for (const pattern of regexes) {
        if (pattern.test(htmlLower) || pattern.test(allScripts) || pattern.test(allLinks) || pattern.test(allHeaders)) {
          if (!targetArray.includes(name)) targetArray.push(name);
          break;
        }
      }
    }
  }

  detectCategory(analyticsPatterns, detected.analytics);
  detectCategory(ecommercePatterns, detected.ecommerce);
  detectCategory(hostingPatterns, detected.hosting);
  detectCategory(cssFrameworkPatterns, detected.cssFrameworks);
  detectCategory(authPatterns, detected.authProviders);
  detectCategory(searchPatterns, detected.searchTech);
  detectCategory(monitoringPatterns, detected.monitoring);
  detectCategory(paymentPatterns, detected.payments);
  detectCategory(marketingPatterns, detected.marketing);
  detectCategory(chatPatterns, detected.chat);
  detectCategory(cdnMediaPatterns, detected.cdnMedia);

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

  // Build a flat summary of all detected technologies for easy storage
  detected.allDetected = [
    ...detected.cms.map(t => ({ name: t, category: 'cms' })),
    ...detected.frameworks.map(t => ({ name: t, category: 'framework' })),
    ...detected.legacySystems.map(t => ({ name: t, category: 'legacyCms' })),
    ...detected.pimSystems.map(t => ({ name: t, category: 'pim' })),
    ...detected.damSystems.map(t => ({ name: t, category: 'dam' })),
    ...detected.lmsSystems.map(t => ({ name: t, category: 'lms' })),
    ...detected.analytics.map(t => ({ name: t, category: 'analytics' })),
    ...detected.ecommerce.map(t => ({ name: t, category: 'ecommerce' })),
    ...detected.hosting.map(t => ({ name: t, category: 'hosting' })),
    ...detected.cssFrameworks.map(t => ({ name: t, category: 'cssFramework' })),
    ...detected.authProviders.map(t => ({ name: t, category: 'auth' })),
    ...detected.searchTech.map(t => ({ name: t, category: 'search' })),
    ...detected.monitoring.map(t => ({ name: t, category: 'monitoring' })),
    ...detected.payments.map(t => ({ name: t, category: 'payments' })),
    ...detected.marketing.map(t => ({ name: t, category: 'marketing' })),
    ...detected.chat.map(t => ({ name: t, category: 'chat' })),
    ...detected.cdnMedia.map(t => ({ name: t, category: 'cdnMedia' })),
  ];

  return detected;
}

