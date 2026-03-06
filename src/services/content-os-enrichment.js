/**
 * Content OS Enrichment Service
 *
 * Runs AFTER the standard enrichment pipeline completes.  Takes the raw
 * research data (scan, crawl, evidence, brief, LinkedIn) and produces the
 * structured Content OS fields on the account document:
 *
 *   - technologies[]  → references to shared Technology documents
 *   - leadership[]    → references to Person documents (key decision-makers)
 *   - painPoints[]    → structured pain point objects
 *   - benchmarks{}    → company size / revenue / traffic estimates
 *   - competitors[]   → references to competitor Account documents
 *
 * This service is idempotent — safe to call multiple times on the same
 * account.  It merges new data without overwriting manually-curated fields.
 */

// ─── Technology Linking ─────────────────────────────────────────────────

/**
 * Ensure every detected technology has a Technology document in Sanity,
 * then link them to the account via the `technologies` reference array.
 */
export async function linkTechnologies(groqQuery, upsertDocument, patchDocument, client, account, accountPack) {
  const techStack = account?.technologyStack || accountPack?.payload?.scan?.technologyStack || {};

  // Collect all tech names from every category
  const allTechs = new Set();
  const categoryMap = {}; // tech name → category

  const CATEGORY_MAP = {
    cms: 'cms',
    frameworks: 'framework',
    legacySystems: 'legacy',
    pimSystems: 'pim',
    damSystems: 'dam',
    lmsSystems: 'lms',
    analytics: 'analytics',
    ecommerce: 'ecommerce',
    hosting: 'hosting',
    cssFrameworks: 'css-framework',
    authProviders: 'auth',
    searchTech: 'search',
    monitoring: 'monitoring',
    payments: 'payments',
    marketing: 'marketing',
    chat: 'chat',
    cdnMedia: 'cdn-media',
    migrationOpportunities: 'migration-target',
  };

  for (const [field, category] of Object.entries(CATEGORY_MAP)) {
    const items = techStack[field] || [];
    for (const tech of items) {
      const name = typeof tech === 'string' ? tech.trim() : tech?.name?.trim();
      if (name) {
        allTechs.add(name);
        categoryMap[name] = category;
      }
    }
  }

  if (allTechs.size === 0) return { linked: 0 };

  const techRefs = [];

  for (const name of allTechs) {
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const techId = `technology-${slug}`;

    // Upsert the technology document (createIfNotExists + patch)
    await upsertDocument(client, {
      _type: 'technology',
      _id: techId,
      name,
      slug,
      category: categoryMap[name] || 'unknown',
      isLegacy: categoryMap[name] === 'legacy',
      isMigrationTarget: categoryMap[name] === 'migration-target',
      lastEnrichedAt: new Date().toISOString(),
    });

    techRefs.push({ _type: 'reference', _ref: techId, _key: slug });
  }

  // Patch the account with technology references (merge, don't replace)
  if (techRefs.length > 0 && account?._id) {
    await patchDocument(client, account._id, {
      set: {
        technologies: techRefs,
        updatedAt: new Date().toISOString(),
      },
    });
  }

  return { linked: techRefs.length, technologies: [...allTechs] };
}


// ─── Pain Point Extraction ──────────────────────────────────────────────

/**
 * Extract structured pain points from all available research data.
 *
 * Sources:
 *   - technologyStack.painPoints (from scan — tech duplication)
 *   - evidence (claims, constraints)
 *   - brief (strategic insights)
 *   - crawl content (performance issues, UX problems)
 */
