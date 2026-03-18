/**
 * OSINT Pipeline Stages
 * Implements the staged OSINT pipeline for year-ahead company intelligence
 */

import {
  calculateSourceScore,
  calculateInitiativeScore,
  determineConfidence,
  detectTimeHorizon,
  isFirstParty as isFirstPartySource,
} from './scoring.js';
import { extractRootDomain } from '../sanity-client.js';
import { deduplicateByKey, truncateText, isFirstParty } from './utils.js';

/**
 * Stage 0: Load or create account context
 */
export async function stage0_LoadAccount(context) {
  const { accountKey, canonicalUrl, companyName, groqQuery, upsertDocument, client } = context;
  
  // Try to load existing account from Sanity
  const query = `*[_type == "account" && accountKey == $accountKey][0]`;
  const existing = await groqQuery(client, query, { accountKey });
  
  if (existing) {
    return {
      account: existing,
      accountKey: existing.accountKey,
      canonicalUrl: existing.canonicalUrl || canonicalUrl,
      rootDomain: existing.domain || extractRootDomain(canonicalUrl),
      companyName: existing.companyName || companyName,
    };
  }
  
  // Create new account
  const rootDomain = extractRootDomain(canonicalUrl);
  const accountDoc = {
    _type: 'account',
    _id: `account.${accountKey}`,
    accountKey,
    canonicalUrl,
    rootDomain,
    companyName: companyName || null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  
  await upsertDocument(client, accountDoc);
  
  return {
    account: accountDoc,
    accountKey,
    canonicalUrl,
    rootDomain,
    companyName: companyName || null,
  };
}

/**
 * Stage 1: Discover pages and identify common page types
 */
export async function stage1_DiscoverPages(context) {
  const { canonicalUrl, handleDiscover, requestId } = context;
  
  if (!canonicalUrl) {
    throw new Error('canonicalUrl is required for discovery');
  }
  
  // Create a mock request for handleDiscover
  const discoverRequest = new Request('http://localhost/discover', {
    method: 'POST',
    body: JSON.stringify({ url: canonicalUrl, budget: 30 }), // Increased budget to find more pages
    headers: { 'Content-Type': 'application/json' },
  });
  
  try {
    const response = await handleDiscover(discoverRequest, requestId);
    const result = await response.json();
    
    if (!result.ok || !result.data) {
      // Return empty object instead of throwing - discovery is optional
      console.warn(`Discovery failed for ${canonicalUrl}: ${result.error?.message || 'Unknown error'}`);
      return { pages: [], prioritizedPages: [] };
    }
    
    const discoveredData = result.data;
    const allPages = discoveredData.pages || discoveredData.candidates || [];
    
    // Identify and prioritize common page types
    const prioritizedPages = identifyCommonPages(allPages, canonicalUrl);
    
    return {
      ...discoveredData,
      pages: allPages,
      prioritizedPages, // Pages to crawl for OSINT
    };
  } catch (e) {
    console.warn(`Discovery error for ${canonicalUrl}:`, e.message);
    return { pages: [], prioritizedPages: [] }; // Return empty object, discovery is optional
  }
}

/**
 * Identify common page types (investor relations, sustainability, etc.)
 */
function identifyCommonPages(pages, baseUrl) {
  const prioritized = [];
  const pageTypes = {
    investor: {
      keywords: ['investor', 'ir.', 'shareholder', 'financial', 'earnings', 'sec filing', 'annual report'],
      urls: ['/investor', '/investors', '/ir', '/shareholders', '/financial'],
      priority: 10,
    },
    sustainability: {
      keywords: ['sustainability', 'esg', 'environmental', 'social responsibility', 'carbon', 'climate'],
      urls: ['/sustainability', '/esg', '/environment', '/responsibility', '/impact'],
      priority: 9,
    },
    about: {
      keywords: ['about', 'company', 'our story', 'mission', 'vision', 'values'],
      urls: ['/about', '/company', '/our-story', '/mission'],
      priority: 8,
    },
    careers: {
      keywords: ['careers', 'jobs', 'hiring', 'join us', 'work with us'],
      urls: ['/careers', '/jobs', '/hiring', '/join'],
      priority: 7,
    },
    news: {
      keywords: ['news', 'press', 'blog', 'announcements', 'updates'],
      urls: ['/news', '/press', '/blog', '/announcements'],
      priority: 6,
    },
    leadership: {
      keywords: ['leadership', 'team', 'executives', 'management', 'board'],
      urls: ['/leadership', '/team', '/executives', '/management'],
      priority: 5,
    },
  };
  
  for (const page of pages) {
    const url = (page.url || '').toLowerCase();
    const title = (page.title || '').toLowerCase();
    const combined = `${url} ${title}`;
    
    for (const [type, config] of Object.entries(pageTypes)) {
      const matchesKeyword = config.keywords.some(kw => combined.includes(kw));
      const matchesUrl = config.urls.some(pattern => url.includes(pattern));
      
      if (matchesKeyword || matchesUrl) {
        prioritized.push({
          url: page.url,
          title: page.title,
          type,
          priority: config.priority,
          reason: matchesUrl ? 'URL pattern match' : 'Keyword match',
        });
        break; // Only match once per page
      }
    }
  }
  
  // Sort by priority and deduplicate
  prioritized.sort((a, b) => b.priority - a.priority);
  const seen = new Set();
  return prioritized.filter(p => {
    if (seen.has(p.url)) return false;
    seen.add(p.url);
    return true;
  }).slice(0, 10); // Limit to top 10 prioritized pages
}

/**
 * Stage 2: Search web
 */
export async function stage2_SearchWeb(context) {
  const { canonicalUrl, rootDomain, companyName, dateRange, recencyDays, handleSearch, requestId } = context;
  
  const searchTerms = companyName || rootDomain;
  if (!searchTerms) {
    console.warn('No company name or root domain for search');
    return [];
  }
  
  // Use date range for search queries - focus on next 12 months
  const queries = [
    `${searchTerms} next 12 months roadmap`,
    `${searchTerms} upcoming initiatives 2026`,
    `${searchTerms} upcoming initiatives 2027`,
    `${searchTerms} digital transformation plans`,
    `${searchTerms} technology strategy next year`,
    `${searchTerms} future plans upcoming year`,
  ];
  
  const allResults = [];
  
  for (const query of queries) {
    try {
      const searchRequest = new Request('http://localhost/search', {
        method: 'POST',
        body: JSON.stringify({
          query,
          limit: 10,
          recencyDays: recencyDays || 365,
          mode: 'fast',
        }),
        headers: { 'Content-Type': 'application/json' },
      });
      
      const response = await handleSearch(searchRequest, requestId);
      const result = await response.json();
      
      if (result.ok && result.data?.results && Array.isArray(result.data.results)) {
        allResults.push(...result.data.results);
      }
    } catch (e) {
      console.warn(`Search failed for query "${query}":`, e.message);
      // Continue with other queries
    }
  }
  
  // Deduplicate by URL
  return deduplicateByKey(allResults, 'url');
}

/**
 * Stage 1.5: Crawl prioritized common pages (investor relations, sustainability, etc.)
 */
export async function stage1_5_CrawlCommonPages(context, discoveredPages) {
  const { handleCrawl, handleExtract, rootDomain, requestId, env } = context;
  
  if (!discoveredPages?.prioritizedPages || discoveredPages.prioritizedPages.length === 0) {
    return [];
  }
  
  const crawledPages = [];
  const pagesToCrawl = discoveredPages.prioritizedPages.slice(0, 8); // Limit to top 8 pages
  
  for (const page of pagesToCrawl) {
    try {
      // Crawl the page
      const crawlRequest = new Request('http://localhost/crawl', {
        method: 'POST',
        body: JSON.stringify({
          urls: [page.url],
          concurrency: 1,
        }),
        headers: { 'Content-Type': 'application/json' },
      });
      
      const crawlResponse = await handleCrawl(crawlRequest, requestId, env);
      const crawlResult = await crawlResponse.json();
      
      if (!crawlResult.ok || !crawlResult.data?.results || crawlResult.data.results.length === 0) {
        continue;
      }
      
      const crawlData = crawlResult.data.results[0];
      if (!crawlData || !crawlData.data) {
        continue;
      }
      
      // Extract text content
      const extractRequest = new Request('http://localhost/extract', {
        method: 'POST',
        body: JSON.stringify({
          url: page.url,
          html: crawlData.data.html || '',
        }),
        headers: { 'Content-Type': 'application/json' },
      });
      
      const extractResponse = await handleExtract(extractRequest, requestId, env);
      const extractResult = await extractResponse.json();
      
      if (extractResult.ok && extractResult.data) {
        crawledPages.push({
          url: page.url,
          title: page.title || extractResult.data.title || 'Untitled',
          type: page.type,
          priority: page.priority,
          excerpt: truncateText(extractResult.data.excerpt || extractResult.data.text || '', 1000),
          fullText: truncateText(extractResult.data.text || '', 5000), // Keep more text for analysis
          publishedAt: extractResult.data.publishedAt || null,
          sourceType: 'first_party', // These are first-party sources
          metadata: {
            pageType: page.type,
            reason: page.reason,
          },
        });
      }
    } catch (e) {
      console.warn(`Failed to crawl page ${page.url}:`, e.message);
      // Continue with other pages
    }
  }
  
  return crawledPages;
}

/**
 * Stage 3: Select top sources
 */
export async function stage3_SelectTopSources(context, searchResults) {
  const { rootDomain, year, recencyDays, env } = context;
  const maxSources = parseInt(env.OSINT_MAX_SOURCES) || 25;
  
  if (!searchResults || searchResults.length === 0) {
    return [];
  }
  
  // Score all sources
  const scored = searchResults
    .filter(source => source && source.url) // Filter out invalid sources
    .map(source => ({
      ...source,
      score: calculateSourceScore(source, rootDomain, context.dateRange, recencyDays),
    }))
    .filter(source => source.score > 0); // Filter out zero-score sources
  
  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);
  
  // Take top N
  return scored.slice(0, maxSources);
}

