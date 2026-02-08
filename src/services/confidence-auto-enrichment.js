/**
 * Confidence-Based Auto-Enrichment Service
 * Automatically triggers additional research when confidence scores are low
 * to improve data completeness and accuracy for users
 */

/**
 * Determine if auto-enrichment is needed based on confidence scores
 * 
 * @param {Object} briefData - Brief data with confidence scores
 * @param {Object} [briefData.opportunityConfidence] - Opportunity confidence object
 * @param {number} [briefData.opportunityConfidence.score] - Confidence score (0-100)
 * @param {string} [briefData.opportunityConfidence.confidence] - Confidence level: 'low'|'medium'|'high'
 * @param {string} [briefData.opportunityConfidence.evidenceStrength] - Evidence strength: 'weak'|'moderate'|'strong'
 * @param {Array} [briefData.evidenceInsights] - Evidence insights array
 * @param {Object} [briefData.personaLens] - Persona lens object
 * @param {Object} [scanResult={}] - Scan result data
 * @param {Object} [scanResult.techStack] - Technology stack data
 * @param {Array} [execClaims=[]] - Executive claims array
 * @param {string} [execClaims[].confidence] - Claim confidence: 'low'|'medium'|'high'
 * @returns {Object} Assessment result
 * @returns {boolean} returns.needsEnrichment - Whether enrichment is needed
 * @returns {string} returns.confidence - Current confidence level
 * @returns {number} returns.score - Current confidence score
 * @returns {string} returns.evidenceStrength - Evidence strength
 * @returns {string[]} returns.reasons - Reasons why enrichment is needed
 * @returns {Array<Object>} returns.enrichmentActions - Actions to take for enrichment
 * @returns {string} returns.enrichmentPath - Primary enrichment method
 * @returns {string} returns.priority - Priority level: 'high'|'medium'|'none'
 */
export function assessConfidenceAndEnrichmentNeeds(briefData, scanResult = {}, execClaims = []) {
  const reasons = [];
  const enrichmentActions = [];
  
  // Check opportunity confidence
  const oppConfidence = briefData?.opportunityConfidence || {};
  const oppScore = oppConfidence.score || 0;
  const evidenceStrength = oppConfidence.evidenceStrength || 'weak';
  const confidence = oppConfidence.confidence || 'low';
  
  // Low confidence triggers
  if (confidence === 'low' || (oppScore < 50 && evidenceStrength === 'weak')) {
    reasons.push('Low opportunity confidence score with weak evidence');
    
    // Determine enrichment path
    if (!scanResult?.techStack?.legacySystems?.length) {
      enrichmentActions.push({
        action: 'deepScan',
        reason: 'No legacy systems detected - perform deeper technology stack analysis',
        priority: 'high',
        method: 'crawlAndExtract',
      });
    }
    
    if (execClaims.length === 0) {
      enrichmentActions.push({
        action: 'searchExecClaims',
        reason: 'No executive claims found - search for public statements and press releases',
        priority: 'high',
        method: 'webSearch',
      });
    }
    
    if (evidenceStrength === 'weak') {
      enrichmentActions.push({
        action: 'extractMoreEvidence',
        reason: 'Weak evidence strength - extract more detailed content from key pages',
        priority: 'medium',
        method: 'distributedCrawl',
      });
    }
  }
  
  // Check evidence insights
  const evidenceInsights = briefData?.evidenceInsights || [];
  if (evidenceInsights.length < 3) {
    reasons.push('Insufficient evidence insights (less than 3)');
    enrichmentActions.push({
      action: 'crawlKeyPages',
      reason: 'Limited evidence insights - crawl about, leadership, and press pages',
      priority: 'medium',
      method: 'smartCrawl',
    });
  }
  
  // Check executive claims confidence
  const lowConfidenceClaims = execClaims.filter(c => c.confidence === 'low' || !c.confidence);
  if (lowConfidenceClaims.length > execClaims.length * 0.5) {
    reasons.push('More than 50% of executive claims have low confidence');
    enrichmentActions.push({
      action: 'verifyClaims',
      reason: 'High proportion of low-confidence claims - verify with additional sources',
      priority: 'high',
      method: 'verifyClaims',
    });
  }
  
  // Check persona lens completeness
  const personaLens = briefData?.personaLens || {};
  if (!personaLens.primaryPersona || !personaLens.pain || !personaLens.gain || !personaLens.metric) {
    reasons.push('Incomplete persona lens data');
    enrichmentActions.push({
      action: 'analyzePersona',
      reason: 'Missing persona insights - analyze company structure and job postings',
      priority: 'medium',
      method: 'crawlCareersPage',
    });
  }
  
  // Check scan result completeness
  if (!scanResult?.techStack || Object.keys(scanResult.techStack || {}).length === 0) {
    reasons.push('Missing or incomplete technology stack data');
    enrichmentActions.push({
      action: 'detectTechStack',
      reason: 'No tech stack detected - perform comprehensive stack analysis',
      priority: 'high',
      method: 'deepScan',
    });
  }
  
  // Determine enrichment path priority
  const highPriorityActions = enrichmentActions.filter(a => a.priority === 'high');
  const mediumPriorityActions = enrichmentActions.filter(a => a.priority === 'medium');
  
  // Build enrichment path
  let enrichmentPath = 'none';
  if (highPriorityActions.length > 0) {
    enrichmentPath = highPriorityActions[0].method;
  } else if (mediumPriorityActions.length > 0) {
    enrichmentPath = mediumPriorityActions[0].method;
  }
  
  return {
    needsEnrichment: reasons.length > 0,
    confidence: confidence,
    score: oppScore,
    evidenceStrength: evidenceStrength,
    reasons,
    enrichmentActions,
    enrichmentPath,
    priority: highPriorityActions.length > 0 ? 'high' : (mediumPriorityActions.length > 0 ? 'medium' : 'none'),
  };
}

