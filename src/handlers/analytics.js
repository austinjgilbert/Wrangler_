/**
 * Analytics and Comparison Handlers
 * Provides account comparison, trend analysis, and aggregate analytics
 */

import { createSuccessResponse, createErrorResponse } from '../utils/response.js';
import { normalizeDomain } from '../services/sanity-account.js';

/**
 * Compare multiple accounts side-by-side
 * POST /analytics/compare
 * Body: { accountKeys: string[] } or { urls: string[] } or { domains: string[] }
 */
export async function handleCompareAccounts(
  request,
  requestId,
  env,
  groqQuery,
  assertSanityConfigured
) {
  try {
    const body = await request.json();
    const accountKeys = body.accountKeys || [];
    const urls = body.urls || [];
    const domains = body.domains || [];
    
    // Validate input
    if (accountKeys.length === 0 && urls.length === 0 && domains.length === 0) {
      return createErrorResponse(
        'VALIDATION_ERROR',
        'accountKeys, urls, or domains array required with at least 2 items',
        {},
        400,
        requestId
      );
    }
    
    if (accountKeys.length > 0 && accountKeys.length < 2) {
      return createErrorResponse(
        'VALIDATION_ERROR',
        'At least 2 accounts required for comparison',
        {},
        400,
        requestId
      );
    }
    
    const client = assertSanityConfigured(env);
    
    // Fetch all account data
    const accounts = [];
    
    // Process accountKeys
    for (const accountKey of accountKeys) {
      const account = await fetchAccountData(client, groqQuery, accountKey, 'accountKey');
      if (account) accounts.push(account);
    }
    
    // Process URLs - need to find accountKey from URL
    for (const url of urls) {
      const accountKey = await findAccountKeyFromUrl(client, groqQuery, url);
      if (accountKey) {
        const account = await fetchAccountData(client, groqQuery, accountKey, 'accountKey');
        if (account) accounts.push(account);
      }
    }
    
    // Process domains - need to find accountKey from domain
    for (const domain of domains) {
      const accountKey = await findAccountKeyFromDomain(client, groqQuery, domain);
      if (accountKey) {
        const account = await fetchAccountData(client, groqQuery, accountKey, 'accountKey');
        if (account) accounts.push(account);
      }
    }
    
    if (accounts.length < 2) {
      return createErrorResponse(
        'NOT_FOUND',
        `Could not find data for at least 2 accounts. Found ${accounts.length} account(s).`,
        { requested: accountKeys.length + urls.length + domains.length },
        404,
        requestId
      );
    }
    
    // Perform comparison
    const comparison = compareAccounts(accounts);
    
    return createSuccessResponse({
      comparison,
      accounts: accounts.map(a => ({
        accountKey: a.accountKey,
        companyName: a.companyName,
        canonicalUrl: a.canonicalUrl,
        opportunityScore: a.opportunityScore,
      })),
      summary: {
        totalAccounts: accounts.length,
        averageOpportunityScore: comparison.averageOpportunityScore,
        highestOpportunityScore: comparison.highestOpportunityScore,
        lowestOpportunityScore: comparison.lowestOpportunityScore,
      },
    }, requestId);
    
  } catch (error) {
    return createErrorResponse(
      'INTERNAL_ERROR',
      'Failed to compare accounts',
      { error: error.message },
      500,
      requestId
    );
  }
}

/**
 * Get trend analysis for an account over time
 * GET /analytics/trends?accountKey=...&days=30
 */
export async function handleAccountTrends(
  request,
  requestId,
  env,
  groqQuery,
  assertSanityConfigured
) {
  try {
    const url = new URL(request.url);
    const accountKey = url.searchParams.get('accountKey');
    const days = parseInt(url.searchParams.get('days') || '90', 10);
    
    if (!accountKey) {
      return createErrorResponse(
        'VALIDATION_ERROR',
        'accountKey parameter required',
        {},
        400,
        requestId
      );
    }
    
    if (days < 1 || days > 365) {
      return createErrorResponse(
        'VALIDATION_ERROR',
        'days must be between 1 and 365',
        {},
        400,
        requestId
      );
    }
    
    const client = assertSanityConfigured(env);
    
    // Fetch historical account data
    const trends = await fetchAccountTrends(client, groqQuery, accountKey, days);
    
    if (!trends || trends.dataPoints.length === 0) {
      return createErrorResponse(
        'NOT_FOUND',
        'No historical data found for this account',
        { accountKey, days },
        404,
        requestId
      );
    }
    
    return createSuccessResponse({
      accountKey,
      period: { days, startDate: trends.startDate, endDate: trends.endDate },
      trends,
      analysis: analyzeTrends(trends),
    }, requestId);
    
  } catch (error) {
    return createErrorResponse(
      'INTERNAL_ERROR',
      'Failed to get account trends',
      { error: error.message },
      500,
      requestId
    );
  }
}