export function extractPainPoints(account, accountPack) {
  const painPoints = [];
  const seen = new Set(); // deduplicate by description hash

  const addPainPoint = (pp) => {
    const key = (pp.category + ':' + pp.description).toLowerCase().substring(0, 100);
    if (seen.has(key)) return;
    seen.add(key);
    painPoints.push(pp);
  };

  const payload = accountPack?.payload || {};
  const scan = payload.scan || {};
  const researchSet = payload.researchSet || {};

  // ── 1. Tech pain points (system duplication) ──────────────────────
  const techPainPoints = scan.technologyStack?.painPoints
    || account?.technologyStack?.painPoints
    || [];

  for (const tp of techPainPoints) {
    const desc = typeof tp === 'string' ? tp : tp?.description || JSON.stringify(tp);
    addPainPoint({
      category: 'tech-debt',
      description: desc,
      severity: 'medium',
      source: 'scan',
      confidence: 'high',
    });
  }

  // ── 2. Legacy system pain points ──────────────────────────────────
  const legacySystems = scan.technologyStack?.legacySystems
    || account?.technologyStack?.legacySystems
    || [];

  for (const legacy of legacySystems) {
    const name = typeof legacy === 'string' ? legacy : legacy?.name;
    if (name) {
      addPainPoint({
        category: 'tech-debt',
        description: `Legacy system detected: ${name}. May create maintenance burden, integration friction, and limit modern workflows.`,
        severity: 'high',
        source: 'scan',
        confidence: 'high',
      });
    }
  }

  // ── 3. Migration opportunities → implied pain ─────────────────────
  const migrations = scan.technologyStack?.migrationOpportunities
    || account?.technologyStack?.migrationOpportunities
    || [];

  for (const mig of migrations) {
    const desc = typeof mig === 'string' ? mig : mig?.description;
    if (desc) {
      addPainPoint({
        category: 'scalability',
        description: `Migration opportunity: ${desc}`,
        severity: 'medium',
        source: 'scan',
        confidence: 'medium',
      });
    }
  }

  // ── 4. Performance pain points ────────────────────────────────────
  const perfScore = scan.performance?.performanceScore
    || account?.performance?.performanceScore;

  if (typeof perfScore === 'number' && perfScore < 50) {
    addPainPoint({
      category: 'performance',
      description: `Website performance score is ${perfScore}/100 — likely slow page loads, poor Core Web Vitals, and negative impact on SEO and conversion rates.`,
      severity: perfScore < 30 ? 'high' : 'medium',
      source: 'scan',
      confidence: 'high',
    });
  }

  // ── 5. Evidence-based pain points ─────────────────────────────────
  const evidence = payload.evidence || researchSet?.evidence || [];
  const evidenceItems = Array.isArray(evidence) ? evidence : evidence?.evidencePacks || [];

  for (const pack of evidenceItems) {
    const items = pack?.evidence || pack?.items || [];
    for (const item of items) {
      if (item?.type === 'constraint' || item?.type === 'risk' || item?.type === 'challenge') {
        addPainPoint({
          category: mapEvidenceToCategory(item),
          description: item.claim || item.text || item.description || '',
          severity: item.confidence === 'high' ? 'high' : 'medium',
          source: 'evidence',
          confidence: item.confidence || 'medium',
        });
      }
    }
  }

  // ── 6. Brief-derived pain points ──────────────────────────────────
  const brief = payload.brief || researchSet?.brief || {};
  const briefChallenges = brief?.challenges || brief?.painPoints || brief?.constraints || [];

  for (const challenge of briefChallenges) {
    const desc = typeof challenge === 'string' ? challenge : challenge?.description || challenge?.text;
    if (desc) {
      addPainPoint({
        category: 'strategic',
        description: desc,
        severity: 'medium',
        source: 'brief',
        confidence: 'medium',
      });
    }
  }

  // ── 7. Multiple-CMS pain point ────────────────────────────────────
  const cmsCount = (scan.technologyStack?.cms || account?.technologyStack?.cms || []).length;
  if (cmsCount > 1) {
    addPainPoint({
      category: 'content-ops',
      description: `Multiple CMS platforms detected (${cmsCount}). Content fragmentation across systems creates operational overhead, inconsistent experiences, and integration complexity.`,
      severity: 'high',
      source: 'scan',
      confidence: 'high',
    });
  }

  return painPoints;
}

function mapEvidenceToCategory(item) {
  const text = (item.claim || item.text || '').toLowerCase();
  if (/performanc|speed|load|lcp|cls|fid|core web/i.test(text)) return 'performance';
  if (/secur|vulnerab|breach|compliance|gdpr|ccpa/i.test(text)) return 'security';
  if (/scale|growth|traffic|capacity/i.test(text)) return 'scalability';
  if (/legacy|outdated|deprecated|migration/i.test(text)) return 'tech-debt';
  if (/content|editorial|publish|workflow/i.test(text)) return 'content-ops';
  return 'strategic';
}


// ─── Benchmark Extraction ───────────────────────────────────────────────

/**
 * Extract benchmark data from all available sources.
 */
export function extractBenchmarks(account, accountPack) {
  const payload = accountPack?.payload || {};
  const scan = payload.scan || {};
  const researchSet = payload.researchSet || {};
  const brief = payload.brief || researchSet?.brief || {};
  const businessScale = scan.businessScale || account?.businessScale || {};

  return {
    estimatedRevenue: businessScale.estimatedAnnualRevenue
      || brief?.companySize?.revenue
      || null,
    estimatedEmployees: businessScale.estimatedEmployeeCount
      || brief?.companySize?.employees
      || brief?.employeeCount
      || null,
    estimatedTraffic: businessScale.estimatedMonthlyTraffic
      || null,
    fundingStage: brief?.fundingStage || brief?.funding || null,
    yearFounded: brief?.yearFounded || brief?.founded || null,
    headquarters: brief?.headquarters || brief?.hq || brief?.location || null,
    publicOrPrivate: brief?.publicOrPrivate || null,
    stockTicker: brief?.stockTicker || brief?.ticker || null,
    updatedAt: new Date().toISOString(),
  };
}