/**
 * Execute auto-enrichment based on assessment
 * 
 * @param {Object} context - Execution context with all handlers
 * @param {Function} [context.handleScan] - Scan handler function
 * @param {Function} [context.handleDistributedCrawl] - Distributed crawl handler
 * @param {Function} [context.verifyClaimsInternal] - Claims verification function
 * @param {Function} [context.searchProvider] - Search provider function
 * @param {Function} [context.crawlWithConcurrency] - Concurrent crawl function
 * @param {Function} [context.discoverPages] - Page discovery function
 * @param {Function} [context.detectTechnologyStack] - Tech stack detection function
 * @param {Function} [context.readHtmlWithLimit] - HTML reading function
 * @param {Function} [context.fetchWithTimeout] - Fetch with timeout function
 * @param {Function} [context.getBrowserHeaders] - Browser headers generator
 * @param {Function} [context.extractTitle] - Title extraction function
 * @param {Function} [context.cleanMainText] - Text cleaning function
 * @param {string} [context.rootDomain] - Root domain
 * @param {string} [context.companyName] - Company name
 * @param {string} [context.canonicalUrl] - Canonical URL
 * @param {Array} [context.execClaims] - Executive claims
 * @param {string} [context.requestId] - Request ID
 * @param {Object} [context.env] - Environment bindings
 * @param {Object} assessment - Enrichment assessment result from assessConfidenceAndEnrichmentNeeds
 * @param {string} assessment.enrichmentPath - Primary enrichment method
 * @param {Array<Object>} assessment.enrichmentActions - Actions to execute
 * @param {Object} params - Original request parameters
 * @param {string} [params.name] - Person name
 * @param {string} [params.companyDomain] - Company domain
 * @param {string} [params.companyName] - Company name
 * @param {string} [params.profileUrl] - Profile URL
 * @param {string} [params.mode] - Mode: 'fast'|'deep'
 * @returns {Promise<Object>} Enrichment results
 * @returns {boolean} returns.enriched - Whether enrichment was performed
 * @returns {string} [returns.reason] - Reason if enrichment not needed
 * @returns {string} returns.enrichmentPath - Enrichment method used
 * @returns {Array<Object>} returns.actionsTaken - Actions executed
 * @returns {Object} returns.improvements - Improvements made (techStack, execClaims, evidence, personaInsights)
 */