/**
 * Get aggregate analytics across all accounts
 * GET /analytics/dashboard?limit=100
 */
export async function handleAnalyticsDashboard(
  request,
  requestId,
  env,
  groqQuery,
  assertSanityConfigured
) {
  try {
    const url = new URL(request.url);
    const limit = parseInt(url.searchParams.get('limit') || '100', 10);
    
    if (limit < 1 || limit > 1000) {
      return createErrorResponse(
        'VALIDATION_ERROR',
        'limit must be between 1 and 1000',
        {},
        400,
        requestId
      );
    }
    
    const client = assertSanityConfigured(env);
    
    // Fetch aggregate data
    const dashboard = await generateAnalyticsDashboard(client, groqQuery, limit);
    
    return createSuccessResponse({
      dashboard,
      generatedAt: new Date().toISOString(),
    }, requestId);
    
  } catch (error) {
    return createErrorResponse(
      'INTERNAL_ERROR',
      'Failed to generate analytics dashboard',
      { error: error.message },
      500,
      requestId
    );
  }
}

/**
 * Export account data in various formats
 * GET /analytics/export?accountKey=...&format=json|csv
 */
export async function handleExportAccount(
  request,
  requestId,
  env,
  groqQuery,
  assertSanityConfigured
) {
  try {
    const url = new URL(request.url);
    const accountKey = url.searchParams.get('accountKey');
    const format = (url.searchParams.get('format') || 'json').toLowerCase();
    const includeHistory = url.searchParams.get('includeHistory') === 'true';
    
    if (!accountKey) {
      return createErrorResponse(
        'VALIDATION_ERROR',
        'accountKey parameter required',
        {},
        400,
        requestId
      );
    }
    
    if (!['json', 'csv'].includes(format)) {
      return createErrorResponse(
        'VALIDATION_ERROR',
        'format must be json or csv',
        {},
        400,
        requestId
      );
    }
    
    const client = assertSanityConfigured(env);
    
    // Fetch account data
    const account = await fetchAccountData(client, groqQuery, accountKey, 'accountKey');
    
    if (!account) {
      return createErrorResponse(
        'NOT_FOUND',
        'Account not found',
        { accountKey },
        404,
        requestId
      );
    }
    
    // Export in requested format
    if (format === 'csv') {
      const csv = exportToCSV(account, includeHistory);
      return new Response(csv, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="account-${accountKey}.csv"`,
        },
      });
    } else {
      const exportData = {
        accountKey: account.accountKey,
        companyName: account.companyName,
        canonicalUrl: account.canonicalUrl,
        exportedAt: new Date().toISOString(),
        data: account,
      };
      
      if (includeHistory) {
        exportData.history = await fetchAccountTrends(client, groqQuery, accountKey, 365);
      }
      
      return new Response(JSON.stringify(exportData, null, 2), {
        headers: {
          'Content-Type': 'application/json',
          'Content-Disposition': `attachment; filename="account-${accountKey}.json"`,
        },
      });
    }
    
  } catch (error) {
    return createErrorResponse(
      'INTERNAL_ERROR',
      'Failed to export account data',
      { error: error.message },
      500,
      requestId
    );
  }
}

// Helper Functions

/**
 * Fetch account data from Sanity
 */
async function fetchAccountData(client, groqQuery, identifier, type = 'accountKey') {
  try {
    let query;
    
    if (type === 'accountKey') {
      query = `*[_type == "account" && accountKey == $accountKey][0]{
        _id,
        _createdAt,
        _updatedAt,
        accountKey,
        companyName,
        canonicalUrl,
        opportunityScore,
        technologyStack,
        roiInsights,
        migrationOpportunities,
        businessUnits,
        scaleScore,
        aiReadinessScore,
        "accountPack": *[_type == "accountPack" && accountKey == $accountKey][0]{
          scanData,
          techStack,
          businessAnalysis,
        }
      }`;
      const result = await groqQuery(client, query, { accountKey: identifier });
      return result && result.length > 0 ? result[0] : null;
    }
    
    return null;
  } catch (error) {
    console.error('Error fetching account data:', error);
    return null;
  }
}

/**
 * Find accountKey from URL
 */
async function findAccountKeyFromUrl(client, groqQuery, url) {
  try {
    const normalized = normalizeDomain(url);
    if (!normalized) return null;
    
    const query = `*[_type == "account" && (canonicalUrl match $url || canonicalUrl match $domain)][0].accountKey`;
    const result = await groqQuery(client, query, { 
      url: `*${url}*`,
      domain: `*${normalized}*`
    });
    
    return (result && result.length > 0 && result[0]) ? result[0] : null;
  } catch (error) {
    console.error('Error finding accountKey from URL:', error);
    return null;
  }
}

/**
 * Find accountKey from domain
 */
async function findAccountKeyFromDomain(client, groqQuery, domain) {
  try {
    const normalized = normalizeDomain(domain);
    if (!normalized) return null;
    
    const query = `*[_type == "account" && canonicalUrl match $domain][0].accountKey`;
    const result = await groqQuery(client, query, { domain: `*${normalized}*` });
    
    return (result && result.length > 0 && result[0]) ? result[0] : null;
  } catch (error) {
    console.error('Error finding accountKey from domain:', error);
    return null;
  }
}

/**
 * Compare multiple accounts
 */
function compareAccounts(accounts) {
  const comparison = {
    techStack: compareTechStacks(accounts),
    opportunityScores: compareOpportunityScores(accounts),
    roiInsights: compareROIInsights(accounts),
    commonPatterns: findCommonPatterns(accounts),
    differences: findDifferences(accounts),
    averageOpportunityScore: 0,
    highestOpportunityScore: 0,
    lowestOpportunityScore: 100,
  };
  
  // Calculate opportunity score stats
  const scores = accounts.map(a => a.opportunityScore || 0).filter(s => s > 0);
  if (scores.length > 0) {
    comparison.averageOpportunityScore = Math.round(
      scores.reduce((a, b) => a + b, 0) / scores.length
    );
    comparison.highestOpportunityScore = Math.max(...scores);
    comparison.lowestOpportunityScore = Math.min(...scores);
  }
  
  return comparison;
}

/**
 * Compare tech stacks across accounts
 */
function compareTechStacks(accounts) {
  const allTechs = new Set();
  const techFrequency = {};
  
  accounts.forEach(account => {
    const tech = account.technologyStack || account.accountPack?.techStack || {};
    const legacy = tech.legacySystems || [];
    const modern = tech.modernFrameworks || [];
    const cms = tech.cmsSystems || [];
    
    [...legacy, ...modern, ...cms].forEach(t => {
      allTechs.add(t);
      techFrequency[t] = (techFrequency[t] || 0) + 1;
    });
  });
  
  const common = Object.entries(techFrequency)
    .filter(([_, count]) => count > 1)
    .sort(([_, a], [__, b]) => b - a)
    .map(([tech, count]) => ({ tech, count, percentage: Math.round((count / accounts.length) * 100) }));
  
  const unique = Array.from(allTechs).filter(tech => techFrequency[tech] === 1);
  
  return {
    commonTechnologies: common,
    uniqueTechnologies: unique,
    totalUniqueTechnologies: allTechs.size,
  };
}

/**
 * Compare opportunity scores
 */
function compareOpportunityScores(accounts) {
  const scores = accounts.map(a => ({
    accountKey: a.accountKey,
    companyName: a.companyName,
    score: a.opportunityScore || 0,
  })).sort((a, b) => b.score - a.score);
  
  return {
    ranked: scores,
    distribution: {
      high: scores.filter(s => s.score >= 60).length,
      medium: scores.filter(s => s.score >= 30 && s.score < 60).length,
      low: scores.filter(s => s.score < 30).length,
    },
  };
}

/**
 * Compare ROI insights
 */
function compareROIInsights(accounts) {
  const insightsByCategory = {};
  
  accounts.forEach(account => {
    const insights = account.roiInsights || [];
    insights.forEach(insight => {
      const category = insight.category || 'Other';
      if (!insightsByCategory[category]) {
        insightsByCategory[category] = [];
      }
      insightsByCategory[category].push({
        accountKey: account.accountKey,
        companyName: account.companyName,
        insight: insight.insight,
        impact: insight.impact,
        estimatedSavings: insight.estimatedSavings,
      });
    });
  });
  
  return {
    byCategory: insightsByCategory,
    topCategories: Object.entries(insightsByCategory)
      .map(([category, insights]) => ({ category, count: insights.length }))
      .sort((a, b) => b.count - a.count),
  };
}

/**
 * Find common patterns across accounts
 */
function findCommonPatterns(accounts) {
  const patterns = {
    legacyCMS: 0,
    multipleSystems: 0,
    systemDuplication: 0,
    highOpportunityScore: 0,
  };
  
  accounts.forEach(account => {
    const tech = account.technologyStack || {};
    if ((tech.legacySystems || []).length > 0) patterns.legacyCMS++;
    if ((tech.legacySystems || []).length > 1) patterns.multipleSystems++;
    if ((tech.systemDuplication || []).length > 0) patterns.systemDuplication++;
    if ((account.opportunityScore || 0) >= 60) patterns.highOpportunityScore++;
  });
  
  return Object.entries(patterns).map(([pattern, count]) => ({
    pattern,
    count,
    percentage: Math.round((count / accounts.length) * 100),
  }));
}

/**
 * Find key differences between accounts
 */
function findDifferences(accounts) {
  const differences = [];
  
  if (accounts.length < 2) return differences;
  
  // Compare opportunity scores
  const scores = accounts.map(a => a.opportunityScore || 0);
  const scoreDiff = Math.max(...scores) - Math.min(...scores);
  if (scoreDiff > 30) {
    differences.push({
      type: 'opportunity_score_gap',
      description: `Large opportunity score gap: ${Math.max(...scores)} vs ${Math.min(...scores)}`,
      impact: 'High',
    });
  }
  
  // Compare tech stack complexity
  const techCounts = accounts.map(a => {
    const tech = a.technologyStack || {};
    return (tech.legacySystems || []).length + (tech.modernFrameworks || []).length;
  });
  const techDiff = Math.max(...techCounts) - Math.min(...techCounts);
  if (techDiff > 5) {
    differences.push({
      type: 'tech_complexity_gap',
      description: `Significant tech stack complexity difference: ${Math.max(...techCounts)} vs ${Math.min(...techCounts)} systems`,
      impact: 'Medium',
    });
  }
  
  return differences;
}

/**
 * Fetch account trends over time
 */
async function fetchAccountTrends(client, groqQuery, accountKey, days) {
  try {
    const query = `*[_type == "account" && accountKey == $accountKey] | order(_updatedAt desc) {
      _id,
      _createdAt,
      _updatedAt,
      accountKey,
      companyName,
      opportunityScore,
      "techStack": accountPack.techStack.legacySystems + accountPack.techStack.modernFrameworks,
      scaleScore,
      aiReadinessScore,
    }[0...20]`;
    
    const records = await groqQuery(client, query, { accountKey });
    
    if (!records || records.length === 0) {
      return null;
    }
    
    // Filter by date range
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    
    const filtered = records.filter(r => {
      const updatedAt = new Date(r._updatedAt);
      return updatedAt >= cutoffDate;
    });
    
    if (filtered.length === 0) {
      return null;
    }
    
    return {
      startDate: filtered[filtered.length - 1]._updatedAt,
      endDate: filtered[0]._updatedAt,
      dataPoints: filtered.map(r => ({
        date: r._updatedAt,
        opportunityScore: r.opportunityScore || 0,
        techStackCount: (r.techStack || []).length,
        scaleScore: r.scaleScore || 0,
        aiReadinessScore: r.aiReadinessScore || 0,
      })),
    };
    
  } catch (error) {
    console.error('Error fetching account trends:', error);
    return null;
  }
}

/**
 * Analyze trends and detect patterns
 */
function analyzeTrends(trends) {
  if (!trends || trends.dataPoints.length < 2) {
    return { status: 'insufficient_data' };
  }
  
  const points = trends.dataPoints;
  const scores = points.map(p => p.opportunityScore);
  
  // Calculate trend direction
  const firstHalf = scores.slice(0, Math.floor(scores.length / 2));
  const secondHalf = scores.slice(Math.floor(scores.length / 2));
  const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
  const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
  
  let direction = 'stable';
  if (secondAvg > firstAvg + 5) direction = 'increasing';
  else if (secondAvg < firstAvg - 5) direction = 'decreasing';
  
  // Calculate volatility
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  const variance = scores.reduce((sum, score) => sum + Math.pow(score - avg, 2), 0) / scores.length;
  const volatility = Math.sqrt(variance);
  
  return {
    direction,
    volatility: Math.round(volatility * 10) / 10,
    averageScore: Math.round(avg),
    currentScore: scores[0],
    change: scores[0] - scores[scores.length - 1],
    dataPoints: points.length,
  };
}

/**
 * Generate analytics dashboard
 */
async function generateAnalyticsDashboard(client, groqQuery, limit) {
  try {
    // Fetch top accounts by opportunity score
    const topAccountsQuery = `*[_type == "account"] | order(opportunityScore desc) [0...$limit] {
      accountKey,
      companyName,
      canonicalUrl,
      opportunityScore,
      technologyStack,
      roiInsights,
      _updatedAt,
    }`;
    
    const topAccounts = await groqQuery(client, topAccountsQuery, { limit }) || [];
    
    // Aggregate statistics
    const stats = {
      totalAccounts: topAccounts.length,
      averageOpportunityScore: 0,
      techStackDistribution: {},
      roiCategoryDistribution: {},
      opportunityScoreDistribution: {
        high: 0,
        medium: 0,
        low: 0,
      },
    };
    
    const scores = [];
    topAccounts.forEach(account => {
      const score = account.opportunityScore || 0;
      scores.push(score);
      
      // Opportunity score distribution
      if (score >= 60) stats.opportunityScoreDistribution.high++;
      else if (score >= 30) stats.opportunityScoreDistribution.medium++;
      else stats.opportunityScoreDistribution.low++;
      
      // Tech stack distribution
      const tech = account.technologyStack || {};
      (tech.legacySystems || []).forEach(sys => {
        stats.techStackDistribution[sys] = (stats.techStackDistribution[sys] || 0) + 1;
      });
      
      // ROI category distribution
      (account.roiInsights || []).forEach(insight => {
        const category = insight.category || 'Other';
        stats.roiCategoryDistribution[category] = (stats.roiCategoryDistribution[category] || 0) + 1;
      });
    });
    
    if (scores.length > 0) {
      stats.averageOpportunityScore = Math.round(
        scores.reduce((a, b) => a + b, 0) / scores.length
      );
    }
    
    // Top tech stacks
    const topTechStacks = Object.entries(stats.techStackDistribution)
      .sort(([_, a], [__, b]) => b - a)
      .slice(0, 10)
      .map(([tech, count]) => ({ tech, count }));
    
    // Top ROI categories
    const topROICategories = Object.entries(stats.roiCategoryDistribution)
      .sort(([_, a], [__, b]) => b - a)
      .slice(0, 5)
      .map(([category, count]) => ({ category, count }));
    
    return {
      statistics: stats,
      topAccounts: topAccounts.slice(0, 20),
      topTechStacks,
      topROICategories,
    };
    
  } catch (error) {
    console.error('Error generating analytics dashboard:', error);
    throw error;
  }
}

/**
 * Export account to CSV
 */
function exportToCSV(account, includeHistory) {
  const rows = [];
  
  // Header
  rows.push('Field,Value');
  
  // Basic info
  rows.push(`Account Key,${account.accountKey || ''}`);
  rows.push(`Company Name,${account.companyName || ''}`);
  rows.push(`Canonical URL,${account.canonicalUrl || ''}`);
  rows.push(`Opportunity Score,${account.opportunityScore || 0}`);
  rows.push(`Scale Score,${account.scaleScore || 0}`);
  rows.push(`AI Readiness Score,${account.aiReadinessScore || 0}`);
  
  // Tech stack
  const tech = account.technologyStack || account.accountPack?.techStack || {};
  rows.push(`Legacy Systems,"${(tech.legacySystems || []).join('; ')}"`);
  rows.push(`Modern Frameworks,"${(tech.modernFrameworks || []).join('; ')}"`);
  rows.push(`CMS Systems,"${(tech.cmsSystems || []).join('; ')}"`);
  
  // ROI Insights
  (account.roiInsights || []).forEach((insight, i) => {
    rows.push(`ROI Insight ${i + 1},"${insight.category}: ${insight.insight}"`);
  });
  
  return rows.join('\n');
}

