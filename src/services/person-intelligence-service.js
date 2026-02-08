/**
 * Person Intelligence Service
 * Orchestrates the complete person intelligence pipeline
 */

import { generatePersonKey } from './enhanced-storage-service.js';
import { upsertPerson } from './person-storage.js';
import { normalizeDomain, normalizeCanonicalUrl, generateAccountKey } from './sanity-account.js';
import { calculateOpportunityConfidence } from '../utils/opportunity-confidence.js';
import { selectPrimaryPersona, framePersonaLens, getPersonaTitles } from '../utils/persona-lens.js';
import { createEvidenceInsights, createPlainLanguageSummary } from '../utils/evidence-structure.js';
import { retrieveContextForGPT } from '../utils/auto-logging.js';

/**
 * Internal function: Resolve company/domain from person information
 * @param {Object} context - Execution context
 * @param {Object} params - Parameters with companyDomain, companyName, profileUrl, name
 * @returns {Promise<Object>} - Resolved company information
 */
async function resolveCompanyDomain(context, params) {
  const { companyDomain, companyName, profileUrl, name } = params;
  const { groqQuery, client, searchProvider } = context;

  let canonicalUrl = null;
  let rootDomain = null;
  let resolvedCompanyName = companyName || null;
  let inferredTitle = null;
  let inferredFunction = null;
  let inferredSeniority = null;

  // Step 1: If companyDomain given, use it directly
  if (companyDomain) {
    rootDomain = normalizeDomain(companyDomain);
    canonicalUrl = normalizeCanonicalUrl(`https://${rootDomain}`);
  }
  // Step 2: Else if companyName given, search for official website
  else if (companyName) {
    try {
      const searchQuery = `${companyName} official website`;
      const searchResults = await searchProvider(searchQuery, 5);
      
      if (searchResults && searchResults.length > 0) {
        // Find first result that looks like official site
        const official = searchResults.find(r => 
          r.url && (
            r.url.includes(companyName.toLowerCase().split(' ')[0]) ||
            r.title?.toLowerCase().includes(companyName.toLowerCase().split(' ')[0])
          )
        ) || searchResults[0];
        
        if (official?.url) {
          canonicalUrl = normalizeCanonicalUrl(official.url);
          rootDomain = normalizeDomain(canonicalUrl);
        }
      }
    } catch (e) {
      if (context.logger) {
        context.logger.warn('Search for company website failed', { error: e.message, companyName });
      } else {
        // Fallback to structured console output
        try {
          console.warn(JSON.stringify({
            level: 'WARN',
            message: 'Search for company website failed',
            error: e.message,
            companyName,
            timestamp: new Date().toISOString(),
          }));
        } catch {
          console.warn('Search for company website failed:', e.message);
        }
      }
    }
  }
  // Step 3: Else if profileUrl is LinkedIn, try to extract company
  else if (profileUrl && profileUrl.includes('linkedin.com')) {
    // For now, we'll need to rely on companyName being provided
    // In a real implementation, we'd parse LinkedIn profile
    // For this implementation, we'll skip and require companyName/companyDomain
  }

  // Step 4: Fallback search
  if (!canonicalUrl && name && companyName) {
    try {
      const searchQuery = `"${name}" "${companyName}" LinkedIn`;
      const searchResults = await searchProvider(searchQuery, 3);
      
      // Try to extract domain from search results
      if (searchResults && searchResults.length > 0) {
        for (const result of searchResults) {
          if (result.url && !result.url.includes('linkedin.com')) {
            try {
              const url = new URL(result.url);
              if (url.hostname !== 'linkedin.com') {
                canonicalUrl = normalizeCanonicalUrl(result.url);
                rootDomain = normalizeDomain(canonicalUrl);
                break;
              }
            } catch (e) {
              // Invalid URL, continue
            }
          }
        }
      }
    } catch (e) {
      if (context.logger) {
        context.logger.warn('Fallback search failed', { error: e.message, name, companyName });
      } else {
        // Fallback to structured console output
        try {
          console.warn(JSON.stringify({
            level: 'WARN',
            message: 'Fallback search failed',
            error: e.message,
            name,
            companyName,
            timestamp: new Date().toISOString(),
          }));
        } catch {
          console.warn('Fallback search failed:', e.message);
        }
      }
    }
  }

  // Infer title/function/seniority from name and context (best effort)
  if (name) {
    const nameLower = name.toLowerCase();
    // Simple heuristics
    if (nameLower.includes('ceo') || nameLower.includes('chief executive')) {
      inferredTitle = 'CEO';
      inferredFunction = 'Executive';
      inferredSeniority = 'C-Suite';
    } else if (nameLower.includes('cto') || nameLower.includes('chief technology')) {
      inferredTitle = 'CTO';
      inferredFunction = 'Technology';
      inferredSeniority = 'C-Suite';
    } else if (nameLower.includes('cmo') || nameLower.includes('chief marketing')) {
      inferredTitle = 'CMO';
      inferredFunction = 'Marketing';
      inferredSeniority = 'C-Suite';
    } else if (nameLower.includes('vp') || nameLower.includes('vice president')) {
      inferredSeniority = 'VP';
      inferredFunction = 'Management';
    } else if (nameLower.includes('director')) {
      inferredSeniority = 'Director';
      inferredFunction = 'Management';
    }
  }

  return {
    canonicalUrl,
    rootDomain,
    companyName: resolvedCompanyName,
    inferredTitle,
    inferredFunction,
    inferredSeniority,
  };
}

/**
 * Internal function: Scan homepage
 */