/**
 * Stage 4: Extract evidence from top sources
 */
export async function stage4_ExtractEvidence(context, topSources) {
  const { handleExtract, requestId, env } = context;
  const maxExtract = parseInt(env.OSINT_MAX_EXTRACT) || 15;
  const sourcesToExtract = topSources.slice(0, maxExtract);
  
  if (!sourcesToExtract || sourcesToExtract.length === 0) {
    return [];
  }
  
  const extractions = [];
  const extractionTimeout = 10000; // 10 seconds per extraction
  
  for (const source of sourcesToExtract) {
    if (!source || !source.url) continue;
    
    try {
      const extractRequest = new Request('http://localhost/extract', {
        method: 'POST',
        body: JSON.stringify({
          url: source.url,
          mode: 'fast',
          maxChars: 10000,
        }),
        headers: { 'Content-Type': 'application/json' },
      });
      
      // Add timeout to extraction
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), extractionTimeout);
      
      try {
        const response = await handleExtract(extractRequest, requestId, env);
        clearTimeout(timeoutId);
        const result = await response.json();
        
        if (result.ok && result.data) {
          extractions.push({
            url: source.url,
            title: source.title || result.data.title || 'Untitled',
            excerpt: truncateText(result.data.excerpt || result.data.text || '', 500),
            publishedAt: source.publishedAt || result.data.publishedAt || null,
            sourceType: isFirstPartySource(source.url, context.rootDomain) ? 'first_party' : 'third_party',
            extraction: result.data,
          });
        }
      } catch (timeoutError) {
        clearTimeout(timeoutId);
        if (timeoutError.name === 'AbortError') {
          console.warn(`Extraction timeout for ${source.url}`);
        } else {
          throw timeoutError;
        }
      }
    } catch (e) {
      // Continue on extraction failure
      console.error(`Extraction failed for ${source.url}:`, e.message);
    }
  }
  
  return extractions;
}

/**
 * Stage 5: Optional verify top claims
 */
export async function stage5_VerifyClaims(context, extractions) {
  // For now, skip verification to keep pipeline fast
  // Can be implemented later if needed
  return { verified: true, claims: [] };
}

/**
 * Stage 6: Synthesize year-ahead report with timeline analysis and benchmarking
 */
