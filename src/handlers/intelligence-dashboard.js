/**
 * Intelligence Dashboard Handler
 * GET /analytics/intelligence
 *
 * Returns a comprehensive view of the entire Sanity database:
 *  - Document inventory (counts by type, total size)
 *  - Account completeness heatmap (per-account dimension breakdown)
 *  - Enrichment progress (pipeline stages, active jobs, queue)
 *  - Data tree (document relationships, coverage graph)
 *  - Gap analysis (missing fields across all accounts)
 *  - Field completion matrix (what we have vs what we want)
 */

import { createSuccessResponse, createErrorResponse } from '../utils/response.js';
import { analyseCompleteness, needsBackgroundWork } from '../services/account-completeness.js';

const DESIRED_ACCOUNT_FIELDS = [
  { field: 'companyName',          label: 'Company Name',         category: 'identity' },
  { field: 'domain',               label: 'Domain',               category: 'identity' },
  { field: 'canonicalUrl',         label: 'Canonical URL',        category: 'identity' },
  { field: 'industry',             label: 'Industry',             category: 'classification' },
  { field: 'classification',       label: 'Classification',       category: 'classification' },
  { field: 'tags',                 label: 'Tags',                 category: 'classification' },
  { field: 'technologyStack',      label: 'Technology Stack',     category: 'tech' },
  { field: 'technologies',         label: 'Linked Technologies',  category: 'tech' },
  { field: 'opportunityScore',     label: 'Opportunity Score',    category: 'scores' },
  { field: 'aiReadiness',          label: 'AI Readiness',         category: 'scores' },
  { field: 'performance',          label: 'Performance Score',    category: 'scores' },
  { field: 'businessScale',        label: 'Business Scale',       category: 'scores' },
  { field: 'leadership',           label: 'Leadership Team',      category: 'people' },
  { field: 'painPoints',           label: 'Pain Points',          category: 'insights' },
  { field: 'competitors',          label: 'Competitors',          category: 'insights' },
  { field: 'competitorResearch',   label: 'Competitor Research',  category: 'insights' },
  { field: 'benchmarks',           label: 'Benchmarks',           category: 'insights' },
  { field: 'signals',              label: 'Signals',              category: 'insights' },
  { field: 'profileCompleteness',  label: 'Completeness Score',   category: 'meta' },
  { field: 'lastScannedAt',        label: 'Last Scanned',         category: 'meta' },
  { field: 'lastEnrichedAt',       label: 'Last Enriched',        category: 'meta' },
];

const DESIRED_PERSON_FIELDS = [
  { field: 'name',                label: 'Name',                 category: 'identity' },
  { field: 'title',               label: 'Title',                category: 'identity' },
  { field: 'linkedinUrl',         label: 'LinkedIn URL',         category: 'identity' },
  { field: 'companyRef',          label: 'Company Link',         category: 'relationships' },
  { field: 'roleCategory',        label: 'Role Category',        category: 'classification' },
  { field: 'seniorityLevel',      label: 'Seniority Level',      category: 'classification' },
  { field: 'isDecisionMaker',     label: 'Decision Maker',       category: 'classification' },
  { field: 'experience',          label: 'Experience',           category: 'intel' },
  { field: 'education',           label: 'Education',            category: 'intel' },
  { field: 'skills',              label: 'Skills',               category: 'intel' },
  { field: 'connections',         label: 'Connections',          category: 'intel' },
];

const TECH_DEPTH_CATEGORIES = [
  'analytics', 'ecommerce', 'hosting', 'marketing', 'payments',
  'chat', 'monitoring', 'authProviders', 'searchTech', 'cssFrameworks', 'cdnMedia',
];

