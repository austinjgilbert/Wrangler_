/**
 * Competitor Discovery Service
 * 
 * Discovers direct competitors and similar companies in the same
 * industry/sector/niche for comparative analysis and opportunity identification.
 */

/**
 * Discover competitors using multiple strategies
 * @param {Function} groqQuery - GROQ query function
 * @param {object} client - Sanity client
 * @param {object} account - Account data
 * @param {object} options - Discovery options
 * @returns {Promise<Array<object>>} - List of competitor candidates
 */
export async function discoverCompetitors(groqQuery, client, account, options = {}) {
  const competitors = [];
  
  if (!account) {
    return competitors;
  }
  
  // Extract domain for exclusion
  let excludeDomain = account.domain || account.canonicalUrl;
  if (excludeDomain) {
    excludeDomain = excludeDomain.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0].toLowerCase();
  }
  
  // Strategy 1: Technology-based competitors (most reliable)
  // Companies using similar tech stack
  if (account.technologyStack) {
    const techCompetitors = await findCompetitorsByTechnology(
      groqQuery,
      client,
      account.technologyStack,
      excludeDomain,
      options
    );
    competitors.push(...techCompetitors);
  }
  
  // Strategy 2: Industry/sector-based
  // Companies in same industry
  if (account.businessUnits?.industry || account.businessUnits?.sector) {
    const industryCompetitors = await findCompetitorsByIndustry(
      groqQuery,
      client,
      account.businessUnits.industry || account.businessUnits.sector,
      excludeDomain,
      options
    );
    competitors.push(...industryCompetitors);
  }
  
  // Strategy 3: Business model-based
  // Companies with similar business models
  if (account.businessScale) {
    const modelCompetitors = await findCompetitorsByBusinessModel(
      groqQuery,
      client,
      account.businessScale,
      excludeDomain,
      options
    );
    competitors.push(...modelCompetitors);
  }
  
  // Strategy 4: Geographic competitors
  // Companies in same region
  if (account.businessUnits?.regions) {
    const geoCompetitors = await findCompetitorsByGeography(
      groqQuery,
      client,
      account.businessUnits.regions,
      excludeDomain,
      options
    );
    competitors.push(...geoCompetitors);
  }
  
  // Strategy 5: Market positioning
  // Companies with similar positioning/messaging
  const positioningCompetitors = await findCompetitorsByPositioning(
    groqQuery,
    client,
    account,
    excludeDomain,
    options
  );
  competitors.push(...positioningCompetitors);
  
  // Strategy 6: Fallback - if no competitors found, get any recent accounts
  if (competitors.length === 0 && options.allowFallback !== false) {
    try {
      console.log('discoverCompetitors: Using fallback strategy - getting recent accounts');
      const query = `*[_type == "accountPack"] | order(updatedAt desc)[0...${(options.limit || 10) * 2}]`;
      const results = await groqQuery(client, query, {});
      
      console.log('discoverCompetitors: Fallback query returned', results?.length || 0, 'results');
      
      if (results && Array.isArray(results)) {
        const excludeDomainNorm = (excludeDomain || '').toLowerCase().replace(/^www\./, '');
        for (const result of results) {
          const resultDomain = (result.domain || result.canonicalUrl || '').toLowerCase().replace(/^www\./, '');
          if (resultDomain !== excludeDomainNorm && resultDomain) {
            competitors.push({
              domain: result.domain || result.canonicalUrl?.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0],
              canonicalUrl: result.canonicalUrl,
              accountKey: result.accountKey,
              matchScore: 0.1,
              matchReasons: ['fallback: recent accounts'],
              technologyStack: result.payload?.scan?.technologyStack,
              businessScale: result.payload?.scan?.businessScale,
            });
          }
        }
      }
    } catch (e) {
      console.warn('Fallback competitor discovery failed:', e.message);
    }
  }
  
  console.log('discoverCompetitors: Found', competitors.length, 'competitor candidates before ranking');
  
  // Deduplicate and rank
  const ranked = rankAndDeduplicateCompetitors(competitors, account, options);
  console.log('discoverCompetitors: Returning', ranked.length, 'ranked competitors');
  return ranked;
}