export async function executeAutoEnrichment(context, assessment, params) {
  if (!assessment.needsEnrichment) {
    return {
      enriched: false,
      reason: 'No enrichment needed - confidence is sufficient',
    };
  }
  
  const results = {
    enriched: true,
    enrichmentPath: assessment.enrichmentPath,
    actionsTaken: [],
    improvements: {},
  };
  
  // Execute enrichment actions based on priority
  const actionsToExecute = [
    ...assessment.enrichmentActions.filter(a => a.priority === 'high'),
    ...assessment.enrichmentActions.filter(a => a.priority === 'medium'),
  ];
  
  for (const action of actionsToExecute.slice(0, 3)) { // Limit to 3 actions to avoid timeout
    try {
      let actionResult = null;
      
      switch (action.method) {
        case 'crawlAndExtract':
          // Deep crawl for tech stack
          actionResult = await executeDeepTechCrawl(context, params);
          break;
          
        case 'webSearch':
          // Search for executive claims
          actionResult = await executeExecClaimsSearch(context, params);
          break;
          
        case 'distributedCrawl':
          // Distributed crawl for more evidence
          actionResult = await executeDistributedCrawl(context, params);
          break;
          
        case 'smartCrawl':
          // Smart crawl of key pages
          actionResult = await executeSmartCrawl(context, params);
          break;
          
        case 'verifyClaims':
          // Verify existing claims
          actionResult = await executeClaimsVerification(context, params);
          break;
          
        case 'crawlCareersPage':
          // Crawl careers page for persona insights
          actionResult = await executeCareersCrawl(context, params);
          break;
          
        case 'deepScan':
          // Deep scan for tech stack
          actionResult = await executeDeepScan(context, params);
          break;
          
        default:
          actionResult = { success: false, error: `Unknown enrichment method: ${action.method}` };
      }
      
      if (actionResult && actionResult.success) {
        results.actionsTaken.push({
          action: action.action,
          method: action.method,
          success: true,
          improvements: actionResult.improvements || {},
        });
        
        // Merge improvements
        Object.assign(results.improvements, actionResult.improvements || {});
      }
    } catch (error) {
      results.actionsTaken.push({
        action: action.action,
        method: action.method,
        success: false,
        error: error.message,
      });
    }
  }
  
  return results;
}

/**
 * Execute deep technology stack crawl
 */