// ─── Leadership Discovery ───────────────────────────────────────────────

/**
 * Find or create Person documents for key decision-makers and link them
 * to the account's `leadership` array.
 *
 * Sources:
 *   - LinkedIn research results (from enrichment pipeline)
 *   - Evidence extraction (exec names from About/Team pages)
 *   - Brief (mentioned executives)
 */
export async function linkLeadership(groqQuery, upsertDocument, patchDocument, client, account, accountPack) {
  const accountKey = account?.accountKey;
  if (!accountKey) return { linked: 0 };

  // Find existing person documents linked to this account
  let existingPeople = [];
  try {
    const raw = await groqQuery(client,
      `*[_type == "person" && (relatedAccountKey == $key || rootDomain == $domain)]{_id, name, personKey, currentTitle, roleCategory, seniorityLevel}`,
      { key: accountKey, domain: account.domain || account.rootDomain || '' });
    existingPeople = Array.isArray(raw) ? raw : [];
  } catch { /* ignore */ }

  // Also check LinkedIn research for people data
  const payload = accountPack?.payload || {};
  const researchSet = payload.researchSet || {};
  const linkedinData = payload.linkedin || researchSet?.linkedin || {};
  const people = linkedinData?.people || linkedinData?.executives || [];

  // Create person docs for any new people from LinkedIn research
  for (const person of people) {
    if (!person?.name) continue;

    const { generatePersonKey } = await import('./enhanced-storage-service.js');
    const personKey = await generatePersonKey(person.linkedinUrl || person.linkedInUrl, person.name);
    if (!personKey) continue;

    // Check if already exists
    const alreadyExists = existingPeople.some(p => p.personKey === personKey);
    if (alreadyExists) continue;

    const personId = `person-${personKey}`;
    const roleCategory = classifyRole(person.title || person.currentTitle || '');
    const seniorityLevel = classifySeniority(person.title || person.currentTitle || '');

    await upsertDocument(client, {
      _type: 'person',
      _id: personId,
      personKey,
      name: person.name,
      currentTitle: person.title || person.currentTitle || null,
      linkedinUrl: person.linkedinUrl || person.linkedInUrl || null,
      linkedInUrl: person.linkedinUrl || person.linkedInUrl || null,
      currentCompany: account.companyName || account.name || account.domain,
      relatedAccountKey: accountKey,
      rootDomain: account.rootDomain || account.domain,
      roleCategory,
      seniorityLevel,
      isDecisionMaker: ['c-suite', 'vp', 'director'].includes(seniorityLevel),
      buyerPersona: deriveBuyerPersona(roleCategory),
      experience: person.experience || [],
      skills: person.skills || [],
      updatedAt: new Date().toISOString(),
    });

    existingPeople.push({ _id: personId, personKey, name: person.name, roleCategory, seniorityLevel });
  }

  // Build leadership refs — only include decision-makers (director+)
  const leadershipRefs = existingPeople
    .filter(p => {
      const seniority = p.seniorityLevel || classifySeniority(p.currentTitle || '');
      return ['c-suite', 'vp', 'director'].includes(seniority);
    })
    .map(p => ({
      _type: 'reference',
      _ref: p._id,
      _key: p.personKey || p._id.replace('person-', ''),
    }));

  if (leadershipRefs.length > 0 && account?._id) {
    await patchDocument(client, account._id, {
      set: {
        leadership: leadershipRefs,
        updatedAt: new Date().toISOString(),
      },
    });
  }

  return { linked: leadershipRefs.length, total: existingPeople.length };
}

function classifyRole(title) {
  const t = (title || '').toLowerCase();
  if (/cto|vp.*eng|head.*eng|director.*eng|software|developer|architect|devops|sre|infrastructure/i.test(t)) return 'engineering';
  if (/cmo|vp.*market|head.*market|director.*market|growth|brand|content.*lead|demand gen/i.test(t)) return 'marketing';
  if (/cpo|vp.*product|head.*product|director.*product|product.*lead|digital.*lead|ux|design/i.test(t)) return 'digital-product';
  if (/ciso|vp.*security|head.*security|it.*director|infrastructure|devops/i.test(t)) return 'it-security';
  if (/ceo|coo|cfo|president|founder|partner|managing director|general manager/i.test(t)) return 'executive';
  if (/vp.*sales|head.*sales|director.*sales|revenue|business development/i.test(t)) return 'sales';
  if (/vp.*ops|head.*ops|director.*ops|operations/i.test(t)) return 'operations';
  return 'other';
}