/**
 * Find competitors by technology stack
 * @param {Function} groqQuery - GROQ query function
 * @param {object} client - Sanity client
 * @param {object} techStack - Technology stack
 * @param {string} excludeDomain - Domain to exclude
 * @param {object} options - Options
 * @returns {Promise<Array<object>>}
 */
async function findCompetitorsByTechnology(groqQuery, client, techStack, excludeDomain, options = {}) {
  const candidates = [];
  
  // Key technologies to match
  const keyTechs = [
    ...(techStack.cms || []),
    ...(techStack.frameworks || []),
    ...(techStack.legacySystems || []),
  ];
  
  if (keyTechs.length === 0) {
    return candidates;
  }
  
  try {
    // Query Sanity for all accountPacks (more lenient - we'll filter in code)
    // This avoids complex GROQ array membership queries that might fail
    const query = `*[_type == "accountPack" && defined(payload.scan.technologyStack)] | order(updatedAt desc)[0...${(options.limit || 20) * 2}]`;
    
    const results = await groqQuery(client, query, {});
    
    if (results && Array.isArray(results)) {
      for (const result of results) {
        // Skip if same domain (case-insensitive, handle www)
        const resultDomain = (result.domain || result.canonicalUrl || '').toLowerCase().replace(/^www\./, '');
        const excludeDomainNorm = (excludeDomain || '').toLowerCase().replace(/^www\./, '');
        if (resultDomain === excludeDomainNorm || !resultDomain) {
          continue;
        }
        
        const resultTech = result.payload?.scan?.technologyStack || {};
        const resultCms = resultTech.cms || [];
        const resultFrameworks = resultTech.frameworks || [];
        const resultLegacy = resultTech.legacySystems || [];
        
        // Find common technologies
        const commonTechs = [
          ...resultCms.filter(t => keyTechs.includes(t)),
          ...resultFrameworks.filter(t => keyTechs.includes(t)),
          ...resultLegacy.filter(t => keyTechs.includes(t)),
        ];
        
        if (commonTechs.length > 0) {
          candidates.push({
            domain: result.domain || result.canonicalUrl?.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0],
            canonicalUrl: result.canonicalUrl,
            accountKey: result.accountKey,
            matchScore: commonTechs.length / keyTechs.length,
            matchReasons: [`technology: ${commonTechs.join(', ')}`],
            technologyStack: resultTech,
            businessScale: result.payload?.scan?.businessScale,
            performance: result.payload?.scan?.performance,
            aiReadiness: result.payload?.scan?.aiReadiness,
          });
        }
      }
    }
  } catch (e) {
    console.warn('Competitor discovery by technology failed:', e.message);
  }
  
  return candidates;
}

/**
 * Find competitors by industry
 * @param {Function} groqQuery - GROQ query function
 * @param {object} client - Sanity client
 * @param {string} industry - Industry name
 * @param {string} excludeDomain - Domain to exclude
 * @param {object} options - Options
 * @returns {Promise<Array<object>>}
 */
async function findCompetitorsByIndustry(groqQuery, client, industry, excludeDomain, options = {}) {
  const candidates = [];
  
  if (!industry) {
    return candidates;
  }
  
  try {
    // Query all accountPacks and filter in code (more reliable)
    const query = `*[_type == "accountPack" && defined(payload.scan.businessUnits)] | order(updatedAt desc)[0...${(options.limit || 20) * 2}]`;
    
    const results = await groqQuery(client, query, {});
    
    if (results && Array.isArray(results)) {
      const excludeDomainNorm = (excludeDomain || '').toLowerCase().replace(/^www\./, '');
      const industryLower = industry.toLowerCase();
      
      for (const result of results) {
        // Skip if same domain
        const resultDomain = (result.domain || result.canonicalUrl || '').toLowerCase().replace(/^www\./, '');
        if (resultDomain === excludeDomainNorm || !resultDomain) {
          continue;
        }
        
        const businessUnits = result.payload?.scan?.businessUnits || {};
        const resultIndustry = (businessUnits.industry || '').toLowerCase();
        const resultSector = (businessUnits.sector || '').toLowerCase();
        
        // Check if industry matches
        if (resultIndustry.includes(industryLower) || resultSector.includes(industryLower) ||
            industryLower.includes(resultIndustry) || industryLower.includes(resultSector)) {
          candidates.push({
            domain: result.domain || result.canonicalUrl?.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0],
            canonicalUrl: result.canonicalUrl,
            accountKey: result.accountKey,
            matchScore: 0.5,
            matchReasons: [`industry: ${industry}`],
            technologyStack: result.payload?.scan?.technologyStack,
            businessScale: result.payload?.scan?.businessScale,
            businessUnits: businessUnits,
          });
        }
      }
    }
  } catch (e) {
    console.warn('Competitor discovery by industry failed:', e.message);
  }
  
  return candidates;
}

