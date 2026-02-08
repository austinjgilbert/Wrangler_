/**
 * Comparative Analysis Service
 * 
 * Compares accounts against competitors to identify:
 * - Technology gaps
 * - Market positioning differences
 * - Opportunity areas
 * - Competitive advantages/disadvantages
 * - Prospecting opportunities
 */

/**
 * Compare account against competitors
 * @param {object} account - Account data
 * @param {object} accountResearchSet - Account's complete research set
 * @param {Array<object>} competitors - Competitor accounts with research sets
 * @returns {object} - Comparative analysis
 */
export function compareAccountToCompetitors(account, accountResearchSet, competitors = []) {
  if (!competitors || competitors.length === 0) {
    return {
      account: account,
      competitors: [],
      comparison: null,
      opportunities: [],
      insights: [],
    };
  }
  
  const comparison = {
    technologyComparison: compareTechnologyStacks(account, competitors),
    positioningComparison: comparePositioning(account, accountResearchSet, competitors),
    marketComparison: compareMarketPosition(account, competitors),
    businessModelComparison: compareBusinessModels(account, competitors),
    performanceComparison: comparePerformance(account, competitors),
  };
  
  const opportunities = identifyOpportunities(account, competitors, comparison);
  const insights = generateInsights(account, competitors, comparison);
  
  return {
    account: {
      domain: account.domain || account.canonicalUrl,
      companyName: account.companyName,
      positioning: extractBusinessPositioning(account, accountResearchSet),
    },
    competitors: competitors.map(c => ({
      domain: c.domain || c.canonicalUrl,
      companyName: c.companyName,
      matchScore: c.finalScore || 0,
      matchReasons: c.matchReasons || [],
    })),
    comparison: comparison,
    opportunities: opportunities,
    insights: insights,
    summary: generateComparisonSummary(comparison, opportunities),
  };
}

/**
 * Compare technology stacks
 * @param {object} account - Account data
 * @param {Array<object>} competitors - Competitor accounts
 * @returns {object} - Technology comparison
 */
function compareTechnologyStacks(account, competitors) {
  const accountTech = account.technologyStack || {};
  const comparison = {
    accountTech: {
      cms: accountTech.cms || [],
      frameworks: accountTech.frameworks || [],
      legacySystems: accountTech.legacySystems || [],
    },
    competitorTech: {
      cms: [],
      frameworks: [],
      legacySystems: [],
    },
    gaps: [],
    advantages: [],
    modernizationOpportunities: [],
  };
  
  // Aggregate competitor tech
  for (const competitor of competitors) {
    const compTech = competitor.technologyStack || {};
    if (compTech.cms) comparison.competitorTech.cms.push(...compTech.cms);
    if (compTech.frameworks) comparison.competitorTech.frameworks.push(...compTech.frameworks);
    if (compTech.legacySystems) comparison.competitorTech.legacySystems.push(...compTech.legacySystems);
  }
  
  // Deduplicate
  comparison.competitorTech.cms = [...new Set(comparison.competitorTech.cms)];
  comparison.competitorTech.frameworks = [...new Set(comparison.competitorTech.frameworks)];
  comparison.competitorTech.legacySystems = [...new Set(comparison.competitorTech.legacySystems)];
  
  // Identify gaps (tech competitors use that account doesn't)
  const accountCMS = new Set(comparison.accountTech.cms);
  const competitorCMS = new Set(comparison.competitorTech.cms);
  comparison.gaps.push(...Array.from(competitorCMS).filter(cms => !accountCMS.has(cms)));
  
  // Identify advantages (tech account uses that competitors don't)
  comparison.advantages.push(...Array.from(accountCMS).filter(cms => !competitorCMS.has(cms)));
  
  // Modernization opportunities
  if (comparison.accountTech.legacySystems.length > 0 && 
      comparison.competitorTech.frameworks.length > 0) {
    comparison.modernizationOpportunities.push({
      type: 'modernization',
      message: 'Competitors use modern frameworks while account uses legacy systems',
      impact: 'high',
      opportunity: 'Migration to modern stack',
    });
  }
  
  return comparison;
}

/**
 * Compare market positioning
 * @param {object} account - Account data
 * @param {object} accountResearchSet - Account research set
 * @param {Array<object>} competitors - Competitor accounts
 * @returns {object} - Positioning comparison
 */
function comparePositioning(account, accountResearchSet, competitors) {
  const accountPositioning = extractBusinessPositioning(account, accountResearchSet);
  
  const competitorPositionings = competitors.map(c => {
    const compResearchSet = c.researchSet || {};
    return extractBusinessPositioning(c, compResearchSet);
  });
  
  return {
    accountPositioning: accountPositioning,
    competitorPositionings: competitorPositionings,
    positioningGaps: identifyPositioningGaps(accountPositioning, competitorPositionings),
    uniquePositioning: identifyUniquePositioning(accountPositioning, competitorPositionings),
  };
}

/**
 * Compare market position
 * @param {object} account - Account data
 * @param {Array<object>} competitors - Competitor accounts
 * @returns {object} - Market position comparison
 */
