/**
 * Sanity Grabber – Content Script
 *
 * Consolidated from:
 *   - SDR research/linkedin-extension  (LinkedInExtractor with fallback selectors)
 *   - sanity-sales-frontend/test-extension (capture + crawl)
 *   - website-scanner-worker/chrome-extension (site-specific extractors)
 *
 * Exposes `window.__moltExtract()` for the popup to call.
 *
 * Supported sites:
 *   - LinkedIn  (profiles, company pages, Sales Navigator)
 *   - Salesforce  (Lightning record pages)
 *   - HubSpot  (contact/company records)
 *   - Outreach  (prospect views)
 *   - Common Room  (member profiles)
 *   - Gong / Apollo / ZoomInfo / 6sense
 *   - Generic website  (meta, OG, tech detection)
 */

(function () {
  'use strict';

  // ═══════════════════════════════════════════════════════════════════════
  //  UTILITIES
  // ═══════════════════════════════════════════════════════════════════════

  function detectSource() {
    const h = location.hostname;
    if (h.includes('linkedin.com'))    return 'linkedin';
    if (h.includes('salesforce.com') || h.includes('force.com')) return 'salesforce';
    if (h.includes('outreach.io'))     return 'outreach';
    if (h.includes('commonroom.io'))   return 'commonroom';
    if (h.includes('looker.com') || h.includes('lookerstudio')) return 'looker';
    if (h.includes('hubspot.com'))     return 'hubspot';
    if (h.includes('gong.io'))         return 'gong';
    if (h.includes('apollo.io'))       return 'apollo';
    if (h.includes('zoominfo.com'))    return 'zoominfo';
    if (h.includes('6sense.com'))      return '6sense';
    return 'website';
  }

  /** Try multiple selectors, return first match text. */
  function extractWithFallbacks(selectors, processor, contexts) {
    const ctxs = (Array.isArray(contexts) && contexts.length) ? contexts : [document];
    for (const ctx of ctxs) {
      for (const sel of selectors) {
        try {
          const el = (ctx.querySelector ? ctx : document).querySelector(sel);
          if (el) {
            const res = processor ? processor(el) : el.textContent?.trim();
            if (res) return res;
          }
        } catch { continue; }
      }
    }
    return null;
  }

  /** Extract multiple items from a container using fallback selectors. */
  function extractMultipleItems(containerSels, itemSels, processor) {
    for (const cSel of containerSels) {
      try {
        const container = document.querySelector(cSel);
        if (!container) continue;
        const items = [];
        for (const iSel of itemSels) {
          for (const el of container.querySelectorAll(iSel)) {
            const item = processor ? processor(el) : el.textContent?.trim();
            if (item) items.push(item);
          }
        }
        if (items.length) return items;
      } catch { continue; }
    }
    return [];
  }

  function txt(sel) { const el = document.querySelector(sel); return el ? el.innerText.trim() : ''; }
  function txts(sel) { return Array.from(document.querySelectorAll(sel)).map(e => e.innerText.trim()).filter(Boolean); }
  function attr(sel, a) { const el = document.querySelector(sel); return el ? (el.getAttribute(a) || '').trim() : ''; }
  function getMeta(name) { const el = document.querySelector(`meta[name="${name}"], meta[property="${name}"]`); return el ? (el.getAttribute('content') || '').trim() : ''; }


  // ═══════════════════════════════════════════════════════════════════════
  //  LINKEDIN EXTRACTOR  (merged from SDR research/linkedin-extension)
  // ═══════════════════════════════════════════════════════════════════════

  const LI_SEL = {
    basic: {
      name:     ['h1.text-heading-xlarge', '.pv-text-details__left-panel h1', '.top-card-layout__title', 'h1[data-test-id="hero__name"]'],
      headline: ['.text-body-medium.break-words', '.pv-text-details__left-panel .text-body-medium', '.top-card-layout__headline', '[data-test-id="hero__headline"]'],
      location: ['.pv-text-details__left-panel .text-body-small', '.top-card-layout__location', '[data-test-id="hero__location"]'],
      summary:  ['.pv-shared-text-with-see-more .display-flex', '.pv-about__summary .pv-shared-text-with-see-more', '#about ~ div .inline-show-more-text', '.top-card-layout__summary'],
      profileImage: ['.pv-top-card-profile-picture__image', '.top-card-layout__profile-picture img', '[data-test-id="hero__profile-picture"]'],
    },
    experience: {
      container: ['.experience__list', '#experience ~ div .pvs-list__outer-container', '[data-section="experience"]', '.pv-position-entity'],
      items:     ['li.pvs-list__paged-list-item', '.experience__item', '.pv-position-entity__body'],
      title:     ['.t-bold span', '.pv-entity__summary-info h3', '.pv-position-entity__title'],
      company:   ['.t-normal span', '.pv-entity__secondary-title', '.pv-position-entity__company'],
      duration:  ['.t-black--light .t-normal span', '.pv-entity__date-range span:nth-child(2)', '.pv-position-entity__duration'],
    },
    skills: {
      container: ['#skills ~ div .pvs-list__outer-container', '.pv-skill-categories-section', '[data-section="skills"]'],
      items:     ['li.pvs-list__paged-list-item .t-bold span', '.pv-skill-category-entity__name', '.skill-item'],
    },
    education: {
      container: ['#education ~ div .pvs-list__outer-container', '.pv-education-section', '[data-section="education"]'],
      items:     ['li.pvs-list__paged-list-item', '.pv-education-entity'],
      school:    ['.t-bold span', '.pv-entity__school-name'],
      degree:    ['.t-normal span', '.pv-entity__degree-name'],
      field:     ['.pv-entity__comma-item'],
    },
    certifications: {
      container: ['#certifications ~ div .pvs-list__outer-container', '#certifications', '[data-section="certifications"]'],
      items: ['.pvs-list__item', '.certifications__item'],
      name: ['.t-bold span', 'h3'], issuer: ['.t-normal span'], date: ['.pvs-entity__caption-wrapper'],
    },
    publications: {
      container: ['#publications ~ div .pvs-list__outer-container', '#publications', '[data-section="publications"]'],
      items: ['.pvs-list__item'], title: ['.t-bold span', 'h3'], publisher: ['.t-normal span'],
      date: ['.pvs-entity__caption-wrapper'], url: ['a[href^="http"]'],
    },
    volunteer: {
      container: ['#volunteering ~ div .pvs-list__outer-container', '#volunteering', '[data-section="volunteering"]'],
      items: ['.pvs-list__item'], organization: ['.t-bold span'], role: ['.t-normal span'], duration: ['.pvs-entity__caption-wrapper'],
    },
    languages: {
      container: ['#languages ~ div .pvs-list__outer-container', '#languages', '[data-section="languages"]'],
      items: ['.pvs-list__item'], name: ['.t-bold span'], proficiency: ['.t-normal span'],
    },
    recommendations: { given: ['[aria-label*="given"]'], received: ['[aria-label*="received"]'] },
    connections: { count: ['.pv-top-card--list-bullet .t-bold', '.top-card-layout__first-subline .t-bold'], mutual: ['.pv-top-card--list-bullet .t-normal'] },
    company: {
      name:        ['.org-top-card-summary__title', 'h1[data-test-id="company-name"]', 'h1'],
      industry:    ['.org-top-card-summary-info-list__info-item'],
      size:        ['.org-about-company-module__company-staff-count-range'],
      description: ['.org-about-us-organization-description__text'],
      website:     ['.org-about-us-company-module__company-page-url a'],
      specialties: ['.org-about-us-organization-description__specialties .org-about-module__specialties-element'],
      headquarters:['.org-about-company-module__headquarters'],
    },
    salesNav: {
      name:    ['[data-anonymize="person-name"]', 'h1'],
      title:   ['[data-anonymize="headline"]'],
      company: ['[data-anonymize="company-name"]'],
    },
  };

  function parseCount(text) { if (!text) return null; const m = text.match(/\d[\d,]*/); return m ? parseInt(m[0].replace(/,/g, ''), 10) : null; }

  function extractLinkedIn() {
    const path = location.pathname;
    const data = { people: [], accounts: [], technologies: [], signals: [] };

    // ── Personal profile (/in/xxx) ──────────────────────────────────
    if (path.startsWith('/in/')) {
      const name     = extractWithFallbacks(LI_SEL.basic.name);
      const headline = extractWithFallbacks(LI_SEL.basic.headline);
      const loc      = extractWithFallbacks(LI_SEL.basic.location);
      const about    = extractWithFallbacks(LI_SEL.basic.summary);

      const experience = extractMultipleItems(LI_SEL.experience.container, LI_SEL.experience.items, (el) => {
        const title   = extractWithFallbacks(LI_SEL.experience.title, e => e.textContent?.trim(), [el]);
        const company = extractWithFallbacks(LI_SEL.experience.company, e => e.textContent?.trim(), [el]);
        const dur     = extractWithFallbacks(LI_SEL.experience.duration, e => e.textContent?.trim(), [el]);
        return (title || company) ? { title, company, duration: dur, isCurrent: !dur || /present/i.test(dur || '') } : null;
      });

      const education = extractMultipleItems(LI_SEL.education.container, LI_SEL.education.items, (el) => {
        const school = extractWithFallbacks(LI_SEL.education.school, e => e.textContent?.trim(), [el]);
        const degree = extractWithFallbacks(LI_SEL.education.degree, e => e.textContent?.trim(), [el]);
        const field  = extractWithFallbacks(LI_SEL.education.field,  e => e.textContent?.trim(), [el]);
        return (school || degree) ? { school, degree, field } : null;
      });

      const skills = extractMultipleItems(LI_SEL.skills.container, LI_SEL.skills.items).slice(0, 20);

      const certifications = extractMultipleItems(LI_SEL.certifications.container, LI_SEL.certifications.items, (el) => {
        const n = extractWithFallbacks(LI_SEL.certifications.name, e => e.textContent?.trim(), [el]);
        return n ? { name: n, issuer: extractWithFallbacks(LI_SEL.certifications.issuer, e => e.textContent?.trim(), [el]) } : null;
      });

      const publications = extractMultipleItems(LI_SEL.publications.container, LI_SEL.publications.items, (el) => {
        const t = extractWithFallbacks(LI_SEL.publications.title, e => e.textContent?.trim(), [el]);
        return t ? { title: t, publisher: extractWithFallbacks(LI_SEL.publications.publisher, e => e.textContent?.trim(), [el]) } : null;
      });

      const languages = extractMultipleItems(LI_SEL.languages.container, LI_SEL.languages.items, (el) => {
        const n = extractWithFallbacks(LI_SEL.languages.name, e => e.textContent?.trim(), [el]);
        return n ? { name: n, proficiency: extractWithFallbacks(LI_SEL.languages.proficiency, e => e.textContent?.trim(), [el]) } : null;
      });

      const connectionsText = extractWithFallbacks(LI_SEL.connections.count);
      const currentCompany = experience.find(e => e.isCurrent)?.company || '';

      data.people.push({
        name, headline, location: loc, about: (about || '').substring(0, 2000),
        currentCompany, currentTitle: experience.find(e => e.isCurrent)?.title || headline,
        linkedinUrl: location.href, experience, education, skills,
        certifications, publications, languages,
        connections: parseCount(connectionsText), source: 'linkedin',
      });

      if (currentCompany) data.accounts.push({ name: currentCompany, source: 'linkedin_profile' });
      // Add all past companies as weak account signals
      for (const exp of experience) {
        if (exp.company && exp.company !== currentCompany) {
          data.accounts.push({ name: exp.company, source: 'linkedin_experience' });
        }
      }
    }

    // ── Company page (/company/xxx) ──────────────────────────────────
    if (path.startsWith('/company/')) {
      const name         = extractWithFallbacks(LI_SEL.company.name);
      const industry     = extractWithFallbacks(LI_SEL.company.industry);
      const description  = extractWithFallbacks(LI_SEL.company.description);
      const size         = extractWithFallbacks(LI_SEL.company.size);
      const website      = extractWithFallbacks(LI_SEL.company.website, el => el.getAttribute('href'));
      const headquarters = extractWithFallbacks(LI_SEL.company.headquarters);
      const specialties  = txts('.org-about-us-organization-description__specialties .org-about-module__specialties-element');

      data.accounts.push({
        name, industry, about: (description || '').substring(0, 2000), headquarters,
        website, employeeCount: size, specialties, linkedinUrl: location.href, source: 'linkedin_company',
      });

      data.technologies = specialties.filter(s => /saas|api|cloud|platform|software|ai|ml|data|analytics/i.test(s));
    }

    // ── Sales Navigator (/sales/) ────────────────────────────────────
    if (path.includes('/sales/')) {
      const name    = extractWithFallbacks(LI_SEL.salesNav.name);
      const title   = extractWithFallbacks(LI_SEL.salesNav.title);
      const company = extractWithFallbacks(LI_SEL.salesNav.company);

      if (name) data.people.push({ name, headline: title, currentCompany: company, source: 'sales_navigator', linkedinUrl: location.href });
      if (company) data.accounts.push({ name: company, source: 'sales_navigator' });
    }

    return data;
  }


  // ═══════════════════════════════════════════════════════════════════════
  //  SALESFORCE EXTRACTOR
  // ═══════════════════════════════════════════════════════════════════════

  function extractSalesforce() {
    const data = { people: [], accounts: [], technologies: [], signals: [] };

    const fields = {};
    document.querySelectorAll('records-record-layout-item, lightning-output-field').forEach(el => {
      const label = (el.querySelector('.slds-form-element__label') || {}).innerText?.trim();
      const value = (el.querySelector('.slds-form-element__static, lightning-formatted-text, lightning-formatted-url, lightning-formatted-email') || {}).innerText?.trim();
      if (label && value) fields[label] = value;
    });

    const recordName = txt('lightning-formatted-name') || txt('.slds-page-header__title') || txt('h1.slds-page-header__title');

    if (fields['Account Name'] || fields['Company'] || fields['Website']) {
      data.accounts.push({
        name: fields['Account Name'] || fields['Company'] || recordName,
        website: fields['Website'] || '', industry: fields['Industry'] || '',
        employees: fields['Employees'] || fields['Number of Employees'] || '',
        revenue: fields['Annual Revenue'] || '', type: fields['Type'] || '', source: 'salesforce',
      });
    }

    if (fields['Name'] || fields['Full Name'] || fields['Title']) {
      data.people.push({
        name: fields['Name'] || fields['Full Name'] || recordName,
        title: fields['Title'] || '', email: fields['Email'] || '',
        currentCompany: fields['Account Name'] || fields['Company'] || '', source: 'salesforce',
      });
      if (fields['Account Name'] || fields['Company']) {
        data.accounts.push({ name: fields['Account Name'] || fields['Company'], source: 'salesforce_contact' });
      }
    }

    const body = (document.body?.innerText || '').substring(0, 5000);
    if (/churn|at risk|downgrade/i.test(body)) data.signals.push({ text: 'Churn / at-risk signal detected', source: 'salesforce' });
    if (/expand|upsell|upgrade/i.test(body))   data.signals.push({ text: 'Expansion / upsell signal detected', source: 'salesforce' });
    if (/renew/i.test(body))                    data.signals.push({ text: 'Renewal upcoming', source: 'salesforce' });

    return data;
  }


  // ═══════════════════════════════════════════════════════════════════════
  //  HUBSPOT / OUTREACH / COMMON ROOM / GENERIC EXTRACTORS
  // ═══════════════════════════════════════════════════════════════════════

  function extractHubSpot() {
    const data = { people: [], accounts: [], technologies: [], signals: [] };
    const cn = txt('[data-test-id="company-name"]') || txt('.company-name');
    if (cn) data.accounts.push({ name: cn, website: txt('[data-test-id="company-domain"]') || '', industry: txt('[data-test-id="industry"]') || '', source: 'hubspot' });
    const pn = txt('[data-test-id="contact-name"]') || txt('.contact-name');
    if (pn) data.people.push({ name: pn, email: txt('[data-test-id="email"]') || '', title: txt('[data-test-id="jobtitle"]') || '', currentCompany: cn || '', source: 'hubspot' });
    return data;
  }

  function extractOutreach() {
    const data = { people: [], accounts: [], technologies: [], signals: [] };
    const name = txt('[data-testid="prospect-name"]') || txt('h1');
    const company = txt('[data-testid="prospect-company"]') || '';
    if (name) data.people.push({ name, headline: txt('[data-testid="prospect-title"]') || '', currentCompany: company, email: txt('[data-testid="prospect-email"]') || '', source: 'outreach' });
    if (company) data.accounts.push({ name: company, source: 'outreach' });
    return data;
  }

  function extractCommonRoom() {
    const data = { people: [], accounts: [], technologies: [], signals: [] };
    const name = txt('[data-testid="member-name"]') || txt('h1');
    const company = txt('[data-testid="member-organization"]') || '';
    if (name) data.people.push({ name, headline: txt('[data-testid="member-title"]') || '', currentCompany: company, source: 'commonroom' });
    if (company) data.accounts.push({ name: company, source: 'commonroom' });
    data.signals = txts('[data-testid="activity-description"]').slice(0, 10).map(a => ({ text: a, source: 'commonroom' }));
    return data;
  }

  function extractGenericWebsite() {
    const data = { people: [], accounts: [], technologies: [], signals: [] };
    const siteName = getMeta('og:site_name') || getMeta('application-name') || '';
    const description = getMeta('og:description') || getMeta('description') || '';

    data.accounts.push({
      name: siteName || undefined, domain: location.hostname, url: location.origin,
      description: description.substring(0, 500), source: 'website',
    });

    // Detect technologies from HTML source
    const html = document.documentElement.outerHTML.substring(0, 60000);
    const techPatterns = [
      [/next\.js|__next|_next\/static/i, 'Next.js'], [/react/i, 'React'], [/vue\.js|__vue/i, 'Vue.js'],
      [/angular/i, 'Angular'], [/svelte/i, 'Svelte'], [/wordpress|wp-content|wp-includes/i, 'WordPress'],
      [/drupal/i, 'Drupal'], [/contentful/i, 'Contentful'], [/sanity\.io|sanity-client/i, 'Sanity'],
      [/shopify/i, 'Shopify'], [/woocommerce/i, 'WooCommerce'], [/magento/i, 'Magento'],
      [/bigcommerce/i, 'BigCommerce'], [/salesforce/i, 'Salesforce'], [/hubspot/i, 'HubSpot'],
      [/marketo/i, 'Marketo'], [/segment\.com|analytics\.js/i, 'Segment'],
      [/google-analytics|gtag|GA4/i, 'Google Analytics'], [/hotjar/i, 'Hotjar'],
      [/amplitude/i, 'Amplitude'], [/mixpanel/i, 'Mixpanel'], [/intercom/i, 'Intercom'],
      [/drift\.com/i, 'Drift'], [/zendesk/i, 'Zendesk'], [/cloudflare/i, 'Cloudflare'],
      [/vercel/i, 'Vercel'], [/netlify/i, 'Netlify'], [/aws\.amazon|amazonaws/i, 'AWS'],
      [/azure/i, 'Azure'], [/stripe/i, 'Stripe'], [/twilio/i, 'Twilio'],
      [/algolia/i, 'Algolia'], [/elasticsearch/i, 'Elasticsearch'], [/datadog/i, 'Datadog'],
      [/pendo/i, 'Pendo'], [/optimizely/i, 'Optimizely'], [/launchdarkly/i, 'LaunchDarkly'],
      [/sitecore/i, 'Sitecore'], [/aem|adobe experience/i, 'Adobe Experience Manager'],
      [/episerver|optimizely cms/i, 'Optimizely CMS'], [/kentico/i, 'Kentico'],
      [/umbraco/i, 'Umbraco'], [/gatsby/i, 'Gatsby'], [/nuxt/i, 'Nuxt'],
      [/tailwind/i, 'Tailwind CSS'], [/bootstrap/i, 'Bootstrap'], [/jquery/i, 'jQuery'],
    ];
    const detected = new Set();
    for (const [p, n] of techPatterns) { if (p.test(html)) detected.add(n); }
    data.technologies = Array.from(detected);

    return data;
  }


  // ═══════════════════════════════════════════════════════════════════════
  //  MAIN EXTRACTOR
  // ═══════════════════════════════════════════════════════════════════════

  function extract() {
    const source = detectSource();
    let siteData;

    switch (source) {
      case 'linkedin':   siteData = extractLinkedIn(); break;
      case 'salesforce': siteData = extractSalesforce(); break;
      case 'hubspot':    siteData = extractHubSpot(); break;
      case 'outreach':   siteData = extractOutreach(); break;
      case 'commonroom': siteData = extractCommonRoom(); break;
      default:           siteData = extractGenericWebsite(); break;
    }

    // Always run tech detection (even on non-website sources)
    if (source !== 'website') {
      const generic = extractGenericWebsite();
      siteData.technologies = Array.from(new Set([...(siteData.technologies || []), ...(generic.technologies || [])]));
    }

    return {
      url: location.href,
      title: document.title,
      source,
      capturedAt: new Date().toISOString(),
      ...siteData,
      metadata: {
        ogTitle: getMeta('og:title'), ogDescription: getMeta('og:description'),
        ogImage: getMeta('og:image'), ogSiteName: getMeta('og:site_name'),
        description: getMeta('description'), keywords: getMeta('keywords'),
        canonical: (document.querySelector('link[rel="canonical"]') || {}).href || '',
      },
      rawText: (document.body?.innerText || '').substring(0, 15000),
    };
  }

  // Expose for popup
  window.__moltExtract = extract;
})();