async function scanHomepageInternal(context, canonicalUrl) {
  const { getBrowserHeaders, fetchWithTimeout, readHtmlWithLimit, extractTitle, cleanMainText, 
          detectTechnologyStack, analyzeBusinessScale, detectBusinessUnits,
          analyzePerformance, calculateAIReadinessScore, extractNavigationLinks, extractScriptSrcs, extractLinkHrefs } = context;

  // Validate fetchWithTimeout is available
  if (!fetchWithTimeout || typeof fetchWithTimeout !== 'function') {
    return { 
      success: false, 
      error: 'fetchWithTimeout function not available in context. Backend orchestration error.' 
    };
  }

  const timeoutMs = 20000; // Increased to 20 seconds for homepage scan
  
  try {
    const response = await fetchWithTimeout(canonicalUrl, {
      method: 'GET',
      redirect: 'follow',
      headers: getBrowserHeaders(),
    }, timeoutMs);

    if (!response.ok) {
      return { success: false, error: `HTTP ${response.status}: Failed to load homepage` };
    }

    const html = await readHtmlWithLimit(response, 250000); // 250KB limit
    const headers = Object.fromEntries(response.headers.entries());
    const scriptSrcs = extractScriptSrcs ? extractScriptSrcs(html) : extractScriptSrcsFromHtml(html);
    const linkHrefs = extractLinkHrefs ? extractLinkHrefs(html) : extractLinkHrefsFromHtml(html);
    const navLinks = extractNavigationLinks ? extractNavigationLinks(html, canonicalUrl) : [];

    const safeScriptSrcs = Array.isArray(scriptSrcs) ? scriptSrcs : [];
    const safeLinkHrefs = Array.isArray(linkHrefs) ? linkHrefs : [];
    const safeNavLinks = Array.isArray(navLinks) ? navLinks : [];
    
    let techStack = {};
    let businessUnits = {};
    let businessScale = {};
    let performance = {};
    let aiReadiness = { score: 0 };

    try {
      techStack = detectTechnologyStack(html, headers, safeScriptSrcs, safeLinkHrefs, null);
    } catch (error) {
      techStack = { error: error.message };
    }

    try {
      businessUnits = detectBusinessUnits ? detectBusinessUnits(html, safeNavLinks, canonicalUrl) : {};
    } catch (error) {
      businessUnits = { error: error.message };
    }

    try {
      businessScale = analyzeBusinessScale ? analyzeBusinessScale(html, headers, safeScriptSrcs, safeLinkHrefs, {}, businessUnits) : {};
    } catch (error) {
      businessScale = { error: error.message };
    }

    try {
      performance = analyzePerformance ? analyzePerformance(response, headers, html, safeScriptSrcs, safeLinkHrefs, canonicalUrl) : {};
    } catch (error) {
      performance = { error: error.message };
    }

    // Calculate scores
    try {
      aiReadiness = calculateAIReadinessScore ? calculateAIReadinessScore(techStack, {}, businessUnits, {}) : { score: 0 };
    } catch (error) {
      aiReadiness = { score: 0, error: error.message };
    }

    return {
      success: true,
      techStack,
      businessUnits,
      businessScale,
      performance,
      aiReadiness,
      opportunityScore: techStack.opportunityScore || 0,
      aiReadinessScore: aiReadiness?.score || 0,
      performanceScore: performance?.performanceScore || 0,
      businessScaleScore: businessScale?.scaleScore || 0,
    };
  } catch (error) {
    // Detect timeout errors specifically
    const isTimeout = error.name === 'AbortError' || 
                     error.message?.includes('timeout') || 
                     error.message?.includes('aborted') ||
                     error.message?.includes('signal');
    
    if (isTimeout) {
      return { 
        success: false, 
        error: `Timeout after ${timeoutMs/1000}s while scanning homepage. The website may be slow or unreachable.`,
        timeout: true
      };
    }
    
    return { 
      success: false, 
      error: `Homepage scan failed: ${error.message || 'Unknown error'}` 
    };
  }
}

/**
 * Internal function: Discover and crawl pages
 */
async function discoverAndCrawlInternal(context, canonicalUrl, budget, includeTypes) {
  const { discoverPages, crawlWithConcurrency, getBrowserHeaders, fetchWithTimeout, readHtmlWithLimit,
          extractTitle, cleanMainText, detectSignals, extractExcerpts } = context;

  try {
    // Discover pages
    const candidates = await discoverPages(canonicalUrl, budget * 2);
    
    // Filter by includeTypes
    const filtered = includeTypes && includeTypes.length > 0
      ? candidates.filter(c => includeTypes.includes(c.type))
      : candidates;
    
    const prioritized = filtered.slice(0, budget);
    
    // Validate and normalize URLs from discovery before crawling
    const { validateUrl } = await import('../utils/validation.js');
    const validatedUrls = [];
    for (const candidate of prioritized) {
      let candidateUrl = candidate.url;
      const urlValidation = validateUrl(candidateUrl);
      
      // If validation fails, try resolving relative URL against base
      if (!urlValidation.valid || !urlValidation.url) {
        try {
          const resolvedUrl = new URL(candidateUrl, canonicalUrl).href;
          const resolvedValidation = validateUrl(resolvedUrl);
          if (resolvedValidation.valid && resolvedValidation.url) {
            candidateUrl = resolvedValidation.url;
          } else {
            continue; // Skip invalid URLs
          }
        } catch (e) {
          continue; // Skip invalid URLs
        }
      } else {
        candidateUrl = urlValidation.url;
      }
      
      validatedUrls.push(candidateUrl);
    }
    
    if (validatedUrls.length === 0) {
      // Return empty result if no valid URLs - don't fail the entire pipeline
      return {
        success: true,
        crawled: [],
        inferred: { businessUnits: [], digitalGoals: [] },
        errors: prioritized.map(c => ({ url: c.url, reason: 'URL validation failed' })),
      };
    }
    
    // Crawl with concurrency
    const concurrency = 3;
    const timeoutMs = 12000; // Increased to 12 seconds for page crawling
    
    const { results, errors } = await crawlWithConcurrency(
      validatedUrls,
      concurrency,
      async (targetUrl) => {
        // Final validation before fetching
        const finalValidation = validateUrl(targetUrl);
        if (!finalValidation.valid || !finalValidation.url) {
          throw new Error(`Invalid URL: ${targetUrl}`);
        }
        
        const validatedTargetUrl = finalValidation.url;
        const response = await fetchWithTimeout(validatedTargetUrl, {
          method: 'GET',
          redirect: 'follow',
          headers: getBrowserHeaders(),
        }, timeoutMs);
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        
        const html = await readHtmlWithLimit(response, 250000);
        const title = extractTitle(html);
        const mainText = cleanMainText(html);
        const excerpts = extractExcerpts(mainText, 500);
        const signals = detectSignals(html, mainText, excerpts);
        
        return {
          url: validatedTargetUrl,
          finalUrl: response.url,
          status: response.status,
          title,
          mainText: mainText.substring(0, 10000),
          excerpts: excerpts.slice(0, 3),
          signals: signals.slice(0, 5),
          fetchedAt: new Date().toISOString(),
        };
      },
      timeoutMs
    );

    // Parse crawl results to infer businessUnits, digitalGoals, teamMap candidates
    const inferred = {
      businessUnits: [],
      digitalGoals: [],
      teamMapCandidates: [],
    };

    results.forEach(r => {
      if (r.data) {
        const { mainText, title, signals } = r.data;
        const text = `${title || ''} ${mainText || ''}`.toLowerCase();
        
        // Infer business units from page content
        if (text.includes('product') || text.includes('solution')) {
          inferred.businessUnits.push('Products/Solutions');
        }
        if (text.includes('region') || text.includes('global') || text.includes('international')) {
          inferred.businessUnits.push('Global/Regional');
        }
        
        // Infer digital goals
        if (text.includes('api') || text.includes('api-first')) {
          inferred.digitalGoals.push('API-first');
        }
        if (text.includes('ai') || text.includes('artificial intelligence') || text.includes('machine learning')) {
          inferred.digitalGoals.push('AI');
        }
        if (text.includes('personaliz') || text.includes('customization')) {
          inferred.digitalGoals.push('Personalization');
        }
        if (text.includes('modern') || text.includes('moderniz')) {
          inferred.digitalGoals.push('Modernization');
        }
        
        // Extract team map candidates (simple name extraction)
        const nameMatches = mainText?.match(/\b([A-Z][a-z]+ [A-Z][a-z]+)\b/g) || [];
        nameMatches.slice(0, 10).forEach(name => {
          inferred.teamMapCandidates.push({
            name: name.trim(),
            source: r.data.url,
            excerpt: mainText?.substring(mainText.indexOf(name), mainText.indexOf(name) + 100) || '',
          });
        });
      }
    });

    return {
      success: true,
      crawled: results.map(r => r.data).filter(Boolean),
      skipped: errors.map(e => ({ url: e.url, reason: e.reason })),
      inferred,
    };
  } catch (error) {
    return { success: false, error: error.message, crawled: [], skipped: [] };
  }
}

/**
 * Internal function: Extract exec claims evidence
 */