async function executeDeepTechCrawl(context, params) {
  const { canonicalUrl, crawlWithConcurrency, discoverPages, detectTechnologyStack, readHtmlWithLimit, fetchWithTimeout, getBrowserHeaders } = context;
  
  try {
    // Discover more pages focusing on technical areas
    const techPages = await discoverPages(canonicalUrl || params.companyDomain, 20);
    const techFocused = techPages.filter(p => 
      ['docs', 'developer', 'api', 'integration', 'security', 'infrastructure'].some(tag => 
        p.type?.toLowerCase().includes(tag) || p.url?.toLowerCase().includes(tag)
      )
    );
    
    // Crawl technical pages
    const crawled = await crawlWithConcurrency(
      techFocused.slice(0, 5).map(p => p.url),
      3,
      async (url) => {
        try {
          const response = await fetchWithTimeout(url, {
            method: 'GET',
            headers: getBrowserHeaders(),
          }, 10000);
          
          if (!response.ok) return null;
          
          const html = await readHtmlWithLimit(response, 250000);
          const techStack = detectTechnologyStack(html, response.headers, [], [], null);
          
          return { url, techStack };
        } catch (e) {
          return null;
        }
      },
      10000
    );
    
    // Merge tech stack findings
    const mergedTechStack = {};
    crawled.results.forEach(r => {
      if (r && r.techStack) {
        Object.assign(mergedTechStack, r.techStack);
      }
    });
    
    return {
      success: true,
      improvements: {
        techStackEnhanced: true,
        pagesCrawled: crawled.results.filter(Boolean).length,
        techStack: mergedTechStack,
      },
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Execute executive claims search
 */
async function executeExecClaimsSearch(context, params) {
  const { searchProvider, rootDomain, companyName } = context;
  
  try {
    if (!searchProvider) {
      return { success: false, error: 'Search provider not available' };
    }
    
    // Search for executive statements
    const queries = [
      `${companyName || rootDomain} CEO CTO executive statement 2024 2025`,
      `${companyName || rootDomain} digital transformation modernization`,
      `${companyName || rootDomain} press release announcement`,
    ];
    
    const allResults = [];
    for (const query of queries.slice(0, 2)) { // Limit to 2 queries
      try {
        const results = await searchProvider(query, { limit: 5, recencyDays: 365 });
        allResults.push(...(results || []));
      } catch (e) {
        // Continue with next query
      }
    }
    
    // Extract claims from results
    const claims = allResults
      .filter(r => r.title || r.snippet)
      .map(r => ({
        speaker: extractSpeaker(r.title || r.snippet || ''),
        role: extractRole(r.title || r.snippet || ''),
        claim: (r.snippet || r.title || '').substring(0, 200),
        url: r.url,
        publishedAt: r.publishedAt || null,
        confidence: 'medium',
        sourceType: 'third-party',
      }))
      .filter(c => c.claim.length > 20);
    
    return {
      success: true,
      improvements: {
        execClaimsEnhanced: true,
        claimsFound: claims.length,
        claims: claims.slice(0, 5),
      },
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Execute distributed crawl
 */
async function executeDistributedCrawl(context, params) {
  const { discoverPages, crawlWithConcurrency, fetchWithTimeout, readHtmlWithLimit, getBrowserHeaders, extractTitle, cleanMainText, extractExcerpts, detectSignals, canonicalUrl } = context;
  
  try {
    if (!discoverPages || !crawlWithConcurrency) {
      return { success: false, error: 'Distributed crawl functions not available' };
    }
    
    const targetUrl = canonicalUrl || params.companyDomain || params.canonicalUrl;
    if (!targetUrl) {
      return { success: false, error: 'No URL available for distributed crawl' };
    }
    
    // Discover pages
    const pages = await discoverPages(targetUrl, 20);
    const relevantPages = pages.filter(p => 
      ['about', 'leadership', 'press', 'news', 'blog'].some(type => 
        p.type?.toLowerCase().includes(type) || p.url?.toLowerCase().includes(type)
      )
    ).slice(0, 10);
    
    if (relevantPages.length === 0) {
      return { success: false, error: 'No relevant pages found for distributed crawl' };
    }
    
    // Crawl pages concurrently
    const crawled = await crawlWithConcurrency(
      relevantPages.map(p => p.url),
      3,
      async (url) => {
        try {
          const response = await fetchWithTimeout(url, {
            method: 'GET',
            headers: getBrowserHeaders(),
          }, 10000);
          
          if (!response.ok) return null;
          
          const html = await readHtmlWithLimit(response, 250000);
          const title = extractTitle(html);
          const text = cleanMainText(html);
          const excerpts = extractExcerpts(text, 500);
          const signals = detectSignals(html, text, excerpts);
          
          return {
            url,
            title,
            text: text.substring(0, 5000),
            excerpts: excerpts.slice(0, 5),
            signals,
          };
        } catch (e) {
          return null;
        }
      },
      10000
    );
    
    const successful = crawled.results.filter(Boolean);
    
    return {
      success: successful.length > 0,
      improvements: {
        evidenceEnhanced: successful.length > 0,
        pagesCrawled: successful.length,
        evidence: successful.slice(0, 10),
      },
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Execute smart crawl
 */
async function executeSmartCrawl(context, params) {
  // Similar to distributed crawl but with different parameters
  return executeDistributedCrawl(context, params);
}

/**
 * Execute claims verification
 */
async function executeClaimsVerification(context, params) {
  const { verifyClaimsInternal, execClaims } = context;
  
  try {
    if (!verifyClaimsInternal || !execClaims || execClaims.length === 0) {
      return { success: false, error: 'No claims to verify' };
    }
    
    // Verify low-confidence claims
    const lowConfidenceClaims = execClaims.filter(c => c.confidence === 'low' || !c.confidence);
    if (lowConfidenceClaims.length === 0) {
      return { success: false, error: 'No low-confidence claims to verify' };
    }
    
    // Call verifyClaimsInternal with proper format (expects { claims, sources }, not context)
    const claimsToVerify = lowConfidenceClaims.slice(0, 5);
    const verifyResult = await verifyClaimsInternal({
      claims: claimsToVerify.map(c => c.claim || c.text || ''),
      sources: claimsToVerify.map(c => c.url).filter(Boolean),
    });
    
    const verifiedCount = verifyResult?.verified?.filter(v => v.status === 'supported').length || 0;
    
    // Update confidence levels for verified claims
    const updatedClaims = claimsToVerify.map((claim, idx) => {
      const verified = verifyResult?.verified?.[idx];
      if (verified && verified.status === 'supported') {
        return {
          ...claim,
          confidence: verified.supportingExcerpts?.length >= 2 ? 'high' : 'medium',
        };
      }
      return claim;
    });
    
    return {
      success: true,
      improvements: {
        claimsVerified: true,
        claimsVerifiedCount: verifiedCount,
        verificationId: verifyResult?.verificationId || null,
        verifiedClaims: updatedClaims,
      },
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Execute careers page crawl
 */
async function executeCareersCrawl(context, params) {
  const { canonicalUrl, crawlWithConcurrency, readHtmlWithLimit, fetchWithTimeout, getBrowserHeaders, extractTitle, cleanMainText } = context;
  
  try {
    const careersUrl = `${canonicalUrl || params.companyDomain}/careers`;
    
    const response = await fetchWithTimeout(careersUrl, {
      method: 'GET',
      headers: getBrowserHeaders(),
    }, 10000);
    
    if (!response.ok) {
      return { success: false, error: `Careers page not accessible: ${response.status}` };
    }
    
    const html = await readHtmlWithLimit(response, 250000);
    const text = cleanMainText(html);
    
    // Extract persona insights from job postings
    const personaInsights = extractPersonaFromCareers(text);
    
    return {
      success: true,
      improvements: {
        personaEnhanced: true,
        personaInsights,
      },
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Execute deep scan
 */
async function executeDeepScan(context, params) {
  const { fetchWithTimeout, readHtmlWithLimit, getBrowserHeaders, detectTechnologyStack, extractScriptSrcs, extractLinkHrefs, canonicalUrl } = context;
  
  try {
    const targetUrl = canonicalUrl || params.companyDomain || params.canonicalUrl;
    if (!targetUrl) {
      return { success: false, error: 'No URL available for deep scan' };
    }
    
    // Perform deep scan
    const response = await fetchWithTimeout(targetUrl, {
      method: 'GET',
      headers: getBrowserHeaders(),
    }, 15000);
    
    if (!response.ok) {
      return { success: false, error: `Scan failed: ${response.status}` };
    }
    
    const html = await readHtmlWithLimit(response, 500000);
    const scriptSrcs = extractScriptSrcs ? extractScriptSrcs(html) : [];
    const linkHrefs = extractLinkHrefs ? extractLinkHrefs(html) : [];
    const headers = Object.fromEntries(response.headers.entries());
    
    const techStack = detectTechnologyStack(html, headers, scriptSrcs, linkHrefs, null);
    
    return {
      success: true,
      improvements: {
        scanEnhanced: true,
        techStack: techStack || {},
      },
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Extract speaker name from text
 */
function extractSpeaker(text) {
  const patterns = [
    /(?:CEO|CTO|CMO|VP|President|Director)\s+([A-Z][a-z]+\s+[A-Z][a-z]+)/i,
    /([A-Z][a-z]+\s+[A-Z][a-z]+),?\s+(?:CEO|CTO|CMO|VP|President|Director)/i,
  ];
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[1] || match[0];
  }
  
  return 'Executive';
}

/**
 * Extract role from text
 */
function extractRole(text) {
  const roles = ['CEO', 'CTO', 'CMO', 'VP', 'President', 'Director'];
  for (const role of roles) {
    if (text.toLowerCase().includes(role.toLowerCase())) {
      return role;
    }
  }
  return 'Executive';
}

/**
 * Extract persona insights from careers page text
 */
function extractPersonaFromCareers(text) {
  const insights = {
    primaryPersona: null,
    pain: null,
    gain: null,
    metric: null,
  };
  
  const textLower = text.toLowerCase();
  
  // Detect primary persona from job postings
  if (textLower.includes('engineer') || textLower.includes('developer') || textLower.includes('software')) {
    insights.primaryPersona = 'Engineering';
    insights.pain = 'Technical debt and legacy systems slowing development';
    insights.gain = 'Faster feature delivery and modern tech stack';
    insights.metric = 'Time to market for new features';
  } else if (textLower.includes('marketing') || textLower.includes('brand') || textLower.includes('content')) {
    insights.primaryPersona = 'Marketing';
    insights.pain = 'Fragmented content systems and inconsistent messaging';
    insights.gain = 'Unified content delivery and brand consistency';
    insights.metric = 'Customer acquisition cost (CAC)';
  } else if (textLower.includes('product') || textLower.includes('design') || textLower.includes('ux')) {
    insights.primaryPersona = 'Digital / Product';
    insights.pain = 'Slow content updates hindering user experience';
    insights.gain = 'Dynamic, personalized user experiences';
    insights.metric = 'Conversion rates and user engagement';
  }
  
  return insights;
}