/**
 * Find competitors by business model
 * @param {Function} groqQuery - GROQ query function
 * @param {object} client - Sanity client
 * @param {object} businessScale - Business scale data
 * @param {string} excludeDomain - Domain to exclude
 * @param {object} options - Options
 * @returns {Promise<Array<object>>}
 */
async function findCompetitorsByBusinessModel(groqQuery, client, businessScale, excludeDomain, options = {}) {
  const candidates = [];
  
  if (!businessScale || !businessScale.businessScale) {
    return candidates;
  }
  
  try {
    // Query all accountPacks and filter by business scale
    const query = `*[_type == "accountPack" && defined(payload.scan.businessScale)] | order(updatedAt desc)[0...${(options.limit || 20) * 2}]`;
    
    const results = await groqQuery(client, query, {});
    
    if (results && Array.isArray(results)) {
      const excludeDomainNorm = (excludeDomain || '').toLowerCase().replace(/^www\./, '');
      const targetScale = businessScale.businessScale;
      
      for (const result of results) {
        // Skip if same domain
        const resultDomain = (result.domain || result.canonicalUrl || '').toLowerCase().replace(/^www\./, '');
        if (resultDomain === excludeDomainNorm || !resultDomain) {
          continue;
        }
        
        const resultScale = result.payload?.scan?.businessScale?.businessScale;
        if (resultScale === targetScale) {
          candidates.push({
            domain: result.domain || result.canonicalUrl?.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0],
            canonicalUrl: result.canonicalUrl,
            accountKey: result.accountKey,
            matchScore: 0.4,
            matchReasons: [`business_scale: ${targetScale}`],
            technologyStack: result.payload?.scan?.technologyStack,
            businessScale: result.payload?.scan?.businessScale,
          });
        }
      }
    }
  } catch (e) {
    console.warn('Competitor discovery by business model failed:', e.message);
  }
  
  return candidates;
}

/**
 * Find competitors by geography
 * @param {Function} groqQuery - GROQ query function
 * @param {object} client - Sanity client
 * @param {Array<string>} regions - Regions
 * @param {string} excludeDomain - Domain to exclude
 * @param {object} options - Options
 * @returns {Promise<Array<object>>}
 */
async function findCompetitorsByGeography(groqQuery, client, regions, excludeDomain, options = {}) {
  const candidates = [];
  
  if (!regions || regions.length === 0) {
    return candidates;
  }
  
  try {
    // Match by geographic presence
    const regionConditions = regions.map(r => `payload.scan.businessUnits.regions match "*${r}*"`).join(' || ');
    const query = `*[_type == "accountPack" && domain != $excludeDomain && (${regionConditions})] | order(updatedAt desc)[0...${options.limit || 20}]`;
    
    const results = await groqQuery(client, query, { excludeDomain });
    
    if (results && Array.isArray(results)) {
      for (const result of results) {
        candidates.push({
          domain: result.domain,
          canonicalUrl: result.canonicalUrl,
          accountKey: result.accountKey,
          matchScore: 0.3,
          matchReasons: [`geography: ${regions.join(', ')}`],
          technologyStack: result.payload?.scan?.technologyStack,
          businessScale: result.payload?.scan?.businessScale,
        });
      }
    }
  } catch (e) {
    // If query fails, return empty
  }
  
  return candidates;
}

/**
 * Find competitors by market positioning
 * @param {Function} groqQuery - GROQ query function
 * @param {object} client - Sanity client
 * @param {object} account - Account data
 * @param {string} excludeDomain - Domain to exclude
 * @param {object} options - Options
 * @returns {Promise<Array<object>>}
 */