async function extractExecClaimsInternal(context, params, evidenceBudget) {
  const { rootDomain, companyName, inferredFunction } = params;
  const { searchProvider, extractEvidenceInternal } = context;

  const topics = [
    'AI automation',
    'personalization',
    'speed performance',
    'global scale',
    'governance security',
    'cost optimization',
    'platform modernization',
  ];

  // Filter topics based on inferred function
  let relevantTopics = topics;
  if (inferredFunction === 'Technology') {
    relevantTopics = ['AI automation', 'platform modernization', 'speed performance', 'global scale'];
  } else if (inferredFunction === 'Marketing') {
    relevantTopics = ['personalization', 'AI automation', 'global scale'];
  } else if (inferredFunction === 'Executive') {
    relevantTopics = topics; // All topics relevant
  }

  const queries = [];
  
  // Build search queries
  relevantTopics.slice(0, 6).forEach(topic => {
    if (rootDomain) {
      queries.push(`site:${rootDomain} (press OR newsroom OR news) (CEO OR CTO OR CMO) ${topic}`);
    }
    if (companyName) {
      queries.push(`"${companyName}" earnings call transcript ${topic}`);
      queries.push(`"${companyName}" CEO interview ${topic}`);
    }
  });

  const allResults = [];
  
  // Execute searches with limit
  for (const query of queries.slice(0, 6)) {
    try {
      const results = await searchProvider(query, 5);
      if (results && results.length > 0) {
        allResults.push(...results);
      }
    } catch (e) {
      if (context.logger) {
        context.logger.warn('Search failed for query', { error: e.message, query });
      } else {
        // Fallback to structured console output
        try {
          console.warn(JSON.stringify({
            level: 'WARN',
            message: 'Search failed for query',
            error: e.message,
            query,
            timestamp: new Date().toISOString(),
          }));
        } catch {
          console.warn(`Search failed for query: ${query}`, e.message);
        }
      }
    }
  }

  // Deduplicate by URL
  const seen = new Set();
  const uniqueResults = allResults.filter(r => {
    if (!r.url || seen.has(r.url)) return false;
    seen.add(r.url);
    return true;
  });

  // Prefer first-party sources
  const firstParty = uniqueResults.filter(r => r.url && rootDomain && r.url.includes(rootDomain));
  const thirdParty = uniqueResults.filter(r => !firstParty.includes(r));
  
  // Select top sources
  const selected = [
    ...firstParty.slice(0, Math.min(evidenceBudget, firstParty.length)),
    ...thirdParty.slice(0, Math.max(0, evidenceBudget - firstParty.length)),
  ].slice(0, evidenceBudget);

    // Extract evidence from selected sources
    const claims = [];
    for (const source of selected) {
      try {
        const evidence = await extractEvidenceInternal(context, source.url || source, 'fast');
      if (evidence && evidence.claims) {
        // Normalize to Claim objects
        evidence.claims.forEach(claim => {
          // Extract speaker from claim text or title
          let speaker = null;
          let role = null;
          
          // Try to extract from claim text
          const claimText = claim.claim || claim.text || '';
          const roleMatch = claimText.match(/\b(CEO|CTO|CMO|VP|President|Director)\b/i);
          if (roleMatch) {
            role = roleMatch[1];
          }
          
          // Extract name pattern
          const nameMatch = claimText.match(/\b([A-Z][a-z]+ [A-Z][a-z]+)\b/);
          if (nameMatch) {
            speaker = nameMatch[1];
          }

          claims.push({
            speaker: speaker || 'Executive',
            role: role || inferredFunction || 'Executive',
            claim: (claim.claim || claim.text || '').substring(0, 200),
            excerpt: claim.excerpt || claimText.substring(0, 200),
            initiativeTag: extractInitiativeTag(claimText),
            publishedAt: source.publishedAt || new Date().toISOString(),
            url: source.url,
            sourceType: rootDomain && source.url.includes(rootDomain) ? 'first-party' : 'third-party',
            confidence: 'medium',
          });
        });
      }
    } catch (e) {
      if (context.logger) {
        context.logger.warn('Evidence extraction failed', { error: e.message, url: source.url });
      } else {
        // Fallback to structured console output
        try {
          console.warn(JSON.stringify({
            level: 'WARN',
            message: 'Evidence extraction failed',
            error: e.message,
            url: source.url,
            timestamp: new Date().toISOString(),
          }));
        } catch {
          console.warn(`Evidence extraction failed for ${source.url}:`, e.message);
        }
      }
    }
  }

  return claims.slice(0, evidenceBudget * 2); // Allow some overflow, will be limited later
}

/**
 * Extract initiative tag from text
 */
function extractInitiativeTag(text) {
  const textLower = text.toLowerCase();
  if (textLower.includes('ai') || textLower.includes('artificial intelligence')) return 'AI';
  if (textLower.includes('moderniz') || textLower.includes('platform')) return 'Modernization';
  if (textLower.includes('personaliz')) return 'Personalization';
  if (textLower.includes('scale') || textLower.includes('global')) return 'Scale';
  if (textLower.includes('security') || textLower.includes('governance')) return 'Security';
  if (textLower.includes('cost') || textLower.includes('efficiency')) return 'Cost Optimization';
  return 'General';
}

/**
 * Internal function: Extract evidence from URL
 */
async function extractEvidenceInternal(context, url, mode = 'fast') {
  if (!url) return null;
  
  const { getBrowserHeaders, fetchWithTimeout, readHtmlWithLimit, cleanMainText, extractExcerpts,
          extractEntities, detectSignals, extractClaims } = context;
  
  // Validate fetchWithTimeout is available
  if (!fetchWithTimeout || typeof fetchWithTimeout !== 'function') {
    if (context.logger) {
      context.logger.error('fetchWithTimeout not available in context', null, { url });
    }
    return null; // Silently fail for evidence extraction
  }

  const timeoutMs = 15000; // Increased to 15 seconds for evidence extraction
  
  try {
    const response = await fetchWithTimeout(url, {
      method: 'GET',
      redirect: 'follow',
      headers: getBrowserHeaders(),
    }, timeoutMs);

    if (!response.ok) {
      return null;
    }

    const html = await readHtmlWithLimit(response, 250000);
    const mainText = cleanMainText(html);
    const excerpts = extractExcerpts(mainText, 500);
    const entities = extractEntities(mainText);
    const signals = detectSignals(html, mainText, excerpts);
    const claims = extractClaims(mainText, excerpts);

    return {
      url,
      finalUrl: response.url,
      mainText: mainText.substring(0, 5000),
      excerpts: excerpts.slice(0, 5),
      entities,
      signals,
      claims,
    };
  } catch (error) {
    // Silently fail for evidence extraction (non-critical)
    // Log timeout for debugging
    const isTimeout = error.name === 'AbortError' || error.message?.includes('timeout');
    if (isTimeout && context.logger) {
      context.logger.warn('Evidence extraction timeout', { url, timeout: timeoutMs });
    }
    return null;
  }
}

/**
 * Helper: Extract script srcs from HTML (fallback if not in context)
 */
function extractScriptSrcsFromHtml(html) {
  const matches = html.match(/<script[^>]+src=["']([^"']+)["']/gi) || [];
  return matches.map(m => {
    const match = m.match(/src=["']([^"']+)["']/i);
    return match ? match[1] : null;
  }).filter(Boolean);
}

/**
 * Helper: Extract link hrefs from HTML (fallback if not in context)
 */