export async function stage6_SynthesizeReport(context, discoveredPages, searchResults, topSources, extractions, crawledPages) {
  const { rootDomain, dateRange, companyName, accountKey, groqQuery, client } = context;
  
  // Combine crawled pages with extractions for analysis
  const allExtractions = [...(extractions || []), ...(crawledPages || [])];
  
  // Get historical report (12 months ago) for comparison
  const historicalReport = await getHistoricalReport(accountKey, dateRange, groqQuery, client);
  
  // Extract initiatives from extractions (including crawled pages)
  const initiatives = extractInitiatives(allExtractions, topSources || [], rootDomain, dateRange);
  
  // Compare with historical initiatives and determine status
  const { categorizedInitiatives, timelineAnalysis } = analyzeTimelineAndProgress(
    initiatives,
    historicalReport?.initiatives || [],
    dateRange
  );
  
  // Get industry and competitor benchmarking
  const benchmarking = await generateBenchmarking(
    accountKey,
    rootDomain,
    categorizedInitiatives,
    timelineAnalysis,
    dateRange,
    groqQuery,
    client
  );
  
  // Generate executive summary with timeline insights and benchmarking
  const executiveSummary = generateExecutiveSummary(
    categorizedInitiatives,
    companyName || rootDomain,
    dateRange,
    timelineAnalysis,
    benchmarking
  );
  
  // Extract signals (including from crawled pages)
  const risks = extractRisks(allExtractions);
  const hiringSignals = extractHiringSignals(allExtractions, discoveredPages || {});
  const digitalSignals = extractDigitalSignals(allExtractions, discoveredPages || {});
  const recommendedNextSteps = generateNextSteps(categorizedInitiatives, timelineAnalysis, benchmarking);
  
  // Extract insights from crawled pages by type
  const pageInsights = extractPageInsights(crawledPages || [], dateRange);
  
  return {
    executiveSummary: executiveSummary.length > 0 ? executiveSummary : [
      `Limited public information available for ${companyName || rootDomain} regarding upcoming initiatives.`,
      'Recommend monitoring company communications and quarterly reports for updates.'
    ],
    initiatives: categorizedInitiatives || [],
    historicalInitiatives: historicalReport?.initiatives || [],
    timelineAnalysis: timelineAnalysis || {},
    benchmarking: benchmarking || {},
    risks: risks || [],
    hiringSignals: hiringSignals || [],
    digitalSignals: digitalSignals || [],
    recommendedNextSteps: recommendedNextSteps || [],
    pageInsights: pageInsights || {}, // Insights from crawled common pages
    sources: (topSources || []).map(s => ({
      url: s.url || '',
      title: s.title || null,
      publishedAt: s.publishedAt || null,
      score: s.score || 0,
    })),
    crawledPages: (crawledPages || []).map(p => ({
      url: p.url,
      title: p.title,
      type: p.type,
      excerpt: p.excerpt,
    })),
  };
}

/**
 * Stage 7: Store results in Sanity
 */
export async function stage7_StoreResults(context, report) {
  const { accountKey, canonicalUrl, rootDomain, companyName, dateRange, mode, upsertDocument, patchDocument, client } = context;
  
  if (!client) {
    throw new Error('Sanity client not configured');
  }
  
  const now = new Date().toISOString();
  
  // Store osintReport (use date-based ID)
  const reportIdSuffix = `${new Date(dateRange.start).getFullYear()}-${String(new Date(dateRange.start).getMonth() + 1).padStart(2, '0')}`;
  const reportId = `osintReport.${accountKey}.${reportIdSuffix}.${mode}`;
  const reportDoc = {
    _type: 'osintReport',
    _id: reportId,
    accountKey,
    canonicalUrl,
    rootDomain,
    companyName: companyName || null,
    dateRange, // Store date range instead of year
    mode,
    generatedAt: now,
    executiveSummary: report.executiveSummary || [],
    initiatives: report.initiatives || [],
    historicalInitiatives: report.historicalInitiatives || [],
    timelineAnalysis: report.timelineAnalysis || {},
    benchmarking: report.benchmarking || {},
    risks: report.risks || [],
    hiringSignals: report.hiringSignals || [],
    digitalSignals: report.digitalSignals || [],
    recommendedNextSteps: report.recommendedNextSteps || [],
    pageInsights: report.pageInsights || {}, // Insights from crawled common pages
    crawledPages: report.crawledPages || [], // List of crawled pages
    sources: report.sources || [],
  };
  
  await upsertDocument(client, reportDoc);
  
  // Update osintJob (use date-based ID)
  const jobId = `osintJob.${accountKey}.${reportIdSuffix}.${mode}`;
  try {
    await patchDocument(client, jobId, {
      set: {
        status: 'complete',
        stage: 7,
        progress: 100,
        completedAt: now,
        reportRef: reportId,
      },
    });
  } catch (e) {
    // Job might not exist, create it
    const jobDoc = {
      _type: 'osintJob',
      _id: jobId,
      accountKey,
      canonicalUrl,
      rootDomain,
      companyName: context.companyName || null,
      dateRange, // Store date range instead of year
      mode,
      status: 'complete',
      stage: 7,
      progress: 100,
      requestedAt: now,
      startedAt: now,
      completedAt: now,
      reportRef: reportId,
    };
    await upsertDocument(client, jobDoc);
  }
  
  // Update account with latest report reference
  const accountId = `account.${accountKey}`;
  try {
    await patchDocument(client, accountId, {
      set: {
        latestOsintReportRef: reportId,
        updatedAt: now,
      },
    });
  } catch (e) {
    // Account might not exist yet, that's okay
    console.warn(`Could not update account ${accountId}:`, e.message);
  }
  
  return { reportId, success: true };
}

/**
 * Extract initiatives from extractions
 */
function extractInitiatives(extractions, allSources, rootDomain, dateRange) {
  const initiatives = [];
  const seen = new Set();
  
  for (const ext of extractions) {
    const text = (ext.excerpt || '').toLowerCase();
    const fullText = (ext.fullText || ext.excerpt || '').toLowerCase();
    
    // Look for initiative patterns
    const patterns = [
      /\b(launch|release|deploy|implement|roll out|introduce|announce)\s+([^.!?]{10,80})/gi,
      /\b(plan|planning|roadmap|strategy|initiative|project)\s+(?:to|for|of)\s+([^.!?]{10,80})/gi,
      /\b(upcoming|coming|future|new)\s+([^.!?]{10,80})/gi,
    ];
    
    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const title = match[2]?.trim();
        if (title && title.length > 10 && title.length < 100 && !seen.has(title)) {
          seen.add(title);
          
          const timeHorizon = detectTimeHorizon(ext.excerpt || ext.fullText || '', dateRange) || '3-12mo';
          const evidence = [{
            url: ext.url,
            title: ext.title,
            excerpt: truncateText(ext.excerpt, 300),
            publishedAt: ext.publishedAt,
            sourceType: ext.sourceType,
          }];
          
          const importanceScore = calculateInitiativeScore(
            { title, evidence },
            allSources,
            rootDomain
          );
          
          // Only include initiatives with minimum score threshold
          if (importanceScore >= 30) {
            // Determine status based on language patterns
            const status = determineInitiativeStatus(fullText, ext.excerpt || '');
            
            initiatives.push({
              title,
              importanceScore,
              confidence: determineConfidence(evidence, rootDomain),
              timeHorizon,
              whyItMatters: generateWhyItMatters(title, ext.excerpt || ''),
              evidence,
              status: status.status,
              progressPercent: status.progressPercent,
              firstMentionedAt: ext.publishedAt || new Date().toISOString(),
              expectedCompletionDate: status.expectedCompletionDate,
            });
          }
        }
      }
    }
  }
  
  // Sort by importance score
  initiatives.sort((a, b) => b.importanceScore - a.importanceScore);
  
  // Limit to top 15 (increased to allow for categorization)
  return initiatives.slice(0, 15);
}