export async function handleIntelligenceDashboard(
  request,
  requestId,
  env,
  groqQuery,
  assertSanityConfigured
) {
  try {
    const client = assertSanityConfigured(env);
    const url = new URL(request.url);
    const detail = url.searchParams.get('detail') || 'full';

    // Run all queries in parallel
    const [
      documentCounts,
      accounts,
      accountPacks,
      enrichmentJobs,
      persons,
      technologies,
      interactions,
      sessions,
      learnings,
    ] = await Promise.all([
      getDocumentCounts(groqQuery, client),
      getAccountsWithFields(groqQuery, client),
      getAccountPacks(groqQuery, client),
      getEnrichmentJobs(groqQuery, client),
      getPersons(groqQuery, client),
      getTechnologies(groqQuery, client),
      getInteractionStats(groqQuery, client),
      getSessionStats(groqQuery, client),
      getLearningStats(groqQuery, client),
    ]);

    // Build accountPack lookup
    const packByKey = {};
    for (const pack of accountPacks) {
      if (pack.accountKey) packByKey[pack.accountKey] = pack;
    }

    // Build enrichment job lookup (latest per account)
    const jobByKey = {};
    for (const job of enrichmentJobs) {
      if (job.accountKey) {
        if (!jobByKey[job.accountKey] || job._updatedAt > jobByKey[job.accountKey]._updatedAt) {
          jobByKey[job.accountKey] = job;
        }
      }
    }

    // ── 1. Document Inventory ──────────────────────────────────────────
    const inventory = buildInventory(documentCounts, accounts, persons, technologies, interactions, sessions, learnings);

    // ── 2. Account Completeness Heatmap ────────────────────────────────
    const completenessHeatmap = buildCompletenessHeatmap(accounts, packByKey, jobByKey);

    // ── 3. Enrichment Progress ─────────────────────────────────────────
    const enrichmentProgress = buildEnrichmentProgress(accounts, packByKey, jobByKey, enrichmentJobs);

    // ── 4. Data Tree ───────────────────────────────────────────────────
    const dataTree = buildDataTree(accounts, persons, technologies, packByKey, interactions, sessions);

    // ── 5. Gap Analysis ────────────────────────────────────────────────
    const gapAnalysis = buildGapAnalysis(accounts, packByKey, jobByKey);

    // ── 6. Field Completion Matrix ─────────────────────────────────────
    const fieldMatrix = buildFieldCompletionMatrix(accounts, persons);

    // ── 7. Tech Stack Coverage ─────────────────────────────────────────
    const techCoverage = buildTechStackCoverage(accounts);

    return createSuccessResponse({
      generatedAt: new Date().toISOString(),
      inventory,
      completenessHeatmap,
      enrichmentProgress,
      dataTree,
      gapAnalysis,
      fieldMatrix,
      techCoverage,
    }, requestId);

  } catch (error) {
    return createErrorResponse(
      'DASHBOARD_ERROR',
      error.message || 'Failed to generate intelligence dashboard',
      { stack: error.stack?.split('\n').slice(0, 3) },
      500,
      requestId
    );
  }
}

// ─── Query Functions ────────────────────────────────────────────────────

async function getDocumentCounts(groqQuery, client) {
  const query = `{
    "accounts": count(*[_type == "account"]),
    "persons": count(*[_type == "person"]),
    "technologies": count(*[_type == "technology"]),
    "interactions": count(*[_type == "interaction"]),
    "sessions": count(*[_type == "session"]),
    "learnings": count(*[_type == "learning"]),
    "enrichmentJobs": count(*[_type == "enrichmentJob"]),
    "accountPacks": count(*[_type == "accountPack"]),
    "briefs": count(*[_type == "molt.strategyBrief"]),
    "signals": count(*[_type == "signal"]),
    "opportunities": count(*[_type == "opportunity"]),
    "crawlSnapshots": count(*[_type == "crawl.snapshot"]),
    "dqFindings": count(*[_type == "dq.finding"]),
    "enrichProposals": count(*[_type == "enrich.proposal"]),
    "moltEvents": count(*[_type == "molt.event"]),
    "moltJobs": count(*[_type == "molt.job"]),
    "callSessions": count(*[_type == "call.session"]),
    "networkPersons": count(*[_type == "networkPerson"]),
    "userInteractions": count(*[_type == "interaction"]),
    "total": count(*[!(_type match "system.*")])
  }`;
  return await groqQuery(client, query, {}) || {};
}