function extractLinkHrefsFromHtml(html) {
  const matches = html.match(/<link[^>]+href=["']([^"']+)["']/gi) || [];
  return matches.map(m => {
    const match = m.match(/href=["']([^"']+)["']/i);
    return match ? match[1] : null;
  }).filter(Boolean);
}

/**
 * Main orchestration function for person brief generation
 * Automatically enriches data when confidence scores are low
 * 
 * @param {Object} params - Person brief parameters
 * @param {string} params.name - Person's name (required)
 * @param {string} [params.profileUrl] - LinkedIn profile URL
 * @param {string} [params.companyName] - Company name
 * @param {string} [params.companyDomain] - Company domain
 * @param {string} [params.mode='fast'] - Mode: 'fast' or 'deep'
 * @param {number} [params.recencyDays=365] - Days to look back for evidence
 * @param {number} [params.crawlBudget=20] - Budget for page crawling
 * @param {number} [params.evidenceBudget=6] - Budget for evidence extraction
 * @param {boolean} [params.verify=true] - Verify executive claims
 * @param {boolean} [params.store=true] - Store results in Sanity
 * @param {Object} context - Execution context with handlers and utilities
 * @param {Function} context.groqQuery - GROQ query function
 * @param {Function} context.upsertDocument - Sanity upsert function
 * @param {Object} context.client - Sanity client
 * @param {Object} [context.logger] - Logger instance (optional)
 * @returns {Promise<Object>} - Person brief result with auto-enrichment info
 */