async function findCompetitorsByPositioning(groqQuery, client, account, excludeDomain, options = {}) {
  const candidates = [];
  
  try {
    // Match by similar opportunity score or AI readiness
    // Companies with similar scores likely have similar positioning
    const accountScore = account.opportunityScore || account.technologyStack?.opportunityScore || 0;
    const scoreRange = 20; // ±20 points
    
    // Query all accountPacks and filter by score range
    const query = `*[_type == "accountPack" && defined(payload.scan.technologyStack)] | order(updatedAt desc)[0...${(options.limit || 20) * 2}]`;
    
    const results = await groqQuery(client, query, {});
    
    if (results && Array.isArray(results)) {
      const excludeDomainNorm = (excludeDomain || '').toLowerCase().replace(/^www\./, '');
      
      for (const result of results) {
        // Skip if same domain
        const resultDomain = (result.domain || result.canonicalUrl || '').toLowerCase().replace(/^www\./, '');
        if (resultDomain === excludeDomainNorm || !resultDomain) {
          continue;
        }
        
        const resultScore = result.payload?.scan?.technologyStack?.opportunityScore || result.payload?.scan?.opportunityScore || 0;
        if (resultScore >= accountScore - scoreRange && resultScore <= accountScore + scoreRange) {
          candidates.push({
            domain: result.domain || result.canonicalUrl?.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0],
            canonicalUrl: result.canonicalUrl,
            accountKey: result.accountKey,
            matchScore: 0.35,
            matchReasons: ['positioning: similar opportunity score'],
            technologyStack: result.payload?.scan?.technologyStack,
            businessScale: result.payload?.scan?.businessScale,
            opportunityScore: resultScore,
          });
        }
      }
    }
  } catch (e) {
    console.warn('Competitor discovery by positioning failed:', e.message);
  }
  
  return candidates;
}

/**
 * Rank and deduplicate competitor candidates
 * @param {Array<object>} candidates - Competitor candidates
 * @param {object} account - Original account
 * @param {object} options - Options
 * @returns {Array<object>} - Ranked and deduplicated competitors
 */
function rankAndDeduplicateCompetitors(candidates, account, options = {}) {
  // Deduplicate by domain
  const byDomain = new Map();
  for (const candidate of candidates) {
    const domain = candidate.domain || candidate.canonicalUrl;
    if (!byDomain.has(domain)) {
      byDomain.set(domain, candidate);
    } else {
      // Merge scores
      const existing = byDomain.get(domain);
      existing.matchScore = Math.max(existing.matchScore || 0, candidate.matchScore || 0);
      existing.matchReasons = [...(existing.matchReasons || []), ...(candidate.matchReasons || [])];
    }
  }
  
  // Score competitors
  const scored = Array.from(byDomain.values()).map(candidate => {
    let score = candidate.matchScore || 0;
    
    // Technology match
    if (candidate.matchReasons?.some(r => r.includes('technology'))) {
      score += 0.3;
    }
    
    // Industry match
    if (candidate.matchReasons?.some(r => r.includes('industry'))) {
      score += 0.25;
    }
    
    // Business model match
    if (candidate.matchReasons?.some(r => r.includes('business_model'))) {
      score += 0.2;
    }
    
    // Geographic match
    if (candidate.matchReasons?.some(r => r.includes('geography'))) {
      score += 0.15;
    }
    
    // Positioning match
    if (candidate.matchReasons?.some(r => r.includes('positioning'))) {
      score += 0.1;
    }
    
    return {
      ...candidate,
      finalScore: score,
    };
  });
  
  // Sort by score descending
  return scored
    .sort((a, b) => b.finalScore - a.finalScore)
    .slice(0, options.limit || 10);
}

/**
 * Extract business positioning from account data
 * @param {object} account - Account data
 * @param {object} researchSet - Complete research set
 * @returns {object} - Business positioning analysis
 */