async function getAccountsWithFields(groqQuery, client) {
  const query = `*[_type == "account"] | order(_updatedAt desc) {
    _id, accountKey, domain, companyName, canonicalUrl,
    industry, classification, tags,
    technologyStack,
    "techRefCount": count(technologies),
    opportunityScore, aiReadiness, performance, businessScale,
    "leadershipCount": count(leadership),
    "painPointCount": count(painPoints),
    "competitorCount": count(competitors),
    competitorResearch,
    benchmarks, signals,
    profileCompleteness,
    lastScannedAt, lastEnrichedAt,
    createdAt, _updatedAt
  }`;
  return await groqQuery(client, query, {}) || [];
}

async function getAccountPacks(groqQuery, client) {
  const query = `*[_type == "accountPack"] {
    _id, accountKey,
    "hasScan": defined(payload.scan),
    "hasDiscovery": defined(payload.discovery) || defined(payload.researchSet.discovery),
    "hasCrawl": defined(payload.crawl) || defined(payload.researchSet.crawl),
    "hasEvidence": defined(payload.evidence) || defined(payload.researchSet.evidence),
    "hasLinkedin": defined(payload.linkedin) || defined(payload.researchSet.linkedin),
    "hasBrief": defined(payload.brief) || defined(payload.researchSet.brief),
    "hasVerification": defined(payload.verification) || defined(payload.researchSet.verification),
    "hasCompetitors": defined(payload.competitors),
    _updatedAt
  }`;
  return await groqQuery(client, query, {}) || [];
}

async function getEnrichmentJobs(groqQuery, client) {
  const query = `*[_type == "enrichmentJob"] | order(_updatedAt desc) {
    _id, accountKey, status, currentStage,
    completedStages, failedStages,
    priority, startedAt, _updatedAt
  }`;
  return await groqQuery(client, query, {}) || [];
}

async function getPersons(groqQuery, client) {
  const query = `*[_type == "person"] {
    _id, personKey, name, title, linkedinUrl,
    "hasCompanyRef": defined(companyRef),
    roleCategory, seniorityLevel, isDecisionMaker,
    "hasExperience": count(experience) > 0,
    "hasEducation": count(education) > 0,
    "hasSkills": count(skills) > 0,
    connections,
    relatedAccountKey, rootDomain,
    _updatedAt
  }`;
  return await groqQuery(client, query, {}) || [];
}

async function getTechnologies(groqQuery, client) {
  const query = `*[_type == "technology"] {
    _id, name, category, isLegacy, isMigrationTarget, accountCount
  }`;
  return await groqQuery(client, query, {}) || [];
}

async function getInteractionStats(groqQuery, client) {
  const query = `{
    "total": count(*[_type == "interaction"]),
    "last24h": count(*[_type == "interaction" && _createdAt > $since24h]),
    "last7d": count(*[_type == "interaction" && _createdAt > $since7d]),
    "withFollowUp": count(*[_type == "interaction" && followUpNeeded == true]),
    "withInsight": count(*[_type == "interaction" && derivedInsight == true]),
    "domains": *[_type == "interaction" && defined(domain)].domain
  }`;
  const now = Date.now();
  return await groqQuery(client, query, {
    since24h: new Date(now - 86400000).toISOString(),
    since7d: new Date(now - 7 * 86400000).toISOString(),
  }) || {};
}

async function getSessionStats(groqQuery, client) {
  const query = `{
    "total": count(*[_type == "session"]),
    "last7d": count(*[_type == "session" && _createdAt > $since7d])
  }`;
  return await groqQuery(client, query, {
    since7d: new Date(Date.now() - 7 * 86400000).toISOString(),
  }) || {};
}

async function getLearningStats(groqQuery, client) {
  const query = `{
    "total": count(*[_type == "learning"]),
    "last7d": count(*[_type == "learning" && _createdAt > $since7d])
  }`;
  return await groqQuery(client, query, {
    since7d: new Date(Date.now() - 7 * 86400000).toISOString(),
  }) || {};
}

// ─── Builder Functions ──────────────────────────────────────────────────