function compareMarketPosition(account, competitors) {
  const accountPosition = determineMarketPosition(account);
  const competitorPositions = competitors.map(c => ({
    domain: c.domain || c.canonicalUrl,
    position: determineMarketPosition(c),
  }));
  
  return {
    accountPosition: accountPosition,
    competitorPositions: competitorPositions,
    relativePosition: determineRelativePosition(accountPosition, competitorPositions),
  };
}

/**
 * Compare business models
 * @param {object} account - Account data
 * @param {Array<object>} competitors - Competitor accounts
 * @returns {object} - Business model comparison
 */
function compareBusinessModels(account, competitors) {
  const accountScale = account.businessScale?.businessScale || 'unknown';
  const competitorScales = competitors.map(c => ({
    domain: c.domain || c.canonicalUrl,
    scale: c.businessScale?.businessScale || 'unknown',
  }));
  
  return {
    accountScale: accountScale,
    competitorScales: competitorScales,
    scaleComparison: compareScales(accountScale, competitorScales),
  };
}

/**
 * Compare performance metrics
 * @param {object} account - Account data
 * @param {Array<object>} competitors - Competitor accounts
 * @returns {object} - Performance comparison
 */
function comparePerformance(account, competitors) {
  const accountPerf = account.performance?.performanceScore || 0;
  const competitorPerfs = competitors.map(c => ({
    domain: c.domain || c.canonicalUrl,
    score: c.performance?.performanceScore || 0,
  }));
  
  const avgCompetitorPerf = competitorPerfs.length > 0
    ? competitorPerfs.reduce((sum, c) => sum + c.score, 0) / competitorPerfs.length
    : 0;
  
  return {
    accountScore: accountPerf,
    averageCompetitorScore: avgCompetitorPerf,
    relativePerformance: accountPerf - avgCompetitorPerf,
    performanceRank: calculatePerformanceRank(accountPerf, competitorPerfs),
  };
}

/**
 * Identify opportunities for prospecting
 * @param {object} account - Account data
 * @param {Array<object>} competitors - Competitor accounts
 * @param {object} comparison - Comparison data
 * @returns {Array<object>} - Opportunities
 */
function identifyOpportunities(account, competitors, comparison) {
  const opportunities = [];
  
  // Opportunity 1: Technology gaps
  if (comparison.technologyComparison.gaps.length > 0) {
    opportunities.push({
      type: 'technology_gap',
      title: 'Technology Gap Opportunity',
      description: `Account lacks technologies used by competitors: ${comparison.technologyComparison.gaps.join(', ')}`,
      impact: 'medium',
      priority: 'high',
      recommendation: 'Evaluate and adopt competitor technologies',
      prospectingAngle: 'Help account modernize to match competitors',
    });
  }
  
  // Opportunity 2: Modernization
  if (comparison.technologyComparison.modernizationOpportunities.length > 0) {
    opportunities.push({
      type: 'modernization',
      title: 'Modernization Opportunity',
      description: 'Competitors use modern tech while account uses legacy systems',
      impact: 'high',
      priority: 'high',
      recommendation: 'Migrate from legacy to modern stack',
      prospectingAngle: 'Help account compete with modernized competitors',
    });
  }
  
  // Opportunity 3: Performance improvement
  if (comparison.performanceComparison.relativePerformance < -10) {
    opportunities.push({
      type: 'performance',
      title: 'Performance Improvement Opportunity',
      description: `Account performance (${comparison.performanceComparison.accountScore}) below competitors (${comparison.performanceComparison.averageCompetitorScore.toFixed(1)})`,
      impact: 'high',
      priority: 'medium',
      recommendation: 'Improve website performance to match competitors',
      prospectingAngle: 'Help account improve performance to competitive levels',
    });
  }
  
  // Opportunity 4: Market positioning
  if (comparison.positioningComparison.positioningGaps.length > 0) {
    opportunities.push({
      type: 'positioning',
      title: 'Positioning Gap Opportunity',
      description: 'Account positioning differs from competitors',
      impact: 'medium',
      priority: 'medium',
      recommendation: 'Align positioning with market leaders',
      prospectingAngle: 'Help account refine positioning strategy',
    });
  }
  
  // Opportunity 5: Industry trends
  const industryTrends = identifyIndustryTrends(competitors);
  if (industryTrends.length > 0) {
    opportunities.push({
      type: 'industry_trend',
      title: 'Industry Trend Opportunity',
      description: `Competitors are adopting: ${industryTrends.join(', ')}`,
      impact: 'medium',
      priority: 'low',
      recommendation: 'Adopt industry trends',
      prospectingAngle: 'Help account stay current with industry trends',
    });
  }
  
  return opportunities.sort((a, b) => {
    const priorityOrder = { high: 3, medium: 2, low: 1 };
    return priorityOrder[b.priority] - priorityOrder[a.priority];
  });
}

/**
 * Generate insights from comparison
 * @param {object} account - Account data
 * @param {Array<object>} competitors - Competitor accounts
 * @param {object} comparison - Comparison data
 * @returns {Array<object>} - Insights
 */
