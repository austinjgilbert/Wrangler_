/**
 * Wrangler – Content Script (v2)
 *
 * DOM extractors (unchanged from v1) + Wrangler overlay panel.
 *
 * Supported sites:
 *   - LinkedIn  (profiles, company pages, Sales Navigator)
 *   - Salesforce  (Lightning record pages)
 *   - HubSpot  (contact/company records)
 *   - Outreach  (prospect views)
 *   - Common Room  (member profiles)
 *   - Gong / Apollo / ZoomInfo / 6sense
 *   - Generic website  (meta, OG, tech detection)
 *
 * Security invariants (per extension-v2-security-review):
 *   - NO authenticated fetch() calls — all API calls go through background.js
 *   - NO window.* globals exposed to host page
 *   - Shadow DOM mode: closed (host page cannot read overlay content)
 *   - All dynamic content uses escapeHtml() — no raw innerHTML
 *   - Panel state in chrome.storage.local, not localStorage
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
      .split(/\s+[|\-–—]\s+/)
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

    if (!payload.domain) return null;
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
      for (const exp of experience) {
        if (exp.company && exp.company !== currentCompany) {
          data.accounts.push({ name: exp.company, source: 'linkedin_experience' });
        }
      }
    }

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


  // ═══════════════════════════════════════════════════════════════════════
  //  WRANGLER OVERLAY (v2)
  //
  //  Replaces the old Rabbit overlay. Key differences:
  //  - Closed shadow DOM (E3: host page cannot read overlay content)
  //  - No window globals (E5: extraction not exposed to page)
  //  - All dynamic content uses escapeHtml (E2: no XSS)
  //  - Edge-snap drag (not free positioning)
  //  - 3 states: pill → compact → expanded
  // ═══════════════════════════════════════════════════════════════════════

  // Module-scoped state (not accessible from host page)
  let overlayRoot = null;
  let shadow = null;
  let overlayState = 'pill'; // 'pill' | 'compact' | 'expanded' | 'hidden'
  let dockedSide = 'right';  // 'left' | 'right'
  let overlayY = 16;         // px from top
  let isDragging = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let dragStartLeft = 0;
  let dragStartTop = 0;
  let currentIntel = null;
  let captureEnabled = true;
  let overlayEnabled = true;

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatRelativeTime(dateStr) {
    if (!dateStr) return '';
    try {
      const diff = Date.now() - new Date(dateStr).getTime();
      const mins = Math.floor(diff / 60000);
      if (mins < 1) return 'Just now';
      if (mins < 60) return `${mins}m ago`;
      const hours = Math.floor(mins / 60);
      if (hours < 24) return `${hours}h ago`;
      const days = Math.floor(hours / 24);
      if (days < 7) return `${days}d ago`;
      const weeks = Math.floor(days / 7);
      return `${weeks}w ago`;
    } catch {
      return '';
    }
  }

  function humanizeCoverage(status) {
    const map = {
      covered: '✓ Complete',
      complete: '✓ Complete',
      missing: '○ Needs Research',
      needs_research: '○ Needs Research',
      partial: '◐ Partial',
      in_progress: '◐ In Progress',
    };
    return map[status] || status || 'Unknown';
  }

  function getStatusDot(intel) {
    if (!intel) return 'loading';
    if (intel.error) return 'error';
    if (intel.primaryAccount) return 'matched';
    if (intel.opportunities?.length) return 'partial';
    return 'none';
  }

  function getPillText(intel) {
    if (!intel) return 'Checking\u2026';
    if (intel.error) return 'Offline';
    const account = intel.primaryAccount;
    if (account) {
      const name = account.companyName || account.name || account.domain || '';
      return name.length > 16 ? name.slice(0, 15) + '\u2026' : name;
    }
    return 'New company?';
  }

  function getPillScore(intel) {
    if (!intel?.primaryAccount) return '';
    const score = intel.primaryAccount.opportunityScore;
    return score != null ? String(score) : '';
  }

  // ─── Overlay CSS ───────────────────────────────────────────────────────

  const OVERLAY_CSS = `
    :host {
      all: initial;
      position: fixed;
      z-index: 2147483647;
      pointer-events: none;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      -webkit-font-smoothing: antialiased;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }

    .wrangler-overlay {
      pointer-events: auto;
      position: fixed;
      transition: top 0.2s ease-out;
    }

    .wrangler-overlay[data-state="hidden"] { display: none; }

    /* ─── Pill ─────────────────────────────────────────────────── */

    .wrangler-pill {
      display: none;
      align-items: center;
      gap: 8px;
      padding: 8px 14px;
      background: #0f172a;
      border: 1px solid rgba(148, 163, 184, 0.2);
      border-radius: 18px;
      box-shadow: 0 2px 12px rgba(0,0,0,0.4), 0 0 0 1px rgba(148,163,184,0.15);
      cursor: pointer;
      user-select: none;
      opacity: 0.85;
      transition: opacity 0.15s, transform 0.15s;
      min-width: 120px;
      max-width: 240px;
      height: 36px;
    }
    .wrangler-pill:hover { opacity: 1; }
    [data-state="pill"] .wrangler-pill { display: flex; }

    .wrangler-icon { font-size: 14px; flex-shrink: 0; }
    .wrangler-pill-name {
      font-size: 12px;
      font-weight: 600;
      color: #f1f5f9;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .wrangler-pill-dot {
      width: 8px; height: 8px;
      border-radius: 50%;
      flex-shrink: 0;
    }
    .wrangler-pill-dot[data-status="matched"]  { background: #22c55e; }
    .wrangler-pill-dot[data-status="partial"]  { background: #f59e0b; }
    .wrangler-pill-dot[data-status="none"]     { background: #6b7280; }
    .wrangler-pill-dot[data-status="error"]    { background: #ef4444; }
    .wrangler-pill-dot[data-status="loading"]  {
      background: #94a3b8;
      animation: wrangler-pulse 2s ease-in-out infinite;
    }
    @keyframes wrangler-pulse {
      0%, 100% { transform: scale(1); opacity: 0.7; }
      50% { transform: scale(1.3); opacity: 1; }
    }
    .wrangler-pill-score {
      font-size: 11px;
      font-weight: 600;
      color: #f59e0b;
      margin-left: auto;
    }

    /* ─── Compact ──────────────────────────────────────────────── */

    .wrangler-compact {
      display: none;
      flex-direction: column;
      width: 320px;
      background: #0f172a;
      border: 1px solid rgba(148, 163, 184, 0.2);
      border-radius: 12px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.5), 0 0 0 1px rgba(148,163,184,0.2);
      overflow: hidden;
      opacity: 0.95;
      transition: opacity 0.15s;
    }
    .wrangler-compact:hover { opacity: 1; }
    [data-state="compact"] .wrangler-compact { display: flex; }

    .wrangler-compact-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 14px;
      cursor: grab;
      user-select: none;
      border-bottom: 1px solid rgba(148, 163, 184, 0.1);
    }
    .wrangler-compact-header:active { cursor: grabbing; }

    .wrangler-compact-header .wrangler-icon { font-size: 14px; }
    .wrangler-company-name {
      font-size: 14px;
      font-weight: 600;
      color: #f1f5f9;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      flex: 1;
      margin: 0 8px;
    }
    .wrangler-collapse-btn {
      background: none;
      border: none;
      color: #94a3b8;
      font-size: 14px;
      cursor: pointer;
      padding: 2px 4px;
      border-radius: 4px;
    }
    .wrangler-collapse-btn:hover { color: #f1f5f9; background: rgba(148,163,184,0.1); }

    .wrangler-compact-info {
      padding: 10px 14px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .wrangler-info-row {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 12px;
      color: #94a3b8;
    }
    .wrangler-info-value { color: #f1f5f9; font-weight: 500; }

    .wrangler-compact-actions {
      padding: 10px 14px;
      display: flex;
      gap: 8px;
      border-top: 1px solid rgba(148, 163, 184, 0.1);
    }

    /* ─── Expanded ─────────────────────────────────────────────── */

    .wrangler-expanded {
      display: none;
      flex-direction: column;
      width: 360px;
      max-height: 520px;
      background: #0f172a;
      border: 1px solid rgba(148, 163, 184, 0.2);
      border-radius: 12px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.5), 0 0 0 1px rgba(148,163,184,0.2);
      overflow: hidden;
    }
    [data-state="expanded"] .wrangler-expanded { display: flex; }

    .wrangler-expanded-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      padding: 14px;
      cursor: grab;
      user-select: none;
      border-bottom: 1px solid rgba(148, 163, 184, 0.1);
      flex-shrink: 0;
    }
    .wrangler-expanded-header:active { cursor: grabbing; }

    .wrangler-expanded-title { flex: 1; min-width: 0; }
    .wrangler-expanded-title .wrangler-company-name {
      font-size: 15px;
      display: block;
      margin: 0;
    }
    .wrangler-company-meta {
      font-size: 11px;
      color: #64748b;
      margin-top: 2px;
    }
    .wrangler-expanded-controls {
      display: flex;
      gap: 4px;
      flex-shrink: 0;
      margin-left: 8px;
    }
    .wrangler-ctrl-btn {
      background: none;
      border: 1px solid rgba(148, 163, 184, 0.15);
      color: #94a3b8;
      width: 28px;
      height: 28px;
      border-radius: 6px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 14px;
    }
    .wrangler-ctrl-btn:hover { color: #f1f5f9; background: rgba(148,163,184,0.1); }

    .wrangler-expanded-body {
      overflow-y: auto;
      padding: 10px 14px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      flex: 1;
    }

    /* ─── Cards ────────────────────────────────────────────────── */

    .wrangler-card {
      border: 1px solid #1e293b;
      border-radius: 8px;
      overflow: hidden;
    }
    .wrangler-card-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 12px;
      background: #1e293b;
      cursor: pointer;
      user-select: none;
    }
    .wrangler-card-title {
      font-size: 11px;
      font-weight: 600;
      color: #93c5fd;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .wrangler-card-count {
      font-size: 10px;
      color: #64748b;
      margin-left: 6px;
    }
    .wrangler-card-chevron {
      font-size: 10px;
      color: #64748b;
      transition: transform 0.15s;
    }
    .wrangler-card[data-collapsed="true"] .wrangler-card-chevron { transform: rotate(-90deg); }
    .wrangler-card-body {
      padding: 10px 12px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .wrangler-card[data-collapsed="true"] .wrangler-card-body { display: none; }

    /* Coverage bar */
    .wrangler-coverage-bar {
      height: 6px;
      background: rgba(148, 163, 184, 0.15);
      border-radius: 3px;
      overflow: hidden;
      margin: 4px 0;
    }
    .wrangler-coverage-fill {
      height: 100%;
      background: linear-gradient(90deg, rgba(96,165,250,0.7), rgba(59,130,246,0.9));
      border-radius: 3px;
      transition: width 0.5s ease-out;
    }

    /* Info rows in cards */
    .wrangler-field {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 12px;
    }
    .wrangler-field-label { color: #94a3b8; }
    .wrangler-field-value { color: #f1f5f9; font-weight: 500; }

    /* Phase B: People, Signal, Ask styles go here */

    /* ─── Buttons ──────────────────────────────────────────────── */

    .wrangler-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      padding: 8px 12px;
      border-radius: 8px;
      border: 1px solid rgba(148, 163, 184, 0.2);
      background: rgba(30, 41, 59, 0.8);
      color: #dbeafe;
      font-size: 12px;
      font-weight: 500;
      font-family: inherit;
      cursor: pointer;
      transition: background 0.15s, border-color 0.15s;
      white-space: nowrap;
      flex: 1;
    }
    .wrangler-btn:hover { background: rgba(51, 65, 85, 0.9); border-color: rgba(148,163,184,0.35); }
    .wrangler-btn:active { transform: scale(0.97); }

    .wrangler-btn--primary {
      background: rgba(245, 158, 11, 0.15);
      border-color: rgba(245, 158, 11, 0.4);
      color: #fbbf24;
      font-weight: 600;
    }
    .wrangler-btn--primary:hover {
      background: rgba(245, 158, 11, 0.25);
      border-color: rgba(245, 158, 11, 0.6);
    }

    .wrangler-btn--small {
      padding: 6px 10px;
      font-size: 11px;
    }

    /* ─── Empty / error states ─────────────────────────────────── */

    .wrangler-empty {
      font-size: 12px;
      color: #64748b;
      text-align: center;
      padding: 8px 0;
    }

    .wrangler-link {
      color: #60a5fa;
      text-decoration: none;
      cursor: pointer;
    }
    .wrangler-link:hover { text-decoration: underline; }

    /* ─── Docking ──────────────────────────────────────────────── */

    .wrangler-overlay[data-docked="right"] { right: 16px; left: auto; }
    .wrangler-overlay[data-docked="left"]  { left: 16px; right: auto; }
  `;

  // ─── Overlay rendering ─────────────────────────────────────────────────

  function shouldHideOverlay() {
    const url = location.href;
    return url.startsWith('chrome://') || url.startsWith('chrome-extension://') || url.startsWith('about:');
  }

  function ensureOverlay() {
    if (overlayRoot && shadow) return shadow;
    if (shouldHideOverlay()) return null;

    overlayRoot = document.createElement('div');
    overlayRoot.id = 'wrangler-overlay-root';
    overlayRoot.style.cssText = 'all:initial; position:fixed; top:0; left:0; width:0; height:0; z-index:2147483647; pointer-events:none;';
    document.documentElement.appendChild(overlayRoot);

    // E3: closed shadow DOM — host page cannot access shadowRoot
    shadow = overlayRoot.attachShadow({ mode: 'closed' });

    renderOverlay();
    return shadow;
  }

  function renderOverlay() {
    if (!shadow) return;

    const intel = currentIntel;
    const account = intel?.primaryAccount || null;
    const statusDot = getStatusDot(intel);
    const pillText = getPillText(intel);
    const pillScore = getPillScore(intel);
    const companyName = account?.companyName || account?.name || account?.domain || 'Unknown';
    const domain = account?.rootDomain || account?.domain || location.hostname;
    const industry = account?.industry || '';
    const score = account?.opportunityScore;
    const coverage = account?.enrichmentProgress ?? account?.profileCompleteness?.score ?? null;
    const coverageStatus = account?.coverageStatus || '';
    const lastUpdated = account?.lastUpdated || '';
    const people = intel?.contacts || intel?.people || [];
    const signals = intel?.signals || [];
    const opportunities = intel?.opportunities || [];

    const state = overlayEnabled ? overlayState : 'hidden';

    shadow.innerHTML = '';

    const style = document.createElement('style');
    style.textContent = OVERLAY_CSS;
    shadow.appendChild(style);

    const overlay = document.createElement('div');
    overlay.className = 'wrangler-overlay';
    overlay.setAttribute('data-state', state);
    overlay.setAttribute('data-docked', dockedSide);
    overlay.style.top = `${overlayY}px`;

    // ── Pill ──
    const pill = document.createElement('div');
    pill.className = 'wrangler-pill';
    pill.innerHTML = `
      <span class="wrangler-icon">\u26A1</span>
      <span class="wrangler-pill-name">${escapeHtml(pillText)}</span>
      <span class="wrangler-pill-dot" data-status="${escapeHtml(statusDot)}"></span>
      ${pillScore ? `<span class="wrangler-pill-score">${escapeHtml(pillScore)}</span>` : ''}
    `;
    pill.addEventListener('click', (e) => {
      if (isDragging) return;
      setState('compact');
    });
    setupDrag(pill, pill);
    overlay.appendChild(pill);

    // ── Compact ──
    const compact = document.createElement('div');
    compact.className = 'wrangler-compact';

    const compactHeader = document.createElement('div');
    compactHeader.className = 'wrangler-compact-header';
    compactHeader.innerHTML = `
      <span class="wrangler-icon">\u26A1</span>
      <span class="wrangler-company-name">${escapeHtml(companyName)}</span>
      <button class="wrangler-collapse-btn">\u25BE</button>
    `;
    compactHeader.querySelector('.wrangler-collapse-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      setState('pill');
    });
    compactHeader.querySelector('.wrangler-company-name').addEventListener('click', (e) => {
      e.stopPropagation();
      setState('expanded');
    });
    setupDrag(compactHeader, compact);
    compact.appendChild(compactHeader);

    const compactInfo = document.createElement('div');
    compactInfo.className = 'wrangler-compact-info';
    if (account) {
      compactInfo.innerHTML = `
        <div class="wrangler-info-row">
          <span>Score:</span>
          <span class="wrangler-info-value">${score != null ? escapeHtml(String(score)) : '\u2014'}</span>
          <span>\u00B7</span>
          <span class="wrangler-info-value">${escapeHtml(humanizeCoverage(coverageStatus))}</span>
        </div>
        ${lastUpdated ? `<div class="wrangler-info-row">Last enriched ${escapeHtml(formatRelativeTime(lastUpdated))}</div>` : ''}
      `;
    } else if (intel && !intel.error) {
      compactInfo.innerHTML = `
        <div class="wrangler-info-row">Not in Wrangler yet. Capture to add ${escapeHtml(domain)} to your portfolio.</div>
      `;
    } else if (intel?.error) {
      compactInfo.innerHTML = `
        <div class="wrangler-info-row">Can't reach Wrangler. Check your connection and Worker URL.</div>
      `;
    } else {
      compactInfo.innerHTML = `
        <div class="wrangler-info-row">Analyzing page\u2026</div>
      `;
    }
    compact.appendChild(compactInfo);

    const compactActions = document.createElement('div');
    compactActions.className = 'wrangler-compact-actions';
    if (account) {
      compactActions.innerHTML = `
        <button class="wrangler-btn wrangler-btn--primary" data-action="view">\uD83D\uDCCA View in Wrangler</button>
        <button class="wrangler-btn" data-action="capture">\uD83D\uDCE5 Capture</button>
      `;
    } else if (intel && !intel.error) {
      compactActions.innerHTML = `
        <button class="wrangler-btn wrangler-btn--primary" data-action="capture" style="flex:1">\uD83D\uDCE5 Capture to Wrangler</button>
      `;
    } else if (intel?.error) {
      compactActions.innerHTML = `
        <button class="wrangler-btn" data-action="settings">\u2699 Open Settings</button>
      `;
    }
    compactActions.addEventListener('click', handleActionClick);
    compact.appendChild(compactActions);
    overlay.appendChild(compact);

    // ── Expanded ──
    const expanded = document.createElement('div');
    expanded.className = 'wrangler-expanded';

    const expandedHeader = document.createElement('div');
    expandedHeader.className = 'wrangler-expanded-header';
    const metaParts = [domain, industry, score != null ? `Score: ${score}` : ''].filter(Boolean);
    expandedHeader.innerHTML = `
      <div class="wrangler-expanded-title">
        <span class="wrangler-company-name">${escapeHtml(companyName)}</span>
        <div class="wrangler-company-meta">${escapeHtml(metaParts.join(' \u00B7 '))}</div>
      </div>
      <div class="wrangler-expanded-controls">
        <button class="wrangler-ctrl-btn" data-action="minimize" title="Minimize">\u2500</button>
        <button class="wrangler-ctrl-btn" data-action="close" title="Close">\u2715</button>
      </div>
    `;
    expandedHeader.querySelector('[data-action="minimize"]').addEventListener('click', (e) => {
      e.stopPropagation();
      setState('pill');
    });
    expandedHeader.querySelector('[data-action="close"]').addEventListener('click', (e) => {
      e.stopPropagation();
      setState('hidden');
    });
    setupDrag(expandedHeader, expanded);
    expanded.appendChild(expandedHeader);

    const body = document.createElement('div');
    body.className = 'wrangler-expanded-body';

    // Account Summary card
    if (account) {
      body.appendChild(buildCard('Account Summary', null, false, () => {
        const el = document.createElement('div');
        el.innerHTML = `
          <div class="wrangler-field">
            <span class="wrangler-field-label">Coverage</span>
            <span class="wrangler-field-value">${coverage != null ? escapeHtml(String(coverage)) + '%' : '\u2014'}</span>
          </div>
          ${coverage != null ? `
            <div class="wrangler-coverage-bar">
              <div class="wrangler-coverage-fill" style="width:${Math.min(100, Math.max(0, coverage))}%"></div>
            </div>
          ` : ''}
          <div class="wrangler-field">
            <span class="wrangler-field-label">Status</span>
            <span class="wrangler-field-value">${escapeHtml(humanizeCoverage(coverageStatus))}</span>
          </div>
          ${lastUpdated ? `
            <div class="wrangler-field">
              <span class="wrangler-field-label">Last scan</span>
              <span class="wrangler-field-value">${escapeHtml(formatRelativeTime(lastUpdated))}</span>
            </div>
          ` : ''}
          <div class="wrangler-field">
            <span class="wrangler-field-label">Signals</span>
            <span class="wrangler-field-value">${signals.length ? signals.length + ' detected' : 'No signals yet'}</span>
          </div>
          <div class="wrangler-field">
            <span class="wrangler-field-label">People</span>
            <span class="wrangler-field-value">${people.length ? people.length + ' contacts' : 'No contacts yet'}</span>
          </div>
        `;
        return el;
      }));
    } else if (intel && !intel.error) {
      body.appendChild(buildCard('New Company', null, false, () => {
        const el = document.createElement('div');
        el.innerHTML = `
          <div class="wrangler-empty">
            \uD83D\uDD0D Not in Wrangler yet<br><br>
            Capture this page to add ${escapeHtml(domain)} to your portfolio.
          </div>
          <button class="wrangler-btn wrangler-btn--primary" data-action="capture" style="margin-top:8px">\uD83D\uDCE5 Capture to Wrangler</button>
        `;
        el.addEventListener('click', handleActionClick);
        return el;
      }));
    }

    // View in Wrangler action
    if (account) {
      body.appendChild(buildCard('Actions', null, false, () => {
        const el = document.createElement('div');
        el.style.cssText = 'display:flex;flex-direction:column;gap:6px;';
        el.innerHTML = `
          <button class="wrangler-btn wrangler-btn--primary" data-action="view">\uD83D\uDCCA View in Command Center</button>
          <button class="wrangler-btn" data-action="capture">\uD83D\uDCE5 Capture This Page</button>
        `;
        el.addEventListener('click', handleActionClick);
        return el;
      }));
    }

    // Phase B: Key People, Recent Signals, Ask Wrangler cards go here

    expanded.appendChild(body);
    overlay.appendChild(expanded);
    shadow.appendChild(overlay);
  }

  function buildCard(title, count, collapsed, contentFn) {
    const card = document.createElement('div');
    card.className = 'wrangler-card';
    card.setAttribute('data-collapsed', collapsed ? 'true' : 'false');

    const header = document.createElement('div');
    header.className = 'wrangler-card-header';
    header.innerHTML = `
      <div>
        <span class="wrangler-card-title">${escapeHtml(title)}</span>
        ${count != null ? `<span class="wrangler-card-count">(${count})</span>` : ''}
      </div>
      <span class="wrangler-card-chevron">\u25BE</span>
    `;
    header.addEventListener('click', () => {
      const isCollapsed = card.getAttribute('data-collapsed') === 'true';
      card.setAttribute('data-collapsed', isCollapsed ? 'false' : 'true');
    });
    card.appendChild(header);

    const body = document.createElement('div');
    body.className = 'wrangler-card-body';
    body.appendChild(contentFn());
    card.appendChild(body);

    return card;
  }

  // Phase B: getSignalAge() for signal freshness dots

  // ─── Actions ───────────────────────────────────────────────────────────

  function handleActionClick(e) {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.getAttribute('data-action');

    switch (action) {
      case 'view': {
        const accountKey = currentIntel?.primaryAccount?.accountKey || '';
        chrome.runtime.sendMessage({ type: 'wrangler:openApp', accountKey });
        break;
      }
      case 'capture': {
        const page = buildPageContext();
        if (page) {
          chrome.runtime.sendMessage({ type: 'wrangler:pageContext', payload: page });
          // Visual feedback
          btn.textContent = '\u2713 Captured';
          btn.style.borderColor = 'rgba(34, 197, 94, 0.5)';
          btn.style.color = '#86efac';
          setTimeout(() => renderOverlay(), 2000);
        }
        break;
      }
      case 'settings': {
        chrome.runtime.sendMessage({ type: 'wrangler:openSettings' });
        break;
      }
    }
  }

  // ─── Drag + edge-snap ──────────────────────────────────────────────────

  function setupDrag(handle, container) {
    let moved = false;

    handle.addEventListener('pointerdown', (e) => {
      // Only drag on primary button, and only on the handle itself (not buttons inside)
      if (e.button !== 0 || e.target.closest('button, a, input, textarea')) return;

      isDragging = false;
      moved = false;
      dragStartX = e.clientX;
      dragStartY = e.clientY;

      const overlay = shadow.querySelector('.wrangler-overlay');
      if (!overlay) return;

      const rect = (container || overlay).getBoundingClientRect();
      dragStartLeft = rect.left;
      dragStartTop = rect.top;

      const onMove = (ev) => {
        const dx = ev.clientX - dragStartX;
        const dy = ev.clientY - dragStartY;
        if (!moved && Math.abs(dx) < 4 && Math.abs(dy) < 4) return;
        moved = true;
        isDragging = true;

        const newTop = Math.max(16, Math.min(window.innerHeight - 52, dragStartTop + dy));
        overlay.style.top = `${newTop}px`;
        overlay.style.transition = 'none';

        // Temporarily position for visual feedback during drag
        const newLeft = dragStartLeft + dx;
        const midpoint = window.innerWidth / 2;
        if (newLeft + rect.width / 2 < midpoint) {
          overlay.setAttribute('data-docked', 'left');
        } else {
          overlay.setAttribute('data-docked', 'right');
        }
      };

      const onUp = (ev) => {
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);

        if (moved) {
          const finalTop = Math.max(16, Math.min(window.innerHeight - 52, dragStartTop + (ev.clientY - dragStartY)));
          overlayY = finalTop;
          const finalLeft = dragStartLeft + (ev.clientX - dragStartX);
          const midpoint = window.innerWidth / 2;
          dockedSide = (finalLeft + (container || overlay).offsetWidth / 2 < midpoint) ? 'left' : 'right';

          overlay.style.transition = 'top 0.2s ease-out';
          overlay.style.top = `${overlayY}px`;
          overlay.setAttribute('data-docked', dockedSide);

          // Save position
          chrome.storage.local.set({
            overlayPosition: { y: overlayY, side: dockedSide, domain: location.hostname },
          });
        }

        // Reset drag flag after a tick (so click handlers can check it)
        setTimeout(() => { isDragging = false; }, 50);
      };

      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', onUp);
    });
  }

  // ─── State management ──────────────────────────────────────────────────

  function setState(newState) {
    overlayState = newState;
    renderOverlay();
  }

  // ─── Message handling from background.js ───────────────────────────────

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type === 'wrangler:intel') {
      currentIntel = message.intel || null;
      renderOverlay();
    }
    if (message?.type === 'wrangler:captureStateChanged') {
      captureEnabled = message.enabled;
    }
    if (message?.type === 'wrangler:extractPayload') {
      // Background.js requests page context via message passing (E5: no window globals)
      const payload = buildPageContext();
      sendResponse({ ok: true, data: payload });
      return false; // synchronous response
    }
  });

  // ─── Page context publishing ───────────────────────────────────────────

  function publishPageContext() {
    const payload = buildPageContext();
    if (!payload) return;
    chrome.runtime.sendMessage({ type: 'wrangler:pageContext', payload }).catch(() => {});
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

  // ─── Keyboard shortcuts ────────────────────────────────────────────────

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (overlayState === 'expanded') setState('compact');
      else if (overlayState === 'compact') setState('pill');
    }
  });

  // ─── Init ──────────────────────────────────────────────────────────────

  // Restore position from storage
  chrome.storage.local.get(['overlayPosition', 'overlayEnabled'], (result) => {
    if (result.overlayEnabled === false) {
      overlayEnabled = false;
    }
    const pos = result.overlayPosition;
    if (pos && pos.domain === location.hostname) {
      overlayY = pos.y || 16;
      dockedSide = pos.side || 'right';
    }

    // E5: No window globals — extraction stays internal
    ensureOverlay();
    installNavigationWatchers();
    installMutationWatcher();
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
      schedulePublish();
    } else {
      window.addEventListener('DOMContentLoaded', schedulePublish, { once: true });
    }
  });

  // E5: No window globals. Background.js uses message passing to request
  // page context, not chrome.scripting.executeScript with window globals.
  // The content script responds to 'wrangler:extractPayload' messages.

})();