function buildInventory(counts, accounts, persons, technologies, interactions, sessions, learnings) {
  const totalDocuments = counts.total || 0;

  return {
    totalDocuments,
    byType: {
      accounts: counts.accounts || 0,
      persons: counts.persons || 0,
      technologies: counts.technologies || 0,
      interactions: counts.interactions || 0,
      sessions: counts.sessions || 0,
      learnings: counts.learnings || 0,
      enrichmentJobs: counts.enrichmentJobs || 0,
      accountPacks: counts.accountPacks || 0,
      briefs: counts.briefs || 0,
      signals: counts.signals || 0,
      opportunities: counts.opportunities || 0,
      crawlSnapshots: counts.crawlSnapshots || 0,
      dqFindings: counts.dqFindings || 0,
      enrichProposals: counts.enrichProposals || 0,
      moltEvents: counts.moltEvents || 0,
      moltJobs: counts.moltJobs || 0,
      callSessions: counts.callSessions || 0,
      networkPersons: counts.networkPersons || 0,
      userInteractions: counts.userInteractions || 0,
    },
    activity: {
      interactions: {
        total: interactions.total || 0,
        last24h: interactions.last24h || 0,
        last7d: interactions.last7d || 0,
        withFollowUp: interactions.withFollowUp || 0,
        withInsight: interactions.withInsight || 0,
        uniqueDomains: [...new Set((interactions.domains || []).filter(Boolean))].length,
      },
      sessions: {
        total: sessions.total || 0,
        last7d: sessions.last7d || 0,
      },
      learnings: {
        total: learnings.total || 0,
        last7d: learnings.last7d || 0,
      },
    },
  };
}

function buildCompletenessHeatmap(accounts, packByKey, jobByKey) {
  const accountScores = [];
  let totalScore = 0;
  const dimensionTotals = {};
  const scoreBuckets = { complete: 0, high: 0, medium: 0, low: 0, empty: 0 };

  for (const account of accounts) {
    const pack = packByKey[account.accountKey] || null;
    const job = jobByKey[account.accountKey] || null;

    const completeness = analyseCompleteness(account, pack, job);
    totalScore += completeness.score;

    if (completeness.score >= 90) scoreBuckets.complete++;
    else if (completeness.score >= 60) scoreBuckets.high++;
    else if (completeness.score >= 30) scoreBuckets.medium++;
    else if (completeness.score > 0) scoreBuckets.low++;
    else scoreBuckets.empty++;

    for (const [dim, val] of Object.entries(completeness.dimensions)) {
      if (!dimensionTotals[dim]) dimensionTotals[dim] = { filled: 0, total: 0, weight: val.weight, label: val.label };
      dimensionTotals[dim].total++;
      if (val.present) dimensionTotals[dim].filled++;
    }

    accountScores.push({
      accountKey: account.accountKey,
      domain: account.domain,
      companyName: account.companyName,
      score: completeness.score,
      gaps: completeness.gaps,
      dimensions: Object.fromEntries(
        Object.entries(completeness.dimensions).map(([k, v]) => [k, v.present])
      ),
    });
  }

  accountScores.sort((a, b) => a.score - b.score);

  const dimensionCoverage = {};
  for (const [dim, data] of Object.entries(dimensionTotals)) {
    dimensionCoverage[dim] = {
      label: data.label,
      weight: data.weight,
      filled: data.filled,
      total: data.total,
      percentage: data.total > 0 ? Math.round((data.filled / data.total) * 100) : 0,
    };
  }

  return {
    averageScore: accounts.length > 0 ? Math.round(totalScore / accounts.length) : 0,
    distribution: scoreBuckets,
    dimensionCoverage,
    accounts: accountScores,
  };
}