/**
 * Generate executive summary
 */
function generateExecutiveSummary(initiatives, companyName, dateRange) {
  const summary = [];
  const now = new Date();
  const endDate = new Date(dateRange.end);
  const yearRange = now.getFullYear() === endDate.getFullYear() 
    ? `${now.getFullYear()}`
    : `${now.getFullYear()}-${endDate.getFullYear()}`;
  
  if (initiatives.length === 0) {
    summary.push(`No specific initiatives identified for ${companyName} in the next 12 months.`);
    return summary;
  }
  
  summary.push(`${companyName} has ${initiatives.length} key initiative${initiatives.length > 1 ? 's' : ''} planned for the next 12 months (${yearRange}).`);
  
  const top3 = initiatives.slice(0, 3);
  for (const init of top3) {
    summary.push(`${init.title} (${init.timeHorizon} timeline, ${init.confidence} confidence)`);
  }
  
  return summary;
}

/**
 * Extract risks
 */
function extractRisks(extractions) {
  const risks = [];
  const riskKeywords = ['risk', 'challenge', 'concern', 'threat', 'vulnerability', 'issue', 'problem'];
  
  for (const ext of extractions) {
    const text = (ext.excerpt || '').toLowerCase();
    if (riskKeywords.some(kw => text.includes(kw))) {
      // Extract risk sentence
      const sentences = (ext.excerpt || '').split(/[.!?]+/);
      for (const sentence of sentences) {
        if (riskKeywords.some(kw => sentence.toLowerCase().includes(kw))) {
          const trimmed = sentence.trim();
          if (trimmed.length > 20 && trimmed.length < 200) {
            risks.push(trimmed);
          }
        }
      }
    }
  }
  
  return [...new Set(risks)].slice(0, 5);
}

/**
 * Extract hiring signals
 */