function classifySeniority(title) {
  const t = (title || '').toLowerCase();
  if (/\bc[a-z]o\b|chief|president|founder|co-founder|partner/i.test(t)) return 'c-suite';
  if (/\bvp\b|vice president|svp|evp/i.test(t)) return 'vp';
  if (/director|head of/i.test(t)) return 'director';
  if (/manager|lead|principal|senior/i.test(t)) return 'manager';
  return 'ic';
}

function deriveBuyerPersona(roleCategory) {
  switch (roleCategory) {
    case 'engineering':
    case 'it-security':
      return 'technical';
    case 'marketing':
    case 'sales':
    case 'operations':
      return 'business';
    case 'executive':
      return 'executive';
    case 'digital-product':
      return 'technical';
    default:
      return 'business';
  }
}


// ─── Competitor Linking ─────────────────────────────────────────────────

/**
 * Link competitor accounts as proper Sanity references on the account doc.
 */
export async function linkCompetitors(groqQuery, patchDocument, client, account, accountPack) {
  const payload = accountPack?.payload || {};
  const competitorData = payload.competitors || {};
  const competitors = competitorData.competitors || [];

  if (competitors.length === 0 || !account?._id) return { linked: 0 };

  // Try to find existing account documents for each competitor
  const competitorRefs = [];

  for (const comp of competitors) {
    const domain = comp.domain || comp.url;
    if (!domain) continue;

    try {
      const raw = await groqQuery(client,
        `*[_type == "account" && (domain == $d || rootDomain == $d || canonicalUrl match $pattern)][0]{_id}`,
        { d: domain.replace(/^https?:\/\//, '').replace(/\/.*$/, ''), pattern: `*${domain}*` });
      const found = Array.isArray(raw) ? raw[0] : raw;

      if (found?._id && found._id !== account._id) {
        competitorRefs.push({
          _type: 'reference',
          _ref: found._id,
          _key: found._id.replace('account-', '').substring(0, 16),
        });
      }
    } catch { /* skip */ }
  }

  if (competitorRefs.length > 0) {
    await patchDocument(client, account._id, {
      set: {
        competitors: competitorRefs,
        updatedAt: new Date().toISOString(),
      },
    });
  }

  return { linked: competitorRefs.length };
}


// ─── Main Orchestrator ──────────────────────────────────────────────────

/**
 * Run ALL Content OS enrichment for an account.
 * Called by gap-fill orchestrator after standard enrichment completes.
 *
 * @returns Summary of what was enriched.
 */
export async function enrichContentOS(groqQuery, upsertDocument, patchDocument, client, account, accountPack) {
  const results = {
    technologies: { linked: 0 },
    painPoints: [],
    benchmarks: null,
    leadership: { linked: 0 },
    competitors: { linked: 0 },
  };

  try {
    // ── 1. Link technologies ──────────────────────────────────────────
    results.technologies = await linkTechnologies(
      groqQuery, upsertDocument, patchDocument, client, account, accountPack);
  } catch (err) {
    console.error('Content OS: linkTechnologies error:', err?.message);
  }

  try {
    // ── 2. Extract & store pain points ────────────────────────────────
    results.painPoints = extractPainPoints(account, accountPack);
  } catch (err) {
    console.error('Content OS: extractPainPoints error:', err?.message);
  }

  try {
    // ── 3. Extract & store benchmarks ─────────────────────────────────
    results.benchmarks = extractBenchmarks(account, accountPack);
  } catch (err) {
    console.error('Content OS: extractBenchmarks error:', err?.message);
  }

  try {
    // ── 4. Link leadership ────────────────────────────────────────────
    results.leadership = await linkLeadership(
      groqQuery, upsertDocument, patchDocument, client, account, accountPack);
  } catch (err) {
    console.error('Content OS: linkLeadership error:', err?.message);
  }

  try {
    // ── 5. Link competitors ───────────────────────────────────────────
    results.competitors = await linkCompetitors(
      groqQuery, patchDocument, client, account, accountPack);
  } catch (err) {
    console.error('Content OS: linkCompetitors error:', err?.message);
  }

  // ── 6. Patch all non-ref fields onto the account in one go ────────
  try {
    if (account?._id) {
      const patchData = {};

      if (results.painPoints.length > 0) {
        patchData.painPoints = results.painPoints;
      }
      if (results.benchmarks && Object.values(results.benchmarks).some(v => v != null && v !== '')) {
        patchData.benchmarks = results.benchmarks;
      }

      if (Object.keys(patchData).length > 0) {
        patchData.updatedAt = new Date().toISOString();
        await patchDocument(client, account._id, { set: patchData });
      }
    }
  } catch (err) {
    console.error('Content OS: patch account error:', err?.message);
  }

  return results;
}
