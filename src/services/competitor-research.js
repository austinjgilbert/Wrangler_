/**
 * Competitor Research Service
 * 
 * Orchestrates complete research for competitors:
 * 1. Discover competitors
 * 2. Enrich each competitor (full pipeline)
 * 3. Build comparative analysis
 * 4. Identify opportunities
 */

import { discoverCompetitors } from './competitor-discovery.js';
import { compareAccountToCompetitors } from './comparative-analysis.js';
import { autoEnrichAccount, getCompleteResearchSet } from './enrichment-service.js';

/**
 * Research competitors for account
 * @param {Function} groqQuery - GROQ query function
 * @param {Function} upsertDocument - Upsert document function
 * @param {object} client - Sanity client
 * @param {string} accountKey - Account key
 * @param {object} account - Account data
 * @param {object} accountResearchSet - Account's research set
 * @param {object} options - Research options
 * @returns {Promise<object>} - Competitor research results
 */
export async function researchCompetitors(
  groqQuery,
  upsertDocument,
  patchDocument,
  client,
  accountKey,
  account,
  accountResearchSet,
  options = {}
) {
  // Step 1: Discover competitors
  const competitorCandidates = await discoverCompetitors(groqQuery, client, account, {
    limit: options.competitorLimit || 10,
    ...options,
  });
  
  if (competitorCandidates.length === 0) {
    return {
      accountKey,
      competitors: [],
      comparison: null,
      opportunities: [],
      message: 'No competitors found',
    };
  }
  
  // Step 2: Enrich each competitor (queue enrichment jobs)
  const enrichedCompetitors = [];
  const enrichmentPromises = [];
  
  for (const candidate of competitorCandidates) {
    const competitorUrl = candidate.canonicalUrl || candidate.url;
    const competitorKey = candidate.accountKey;
    
    if (competitorUrl) {
      // Queue enrichment for competitor
      const enrichPromise = autoEnrichAccount(
        groqQuery,
        upsertDocument,
        client,
        competitorKey || await generateAccountKey(competitorUrl),
        competitorUrl
      ).then(async () => {
        // Get research set if available (may need to wait)
        const researchSet = await getCompleteResearchSet(groqQuery, client, competitorKey);
        return {
          ...candidate,
          researchSet: researchSet,
          enriched: !!researchSet,
        };
      }).catch(() => {
        return {
          ...candidate,
          enriched: false,
        };
      });
      
      enrichmentPromises.push(enrichPromise);
    }
  }
  
  // Wait for enrichments (with timeout)
  const enrichmentResults = await Promise.allSettled(enrichmentPromises);
  for (const result of enrichmentResults) {
    if (result.status === 'fulfilled') {
      enrichedCompetitors.push(result.value);
    }
  }
  
  // Step 3: Build comparative analysis
  const comparison = compareAccountToCompetitors(
    account,
    accountResearchSet,
    enrichedCompetitors.filter(c => c.enriched)
  );
  
  // Step 4: Store competitor research
  const competitorResearchId = `competitorResearch-${accountKey}-${Date.now()}`;
  const competitorResearchDoc = {
    _type: 'competitorResearch',
    _id: competitorResearchId,
    accountKey,
    accountDomain: account.domain || account.canonicalUrl,
    competitors: enrichedCompetitors.map(c => ({
      domain: c.domain || c.canonicalUrl,
      accountKey: c.accountKey,
      matchScore: c.finalScore || 0,
      matchReasons: c.matchReasons || [],
      enriched: c.enriched,
    })),
    comparison: comparison,
    opportunities: comparison.opportunities || [],
    insights: comparison.insights || [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  
  await upsertDocument(client, competitorResearchDoc);
  
  // Step 5: Store in accountPack (if patchDocument is available)
  if (patchDocument) {
    const packId = `accountPack-${accountKey}`;
    try {
      await patchDocument(client, packId, {
        set: {
          'payload.competitorResearch': competitorResearchDoc,
          updatedAt: new Date().toISOString(),
        },
      });
    } catch (e) {
      // If patch fails, continue (document may not exist yet)
    }
  }
  
  return {
    accountKey,
    competitorResearchId,
    competitors: enrichedCompetitors,
    comparison: comparison,
    opportunities: comparison.opportunities || [],
    insights: comparison.insights || [],
    summary: comparison.summary,
  };
}

/**
 * Get competitor research for account
 * @param {Function} groqQuery - GROQ query function
 * @param {object} client - Sanity client
 * @param {string} accountKey - Account key
 * @returns {Promise<object|null>}
 */
export async function getCompetitorResearch(groqQuery, client, accountKey) {
  try {
    // Get from accountPack
    const packId = `accountPack-${accountKey}`;
    const query = `*[_id == $packId][0]`;
    const pack = await groqQuery(client, query, { packId });
    
    if (pack?.payload?.competitorResearch) {
      return pack.payload.competitorResearch;
    }
    
    // Or get from competitorResearch document
    const researchQuery = `*[_type == "competitorResearch" && accountKey == $accountKey] | order(updatedAt desc)[0]`;
    const research = await groqQuery(client, researchQuery, { accountKey });
    
    return research ?? null;
  } catch (e) {
    return null;
  }
}

/**
 * Identify prospecting opportunities from competitor analysis
 * @param {object} competitorResearch - Competitor research data
 * @returns {Array<object>} - Prospecting opportunities
 */
export function identifyProspectingOpportunities(competitorResearch) {
  if (!competitorResearch || !competitorResearch.comparison) {
    return [];
  }
  
  const opportunities = [];
  const comparison = competitorResearch.comparison;
  
  // Opportunity 1: Technology gaps
  if (comparison.technologyComparison?.gaps?.length > 0) {
    opportunities.push({
      type: 'technology_gap',
      title: 'Technology Gap - Prospecting Opportunity',
      description: `Account lacks ${comparison.technologyComparison.gaps.join(', ')} used by competitors`,
      prospectingAngle: 'Help account adopt competitor technologies',
      targetAccounts: competitorResearch.competitors
        .filter(c => c.enriched)
        .map(c => c.domain),
      industry: 'same',
      niche: 'technology_adoption',
    });
  }
  
  // Opportunity 2: Modernization
  if (comparison.technologyComparison?.modernizationOpportunities?.length > 0) {
    opportunities.push({
      type: 'modernization',
      title: 'Modernization - Prospecting Opportunity',
      description: 'Account uses legacy systems while competitors are modernized',
      prospectingAngle: 'Help account modernize to compete',
      targetAccounts: competitorResearch.competitors
        .filter(c => c.enriched && c.technologyStack?.frameworks?.length > 0)
        .map(c => c.domain),
      industry: 'same',
      niche: 'modernization',
    });
  }
  
  // Opportunity 3: Performance improvement
  if (comparison.performanceComparison?.relativePerformance < -10) {
    opportunities.push({
      type: 'performance',
      title: 'Performance Improvement - Prospecting Opportunity',
      description: `Account performance (${comparison.performanceComparison.accountScore}) below competitors`,
      prospectingAngle: 'Help account improve performance to competitive levels',
      targetAccounts: competitorResearch.competitors
        .filter(c => c.enriched && (c.performance?.performanceScore || 0) > comparison.performanceComparison.accountScore)
        .map(c => c.domain),
      industry: 'same',
      niche: 'performance_optimization',
    });
  }
  
  // Opportunity 4: Industry trends
  const industryTrends = identifyIndustryTrendsFromComparison(comparison);
  if (industryTrends.length > 0) {
    opportunities.push({
      type: 'industry_trend',
      title: 'Industry Trend - Prospecting Opportunity',
      description: `Competitors adopting: ${industryTrends.join(', ')}`,
      prospectingAngle: 'Help account adopt industry trends',
      targetAccounts: competitorResearch.competitors
        .filter(c => c.enriched)
        .map(c => c.domain),
      industry: 'same',
      niche: 'industry_trends',
    });
  }
  
  // Opportunity 5: Market expansion
  if (comparison.marketComparison?.relativePosition === 'behind') {
    opportunities.push({
      type: 'market_expansion',
      title: 'Market Expansion - Prospecting Opportunity',
      description: 'Account behind competitors in market position',
      prospectingAngle: 'Help account expand market presence',
      targetAccounts: competitorResearch.competitors
        .filter(c => c.enriched)
        .map(c => c.domain),
      industry: 'same',
      niche: 'market_expansion',
    });
  }
  
  return opportunities;
}

/**
 * Build industry/niche profile from competitor analysis
 * @param {object} competitorResearch - Competitor research data
 * @returns {object} - Industry/niche profile
 */
export function buildIndustryProfile(competitorResearch) {
  if (!competitorResearch || !competitorResearch.competitors) {
    return null;
  }
  
  const competitors = competitorResearch.competitors.filter(c => c.enriched);
  
  if (competitors.length === 0) {
    return null;
  }
  
  // Aggregate industry data
  const techStacks = competitors.map(c => c.technologyStack || {});
  const businessScales = competitors.map(c => c.businessScale || {});
  const positions = competitors.map(c => determineMarketPosition(c));
  
  // Common technologies
  const techFrequency = {};
  for (const techStack of techStacks) {
    [...(techStack.cms || []), ...(techStack.frameworks || [])].forEach(tech => {
      techFrequency[tech] = (techFrequency[tech] || 0) + 1;
    });
  }
  
  const commonTechs = Object.entries(techFrequency)
    .filter(([tech, count]) => count >= competitors.length * 0.5)
    .map(([tech]) => tech);
  
  // Average business scale
  const scaleOrder = { enterprise: 3, 'mid-market': 2, small: 1 };
  const avgScale = businessScales.length > 0
    ? businessScales.reduce((sum, bs) => sum + (scaleOrder[bs.businessScale] || 0), 0) / businessScales.length
    : 0;
  
  const dominantScale = Object.entries(scaleOrder).find(([scale, order]) => 
    Math.abs(order - avgScale) < 0.5
  )?.[0] || 'mid-market';
  
  // Market position distribution
  const positionDistribution = {};
  positions.forEach(pos => {
    positionDistribution[pos] = (positionDistribution[pos] || 0) + 1;
  });
  
  return {
    industry: competitorResearch.accountDomain, // Would be extracted from account
    niche: identifyNiche(competitors),
    competitorCount: competitors.length,
    commonTechnologies: commonTechs,
    dominantBusinessScale: dominantScale,
    marketPositionDistribution: positionDistribution,
    averageTechStackSize: calculateAverageTechStackSize(competitors),
    industryTrends: commonTechs,
  };
}

// Helper functions
function identifyIndustryTrendsFromComparison(comparison) {
  const trends = [];
  
  if (comparison.technologyComparison?.competitorTech?.frameworks) {
    trends.push(...comparison.technologyComparison.competitorTech.frameworks.slice(0, 3));
  }
  
  return trends;
}

function identifyNiche(competitors) {
  // Analyze common characteristics to identify niche
  // This would be enhanced with more sophisticated analysis
  return 'technology_sector';
}

function calculateAverageTechStackSize(competitors) {
  if (competitors.length === 0) return 0;
  
  const sizes = competitors.map(c => {
    const tech = c.technologyStack || {};
    return (tech.cms?.length || 0) + (tech.frameworks?.length || 0);
  });
  
  return sizes.reduce((sum, s) => sum + s, 0) / sizes.length;
}

function determineMarketPosition(account) {
  const techStack = account.technologyStack || {};
  const businessScale = account.businessScale || {};
  
  if (techStack.modernFrameworks?.length > 2 && businessScale.businessScale === 'enterprise') {
    return 'market_leader';
  }
  
  if (techStack.modernFrameworks?.length > 0 && businessScale.businessScale === 'mid-market') {
    return 'challenger';
  }
  
  return 'established';
}

// Import generateAccountKey
async function generateAccountKey(url) {
  const { generateAccountKey: genKey } = await import('./sanity-account.js');
  return await genKey(url);
}