function buildEnrichmentProgress(accounts, packByKey, jobByKey, allJobs) {
  const stageNames = ['initial_scan', 'discovery', 'crawl', 'extraction', 'linkedin', 'brief', 'verification'];

  const stageCounts = {};
  for (const stage of stageNames) {
    stageCounts[stage] = { completed: 0, total: accounts.length };
  }

  for (const account of accounts) {
    const pack = packByKey[account.accountKey];
    if (!pack) continue;

    if (pack.hasScan) stageCounts.initial_scan.completed++;
    if (pack.hasDiscovery) stageCounts.discovery.completed++;
    if (pack.hasCrawl) stageCounts.crawl.completed++;
    if (pack.hasEvidence) stageCounts.extraction.completed++;
    if (pack.hasLinkedin) stageCounts.linkedin.completed++;
    if (pack.hasBrief) stageCounts.brief.completed++;
    if (pack.hasVerification) stageCounts.verification.completed++;
  }

  for (const stage of stageNames) {
    stageCounts[stage].percentage = accounts.length > 0
      ? Math.round((stageCounts[stage].completed / accounts.length) * 100)
      : 0;
  }

  const activeJobs = allJobs.filter(j => ['pending', 'in_progress'].includes(j.status));
  const completedJobs = allJobs.filter(j => j.status === 'complete' || j.status === 'completed');
  const failedJobs = allJobs.filter(j => j.status === 'failed' || j.status === 'error');

  const accountsNeedingWork = [];
  for (const account of accounts) {
    const pack = packByKey[account.accountKey] || null;
    const job = jobByKey[account.accountKey] || null;
    const work = needsBackgroundWork(account, pack, job);
    if (work.needed) {
      accountsNeedingWork.push({
        accountKey: account.accountKey,
        domain: account.domain,
        companyName: account.companyName,
        priority: work.priority,
        currentScore: work.currentScore,
        missingStages: work.stages,
        reason: work.reason,
      });
    }
  }
  accountsNeedingWork.sort((a, b) => {
    const priorityOrder = { urgent: 0, high: 1, normal: 2 };
    return (priorityOrder[a.priority] ?? 3) - (priorityOrder[b.priority] ?? 3);
  });

  return {
    pipelineStages: stageCounts,
    jobs: {
      total: allJobs.length,
      active: activeJobs.length,
      completed: completedJobs.length,
      failed: failedJobs.length,
      activeDetails: activeJobs.slice(0, 10).map(j => ({
        accountKey: j.accountKey,
        status: j.status,
        currentStage: j.currentStage,
        startedAt: j.startedAt,
      })),
    },
    queue: {
      accountsNeedingEnrichment: accountsNeedingWork.length,
      byPriority: {
        urgent: accountsNeedingWork.filter(a => a.priority === 'urgent').length,
        high: accountsNeedingWork.filter(a => a.priority === 'high').length,
        normal: accountsNeedingWork.filter(a => a.priority === 'normal').length,
      },
      top10: accountsNeedingWork.slice(0, 10),
    },
  };
}

function buildDataTree(accounts, persons, technologies, packByKey, interactions, sessions) {
  const accountsWithPack = accounts.filter(a => packByKey[a.accountKey]).length;
  const accountsWithTech = accounts.filter(a => a.techRefCount > 0).length;
  const accountsWithLeadership = accounts.filter(a => a.leadershipCount > 0).length;
  const accountsWithCompetitors = accounts.filter(a => a.competitorCount > 0).length;
  const accountsWithPainPoints = accounts.filter(a => a.painPointCount > 0).length;
  const accountsWithBenchmarks = accounts.filter(a =>
    a.benchmarks && Object.values(a.benchmarks).some(v => v != null && v !== '')
  ).length;

  const personsLinked = persons.filter(p => p.hasCompanyRef || p.relatedAccountKey).length;

  const uniqueInteractionDomains = [...new Set((interactions.domains || []).filter(Boolean))];

  return {
    root: {
      type: 'database',
      children: [
        {
          type: 'accounts',
          count: accounts.length,
          coverage: {
            withAccountPack: accountsWithPack,
            withLinkedTechnologies: accountsWithTech,
            withLeadership: accountsWithLeadership,
            withCompetitors: accountsWithCompetitors,
            withPainPoints: accountsWithPainPoints,
            withBenchmarks: accountsWithBenchmarks,
          },
        },
        {
          type: 'persons',
          count: persons.length,
          coverage: {
            linkedToAccount: personsLinked,
            unlinked: persons.length - personsLinked,
            withExperience: persons.filter(p => p.hasExperience).length,
            withEducation: persons.filter(p => p.hasEducation).length,
            withSkills: persons.filter(p => p.hasSkills).length,
            decisionMakers: persons.filter(p => p.isDecisionMaker).length,
          },
        },
        {
          type: 'technologies',
          count: technologies.length,
          coverage: {
            byCategory: groupBy(technologies, 'category'),
            legacy: technologies.filter(t => t.isLegacy).length,
            migrationTargets: technologies.filter(t => t.isMigrationTarget).length,
          },
        },
        {
          type: 'interactions',
          count: interactions.total || 0,
          coverage: {
            uniqueDomains: uniqueInteractionDomains.length,
            withFollowUp: interactions.withFollowUp || 0,
            withInsight: interactions.withInsight || 0,
          },
        },
        {
          type: 'sessions',
          count: sessions.total || 0,
        },
      ],
    },
    relationships: {
      accountToPersonLinks: personsLinked,
      accountToTechLinks: accountsWithTech,
      accountToCompetitorLinks: accountsWithCompetitors,
      interactionDomainsCovered: uniqueInteractionDomains.length,
      orphanedPersons: persons.length - personsLinked,
    },
  };
}