function extractHiringSignals(extractions, discoveredPages) {
  const signals = [];
  
  // Check discovered pages for careers/jobs
  if (discoveredPages?.careers || discoveredPages?.jobs) {
    signals.push('Active hiring page detected');
  }
  
  // Check extractions for hiring keywords
  for (const ext of extractions) {
    const text = (ext.excerpt || '').toLowerCase();
    if (/\b(hiring|recruiting|open position|job opening|we're hiring|join our team)\b/.test(text)) {
      signals.push(`Hiring mentioned: ${ext.title || ext.url}`);
    }
  }
  
  return [...new Set(signals)].slice(0, 5);
}

/**
 * Extract digital signals
 */
function extractDigitalSignals(extractions, discoveredPages) {
  const signals = [];
  
  const digitalKeywords = [
    'digital transformation',
    'cloud migration',
    'ai integration',
    'automation',
    'modernization',
    'platform upgrade',
    'technology stack',
  ];
  
  for (const ext of extractions) {
    const text = (ext.excerpt || '').toLowerCase();
    for (const keyword of digitalKeywords) {
      if (text.includes(keyword)) {
        signals.push(`${keyword}: ${ext.title || ext.url}`);
        break;
      }
    }
  }
  
  return [...new Set(signals)].slice(0, 5);
}

/**
 * Generate recommended next steps
 */
function generateNextSteps(initiatives, timelineAnalysis = {}, benchmarking = {}) {
  const steps = [];
  
  if (initiatives.length === 0) {
    steps.push('Monitor company website for upcoming announcements');
    steps.push('Check quarterly earnings calls for strategic direction');
    return steps;
  }
  
  // Steps for initiatives needing execution
  const needingExecution = initiatives.filter(i => i.status === 'needing_execution');
  if (needingExecution.length > 0) {
    steps.push(`Focus on execution readiness for: ${needingExecution.slice(0, 2).map(i => i.title).join(', ')}`);
  }
  
  // Steps for initiatives being decided
  const beingDecided = initiatives.filter(i => i.status === 'being_decided');
  if (beingDecided.length > 0) {
    steps.push(`Monitor decision-making process for: ${beingDecided.slice(0, 2).map(i => i.title).join(', ')}`);
  }
  
  // Steps for in-progress initiatives
  const inProgress = initiatives.filter(i => i.status === 'happening');
  if (inProgress.length > 0) {
    steps.push(`Track progress on active initiatives: ${inProgress.slice(0, 2).map(i => i.title).join(', ')}`);
  }
  
  // Steps based on timeline analysis
  if (timelineAnalysis.delayedCount > 0) {
    steps.push(`Address ${timelineAnalysis.delayedCount} delayed initiative(s) from previous period.`);
  }
  
  if (timelineAnalysis.completionRate < 50 && timelineAnalysis.historicalCount > 0) {
    steps.push('Review execution capabilities - completion rate below 50%.');
  }
  
  // Steps based on benchmarking
  if (benchmarking.industryBenchmark && benchmarking.industryBenchmark.sampleSize > 0) {
    const industryAvg = benchmarking.industryBenchmark.averageInitiativeCount || 0;
    const companyCount = initiatives.length;
    
    if (companyCount < industryAvg * 0.8) {
      steps.push(`Consider expanding initiative portfolio - below industry average (${companyCount} vs ${industryAvg.toFixed(1)}).`);
    }
    
    if (benchmarking.industryBenchmark.commonGoals && benchmarking.industryBenchmark.commonGoals.length > 0) {
      const missingGoals = benchmarking.industryBenchmark.commonGoals.filter(goal => 
        !initiatives.some(i => i.title.toLowerCase().includes(goal.toLowerCase()))
      );
      if (missingGoals.length > 0) {
        steps.push(`Evaluate industry-standard goals: ${missingGoals.slice(0, 2).join(', ')}`);
      }
    }
  }
  
  const immediate = initiatives.filter(i => i.timeHorizon === '0-3mo');
  if (immediate.length > 0) {
    steps.push(`Engage immediately on: ${immediate[0].title}`);
  }
  
  return steps.length > 0 ? steps : ['Monitor company communications for upcoming announcements.'];
}

/**
 * Extract insights from crawled pages by type
 */
function extractPageInsights(crawledPages, dateRange) {
  const insights = {
    investor: [],
    sustainability: [],
    about: [],
    careers: [],
    news: [],
    leadership: [],
  };
  
  const now = new Date();
  const currentYear = now.getFullYear();
  const nextYear = currentYear + 1;
  
  for (const page of crawledPages) {
    const type = page.type;
    if (!insights[type]) continue;
    
    const text = (page.fullText || page.excerpt || '').toLowerCase();
    
    // Look for future-focused content
    const futureKeywords = [
      'plan', 'planning', 'goal', 'target', 'commitment', 'strategy',
      'roadmap', 'initiative', 'launch', 'release', 'deploy',
      `${currentYear}`, `${nextYear}`, 'next year', 'upcoming', 'coming',
      'will', 'expect', 'anticipate', 'forecast', 'projection'
    ];
    
    const hasFutureContent = futureKeywords.some(kw => text.includes(kw));
    
    if (hasFutureContent) {
      // Extract relevant sentences
      const sentences = (page.fullText || page.excerpt || '').split(/[.!?]+/);
      const relevantSentences = sentences
        .filter(s => {
          const lower = s.toLowerCase();
          return futureKeywords.some(kw => lower.includes(kw)) && 
                 s.trim().length > 30 && 
                 s.trim().length < 300;
        })
        .slice(0, 3)
        .map(s => s.trim());
      
      if (relevantSentences.length > 0) {
        insights[type].push({
          url: page.url,
          title: page.title,
          excerpts: relevantSentences,
        });
      }
    }
  }
  
  // Remove empty arrays
  return Object.fromEntries(
    Object.entries(insights).filter(([_, value]) => value.length > 0)
  );
}

/**
 * Generate "why it matters" explanation
 */
function generateWhyItMatters(title, excerpt) {
  // Simple heuristic-based explanation
  if (excerpt.length < 50) {
    return `Strategic initiative that may indicate technology or business priorities.`;
  }
  
  const firstSentence = excerpt.split(/[.!?]/)[0];
  if (firstSentence.length > 20 && firstSentence.length < 200) {
    return firstSentence.trim();
  }
  
  return `This initiative suggests focus areas and potential technology needs.`;
}

/**
 * Determine initiative status based on language patterns
 */
function determineInitiativeStatus(fullText, excerpt) {
  const text = (fullText || excerpt || '').toLowerCase();
  
  // Patterns indicating initiative is happening/active
  const happeningPatterns = [
    /\b(launched|released|deployed|implemented|rolling out|currently|active|in progress|underway|executing)\b/gi,
    /\b(completed|finished|done|achieved)\s+\d+%/gi, // Progress indicators
    /\b(phase \d+|stage \d+|milestone)\b/gi,
  ];
  
  // Patterns indicating initiative is being decided/planned
  const decidingPatterns = [
    /\b(planning|considering|evaluating|exploring|assessing|reviewing|deciding|discussing)\b/gi,
    /\b(roadmap|strategy|vision|goal|target|aim)\b/gi,
    /\b(may|might|could|potential|possible|exploring)\b/gi,
  ];
  
  // Patterns indicating initiative needs execution
  const executionPatterns = [
    /\b(will|shall|going to|plan to|intend to|aim to|target to)\b/gi,
    /\b(upcoming|forthcoming|future|next|planned|scheduled)\b/gi,
    /\b(by \d{4}|in \d{4}|Q\d|quarter)\b/gi, // Future dates
  ];
  
  // Check for progress percentages
  const progressMatch = text.match(/\b(\d+)%\s*(complete|done|finished|progress)\b/gi);
  const progressPercent = progressMatch ? parseInt(progressMatch[0]) : null;
  
  // Check for completion dates
  const dateMatch = text.match(/\b(by|before|target|deadline|completion)\s+(\w+\s+\d{1,2},?\s+\d{4}|\d{4}|\w+\s+\d{4})\b/gi);
  const expectedCompletionDate = dateMatch ? extractDateFromText(dateMatch[0]) : null;
  
  // Count matches
  const happeningCount = happeningPatterns.reduce((sum, pattern) => {
    const matches = text.match(pattern);
    return sum + (matches ? matches.length : 0);
  }, 0);
  
  const decidingCount = decidingPatterns.reduce((sum, pattern) => {
    const matches = text.match(pattern);
    return sum + (matches ? matches.length : 0);
  }, 0);
  
  const executionCount = executionPatterns.reduce((sum, pattern) => {
    const matches = text.match(pattern);
    return sum + (matches ? matches.length : 0);
  }, 0);
  
  // Determine status based on highest count
  if (happeningCount > decidingCount && happeningCount > executionCount) {
    return {
      status: 'happening',
      progressPercent: progressPercent,
      expectedCompletionDate: expectedCompletionDate,
    };
  } else if (decidingCount > executionCount) {
    return {
      status: 'being_decided',
      progressPercent: null,
      expectedCompletionDate: expectedCompletionDate,
    };
  } else {
    return {
      status: 'needing_execution',
      progressPercent: null,
      expectedCompletionDate: expectedCompletionDate,
    };
  }
}

/**
 * Extract date from text (simple implementation)
 */
function extractDateFromText(text) {
  // Simple date extraction - can be enhanced
  const dateMatch = text.match(/\b(\d{4})\b/);
  if (dateMatch) {
    const year = parseInt(dateMatch[1]);
    const now = new Date();
    if (year >= now.getFullYear() && year <= now.getFullYear() + 2) {
      return new Date(year, 11, 31).toISOString(); // End of year
    }
  }
  return null;
}

/**
 * Get historical OSINT report from 12 months ago
 */
async function getHistoricalReport(accountKey, currentDateRange, groqQuery, client) {
  try {
    // Calculate date range for 12 months ago
    const now = new Date(currentDateRange.start);
    const twelveMonthsAgo = new Date(now);
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);
    
    const historicalStart = twelveMonthsAgo;
    const historicalEnd = new Date(now);
    
    // Generate report ID suffix for historical period
    const historicalSuffix = `${historicalStart.getFullYear()}-${String(historicalStart.getMonth() + 1).padStart(2, '0')}`;
    const historicalReportId = `osintReport.${accountKey}.${historicalSuffix}.year_ahead`;
    
    // Query for historical report
    const query = `*[_id == $reportId][0]`;
    const historicalReport = await groqQuery(client, query, { reportId: historicalReportId });
    
    if (historicalReport) {
      return {
        initiatives: historicalReport.initiatives || [],
        generatedAt: historicalReport.generatedAt,
        dateRange: historicalReport.dateRange,
      };
    }
    
    return null;
  } catch (e) {
    console.warn('Could not retrieve historical report:', e.message);
    return null;
  }
}

/**
 * Analyze timeline and progress by comparing current and historical initiatives
 */