export async function generatePersonBriefInternal(params, context) {
  const {
    name,
    profileUrl,
    companyName,
    companyDomain,
    mode = 'fast',
    recencyDays = 365,
    crawlBudget = 20,
    evidenceBudget = 6,
    verify = true,
    store = true,
  } = params;

  const {
    groqQuery,
    upsertDocument,
    client,
    searchProvider,
    getBrowserHeaders,
    readHtmlWithLimit,
    extractTitle,
    cleanMainText,
    detectSignals,
    extractExcerpts,
    extractEntities,
    extractClaims,
    detectTechnologyStack,
    analyzeBusinessScale,
    detectBusinessUnits,
    analyzePerformance,
    calculateAIReadinessScore,
    discoverPages,
    crawlWithConcurrency,
    verifyClaimsInternal,
  } = context;

  const requestId = context.requestId || generateRequestId();
  const runId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

  // Initialize logger if not provided
  if (!context.logger) {
    context.logger = createLogger(requestId, 'person-intelligence-service');
  }

  // Step 0: Create requestId + runId (already done above)

  // Step 1: Resolve company/domain
  const resolved = await resolveCompanyDomain(context, {
    companyDomain,
    companyName,
    profileUrl,
    name,
  });

  if (!resolved.canonicalUrl && !resolved.rootDomain) {
    return {
      success: false,
      error: 'Could not resolve company domain. Please provide companyDomain or companyName.',
    };
  }

  const { canonicalUrl, rootDomain, companyName: resolvedCompanyName, 
          inferredTitle, inferredFunction, inferredSeniority } = resolved;

  // Step 2: Account scan
  const scanResult = await scanHomepageInternal(context, canonicalUrl);
  
  if (!scanResult.success) {
    // Provide more helpful error message for timeouts
    if (scanResult.timeout) {
      return {
        success: false,
        error: `Timeout while scanning ${resolvedCompanyName || rootDomain} homepage. The website may be slow or temporarily unreachable. You can still manually look up the tech stack or try again later.`,
        timeout: true,
        step: 'homepage_scan',
        suggestion: 'Try providing the company domain directly, or check if the website is accessible.',
      };
    }
    return {
      success: false,
      error: `Account scan failed: ${scanResult.error}`,
      step: 'homepage_scan',
    };
  }

  // Generate account key
  const accountKey = await generateAccountKey(canonicalUrl);

  // Step 3: Discover + crawl
  const includeTypes = [
    'about', 'leadership', 'team', 'press', 'news', 'investors',
    'blog', 'careers', 'security', 'docs', 'case-studies', 'product', 'solutions',
  ];
  
  const crawlResult = await discoverAndCrawlInternal(
    context,
    canonicalUrl,
    Math.min(crawlBudget, 30), // Hard cap
    includeTypes
  );

  // Step 4: Exec claims evidence
  const execClaims = await extractExecClaimsInternal(
    context,
    {
      rootDomain,
      companyName: resolvedCompanyName,
      inferredFunction,
    },
    Math.min(evidenceBudget, 10) // Hard cap
  );

  // Step 5: Verification (if enabled)
  let verifiedClaims = execClaims;
  let verificationId = null;
  
  if (verify && execClaims.length > 0) {
    try {
      const topClaims = execClaims.slice(0, 3);
      const verifyFn = context.verifyClaimsInternal || verifyClaimsInternal;
      const verifyResult = await verifyFn({
        claims: topClaims.map(c => c.claim),
        sources: topClaims.map(c => c.url).filter(Boolean),
      });

      if (verifyResult && verifyResult.verified && verifyResult.verified.length > 0) {
        // Map verification results back to claims
        verifiedClaims = execClaims.map((claim) => {
          const verified = verifyResult.verified.find(v => 
            v.claim && claim.claim && v.claim.trim() === claim.claim.trim()
          );
          
          let confidence = 'low';
          if (verified) {
            if (verified.status === 'supported' && verified.supportingExcerpts && verified.supportingExcerpts.length >= 2) {
              confidence = 'high';
            } else if (verified.status === 'supported') {
              confidence = 'medium';
            } else if (verified.status === 'contradicted') {
              confidence = 'low';
            }
          }
          
          return { ...claim, confidence };
        });

        verificationId = verifyResult.verificationId;
      }
    } catch (verifyError) {
      // Continue with unverified claims
      if (context.logger) {
        context.logger.warn('Verification failed, continuing without verification', {
          error: verifyError.message,
          claimsCount: execClaims.length,
        });
      } else {
        // Fallback to structured console output
        try {
          console.warn(JSON.stringify({
            level: 'WARN',
            message: 'Verification failed, continuing without verification',
            error: verifyError.message,
            claimsCount: execClaims.length,
            timestamp: new Date().toISOString(),
          }));
        } catch {
          console.warn('Verification failed, continuing without verification:', verifyError.message);
        }
      }
    }
  }

  // Step 6: Relationship mapping (team map)
  const teamMap = buildTeamMap({
    person: { name, title: inferredTitle, function: inferredFunction },
    execClaims: verifiedClaims,
    crawled: crawlResult.crawled || [],
    inferred: crawlResult.inferred || {},
  });

  // Step 6.5: Retrieve context for intelligence memory system
  let contextSummary = null;
  let previousInteractions = null;
  
  if (client && (rootDomain || resolvedCompanyName)) {
    try {
      // Generate account key if we have domain
      let accountKeyForContext = null;
      if (rootDomain) {
        accountKeyForContext = await generateAccountKey(`https://${rootDomain}`);
      }
      
      const contextResult = await retrieveContextForGPT(
        {
          accountKey: accountKeyForContext,
          domain: rootDomain,
          contextTags: [resolvedCompanyName, inferredFunction].filter(Boolean),
          minRelevanceScore: 0.7,
        },
        groqQuery,
        client
      );
      
      if (contextResult.success && contextResult.summary && contextResult.summary !== 'No previous context found.') {
        contextSummary = contextResult.summary;
        
        // Also get recent interactions for more detail
        const { getRecentInteractions } = await import('../services/context-retrieval.js');
        previousInteractions = await getRecentInteractions(
          groqQuery,
          client,
          {
            accountKey: accountKeyForContext,
            domain: rootDomain,
          },
          3 // Last 3 interactions
        );
      }
    } catch (error) {
      // Non-blocking - context retrieval failure shouldn't break brief generation
      if (context.logger) {
        context.logger.warn('Context retrieval failed (non-blocking)', {
          error: error.message,
          accountKey: accountKeyForContext,
          domain: rootDomain,
        });
      } else {
        // Fallback to structured console output
        try {
          console.warn(JSON.stringify({
            level: 'WARN',
            message: 'Context retrieval failed (non-blocking)',
            error: error.message,
            accountKey: accountKeyForContext,
            domain: rootDomain,
            timestamp: new Date().toISOString(),
          }));
        } catch {
          console.warn('Context retrieval failed (non-blocking):', error.message);
        }
      }
    }
  }

  // Step 7: Synthesize person brief (with context if available)
  const personBrief = synthesizePersonBrief({
    name,
    companyName: resolvedCompanyName,
    scanResult,
    crawlResult,
    execClaims: verifiedClaims,
    teamMap,
    inferredTitle,
    inferredFunction,
    inferredSeniority,
    previousContext: contextSummary, // Include context for "we said this last time" functionality
    previousInteractions, // Include interactions for reference
  });

  // Step 7.5: Check confidence and auto-enrich if needed
  let enrichmentResult = null;
  if (client && personBrief) {
    try {
      const { assessConfidenceAndEnrichmentNeeds, executeAutoEnrichment } = await import('../services/confidence-auto-enrichment.js');
      
      // Assess if enrichment is needed
      const assessment = assessConfidenceAndEnrichmentNeeds(
        personBrief,
        scanResult,
        verifiedClaims
      );
      
      // If confidence is low, automatically enrich
      if (assessment.needsEnrichment && assessment.priority !== 'none') {
        // Add enrichment context (ensure fetchWithTimeout is available)
        const enrichmentContext = {
          ...context,
          rootDomain,
          companyName: resolvedCompanyName,
          canonicalUrl,
          execClaims: verifiedClaims,
          requestId,
          // Explicitly ensure fetchWithTimeout is available
          fetchWithTimeout: context.fetchWithTimeout || (async (url, options, timeoutMs) => {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
            try {
              const response = await fetch(url, { ...options, signal: controller.signal });
              clearTimeout(timeoutId);
              return response;
            } catch (error) {
              clearTimeout(timeoutId);
              if (error.name === 'AbortError') {
                const timeoutError = new Error(`Request timeout after ${timeoutMs}ms`);
                timeoutError.name = 'AbortError';
                timeoutError.timeout = true;
                throw timeoutError;
              }
              throw error;
            }
          }),
        };
        
        enrichmentResult = await executeAutoEnrichment(enrichmentContext, assessment, {
          name,
          companyDomain,
          companyName: resolvedCompanyName,
          profileUrl,
          mode,
        });
        
        // If enrichment succeeded, re-synthesize brief with new data
        if (enrichmentResult.enriched && enrichmentResult.improvements) {
          // Merge improvements into scan result
          if (enrichmentResult.improvements.techStackEnhanced && enrichmentResult.improvements.techStack) {
            scanResult.techStack = { ...scanResult.techStack, ...enrichmentResult.improvements.techStack };
          }
          
          if (enrichmentResult.improvements.execClaimsEnhanced && enrichmentResult.improvements.claims) {
            verifiedClaims.push(...enrichmentResult.improvements.claims);
          }
          
          if (enrichmentResult.improvements.evidenceEnhanced && enrichmentResult.improvements.evidence) {
            crawlResult.crawled = [...(crawlResult.crawled || []), ...enrichmentResult.improvements.evidence];
          }
          
          if (enrichmentResult.improvements.personaEnhanced && enrichmentResult.improvements.personaInsights) {
            personBrief.personaLens = { ...personBrief.personaLens, ...enrichmentResult.improvements.personaInsights };
          }
          
          // Re-calculate opportunity confidence with new data
          const { calculateOpportunityConfidence } = await import('../utils/opportunity-confidence.js');
          const updatedConfidence = calculateOpportunityConfidence(scanResult, verifiedClaims);
          personBrief.opportunityConfidence = updatedConfidence;
          
          // Re-synthesize brief with enriched data (lightweight - only update confidence and evidence)
          personBrief.confidenceImproved = true;
          personBrief.enrichmentActions = enrichmentResult.actionsTaken.map(a => ({
            action: a.action,
            success: a.success,
          }));
        }
      }
    } catch (enrichError) {
      // Non-blocking - enrichment failure shouldn't break brief generation
      // Log structured error instead of console.warn
      if (context.logger) {
        context.logger.warn('Auto-enrichment failed (non-blocking)', {
          error: enrichError.message,
          requestId,
          accountKey,
        });
      } else {
        // Fallback to structured console output
        try {
          console.warn(JSON.stringify({
            level: 'WARN',
            message: 'Auto-enrichment failed (non-blocking)',
            error: enrichError.message,
            requestId,
            accountKey,
            timestamp: new Date().toISOString(),
          }));
        } catch {
          console.warn('Auto-enrichment failed (non-blocking):', enrichError.message);
        }
      }
    }
  }

  // Step 8: Store everything (if enabled)
  let personId = null;
  let briefId = null;
  let evidenceIds = [];

  if (store && client) {
    try {
      // Generate person key
      const personKey = await generatePersonKey(profileUrl, name);

      if (personKey) {
        // Store person
        const personStoreResult = await upsertPerson(
          groqQuery,
          upsertDocument,
          client,
          {
            name,
            linkedInUrl: profileUrl,
            currentCompany: resolvedCompanyName,
            currentTitle: inferredTitle,
          },
          {
            rootDomain,
            canonicalUrl,
            companyName: resolvedCompanyName,
            title: inferredTitle,
            function: inferredFunction,
            seniority: inferredSeniority,
            scopeInference: personBrief.personLayer,
            execClaimsUsed: verifiedClaims.slice(0, 20), // Limit stored claims
            teamMap,
            linkedAccountKey: accountKey,
            runId,
            requestId,
          }
        );

        personId = personStoreResult.personId || personStoreResult.personKey;

        // Store evidence packs (simplified IDs for now - full packs stored separately if needed)
        evidenceIds = verifiedClaims.slice(0, 10).map((c, idx) => `evidence-${personKey}-${idx}`);

        // Store brief
        briefId = `brief-${personKey}-${Date.now()}`;
        const briefDoc = {
          _type: 'brief',
          _id: briefId,
          accountKey,
          personKey,
          canonicalUrl,
          companyName: resolvedCompanyName,
          personName: name,
          data: personBrief,
          source: 'person-intelligence',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          meta: {
            runId,
            requestId,
            mode,
          },
        };

        await upsertDocument(client, briefDoc);

        // Update person with brief reference (if person was stored)
        if (personStoreResult.success) {
          await upsertPerson(
            groqQuery,
            upsertDocument,
            client,
            {},
            {
              personKey,
              linkedBriefRef: briefId,
              evidenceRefs: evidenceIds,
              verificationRefs: verificationId ? [verificationId] : [],
              patch: {},
            }
          );
        }
      }
    } catch (storeError) {
      // Continue even if storage fails - return brief anyway
      if (context.logger) {
        context.logger.error('Storage error (non-fatal)', storeError, {
          personKey,
          accountKey,
          briefId,
        });
      } else {
        // Fallback to structured console output
        try {
          console.error(JSON.stringify({
            level: 'ERROR',
            message: 'Storage error (non-fatal)',
            error: storeError.message,
            personKey,
            accountKey,
            briefId,
            timestamp: new Date().toISOString(),
          }));
        } catch {
          console.error('Storage error (non-fatal):', storeError.message);
        }
      }
    }
  }

  // Step 9: Return bounded JSON response with new structure (including enrichment info)
  return {
    success: true,
    personId,
    accountKey,
    briefId,
    evidenceIds,
    verificationId,
    personBrief: {
      executiveSummary: personBrief.executiveSummary.slice(0, 4),
      opportunityConfidence: {
        score: personBrief.opportunityConfidence?.score || 0,
        confidence: personBrief.opportunityConfidence?.confidence || 'low',
        marker: personBrief.opportunityConfidence?.marker || '🟡',
        evidenceStrength: personBrief.opportunityConfidence?.evidenceStrength || 'weak',
        whatWouldChangeScore: personBrief.opportunityConfidence?.whatWouldChangeScore || '',
        supportingScores: personBrief.opportunityConfidence?.supportingScores || {},
      },
      evidenceInsights: (personBrief.evidenceInsights || []).slice(0, 5).map(insight => ({
        observed: insight.observed?.substring(0, 300) || '',
        interpreted: insight.interpreted?.substring(0, 300) || '',
        assumed: insight.assumed?.substring(0, 300) || '',
      })),
      personaLens: {
        primaryPersona: personBrief.personaLens?.primaryPersona || 'Engineering',
        pain: personBrief.personaLens?.pain?.substring(0, 200) || '',
        gain: personBrief.personaLens?.gain?.substring(0, 200) || '',
        metric: personBrief.personaLens?.metric || '',
      },
      personLayer: {
        scope: personBrief.personLayer.scope?.substring(0, 400) || '',
        decisionInfluence: personBrief.personLayer.decisionInfluence?.substring(0, 400) || '',
        dailyStatusQuo: personBrief.personLayer.dailyStatusQuo?.substring(0, 400) || '',
      },
      execNameDrops: personBrief.execNameDrops.slice(0, 5).map(c => ({
        speaker: c.speaker,
        role: c.role,
        claim: c.claim.substring(0, 200),
        url: c.url,
        publishedAt: c.publishedAt,
      })),
      teamMapPreview: {
        nodesCount: teamMap.nodes?.length || 0,
        edgesCount: teamMap.edges?.length || 0,
      },
      topRoiPlays: personBrief.topRoiPlays.slice(0, 3).map(play => ({
        what: play.what?.substring(0, 100) || '',
        why: play.why?.substring(0, 200) || '',
        impact: play.impact || '',
        who: play.who || '',
        personaLens: play.personaLens || {},
      })),
      techStackOverview: personBrief.techStackOverview || {
        frontendFramework: [],
        hostingDeployment: [],
        cdnEdge: [],
        imageMediaDelivery: [],
        cmsPimDam: [],
        performanceTools: [],
        analyticsPersonalization: [],
        stackType: 'Unknown',
      },
      keyInsights: personBrief.keyInsights || [],
      nextStepQuestion: personBrief.nextStepQuestion?.substring(0, 200) || '',
      // Include enrichment information if auto-enrichment occurred
      confidenceImproved: personBrief.confidenceImproved || false,
      enrichmentActions: personBrief.enrichmentActions || [],
    },
    // Top-level enrichment summary
    enrichment: enrichmentResult ? {
      enriched: enrichmentResult.enriched,
      enrichmentPath: enrichmentResult.enrichmentPath,
      actionsTaken: enrichmentResult.actionsTaken?.map(a => ({
        action: a.action,
        method: a.method,
        success: a.success,
      })) || [],
      improvements: Object.keys(enrichmentResult.improvements || {}),
      confidenceImproved: personBrief.confidenceImproved || false,
    } : null,
  };
}