export function extractBusinessPositioning(account, researchSet = {}) {
  const positioning = {
    valueProposition: null,
    targetAudience: null,
    keyMessages: [],
    differentiators: [],
    marketPosition: null,
    brandVoice: null,
    competitiveAdvantages: [],
  };
  
  // Extract from scan data
  if (account.technologyStack) {
    // Technology as differentiator
    if (account.technologyStack.modernFrameworks?.length > 0) {
      positioning.differentiators.push('Modern technology stack');
    }
    if (account.technologyStack.legacySystems?.length > 0) {
      positioning.competitiveAdvantages.push('Established systems');
    }
    positioning.marketPosition = determineMarketPosition(account);
  }
  
  // Extract from brief/evidence
  if (researchSet.brief) {
    const briefText = researchSet.brief.briefMarkdown || '';
    positioning.keyMessages = extractKeyMessages(briefText);
    positioning.valueProposition = extractValueProposition(briefText);
  }
  
  // Extract from evidence
  if (researchSet.evidence?.extractions) {
    for (const extraction of researchSet.evidence.extractions) {
      // Look for positioning signals
      const positioningSignals = extraction.signals?.filter(s => 
        s.type === 'positioning' || 
        s.type === 'value_prop' ||
        s.type === 'differentiator'
      );
      
      if (positioningSignals?.length > 0) {
        positioning.keyMessages.push(...positioningSignals.map(s => s.evidence));
      }
    }
  }
  
  // Extract from business units
  if (account.businessUnits) {
    positioning.targetAudience = identifyTargetAudience(account.businessUnits);
  }
  
  return positioning;
}

/**
 * Determine market position
 * @param {object} account - Account data
 * @returns {string} - Market position
 */
function determineMarketPosition(account) {
  const techStack = account.technologyStack || {};
  const businessScale = account.businessScale || {};
  
  // Leader indicators
  if (techStack.modernFrameworks?.length > 2 && businessScale.businessScale === 'enterprise') {
    return 'market_leader';
  }
  
  // Challenger indicators
  if (techStack.modernFrameworks?.length > 0 && businessScale.businessScale === 'mid-market') {
    return 'challenger';
  }
  
  // Niche indicators
  if (techStack.legacySystems?.length > 0 && businessScale.businessScale === 'small') {
    return 'niche';
  }
  
  return 'established';
}

/**
 * Extract key messages from text
 * @param {string} text - Text to analyze
 * @returns {Array<string>} - Key messages
 */
function extractKeyMessages(text) {
  if (!text) return [];
  
  const messages = [];
  
  // Look for value proposition patterns
  const valuePropPatterns = [
    /(?:we|our|the|our platform|we provide|we offer)[\s\S]{0,200}(?:solution|platform|service|product)/gi,
    /(?:help|enable|empower|transform)[\s\S]{0,200}(?:business|company|organization|team)/gi,
  ];
  
  for (const pattern of valuePropPatterns) {
    const matches = text.match(pattern);
    if (matches) {
      messages.push(...matches.slice(0, 5).map(m => m.trim()));
    }
  }
  
  return [...new Set(messages)].slice(0, 10);
}

/**
 * Extract value proposition
 * @param {string} text - Text to analyze
 * @returns {string|null} - Value proposition
 */
function extractValueProposition(text) {
  if (!text) return null;
  
  // Look for value proposition in first paragraph or executive summary
  const firstParagraph = text.split('\n\n')[0] || text.substring(0, 500);
  
  // Look for key phrases
  const valuePropKeywords = ['value', 'proposition', 'mission', 'purpose', 'help', 'enable'];
  if (valuePropKeywords.some(keyword => firstParagraph.toLowerCase().includes(keyword))) {
    return firstParagraph.substring(0, 200);
  }
  
  return null;
}

/**
 * Identify target audience
 * @param {object} businessUnits - Business units data
 * @returns {string|null} - Target audience
 */
function identifyTargetAudience(businessUnits) {
  if (!businessUnits) return null;
  
  // Analyze business units to determine target
  const units = businessUnits.units || [];
  
  if (units.some(u => u.includes('enterprise') || u.includes('B2B'))) {
    return 'enterprise_b2b';
  }
  
  if (units.some(u => u.includes('consumer') || u.includes('B2C'))) {
    return 'consumer_b2c';
  }
  
  if (units.some(u => u.includes('developer') || u.includes('technical'))) {
    return 'developer';
  }
  
  return 'general';
}

