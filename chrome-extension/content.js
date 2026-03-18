/**
 * Rabbit – Content Script
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
  function capturePageContext() {
    return {
      source: 'chrome_extension',
      domain: window.location.hostname || '',
      url: window.location.href || '',
      title: document.title || '',
      timestamp: new Date().toISOString(),
    };
  }
  function inferCompanyNameFromDomain(domain) {
    const base = String(domain || '').replace(/^www\./i, '').split('.')[0] || '';
    if (!base) return '';
    return base.charAt(0).toUpperCase() + base.slice(1);
  }
  function inferCompanyName(pageContext = capturePageContext()) {
    const metaSiteName = getMeta('og:site_name') || getMeta('application-name');
    if (metaSiteName) return metaSiteName;

    const titleRoot = String(document.title || '')
      .split(/\s+[\|\-–—]\s+/)
      .map(part => part.trim())
      .find(Boolean);
    if (titleRoot) return titleRoot;

    return inferCompanyNameFromDomain(pageContext.domain);
  }
  function buildInteractionPayload(extracted) {
    const pageContext = capturePageContext();
    const accountName = (extracted?.accounts || []).find(account => account?.name)?.name
      || (extracted?.people || []).find(person => person?.currentCompany)?.currentCompany
      || inferCompanyName(pageContext);
    const payload = {
      _type: 'interaction',
      source: 'chrome_extension',
      domain: pageContext.domain,
      url: pageContext.url,
      title: pageContext.title,
      companyName: accountName || inferCompanyNameFromDomain(pageContext.domain),
      timestamp: pageContext.timestamp,
    };

    if (!payload.domain) {
      console.warn('[Rabbit] Interaction skipped: missing domain');
      return null;
    }

    console.log('[Rabbit] Chrome Extension Interaction:', payload);
    return payload;
  }
  function fieldValueByLabels(fields, labels) {
    for (const label of labels) {
      if (fields[label]) return fields[label];
    }
    return '';
  }
  function collectInlineSignals(text, patterns, source) {
    const lower = String(text || '').toLowerCase();
    return patterns
      .filter(({ regex }) => regex.test(lower))
      .map(({ text: signalText }) => ({ text: signalText, source }));
  }

  function extractEmails(text) {
    return [...new Set((String(text || '').match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || []).slice(0, 25))];
  }

  function extractPhones(text) {
    return [...new Set((String(text || '').match(/(?:\+?\d[\d\s().-]{7,}\d)/g) || []).map(v => v.trim()).slice(0, 20))];
  }

  function simpleHash(text) {
    const input = String(text || '');
    let hash = 0;
    for (let i = 0; i < input.length; i += 1) {
      hash = ((hash << 5) - hash) + input.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash).toString(16);
  }


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
    const accountName = fieldValueByLabels(fields, ['Account Name', 'Company', 'Account', 'Parent Account']);
    const website = fieldValueByLabels(fields, ['Website', 'Domain']);
    const industry = fieldValueByLabels(fields, ['Industry']);
    const stage = fieldValueByLabels(fields, ['Stage', 'Stage Name', 'Lifecycle Stage']);
    const owner = fieldValueByLabels(fields, ['Owner', 'Account Owner', 'Opportunity Owner']);
    const email = fieldValueByLabels(fields, ['Email']);
    const phone = fieldValueByLabels(fields, ['Phone', 'Mobile', 'Mobile Phone', 'Direct Phone']);

    if (accountName || website) {
      data.accounts.push({
        name: accountName || recordName,
        website: website || '',
        industry: industry || '',
        employees: fieldValueByLabels(fields, ['Employees', 'Number of Employees']) || '',
        revenue: fieldValueByLabels(fields, ['Annual Revenue']) || '',
        type: fieldValueByLabels(fields, ['Type']) || '',
        stage,
        owner,
        source: 'salesforce',
      });
    }

    if (fieldValueByLabels(fields, ['Name', 'Full Name']) || fieldValueByLabels(fields, ['Title', 'Job Title'])) {
      data.people.push({
        name: fieldValueByLabels(fields, ['Name', 'Full Name']) || recordName,
        title: fieldValueByLabels(fields, ['Title', 'Job Title']) || '',
        email: email || '',
        phone: phone || '',
        currentCompany: accountName || '',
        source: 'salesforce',
      });
      if (accountName) {
        data.accounts.push({ name: accountName, source: 'salesforce_contact' });
      }
    }

    const body = (document.body?.innerText || '').substring(0, 5000);
    data.signals.push(...collectInlineSignals(body, [
      { regex: /churn|at risk|downgrade/, text: 'Churn / at-risk signal detected' },
      { regex: /expand|upsell|upgrade/, text: 'Expansion / upsell signal detected' },
      { regex: /renew|renewal/, text: 'Renewal signal detected' },
      { regex: /champion|executive sponsor/, text: 'Internal champion language detected' },
      { regex: /legal|security review|procurement/, text: 'Buying process friction detected' },
    ], 'salesforce'));

    return data;
  }


  // ═══════════════════════════════════════════════════════════════════════
  //  HUBSPOT / OUTREACH / COMMON ROOM / GENERIC EXTRACTORS
  // ═══════════════════════════════════════════════════════════════════════

  function extractHubSpot() {
    const data = { people: [], accounts: [], technologies: [], signals: [] };
    const cn = txt('[data-test-id="company-name"]') || txt('.company-name');
    if (cn) data.accounts.push({
      name: cn,
      website: txt('[data-test-id="company-domain"]') || '',
      industry: txt('[data-test-id="industry"]') || '',
      owner: txt('[data-test-id="owner"]') || '',
      source: 'hubspot',
    });
    const pn = txt('[data-test-id="contact-name"]') || txt('.contact-name');
    if (pn) data.people.push({
      name: pn,
      email: txt('[data-test-id="email"]') || '',
      phone: txt('[data-test-id="phone"]') || '',
      title: txt('[data-test-id="jobtitle"]') || '',
      currentCompany: cn || '',
      source: 'hubspot',
    });
    data.signals.push(...collectInlineSignals(document.body?.innerText || '', [
      { regex: /meeting booked|open deal|demo requested/, text: 'HubSpot activity suggests active pipeline movement' },
      { regex: /high intent|hot lead|mql|sql/, text: 'HubSpot scoring language suggests high intent' },
    ], 'hubspot'));
    return data;
  }

  function extractOutreach() {
    const data = { people: [], accounts: [], technologies: [], signals: [] };
    const name = txt('[data-testid="prospect-name"]') || txt('h1');
    const company = txt('[data-testid="prospect-company"]') || '';
    const titleVal = txt('[data-testid="prospect-title"]') || '';
    if (name) data.people.push({
      name,
      headline: titleVal,
      title: titleVal,
      currentTitle: titleVal,
      currentCompany: company,
      email: txt('[data-testid="prospect-email"]') || '',
      phone: txt('[data-testid="prospect-phone"]') || '',
      source: 'outreach',
    });
    if (company) data.accounts.push({ name: company, source: 'outreach' });
    data.signals.push(...collectInlineSignals(document.body?.innerText || '', [
      { regex: /opened|clicked|replied|positive reply/, text: 'Outreach engagement signal detected' },
      { regex: /sequence|task due|next step/, text: 'Outreach suggests a live execution step is due' },
      { regex: /bounced|invalid email/, text: 'Outreach shows contact quality friction' },
    ], 'outreach'));
    return data;
  }

  function extractCommonRoom() {
    const data = { people: [], accounts: [], technologies: [], signals: [] };
    const name = txt('[data-testid="member-name"]') || txt('h1');
    const company = txt('[data-testid="member-organization"]') || '';
    if (name) data.people.push({
      name,
      headline: txt('[data-testid="member-title"]') || '',
      currentCompany: company,
      email: txt('[data-testid="member-email"]') || '',
      source: 'commonroom',
    });
    if (company) data.accounts.push({ name: company, source: 'commonroom' });
    data.signals = txts('[data-testid="activity-description"]').slice(0, 10).map(a => ({ text: a, source: 'commonroom' }));
    data.signals.push(...collectInlineSignals(document.body?.innerText || '', [
      { regex: /champion|power user|active community/, text: 'Common Room suggests a strong product champion signal' },
      { regex: /job change|new role|joined/, text: 'Common Room shows a recent persona change' },
    ], 'commonroom'));
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

  function buildPageContext() {
    const extracted = extract();
    const interaction = buildInteractionPayload(extracted);
    if (!interaction) return null;
    const visibleText = extracted.rawText || '';
    const headings = Array.from(document.querySelectorAll('h1, h2, h3'))
      .map(el => el.textContent?.trim())
      .filter(Boolean)
      .slice(0, 12);
    const links = Array.from(document.querySelectorAll('a[href]'))
      .map(el => ({ text: (el.textContent || '').trim(), href: el.href }))
      .filter(link => link.href && /^https?:/i.test(link.href))
      .slice(0, 25);

    const payload = {
      ...extracted,
      url: interaction.url,
      title: interaction.title,
      domain: interaction.domain,
      companyName: interaction.companyName,
      capturedAt: interaction.timestamp,
      captureSource: interaction.source,
      pageSource: extracted.source,
      interaction,
      headings,
      links,
      emails: extractEmails(visibleText),
      phones: extractPhones(visibleText),
      observedAt: interaction.timestamp,
    };
    payload.fingerprint = simpleHash([
      payload.url,
      payload.title,
      (payload.accounts || []).map(a => a.name || a.domain || '').join('|'),
      (payload.people || []).map(p => p.name || p.email || '').join('|'),
      payload.emails.join('|'),
      payload.phones.join('|'),
      visibleText.slice(0, 1500),
    ].join('||'));
    return payload;
  }

  let rabbitRoot = null;
  let rabbitShadow = null;
  let rabbitOpen = false;
  let rabbitLightboxOpen = false;
  let rabbitAskState = { loading: false, answer: '' };
  let rabbitIntel = null;
  let rabbitLearnIntel = null;
  const RABBIT_PANEL_ENABLED_KEY = 'grabbit.panel.enabled';
  let rabbitPanelEnabled = readRabbitPanelEnabled();

  function readRabbitPanelEnabled() {
    try {
      const value = window.localStorage.getItem(RABBIT_PANEL_ENABLED_KEY);
      return value == null ? true : value !== 'false';
    } catch {
      return true;
    }
  }

  function writeRabbitPanelEnabled(value) {
    rabbitPanelEnabled = !!value;
    try {
      window.localStorage.setItem(RABBIT_PANEL_ENABLED_KEY, rabbitPanelEnabled ? 'true' : 'false');
    } catch {}
  }

  function ensureRabbitOverlay() {
    if (rabbitRoot && rabbitShadow) return rabbitShadow;
    rabbitRoot = document.createElement('div');
    rabbitRoot.id = 'rabbit-extension-root';
    rabbitRoot.style.all = 'initial';
    rabbitRoot.style.position = 'fixed';
    rabbitRoot.style.top = '16px';
    rabbitRoot.style.right = '16px';
    rabbitRoot.style.zIndex = '2147483647';
    document.documentElement.appendChild(rabbitRoot);
    rabbitShadow = rabbitRoot.attachShadow({ mode: 'open' });
    renderRabbitOverlay();
    return rabbitShadow;
  }

  function renderRabbitOverlay() {
    const shadow = ensureRabbitOverlay();
    const opportunities = rabbitIntel?.opportunities || [];
    const contacts = rabbitIntel?.contacts || [];
    const connections = rabbitIntel?.connections || [];
    const nextActions = rabbitIntel?.nextActions || [];
    const recentLearnings = rabbitIntel?.recentLearnings || [];
    const account = rabbitIntel?.primaryAccount || null;
    const summary = rabbitIntel?.summary || 'Rabbit is watching this page.';
    const learnSummary = rabbitLearnIntel?.summary || '';
    const learnFields = rabbitLearnIntel?.mappedFields || [];
    const learnFindings = rabbitLearnIntel?.validationFindings || [];
    shadow.innerHTML = `
      <style>
        .rabbit-shell { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #e5e7eb; }
        .rabbit-pill { display:flex; align-items:center; gap:8px; background:#111827; border:1px solid #374151; border-radius:999px; padding:8px 12px; box-shadow:0 10px 30px rgba(0,0,0,.35); cursor:pointer; }
        .rabbit-pill strong { color:#fff; font-size:12px; }
        .rabbit-pill span { color:#fbbf24; font-size:11px; }
        .rabbit-pill-actions { margin-left:auto; display:flex; align-items:center; gap:6px; }
        .rabbit-pill button { background:transparent; color:#93c5fd; border:none; cursor:pointer; font-size:11px; }
        .rabbit-toggle-btn { border:1px solid #475569 !important; border-radius:999px; padding:4px 8px; color:${rabbitPanelEnabled ? '#86efac' : '#fca5a5'} !important; }
        .rabbit-panel { margin-top:8px; width:340px; max-height:70vh; overflow:auto; background:#0b1220; border:1px solid #334155; border-radius:16px; box-shadow:0 16px 50px rgba(0,0,0,.45); padding:14px; display:${rabbitOpen && rabbitPanelEnabled ? 'block' : 'none'}; }
        .rabbit-panel-header { display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:6px; }
        .rabbit-title { font-size:13px; font-weight:700; color:#fff; margin-bottom:6px; }
        .rabbit-panel-close { background:transparent; color:#94a3b8; border:1px solid #334155; border-radius:999px; padding:4px 8px; cursor:pointer; font-size:11px; }
        .rabbit-summary { font-size:12px; line-height:1.45; color:#cbd5e1; margin-bottom:10px; }
        .rabbit-section { margin-top:10px; }
        .rabbit-section h4 { margin:0 0 6px; font-size:11px; color:#93c5fd; text-transform:uppercase; letter-spacing:.05em; }
        .rabbit-list { margin:0; padding-left:16px; }
        .rabbit-list li { font-size:12px; color:#e2e8f0; margin-bottom:6px; }
        .rabbit-empty { font-size:12px; color:#94a3b8; }
        .rabbit-ask { margin-top:12px; display:flex; flex-direction:column; gap:8px; }
        .rabbit-ask textarea { width:100%; min-height:64px; resize:vertical; box-sizing:border-box; background:#111827; color:#fff; border:1px solid #334155; border-radius:10px; padding:10px; font:inherit; }
        .rabbit-ask button { background:#f8fafc; color:#020617; border:none; border-radius:10px; padding:10px; font-size:12px; font-weight:700; cursor:pointer; }
        .rabbit-answer { white-space:pre-wrap; font-size:12px; color:#dbeafe; background:#111827; border:1px solid #334155; border-radius:10px; padding:10px; }
        .rabbit-lightbox { position:fixed; inset:0; display:${rabbitLightboxOpen ? 'flex' : 'none'}; align-items:center; justify-content:center; background:rgba(2,6,23,.75); backdrop-filter: blur(8px); z-index:2147483647; }
        .rabbit-lightbox-card { width:min(1040px, calc(100vw - 48px)); max-height:calc(100vh - 48px); overflow:auto; background:#020617; border:1px solid #334155; border-radius:24px; box-shadow:0 20px 70px rgba(0,0,0,.55); padding:20px; }
        .rabbit-lightbox-header { display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:14px; }
        .rabbit-lightbox-title { font-size:18px; font-weight:800; color:#fff; }
        .rabbit-lightbox-close { background:#111827; color:#e2e8f0; border:1px solid #334155; border-radius:999px; padding:8px 12px; cursor:pointer; }
        .rabbit-grid { display:grid; grid-template-columns: 1.2fr 1fr; gap:16px; }
        .rabbit-card { background:#0f172a; border:1px solid #1e293b; border-radius:16px; padding:14px; }
        .rabbit-card h3 { margin:0 0 8px; font-size:12px; text-transform:uppercase; letter-spacing:.05em; color:#93c5fd; }
        .rabbit-meta { font-size:12px; color:#cbd5e1; line-height:1.5; }
        .rabbit-chip-row { display:flex; flex-wrap:wrap; gap:8px; margin-top:8px; }
        .rabbit-chip { background:#111827; color:#e2e8f0; border:1px solid #334155; border-radius:999px; padding:6px 10px; font-size:11px; }
        @media (max-width: 860px) {
          .rabbit-grid { grid-template-columns: 1fr; }
        }
      </style>
      <div class="rabbit-shell">
        <div class="rabbit-pill" id="rabbit-pill">
          <strong>Rabbit</strong>
          <span>${opportunities.length > 0 ? `${opportunities.length} opportunity${opportunities.length === 1 ? '' : 'ies'}` : 'watching'}</span>
          <div class="rabbit-pill-actions">
            <button id="rabbit-toggle-btn" class="rabbit-toggle-btn" title="Toggle Grabbit hover bubble">${rabbitPanelEnabled ? 'Bubble On' : 'Bubble Off'}</button>
            <button id="rabbit-expand-btn" title="Open Rabbit Workspace">Open</button>
          </div>
        </div>
        <div class="rabbit-panel">
          <div class="rabbit-panel-header">
            <div class="rabbit-title">On this page, I noticed:</div>
            <button id="rabbit-panel-close" class="rabbit-panel-close" title="Hide bubble">Hide</button>
          </div>
          <div class="rabbit-summary">${escapeHtml(summary)}</div>

          <div class="rabbit-section">
            <h4>Opportunities</h4>
            ${opportunities.length ? `<ul class="rabbit-list">${opportunities.slice(0, 6).map(item => `<li>${escapeHtml(item.title || item)}</li>`).join('')}</ul>` : '<div class="rabbit-empty">No high-confidence opportunity yet.</div>'}
          </div>

          <div class="rabbit-section">
            <h4>Contacts</h4>
            ${contacts.length ? `<ul class="rabbit-list">${contacts.slice(0, 6).map(item => `<li>${escapeHtml(item.label || item.value || item)}</li>`).join('')}</ul>` : '<div class="rabbit-empty">No emails or phone numbers surfaced yet.</div>'}
          </div>

          <div class="rabbit-section">
            <h4>Connections</h4>
            ${connections.length ? `<ul class="rabbit-list">${connections.slice(0, 4).map(item => `<li>${escapeHtml(item.name)}${item.title ? ` — ${escapeHtml(item.title)}` : ''}</li>`).join('')}</ul>` : '<div class="rabbit-empty">No known relationship surfaced yet.</div>'}
          </div>

          <div class="rabbit-section">
            <h4>Next Moves</h4>
            ${nextActions.length ? `<ul class="rabbit-list">${nextActions.slice(0, 4).map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>` : '<div class="rabbit-empty">Rabbit has not recommended a move yet.</div>'}
          </div>

          ${rabbitLearnIntel ? `
            <div class="rabbit-section">
              <h4>Learn Mode</h4>
              <div class="rabbit-summary">${escapeHtml(learnSummary || 'Rabbit is mapping this app structure and merging it into a consensus model.')}</div>
              ${learnFields.length ? `<ul class="rabbit-list">${learnFields.slice(0, 5).map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>` : '<div class="rabbit-empty">No mapped fields yet.</div>'}
              ${learnFindings.length ? `<ul class="rabbit-list">${learnFindings.slice(0, 3).map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>` : ''}
            </div>
          ` : ''}

          <div class="rabbit-ask">
            <textarea id="rabbit-ask-input" placeholder="Ask Rabbit about this page, account, person, or next move..."></textarea>
            <button id="rabbit-ask-btn">${rabbitAskState.loading ? 'Thinking...' : 'Ask Rabbit'}</button>
            ${rabbitAskState.answer ? `<div class="rabbit-answer">${escapeHtml(rabbitAskState.answer)}</div>` : ''}
          </div>
        </div>

        <div class="rabbit-lightbox" id="rabbit-lightbox">
          <div class="rabbit-lightbox-card">
            <div class="rabbit-lightbox-header">
              <div>
                <div class="rabbit-lightbox-title">Rabbit Workspace</div>
                <div class="rabbit-summary">${escapeHtml(summary)}</div>
              </div>
              <button class="rabbit-lightbox-close" id="rabbit-lightbox-close">Close</button>
            </div>
            <div class="rabbit-grid">
              <div class="rabbit-card">
                <h3>Account</h3>
                <div class="rabbit-meta">
                  ${account ? `
                    <div><strong>${escapeHtml(account.companyName || account.name || account.domain || 'Unknown account')}</strong></div>
                    <div>Domain: ${escapeHtml(account.domain || account.rootDomain || 'Unknown')}</div>
                    <div>Opportunity: ${escapeHtml(account.opportunityScore ?? 'unknown')}</div>
                    <div>Completeness: ${escapeHtml(account.profileCompleteness?.score ?? 'unknown')}%</div>
                  ` : 'No account matched yet.'}
                </div>
                ${(account?.profileCompleteness?.gaps || []).length ? `<div class="rabbit-chip-row">${account.profileCompleteness.gaps.slice(0, 8).map(item => `<span class="rabbit-chip">${escapeHtml(item)}</span>`).join('')}</div>` : ''}
              </div>
              <div class="rabbit-card">
                <h3>Warm Paths</h3>
                ${connections.length ? `<ul class="rabbit-list">${connections.slice(0, 6).map(item => `<li>${escapeHtml(item.name)}${item.title ? ` — ${escapeHtml(item.title)}` : ''}</li>`).join('')}</ul>` : '<div class="rabbit-empty">No warm path found yet.</div>'}
              </div>
              <div class="rabbit-card">
                <h3>Opportunities</h3>
                ${opportunities.length ? `<ul class="rabbit-list">${opportunities.slice(0, 8).map(item => `<li>${escapeHtml(item.title || item)}</li>`).join('')}</ul>` : '<div class="rabbit-empty">No high-confidence opportunity yet.</div>'}
              </div>
              <div class="rabbit-card">
                <h3>Contacts</h3>
                ${contacts.length ? `<ul class="rabbit-list">${contacts.slice(0, 8).map(item => `<li>${escapeHtml(item.label || item.value || item)}</li>`).join('')}</ul>` : '<div class="rabbit-empty">No contact details found yet.</div>'}
              </div>
              <div class="rabbit-card">
                <h3>Learnings</h3>
                ${recentLearnings.length ? `<ul class="rabbit-list">${recentLearnings.slice(0, 5).map(item => `<li>${escapeHtml(item.title || item.summary || 'Learning')}</li>`).join('')}</ul>` : '<div class="rabbit-empty">No reusable learnings tied to this account yet.</div>'}
              </div>
              <div class="rabbit-card">
                <h3>Learn Mode</h3>
                ${rabbitLearnIntel ? `
                  <div class="rabbit-meta">${escapeHtml(learnSummary || 'Learn Mode is active for this app.')}</div>
                  ${learnFields.length ? `<div class="rabbit-chip-row">${learnFields.slice(0, 10).map(item => `<span class="rabbit-chip">${escapeHtml(item)}</span>`).join('')}</div>` : ''}
                  ${learnFindings.length ? `<ul class="rabbit-list">${learnFindings.slice(0, 5).map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>` : '<div class="rabbit-empty">No validation issues surfaced yet.</div>'}
                ` : '<div class="rabbit-empty">Learn Mode is not active on this page.</div>'}
              </div>
              <div class="rabbit-card">
                <h3>Next Moves</h3>
                ${nextActions.length ? `<ul class="rabbit-list">${nextActions.slice(0, 8).map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>` : '<div class="rabbit-empty">Rabbit has not recommended a move yet.</div>'}
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    shadow.getElementById('rabbit-pill')?.addEventListener('click', () => {
      if (!rabbitPanelEnabled) return;
      rabbitOpen = !rabbitOpen;
      renderRabbitOverlay();
    });
    shadow.getElementById('rabbit-toggle-btn')?.addEventListener('click', (event) => {
      event.stopPropagation();
      writeRabbitPanelEnabled(!rabbitPanelEnabled);
      if (!rabbitPanelEnabled) {
        rabbitOpen = false;
      }
      renderRabbitOverlay();
    });
    shadow.getElementById('rabbit-expand-btn')?.addEventListener('click', (event) => {
      event.stopPropagation();
      rabbitLightboxOpen = true;
      rabbitOpen = rabbitPanelEnabled;
      renderRabbitOverlay();
    });
    shadow.getElementById('rabbit-panel-close')?.addEventListener('click', (event) => {
      event.stopPropagation();
      writeRabbitPanelEnabled(false);
      rabbitOpen = false;
      renderRabbitOverlay();
    });
    shadow.getElementById('rabbit-lightbox-close')?.addEventListener('click', () => {
      rabbitLightboxOpen = false;
      renderRabbitOverlay();
    });
    shadow.getElementById('rabbit-lightbox')?.addEventListener('click', (event) => {
      if (event.target?.id === 'rabbit-lightbox') {
        rabbitLightboxOpen = false;
        renderRabbitOverlay();
      }
    });

    shadow.getElementById('rabbit-ask-btn')?.addEventListener('click', async () => {
      const input = shadow.getElementById('rabbit-ask-input');
      const prompt = input?.value?.trim();
      if (!prompt || rabbitAskState.loading) return;
      rabbitAskState = { loading: true, answer: '' };
      renderRabbitOverlay();
      try {
        const page = buildPageContext();
        const response = await chrome.runtime.sendMessage({ type: 'rabbit:ask', payload: { prompt, page } });
        rabbitAskState = { loading: false, answer: response?.data?.answer || 'Rabbit did not return an answer.' };
      } catch (error) {
        rabbitAskState = { loading: false, answer: `Rabbit error: ${error.message}` };
      }
      rabbitOpen = true;
      renderRabbitOverlay();
    });
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function publishPageContext() {
    const payload = buildPageContext();
    if (!payload) return;
    chrome.runtime.sendMessage({ type: 'rabbit:pageContext', payload }).catch(() => {});
  }

  let publishTimer = null;
  function schedulePublish() {
    if (publishTimer) clearTimeout(publishTimer);
    publishTimer = setTimeout(() => {
      publishTimer = null;
      publishPageContext();
    }, 900);
  }

  function installNavigationWatchers() {
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;
    history.pushState = function () {
      const result = originalPushState.apply(this, arguments);
      schedulePublish();
      return result;
    };
    history.replaceState = function () {
      const result = originalReplaceState.apply(this, arguments);
      schedulePublish();
      return result;
    };
    window.addEventListener('popstate', schedulePublish);
    window.addEventListener('hashchange', schedulePublish);
  }

  function installMutationWatcher() {
    const observer = new MutationObserver(() => schedulePublish());
    observer.observe(document.documentElement, {
      subtree: true,
      childList: true,
      characterData: false,
      attributes: false,
    });
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === 'rabbit:intel') {
      rabbitIntel = message.intel || null;
      if (rabbitIntel && rabbitPanelEnabled) {
        rabbitOpen = rabbitOpen || (rabbitIntel.opportunities || []).length > 0;
      }
      renderRabbitOverlay();
    }
    if (message?.type === 'rabbit:learnIntel') {
      rabbitLearnIntel = message.learnIntel || null;
      renderRabbitOverlay();
    }
  });

  // Expose for popup and background
  window.__moltExtract = extract;
  window.__rabbitBuildPageContext = buildPageContext;

  ensureRabbitOverlay();
  installNavigationWatchers();
  installMutationWatcher();
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    schedulePublish();
  } else {
    window.addEventListener('DOMContentLoaded', schedulePublish, { once: true });
  }
})();