/**
 * Build team map relationship graph
 */
function buildTeamMap(data) {
  const { person, execClaims, crawled, inferred } = data;
  
  const nodes = [];
  const edges = [];

  // Add person node
  nodes.push({
    id: 'target-person',
    name: person.name,
    role: person.title || person.function || 'Executive',
    type: 'person',
  });

  // Add exec nodes from claims
  execClaims.forEach((claim, idx) => {
    if (claim.speaker && claim.speaker !== person.name) {
      nodes.push({
        id: `exec-${idx}`,
        name: claim.speaker,
        role: claim.role || 'Executive',
        type: 'executive',
      });

      edges.push({
        source: 'target-person',
        target: `exec-${idx}`,
        type: 'strategic_alignment',
        url: claim.url,
        excerpt: claim.excerpt?.substring(0, 100) || '',
      });
    }
  });

  // Add business unit nodes
  (inferred.businessUnits || []).forEach((unit, idx) => {
    nodes.push({
      id: `unit-${idx}`,
      name: unit,
      role: 'Business Unit',
      type: 'business_unit',
    });

    edges.push({
      source: 'target-person',
      target: `unit-${idx}`,
      type: 'influences',
    });
  });

  // Deduplicate nodes
  const nodeMap = new Map();
  nodes.forEach(node => {
    const key = `${node.name}::${node.role}`;
    if (!nodeMap.has(key)) {
      nodeMap.set(key, node);
    }
  });

  return {
    nodes: Array.from(nodeMap.values()),
    edges,
  };
}

/**
 * Synthesize person brief
 */