function analyzeTimelineAndProgress(currentInitiatives, historicalInitiatives, dateRange) {
  const now = new Date();
  const analysis = {
    historicalCount: historicalInitiatives.length,
    completedCount: 0,
    inProgressCount: 0,
    delayedCount: 0,
    cancelledCount: 0,
    completionRate: 0,
    continuationCount: 0,
    newInitiativesCount: 0,
  };
  
  const categorizedInitiatives = [];
  const historicalMap = new Map();
  
  // Create map of historical initiatives by title (normalized)
  for (const hist of historicalInitiatives) {
    const normalizedTitle = normalizeInitiativeTitle(hist.title);
    historicalMap.set(normalizedTitle, hist);
  }
  
  // Process current initiatives
  for (const current of currentInitiatives) {
    const normalizedTitle = normalizeInitiativeTitle(current.title);
    const historical = historicalMap.get(normalizedTitle);
    
    if (historical) {
      // This is a continuation of a historical initiative
      analysis.continuationCount++;
      
      // Determine completion status
      const completionStatus = determineCompletionStatus(current, historical, now);
      current.completionStatus = completionStatus.status;
      current.historicalReference = historical.title;
      current.firstMentionedAt = historical.firstMentionedAt || historical.evidence[0]?.publishedAt || null;
      
      if (completionStatus.status === 'completed') {
        analysis.completedCount++;
        current.status = 'historical'; // Mark as historical since it's completed
      } else if (completionStatus.status === 'in_progress') {
        analysis.inProgressCount++;
        current.status = 'happening';
        current.progressPercent = completionStatus.progressPercent;
      } else if (completionStatus.status === 'delayed') {
        analysis.delayedCount++;
        current.status = 'needing_execution'; // Needs attention
      }
    } else {
      // This is a new initiative
      analysis.newInitiativesCount++;
    }
    
    categorizedInitiatives.push(current);
  }
  
  // Process historical initiatives that don't appear in current
  for (const hist of historicalInitiatives) {
    const normalizedTitle = normalizeInitiativeTitle(hist.title);
    const found = categorizedInitiatives.find(i => normalizeInitiativeTitle(i.title) === normalizedTitle);
    
    if (!found) {
      // Historical initiative not found in current - likely completed or cancelled
      const likelyStatus = determineLikelyStatus(hist, now);
      if (likelyStatus === 'completed') {
        analysis.completedCount++;
      } else if (likelyStatus === 'cancelled') {
        analysis.cancelledCount++;
      }
      
      // Add as historical initiative
      categorizedInitiatives.push({
        ...hist,
        status: 'historical',
        completionStatus: likelyStatus,
        historicalReference: hist.title,
      });
    }
  }
  
  // Calculate completion rate
  if (analysis.historicalCount > 0) {
    analysis.completionRate = Math.round((analysis.completedCount / analysis.historicalCount) * 100);
  }
  
  return {
    categorizedInitiatives,
    timelineAnalysis: analysis,
  };
}

/**
 * Normalize initiative title for comparison
 */