function generateInsights(account, competitors, comparison) {
  const insights = [];
  
  // Insight 1: Technology leadership
  if (comparison.technologyComparison.advantages.length > 0) {
    insights.push({
      type: 'advantage',
      message: `Account has technology advantages: ${comparison.technologyComparison.advantages.join(', ')}`,
      confidence: 0.8,
    });
  }
  
  // Insight 2: Market position
  if (comparison.marketComparison.relativePosition === 'ahead') {
    insights.push({
      type: 'position',
      message: 'Account is ahead of competitors in market position',
      confidence: 0.7,
    });
  } else if (comparison.marketComparison.relativePosition === 'behind') {
    insights.push({
      type: 'position',
      message: 'Account is behind competitors - opportunity for improvement',
      confidence: 0.7,
    });
  }
  
  // Insight 3: Performance
  if (comparison.performanceComparison.relativePerformance > 10) {
    insights.push({
      type: 'performance',
      message: 'Account outperforms competitors',
      confidence: 0.8,
    });
  } else if (comparison.performanceComparison.relativePerformance < -10) {
    insights.push({
      type: 'performance',
      message: 'Account underperforms competitors - improvement needed',
      confidence: 0.8,
    });
  }
  
  // Insight 4: Competitive landscape
  insights.push({
    type: 'landscape',
    message: `Analyzed ${competitors.length} competitors in same space`,
    confidence: 1.0,
    details: {
      competitorCount: competitors.length,
      averageTechStackSize: calculateAverageTechStackSize(competitors),
    },
  });
  
  return insights;
}

/**
 * Generate comparison summary
 * @param {object} comparison - Comparison data
 * @param {Array<object>} opportunities - Opportunities
 * @returns {object} - Summary
 */
function generateComparisonSummary(comparison, opportunities) {
  return {
    technologyGaps: comparison.technologyComparison.gaps.length,
    technologyAdvantages: comparison.technologyComparison.advantages.length,
    opportunitiesCount: opportunities.length,
    highPriorityOpportunities: opportunities.filter(o => o.priority === 'high').length,
    relativePerformance: comparison.performanceComparison.relativePerformance,
    marketPosition: comparison.marketComparison.relativePosition,
  };
}

// Helper functions
function identifyPositioningGaps(accountPos, competitorPoss) {
  // Compare positioning elements
  return [];
}

function identifyUniquePositioning(accountPos, competitorPoss) {
  // Find unique positioning elements
  return [];
}

function determineRelativePosition(accountPos, competitorPoss) {
  const positions = competitorPoss.map(c => c.position);
  const leaderCount = positions.filter(p => p === 'market_leader').length;
  
  if (accountPos === 'market_leader' && leaderCount === 0) {
    return 'ahead';
  } else if (accountPos !== 'market_leader' && leaderCount > 0) {
    return 'behind';
  }
  
  return 'at_parity';
}

function compareScales(accountScale, competitorScales) {
  const scales = competitorScales.map(c => c.scale);
  const scaleOrder = { enterprise: 3, 'mid-market': 2, small: 1, unknown: 0 };
  
  const accountScaleNum = scaleOrder[accountScale] || 0;
  const avgCompetitorScale = scales.length > 0
    ? scales.reduce((sum, s) => sum + (scaleOrder[s] || 0), 0) / scales.length
    : 0;
  
  if (accountScaleNum > avgCompetitorScale) {
    return 'larger';
  } else if (accountScaleNum < avgCompetitorScale) {
    return 'smaller';
  }
  
  return 'similar';
}

function calculatePerformanceRank(accountScore, competitorPerfs) {
  const allScores = [accountScore, ...competitorPerfs.map(c => c.score)].sort((a, b) => b - a);
  return allScores.indexOf(accountScore) + 1;
}

function identifyIndustryTrends(competitors) {
  const trends = [];
  
  // Analyze common technologies across competitors
  const techFrequency = {};
  for (const competitor of competitors) {
    const tech = competitor.technologyStack || {};
    [...(tech.cms || []), ...(tech.frameworks || [])].forEach(t => {
      techFrequency[t] = (techFrequency[t] || 0) + 1;
    });
  }
  
  // Trends are technologies used by majority of competitors
  const threshold = competitors.length * 0.5;
  for (const [tech, count] of Object.entries(techFrequency)) {
    if (count >= threshold) {
      trends.push(tech);
    }
  }
  
  return trends;
}

function calculateAverageTechStackSize(competitors) {
  if (competitors.length === 0) return 0;
  
  const sizes = competitors.map(c => {
    const tech = c.technologyStack || {};
    return (tech.cms?.length || 0) + (tech.frameworks?.length || 0);
  });
  
  return sizes.reduce((sum, s) => sum + s, 0) / sizes.length;
}

// Import extractBusinessPositioning and determineMarketPosition
import { extractBusinessPositioning } from './competitor-discovery.js';

// Re-export for use
export { extractBusinessPositioning };