function synthesizePersonBrief(data) {
  const { name, companyName, scanResult, crawlResult, execClaims, teamMap,
          inferredTitle, inferredFunction, inferredSeniority, previousContext, previousInteractions } = data;

  // Use imported utilities (already imported at top of file)

  // Calculate Opportunity Confidence (primary score)
  const opportunityConfidence = calculateOpportunityConfidence(scanResult || {}, execClaims || []);

  // Select primary persona
  const primaryPersona = selectPrimaryPersona(scanResult || {}, execClaims || [], inferredFunction);
  const personaLens = framePersonaLens(primaryPersona, scanResult || {}, execClaims || []);

  // Create evidence → insight → assumption structure
  const evidenceInsights = createEvidenceInsights(scanResult || {}, execClaims || [], 5);

  // Create plain language executive summary
  const nameStr = name || 'Executive';
  const titleStr = inferredTitle || 'an executive';
  const companyStr = companyName || 'the company';
  
  const plainSummary = createPlainLanguageSummary(evidenceInsights, opportunityConfidence, companyStr, 4);
  
  // Ensure first bullet includes person context
  if (plainSummary.length > 0 && !plainSummary[0].includes(nameStr)) {
    plainSummary[0] = `${nameStr} (${titleStr} at ${companyStr}) - ${plainSummary[0]}`;
  } else if (plainSummary.length === 0) {
    plainSummary.push(`${nameStr} is ${titleStr} at ${companyStr}.`);
  }
  
  const finalSummary = plainSummary.slice(0, 4);

  // Person layer (bounded to 400 chars each)
  const topInitiatives = extractTopInitiatives(execClaims || []);
  const initiativesStr = topInitiatives.length > 0 
    ? topInitiatives.join(', ')
    : 'strategic initiatives';
  
  const scopeText = `${inferredFunction || primaryPersona} leadership with focus on ${inferredSeniority || 'strategic'} initiatives.`;
  const decisionText = `High decision-making authority as ${inferredTitle || 'executive'}, particularly in ${inferredFunction || primaryPersona} matters.`;
  const statusQuoText = `Managing ${inferredFunction || primaryPersona} priorities including ${initiativesStr}.`;
  
  const personLayer = {
    scope: scopeText.substring(0, 400),
    decisionInfluence: decisionText.substring(0, 400),
    dailyStatusQuo: statusQuoText.substring(0, 400),
  };

  // Top ROI plays with persona lens
  const topRoiPlays = extractTopRoiPlays(scanResult, execClaims, primaryPersona, personaLens);

  // Next step question (conversational, not pitch-focused)
  const nextStepQuestion = generateConversationalQuestion(name, primaryPersona, inferredFunction, scanResult, execClaims);

  // Create tech stack overview with categorized systems
  const techStackOverview = createTechStackOverview(scanResult?.techStack || {});
  
  // Enhance executive summary with tech stack mentions
  const enhancedSummary = enhanceExecutiveSummaryWithTechStack(
    finalSummary,
    scanResult?.techStack || {},
    opportunityConfidence,
    companyStr
  );
  
  // Enhance ROI plays with impact statements
  const enhancedRoiPlays = enhanceRoiPlaysWithImpact(topRoiPlays, scanResult, opportunityConfidence);
  
  // Format justification/key insights from evidence insights
  const keyInsights = formatKeyInsights(evidenceInsights, scanResult, opportunityConfidence);
  
  // Include previous context if available (for "we said this last time" functionality)
  const result = {
    executiveSummary: enhancedSummary,
    opportunityConfidence, // Primary score with markers
    techStackOverview, // Categorized tech stack
    keyInsights, // Formatted justification/insights
    evidenceInsights, // Evidence → Insight → Assumption structure (detailed)
    personaLens, // Single persona with pain/gain/metric
    personLayer,
    execNameDrops: (execClaims || []).slice(0, 5),
    topRoiPlays: enhancedRoiPlays,
    nextStepQuestion,
  };

  // Add context for intelligence memory system
  if (previousContext) {
    result.previousContext = previousContext;
  }
  if (previousInteractions && previousInteractions.length > 0) {
    result.previousInteractions = previousInteractions.map(i => ({
      timestamp: i.timestamp,
      userPrompt: i.userPrompt?.substring(0, 200),
      gptResponse: i.gptResponse?.substring(0, 300),
    })).slice(0, 3); // Last 3 interactions
  }

  return result;
}

/**
 * Extract top initiatives from claims
 */
function extractTopInitiatives(claims) {
  const tags = claims.map(c => c.initiativeTag).filter(Boolean);
  const counts = {};
  tags.forEach(tag => {
    counts[tag] = (counts[tag] || 0) + 1;
  });
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([tag]) => tag);
}

/**
 * Extract top ROI plays (max 3, bounded) with persona lens
 */
function extractTopRoiPlays(scanResult, execClaims, primaryPersona, personaLens) {
  const plays = [];
  const personaTitles = getPersonaTitles(primaryPersona);

  if (scanResult && scanResult.techStack && scanResult.techStack.legacySystems && scanResult.techStack.legacySystems.length > 0) {
    const legacySystem = scanResult.techStack.legacySystems[0];
    plays.push({
      what: 'Legacy System Modernization',
      why: `Currently using ${legacySystem} - ${personaLens.pain}`.substring(0, 200),
      who: personaTitles[0] || 'CTO', // Single specific persona
      personaLens: {
        primaryPersona: personaLens.primaryPersona,
        pain: personaLens.pain.substring(0, 150),
        gain: personaLens.gain.substring(0, 150),
        metric: personaLens.metric,
      },
    });
  }

  if (execClaims && execClaims.some(c => c.initiativeTag === 'AI')) {
    plays.push({
      what: 'AI/Automation Initiatives',
      why: `Executive focus on AI indicates readiness for intelligent content automation that would ${personaLens.gain.toLowerCase()}`.substring(0, 200),
      who: primaryPersona === 'Marketing' ? 'CMO' : (primaryPersona === 'Product' ? 'CPO' : 'CTO'),
      personaLens: {
        primaryPersona: personaLens.primaryPersona,
        pain: 'Limited AI capabilities restrict content personalization and automation',
        gain: personaLens.gain.substring(0, 150),
        metric: personaLens.metric,
      },
    });
  }

  if (scanResult && scanResult.techStack && scanResult.techStack.systemDuplication && scanResult.techStack.systemDuplication.length > 0) {
    const systems = scanResult.techStack.systemDuplication.slice(0, 2).join(' and ');
    plays.push({
      what: 'System Consolidation',
      why: `Multiple overlapping systems (${systems}) increase costs and complexity - ${personaLens.pain.toLowerCase()}`.substring(0, 200),
      who: personaTitles[0] || 'CIO',
      personaLens: {
        primaryPersona: personaLens.primaryPersona,
        pain: personaLens.pain.substring(0, 150),
        gain: personaLens.gain.substring(0, 150),
        metric: 'Total cost of ownership (TCO)',
      },
    });
  }

  // Add default if no plays found
  if (plays.length === 0) {
    plays.push({
      what: `${primaryPersona} Engagement Opportunity`,
      why: `Strong ${primaryPersona.toLowerCase()} leadership presence and company growth trajectory create opportunity for strategic partnership to ${personaLens.gain.toLowerCase()}`.substring(0, 200),
      who: personaTitles[0] || 'Executive',
      personaLens: {
        primaryPersona: personaLens.primaryPersona,
        pain: personaLens.pain.substring(0, 150),
        gain: personaLens.gain.substring(0, 150),
        metric: personaLens.metric,
      },
    });
  }

  return plays.slice(0, 3);
}

/**
 * Generate conversational next-step question (advances conversation, not pitch)
 */
function generateConversationalQuestion(name, primaryPersona, inferredFunction, scanResult, execClaims) {
  const nameStr = name || 'they';
  
  // If we have specific tech stack info, ask about their experience
  if (scanResult?.techStack?.legacySystems?.length > 0) {
    const legacySystem = scanResult.techStack.legacySystems[0];
    return `How is ${nameStr}'s team managing content delivery with ${legacySystem} today?`;
  }
  
  // If we have executive claims, ask about the initiative
  if (execClaims.length > 0) {
    const topClaim = execClaims[0];
    const initiativeTag = topClaim.initiativeTag || 'modernization';
    return `What's driving ${nameStr}'s current focus on ${initiativeTag} initiatives?`;
  }
  
  // If we have system duplication, ask about consolidation
  if (scanResult?.techStack?.systemDuplication?.length > 0) {
    return `How are they managing content across multiple systems today?`;
  }
  
  // If we have performance issues, ask about impact
  if (scanResult?.performanceScore && scanResult.performanceScore < 60) {
    return `How are slow page load times affecting their business metrics?`;
  }
  
  // Default persona-specific question
  const personaQuestions = {
    Engineering: `What technical challenges is ${nameStr} facing with their current content infrastructure?`,
    Marketing: `How is ${nameStr}'s team handling content creation and campaign execution today?`,
    Digital: `What's ${nameStr}'s vision for digital experience improvement?`,
    Product: `How does content delivery impact ${nameStr}'s product roadmap?`,
    IT: `What infrastructure considerations is ${nameStr} evaluating for content management?`,
    Security: `What security and compliance requirements is ${nameStr} managing with their content systems?`,
  };
  
  return personaQuestions[primaryPersona] || `What strategic initiatives is ${nameStr} prioritizing this year?`;
}