function normalizeInitiativeTitle(title) {
  return title.toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Determine completion status by comparing current and historical initiative
 */
function determineCompletionStatus(current, historical, now) {
  // Check if current initiative mentions completion
  const currentText = (current.whyItMatters || '').toLowerCase();
  const completionKeywords = ['completed', 'finished', 'done', 'achieved', 'launched', 'released'];
  const isCompleted = completionKeywords.some(keyword => currentText.includes(keyword));
  
  if (isCompleted) {
    return { status: 'completed', progressPercent: 100 };
  }
  
  // Check progress percentage
  if (current.progressPercent !== null && current.progressPercent >= 100) {
    return { status: 'completed', progressPercent: 100 };
  }
  
  // Check if past expected completion date
  if (current.expectedCompletionDate) {
    const expectedDate = new Date(current.expectedCompletionDate);
    if (now > expectedDate && current.progressPercent < 100) {
      return { status: 'delayed', progressPercent: current.progressPercent };
    }
  }
  
  // Check historical expected date
  if (historical.expectedCompletionDate) {
    const expectedDate = new Date(historical.expectedCompletionDate);
    if (now > expectedDate && current.progressPercent !== 100) {
      return { status: 'delayed', progressPercent: current.progressPercent || 0 };
    }
  }
  
  // If initiative is still mentioned and has progress, it's in progress
  if (current.progressPercent !== null && current.progressPercent > 0) {
    return { status: 'in_progress', progressPercent: current.progressPercent };
  }
  
  // Default to in progress if still being mentioned
  return { status: 'in_progress', progressPercent: current.progressPercent || 0 };
}

/**
 * Determine likely status of historical initiative not found in current
 */
function determineLikelyStatus(historical, now) {
  // If past expected completion date and not mentioned, likely completed
  if (historical.expectedCompletionDate) {
    const expectedDate = new Date(historical.expectedCompletionDate);
    if (now > expectedDate) {
      return 'completed';
    }
  }
  
  // If time horizon was 0-3mo and it's been more than 3 months, likely completed or cancelled
  if (historical.timeHorizon === '0-3mo') {
    const firstMentioned = historical.firstMentionedAt ? new Date(historical.firstMentionedAt) : null;
    if (firstMentioned) {
      const monthsSince = (now - firstMentioned) / (1000 * 60 * 60 * 24 * 30);
      if (monthsSince > 3) {
        return 'completed'; // Likely completed if past time horizon
      }
    }
  }
  
  // Default to cancelled if not found and no clear completion signal
  return 'cancelled';
}

/**
 * Generate industry and competitor benchmarking
 */
async function generateBenchmarking(
  accountKey,
  rootDomain,
  companyInitiatives,
  timelineAnalysis,
  dateRange,
  groqQuery,
  client
) {
  try {
    // Get competitor OSINT reports from Sanity
    const competitorReports = await getCompetitorOsintReports(accountKey, rootDomain, dateRange, groqQuery, client);
    
    if (!competitorReports || competitorReports.length === 0) {
      return {
        industryBenchmark: {
          sampleSize: 0,
          averageInitiativeCount: 0,
          averageCompletionRate: 0,
          averageInProgressCount: 0,
          commonGoals: [],
          commonTechnologies: [],
          initiativeStatusDistribution: {},
        },
        competitorBenchmarks: [],
        companyPosition: {
          initiativeCountRank: null,
          completionRateRank: null,
          relativePosition: 'insufficient_data',
        },
        insights: ['Insufficient data for industry benchmarking.'],
      };
    }
    
    // Calculate industry benchmarks
    const industryBenchmark = calculateIndustryBenchmarks(competitorReports);
    
    // Calculate competitor benchmarks
    const competitorBenchmarks = calculateCompetitorBenchmarks(competitorReports);
    
    // Determine company position
    const companyPosition = determineCompanyPosition(
      companyInitiatives.length,
      timelineAnalysis.completionRate || 0,
      timelineAnalysis.inProgressCount || 0,
      competitorBenchmarks,
      industryBenchmark
    );
    
    // Generate insights
    const insights = generateBenchmarkingInsights(
      companyInitiatives,
      timelineAnalysis,
      industryBenchmark,
      competitorBenchmarks,
      companyPosition
    );
    
    return {
      industryBenchmark,
      competitorBenchmarks: competitorBenchmarks.slice(0, 10), // Top 10 competitors
      companyPosition,
      insights,
    };
  } catch (e) {
    console.warn('Benchmarking generation failed:', e.message);
    return {
      industryBenchmark: { sampleSize: 0 },
      competitorBenchmarks: [],
      companyPosition: { relativePosition: 'error' },
      insights: ['Benchmarking data unavailable.'],
    };
  }
}

/**
 * Get competitor OSINT reports from Sanity
 */
async function getCompetitorOsintReports(accountKey, rootDomain, dateRange, groqQuery, client) {
  try {
    // Get current report period suffix
    const reportIdSuffix = `${new Date(dateRange.start).getFullYear()}-${String(new Date(dateRange.start).getMonth() + 1).padStart(2, '0')}`;
    
    // Query for all OSINT reports from the same period (excluding current account)
    const query = `*[_type == "osintReport" && accountKey != $accountKey && dateRange.start >= $startDate && dateRange.end <= $endDate] | order(updatedAt desc)[0...50]`;
    
    const reports = await groqQuery(client, query, { accountKey, startDate: dateRange.start, endDate: dateRange.end });
    
    if (!reports || !Array.isArray(reports)) {
      return [];
    }
    
    // Also try to get reports from similar domains (competitors)
    const domainQuery = `*[_type == "osintReport" && rootDomain != $rootDomain && dateRange.start >= $startDate] | order(updatedAt desc)[0...30]`;
    const domainReports = await groqQuery(client, domainQuery, { rootDomain, startDate: dateRange.start });
    
    // Combine and deduplicate
    const allReports = [...(reports || []), ...(domainReports || [])];
    const uniqueReports = [];
    const seenKeys = new Set();
    
    for (const report of allReports) {
      if (report.accountKey && !seenKeys.has(report.accountKey)) {
        seenKeys.add(report.accountKey);
        uniqueReports.push(report);
      }
    }
    
    return uniqueReports.slice(0, 20); // Limit to 20 for performance
  } catch (e) {
    console.warn('Failed to get competitor OSINT reports:', e.message);
    return [];
  }
}

/**
 * Calculate industry benchmarks from competitor reports
 */
function calculateIndustryBenchmarks(competitorReports) {
  if (!competitorReports || competitorReports.length === 0) {
    return {
      sampleSize: 0,
      averageInitiativeCount: 0,
      averageCompletionRate: 0,
      averageInProgressCount: 0,
      commonGoals: [],
      commonTechnologies: [],
      initiativeStatusDistribution: {},
    };
  }
  
  let totalInitiatives = 0;
  let totalCompletionRate = 0;
  let totalInProgress = 0;
  const goalFrequency = {};
  const techFrequency = {};
  const statusDistribution = {
    happening: 0,
    being_decided: 0,
    needing_execution: 0,
    historical: 0,
  };
  
  for (const report of competitorReports) {
    const initiatives = report.initiatives || [];
    const timelineAnalysis = report.timelineAnalysis || {};
    
    totalInitiatives += initiatives.length;
    totalCompletionRate += timelineAnalysis.completionRate || 0;
    totalInProgress += timelineAnalysis.inProgressCount || 0;
    
    // Count initiative statuses
    for (const init of initiatives) {
      const status = init.status || 'needing_execution';
      statusDistribution[status] = (statusDistribution[status] || 0) + 1;
      
      // Extract goals from initiative titles
      const title = (init.title || '').toLowerCase();
      const goalKeywords = ['digital', 'transformation', 'cloud', 'ai', 'automation', 'modernization', 'sustainability', 'security'];
      for (const keyword of goalKeywords) {
        if (title.includes(keyword)) {
          goalFrequency[keyword] = (goalFrequency[keyword] || 0) + 1;
        }
      }
    }
  }
  
  const sampleSize = competitorReports.length;
  const averageInitiativeCount = totalInitiatives / sampleSize;
  const averageCompletionRate = totalCompletionRate / sampleSize;
  const averageInProgressCount = totalInProgress / sampleSize;
  
  // Get most common goals (top 5)
  const commonGoals = Object.entries(goalFrequency)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([goal]) => goal);
  
  // Normalize status distribution
  const totalStatusCount = Object.values(statusDistribution).reduce((sum, count) => sum + count, 0);
  const normalizedStatusDistribution = {};
  for (const [status, count] of Object.entries(statusDistribution)) {
    normalizedStatusDistribution[status] = totalStatusCount > 0 ? (count / totalStatusCount) * 100 : 0;
  }
  
  return {
    sampleSize,
    averageInitiativeCount: Math.round(averageInitiativeCount * 10) / 10,
    averageCompletionRate: Math.round(averageCompletionRate * 10) / 10,
    averageInProgressCount: Math.round(averageInProgressCount * 10) / 10,
    commonGoals,
    commonTechnologies: [], // Can be enhanced with tech stack analysis
    initiativeStatusDistribution: normalizedStatusDistribution,
  };
}

/**
 * Calculate individual competitor benchmarks
 */
function calculateCompetitorBenchmarks(competitorReports) {
  const benchmarks = [];
  
  for (const report of competitorReports) {
    const initiatives = report.initiatives || [];
    const timelineAnalysis = report.timelineAnalysis || {};
    
    const completionRate = timelineAnalysis.completionRate || 0;
    const inProgressCount = timelineAnalysis.inProgressCount || 0;
    
    const topInitiatives = initiatives
      .sort((a, b) => (b.importanceScore || 0) - (a.importanceScore || 0))
      .slice(0, 3)
      .map(i => i.title);
    
    benchmarks.push({
      domain: report.rootDomain || report.canonicalUrl,
      companyName: report.companyName || report.rootDomain,
      initiativeCount: initiatives.length,
      completionRate: Math.round(completionRate),
      inProgressCount,
      topInitiatives,
      relativePosition: 'at_parity', // Will be calculated in determineCompanyPosition
    });
  }
  
  // Sort by initiative count (descending)
  benchmarks.sort((a, b) => b.initiativeCount - a.initiativeCount);
  
  return benchmarks;
}

/**
 * Determine company position relative to competitors
 */