function buildGapAnalysis(accounts, packByKey, jobByKey) {
  const gapFrequency = {};
  const criticalGaps = [];

  for (const account of accounts) {
    const pack = packByKey[account.accountKey] || null;
    const job = jobByKey[account.accountKey] || null;
    const { gaps, score } = analyseCompleteness(account, pack, job);

    for (const gap of gaps) {
      if (!gapFrequency[gap]) gapFrequency[gap] = 0;
      gapFrequency[gap]++;
    }

    if (score === 0 && account.domain) {
      criticalGaps.push({
        accountKey: account.accountKey,
        domain: account.domain,
        companyName: account.companyName,
        reason: 'Zero completeness — no enrichment data',
      });
    } else if (gaps.includes('scan') && account.domain) {
      criticalGaps.push({
        accountKey: account.accountKey,
        domain: account.domain,
        companyName: account.companyName,
        reason: 'Missing initial scan',
      });
    }
  }

  const sortedGaps = Object.entries(gapFrequency)
    .map(([gap, count]) => ({
      dimension: gap,
      accountsMissing: count,
      percentage: accounts.length > 0 ? Math.round((count / accounts.length) * 100) : 0,
    }))
    .sort((a, b) => b.accountsMissing - a.accountsMissing);

  const fieldGaps = analyzeFieldGaps(accounts);

  return {
    dimensionGaps: sortedGaps,
    fieldGaps,
    criticalAccounts: criticalGaps.slice(0, 20),
    summary: {
      totalAccounts: accounts.length,
      fullyComplete: accounts.filter(a => {
        const pack = packByKey[a.accountKey] || null;
        const job = jobByKey[a.accountKey] || null;
        return analyseCompleteness(a, pack, job).score >= 90;
      }).length,
      needsWork: sortedGaps.length > 0 ? sortedGaps[0].accountsMissing : 0,
      mostCommonGap: sortedGaps.length > 0 ? sortedGaps[0].dimension : null,
    },
  };
}

function analyzeFieldGaps(accounts) {
  const gaps = {};

  for (const { field, label, category } of DESIRED_ACCOUNT_FIELDS) {
    let filled = 0;
    for (const account of accounts) {
      const val = account[field];
      if (val !== null && val !== undefined && val !== '' && val !== 0) {
        if (Array.isArray(val)) {
          if (val.length > 0) filled++;
        } else if (typeof val === 'object') {
          if (Object.values(val).some(v => v != null && v !== '')) filled++;
        } else {
          filled++;
        }
      }
    }

    gaps[field] = {
      label,
      category,
      filled,
      total: accounts.length,
      percentage: accounts.length > 0 ? Math.round((filled / accounts.length) * 100) : 0,
      missing: accounts.length - filled,
    };
  }

  return gaps;
}