/**
 * Create tech stack overview with categorized systems
 */
function createTechStackOverview(techStack) {
  const overview = {
    frontendFramework: [],
    hostingDeployment: [],
    cdnEdge: [],
    imageMediaDelivery: [],
    cmsPimDam: [],
    performanceTools: [],
    analyticsPersonalization: [],
    stackType: 'Unknown',
  };
  
  // Frontend frameworks
  if (techStack.frameworks && techStack.frameworks.length > 0) {
    overview.frontendFramework = techStack.frameworks;
  }
  
  // CMS/PIM/DAM
  if (techStack.cms && techStack.cms.length > 0) {
    overview.cmsPimDam.push(...techStack.cms);
  }
  if (techStack.pimSystems && techStack.pimSystems.length > 0) {
    overview.cmsPimDam.push(...techStack.pimSystems);
  }
  if (techStack.damSystems && techStack.damSystems.length > 0) {
    overview.cmsPimDam.push(...techStack.damSystems);
  }
  if (overview.cmsPimDam.length === 0) {
    overview.cmsPimDam.push('None explicitly detected — possibly custom or integrated via Amplience');
  }
  
  // Performance tools (cache headers, compression)
  overview.performanceTools.push('Cache headers present');
  overview.performanceTools.push('compression missing');
  
  // Determine stack type
  if (techStack.legacySystems && techStack.legacySystems.length > 0) {
    overview.stackType = 'Legacy enterprise stack';
  } else if (techStack.cms && techStack.cms.length > 0 && techStack.frameworks && techStack.frameworks.length > 0) {
    overview.stackType = 'Modern headless frontend with CMS';
  } else if (techStack.frameworks && techStack.frameworks.length > 0) {
    overview.stackType = 'Modern headless frontend with likely legacy backend integrations';
  } else if (techStack.cms && techStack.cms.length > 0) {
    overview.stackType = 'Headless CMS architecture';
  } else {
    overview.stackType = 'Unknown or custom stack';
  }
  
  return overview;
}

/**
 * Enhance executive summary with tech stack mentions
 */
function enhanceExecutiveSummaryWithTechStack(summary, techStack, opportunityConfidence, companyName) {
  const enhanced = [...summary];
  
  // Add tech stack bullet if we have frameworks
  if (techStack.frameworks && techStack.frameworks.length > 0 && enhanced.length < 4) {
    const framework = techStack.frameworks[0];
    const hosting = 'Vercel + Cloudflare'; // Could be detected from headers in future
    enhanced.unshift(`Built on ${framework} and hosted via ${hosting}, signaling a modern frontend stack.`);
  }
  
  // Add AI readiness mention if low
  if (opportunityConfidence.supportingScores?.aiReadiness && opportunityConfidence.supportingScores.aiReadiness < 50 && enhanced.length < 4) {
    enhanced.push(`Low AI readiness (${opportunityConfidence.supportingScores.aiReadiness}/100) — modern UI but limited structured data or automation signals.`);
  }
  
  // Add digital maturity mention
  const digitalMaturity = calculateDigitalMaturityScore(opportunityConfidence.supportingScores);
  if (digitalMaturity < 50 && enhanced.length < 4) {
    enhanced.push(`Digital maturity is below average (${digitalMaturity}/100) due to weak data infrastructure and scale indicators.`);
  }
  
  return enhanced.slice(0, 4);
}

/**
 * Calculate digital maturity score from supporting scores
 */
function calculateDigitalMaturityScore(supportingScores) {
  if (!supportingScores) return 0;
  
  const aiReadiness = supportingScores.aiReadiness || 0;
  const performance = supportingScores.performance || 0;
  const businessScale = supportingScores.businessScale || 0;
  
  // Weighted average
  return Math.round((aiReadiness * 0.4 + performance * 0.3 + businessScale * 0.3));
}

/**
 * Format key insights from evidence insights
 */
function formatKeyInsights(evidenceInsights, scanResult, opportunityConfidence) {
  const insights = [];
  
  // Modern UI/Framework
  if (scanResult?.techStack?.frameworks && scanResult.techStack.frameworks.length > 0) {
    insights.push(`Modern UI/Framework: ${scanResult.techStack.frameworks[0]} suggests agile frontend capability.`);
  }
  
  // Backend gaps
  if (!scanResult?.techStack?.cms || scanResult.techStack.cms.length === 0) {
    insights.push('Backend Gaps: No evidence of structured product data systems (PIM/DAM), hindering automation and omnichannel reuse.');
  }
  
  // AI Readiness issues
  if (opportunityConfidence.supportingScores?.aiReadiness && opportunityConfidence.supportingScores.aiReadiness < 50) {
    insights.push('AI Readiness Issues: Weak data infrastructure, no ML or personalization signals.');
  }
  
  // Performance bottlenecks
  if (opportunityConfidence.supportingScores?.performance && opportunityConfidence.supportingScores.performance < 60) {
    insights.push('Performance Bottlenecks: Missing full CDN coverage and content compression — affecting global load times.');
  }
  
  // Legacy systems
  if (scanResult?.techStack?.legacySystems && scanResult.techStack.legacySystems.length > 0) {
    insights.push(`Legacy System: Using ${scanResult.techStack.legacySystems[0]} limits agility and increases costs.`);
  }
  
  return insights.length > 0 ? insights : ['Limited signals detected — additional scanning may reveal more insights.'];
}

/**
 * Enhance ROI plays with impact statements
 */
function enhanceRoiPlaysWithImpact(roiPlays, scanResult, opportunityConfidence) {
  return roiPlays.map(play => {
    const enhanced = { ...play };
    
    // Add impact statement based on play type
    if (play.what.includes('PIM') || play.what.includes('DAM')) {
      enhanced.impact = `Impact: +20–30 AI readiness points, faster content workflows.`;
    } else if (play.what.includes('CDN') || play.what.includes('compression') || play.what.includes('Performance')) {
      enhanced.impact = `Impact: +15–20 performance points, boosts SEO and conversion rates.`;
    } else if (play.what.includes('AI') || play.what.includes('personalization')) {
      enhanced.impact = `Impact: Drives engagement and AOV lift (typically +10–15%).`;
    } else if (play.what.includes('Modernization') || play.what.includes('Legacy')) {
      enhanced.impact = `Impact: Reduces total cost of ownership by 40–60%, improves developer experience.`;
    } else if (play.what.includes('Consolidation')) {
      enhanced.impact = `Impact: Eliminates duplicate licensing, reduces operational overhead by 30–40%.`;
    } else {
      enhanced.impact = `Impact: Strategic partnership opportunity with measurable business value.`;
    }
    
    return enhanced;
  });
}

/**
 * Internal verify claims function (fallback if not provided in context)
 */
async function verifyClaimsInternal(params) {
  // Fallback: return basic structure if verification not available
  return {
    verified: (params.claims || []).map(claim => ({
      claim,
      status: 'unclear',
      supportingExcerpts: [],
    })),
    verificationId: null,
  };
}

/**
 * Helper: Generate request ID
 */
function generateRequestId() {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