function determineCompanyPosition(
  companyInitiativeCount,
  companyCompletionRate,
  companyInProgressCount,
  competitorBenchmarks,
  industryBenchmark
) {
  if (competitorBenchmarks.length === 0) {
    return {
      initiativeCountRank: null,
      completionRateRank: null,
      relativePosition: 'insufficient_data',
    };
  }
  
  // Rank by initiative count
  const sortedByCount = [...competitorBenchmarks].sort((a, b) => b.initiativeCount - a.initiativeCount);
  let initiativeCountRank = sortedByCount.findIndex(c => c.initiativeCount <= companyInitiativeCount) + 1;
  if (initiativeCountRank === 0) initiativeCountRank = sortedByCount.length + 1;
  
  // Rank by completion rate
  const sortedByCompletion = [...competitorBenchmarks].sort((a, b) => b.completionRate - a.completionRate);
  let completionRateRank = sortedByCompletion.findIndex(c => c.completionRate <= companyCompletionRate) + 1;
  if (completionRateRank === 0) completionRateRank = sortedByCompletion.length + 1;
  
  // Determine overall relative position
  const totalCompetitors = competitorBenchmarks.length;
  const initiativePercentile = (1 - (initiativeCountRank - 1) / totalCompetitors) * 100;
  const completionPercentile = (1 - (completionRateRank - 1) / totalCompetitors) * 100;
  const averagePercentile = (initiativePercentile + completionPercentile) / 2;
  
  let relativePosition = 'at_parity';
  if (averagePercentile >= 75) {
    relativePosition = 'ahead';
  } else if (averagePercentile <= 25) {
    relativePosition = 'behind';
  }
  
  return {
    initiativeCountRank,
    completionRateRank,
    relativePosition,
    initiativePercentile: Math.round(initiativePercentile),
    completionPercentile: Math.round(completionPercentile),
    totalCompetitors,
  };
}

/**
 * Generate benchmarking insights
 */
function generateBenchmarkingInsights(
  companyInitiatives,
  timelineAnalysis,
  industryBenchmark,
  competitorBenchmarks,
  companyPosition
) {
  const insights = [];
  
  if (industryBenchmark.sampleSize === 0) {
    return ['Insufficient data for benchmarking analysis.'];
  }
  
  // Initiative count insights
  const companyCount = companyInitiatives.length;
  const industryAvg = industryBenchmark.averageInitiativeCount;
  
  if (companyCount > industryAvg * 1.2) {
    insights.push(`Above average initiative portfolio: ${companyCount} initiatives vs industry average of ${industryAvg.toFixed(1)}.`);
  } else if (companyCount < industryAvg * 0.8) {
    insights.push(`Below average initiative portfolio: ${companyCount} initiatives vs industry average of ${industryAvg.toFixed(1)}.`);
  } else {
    insights.push(`Initiative portfolio aligns with industry average: ${companyCount} initiatives.`);
  }
  
  // Completion rate insights
  const companyCompletion = timelineAnalysis.completionRate || 0;
  const industryCompletion = industryBenchmark.averageCompletionRate;
  
  if (companyCompletion > industryCompletion + 10) {
    insights.push(`Strong execution performance: ${companyCompletion}% completion rate vs industry ${industryCompletion.toFixed(0)}%.`);
  } else if (companyCompletion < industryCompletion - 10) {
    insights.push(`Execution below industry average: ${companyCompletion}% completion rate vs industry ${industryCompletion.toFixed(0)}%.`);
  }
  
  // Position insights
  if (companyPosition.relativePosition === 'ahead') {
    insights.push(`Competitive position: Ahead of ${companyPosition.totalCompetitors} benchmarked competitors.`);
  } else if (companyPosition.relativePosition === 'behind') {
    insights.push(`Competitive position: Behind industry leaders - ranked ${companyPosition.initiativeCountRank} of ${companyPosition.totalCompetitors} for initiative count.`);
  }
  
  // Common goals insights
  if (industryBenchmark.commonGoals && industryBenchmark.commonGoals.length > 0) {
    const companyGoals = companyInitiatives.map(i => i.title.toLowerCase());
    const missingGoals = industryBenchmark.commonGoals.filter(goal =>
      !companyGoals.some(title => title.includes(goal))
    );
    
    if (missingGoals.length > 0) {
      insights.push(`Industry trends: Consider evaluating ${missingGoals.slice(0, 2).join(' and ')} initiatives common in the industry.`);
    }
  }
  
  return insights;
}

/**
 * Main pipeline runner
 */
export async function runOsintPipeline(context) {
  const { jobStateDO, accountKey, dateRange, mode } = context;
  
  const startTime = Date.now();
  
  try {
    // Update job state: running
    if (jobStateDO) {
      await jobStateDO.updateState({
        status: 'running',
        stage: 0,
        progress: 0,
        startedAt: new Date().toISOString(),
      });
    }
    
    // Stage 0: Load account
    const accountContext = await stage0_LoadAccount(context);
    context.rootDomain = accountContext.rootDomain;
    context.companyName = accountContext.companyName;
    
    if (jobStateDO) {
      await jobStateDO.updateState({ stage: 0, progress: 10 });
    }
    
    // Stage 1: Discover pages
    const discoveredPages = await stage1_DiscoverPages(context);
    if (jobStateDO) {
      await jobStateDO.updateState({ stage: 1, progress: 20 });
    }
    
    // Stage 2: Search web
    const searchResults = await stage2_SearchWeb(context);
    if (jobStateDO) {
      await jobStateDO.updateState({ stage: 2, progress: 35 });
    }
    
    // Stage 3: Select top sources
    const topSources = await stage3_SelectTopSources(context, searchResults);
    if (jobStateDO) {
      await jobStateDO.updateState({ stage: 3, progress: 50 });
    }
    
    // Stage 4: Extract evidence
    const extractions = await stage4_ExtractEvidence(context, topSources);
    if (jobStateDO) {
      await jobStateDO.updateState({ stage: 4, progress: 65 });
    }
    
    // Stage 5: Verify claims (optional, skipped for now)
    const verification = await stage5_VerifyClaims(context, extractions);
    if (jobStateDO) {
      await jobStateDO.updateState({ stage: 5, progress: 75 });
    }
    
    // Stage 6: Synthesize report
    const report = await stage6_SynthesizeReport(
      context,
      discoveredPages,
      searchResults,
      topSources,
      extractions
    );
    if (jobStateDO) {
      await jobStateDO.updateState({ stage: 6, progress: 90 });
    }
    
    // Stage 7: Store results
    const storageResult = await stage7_StoreResults(context, report);
    if (jobStateDO) {
      await jobStateDO.updateState({
        status: 'complete',
        stage: 7,
        progress: 100,
        reportId: storageResult.reportId,
      });
    }
    
    const duration = Date.now() - startTime;
    
    return {
      success: true,
      reportId: storageResult.reportId,
      report,
      duration,
    };
    
  } catch (error) {
    // Update job state: failed
    const duration = Date.now() - startTime;
    
    if (jobStateDO) {
      await jobStateDO.updateState({
        status: 'failed',
        error: error.message,
        duration,
      });
    }
    
    // Log error for debugging
    console.error(`OSINT pipeline failed for ${accountKey}:`, {
      error: error.message,
      stack: error.stack,
      stage: context.currentStage || 'unknown',
      duration,
    });
    
    throw error;
  }
}