function buildFieldCompletionMatrix(accounts, persons) {
  const accountMatrix = {};
  for (const { field, label, category } of DESIRED_ACCOUNT_FIELDS) {
    if (!accountMatrix[category]) accountMatrix[category] = { fields: [], categoryFilled: 0, categoryTotal: 0 };

    let filled = 0;
    for (const account of accounts) {
      const val = account[field];
      if (isFieldFilled(val)) filled++;
    }

    accountMatrix[category].fields.push({
      field,
      label,
      filled,
      total: accounts.length,
      percentage: accounts.length > 0 ? Math.round((filled / accounts.length) * 100) : 0,
    });
    accountMatrix[category].categoryFilled += filled;
    accountMatrix[category].categoryTotal += accounts.length;
  }

  for (const cat of Object.values(accountMatrix)) {
    cat.categoryPercentage = cat.categoryTotal > 0
      ? Math.round((cat.categoryFilled / cat.categoryTotal) * 100)
      : 0;
  }

  const personMatrix = {};
  for (const { field, label, category } of DESIRED_PERSON_FIELDS) {
    if (!personMatrix[category]) personMatrix[category] = { fields: [], categoryFilled: 0, categoryTotal: 0 };

    let filled = 0;
    for (const person of persons) {
      const val = person[field];
      if (isFieldFilled(val)) filled++;
    }

    personMatrix[category].fields.push({
      field,
      label,
      filled,
      total: persons.length,
      percentage: persons.length > 0 ? Math.round((filled / persons.length) * 100) : 0,
    });
    personMatrix[category].categoryFilled += filled;
    personMatrix[category].categoryTotal += persons.length;
  }

  for (const cat of Object.values(personMatrix)) {
    cat.categoryPercentage = cat.categoryTotal > 0
      ? Math.round((cat.categoryFilled / cat.categoryTotal) * 100)
      : 0;
  }

  return { accounts: accountMatrix, persons: personMatrix };
}

function buildTechStackCoverage(accounts) {
  const coreCategories = ['cms', 'frameworks'];
  const depthCategories = TECH_DEPTH_CATEGORIES;

  const coreCoverage = {};
  const depthCoverage = {};
  const techFrequency = {};

  for (const cat of coreCategories) {
    coreCoverage[cat] = { filled: 0, total: accounts.length };
  }
  for (const cat of depthCategories) {
    depthCoverage[cat] = { filled: 0, total: accounts.length };
  }

  for (const account of accounts) {
    const ts = account.technologyStack;
    if (!ts) continue;

    for (const cat of coreCategories) {
      if (Array.isArray(ts[cat]) && ts[cat].length > 0) {
        coreCoverage[cat].filled++;
        for (const tech of ts[cat]) {
          techFrequency[tech] = (techFrequency[tech] || 0) + 1;
        }
      }
    }

    for (const cat of depthCategories) {
      if (Array.isArray(ts[cat]) && ts[cat].length > 0) {
        depthCoverage[cat].filled++;
        for (const tech of ts[cat]) {
          techFrequency[tech] = (techFrequency[tech] || 0) + 1;
        }
      }
    }
  }

  for (const cat of Object.keys(coreCoverage)) {
    coreCoverage[cat].percentage = accounts.length > 0
      ? Math.round((coreCoverage[cat].filled / accounts.length) * 100) : 0;
  }
  for (const cat of Object.keys(depthCoverage)) {
    depthCoverage[cat].percentage = accounts.length > 0
      ? Math.round((depthCoverage[cat].filled / accounts.length) * 100) : 0;
  }

  const topTechnologies = Object.entries(techFrequency)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 30);

  return {
    coreCoverage,
    depthCoverage,
    topTechnologies,
    accountsWithAnyTech: accounts.filter(a => a.technologyStack && (
      (a.technologyStack.cms?.length > 0) ||
      (a.technologyStack.frameworks?.length > 0) ||
      TECH_DEPTH_CATEGORIES.some(c => a.technologyStack[c]?.length > 0)
    )).length,
    accountsWithDepth: accounts.filter(a => {
      const ts = a.technologyStack;
      if (!ts) return false;
      const pop = depthCategories.filter(c => Array.isArray(ts[c]) && ts[c].length > 0).length;
      return pop >= 3;
    }).length,
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────

function isFieldFilled(val) {
  if (val === null || val === undefined || val === '') return false;
  if (Array.isArray(val)) return val.length > 0;
  if (typeof val === 'object') return Object.values(val).some(v => v != null && v !== '');
  return true;
}

function groupBy(arr, key) {
  const groups = {};
  for (const item of arr) {
    const k = item[key] || 'uncategorized';
    if (!groups[k]) groups[k] = 0;
    groups[k]++;
  }
  return groups;
}
