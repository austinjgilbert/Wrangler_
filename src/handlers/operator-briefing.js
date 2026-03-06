import { createSuccessResponse, createErrorResponse } from '../utils/response.js';

export async function handleOperatorBriefing(request, requestId, env, groqQuery, upsertDocument, assertSanityConfigured) {
  try {
    const client = assertSanityConfigured(env);
    const url = new URL(request.url);
    const refresh = url.searchParams.get('refresh') === 'true' || request.method === 'POST';
    const hours = Math.min(168, Math.max(6, parseInt(url.searchParams.get('hours') || '24', 10)));
    const date = url.searchParams.get('date') || new Date().toISOString().slice(0, 10);
    const briefingId = `operatorDailyBriefing.${date}`;

    if (!refresh) {
      const existing = await groqQuery(client, `*[_id == $id][0]`, { id: briefingId });
      if (existing) {
        return createSuccessResponse({ briefing: existing, reused: true }, requestId);
      }
    }

    const briefing = await generateOperatorBriefing(groqQuery, upsertDocument, client, { date, hours });
    return createSuccessResponse({ briefing, reused: false }, requestId);
  } catch (error) {
    return createErrorResponse('OPERATOR_BRIEF_ERROR', error.message, {}, 500, requestId);
  }
}

async function generateOperatorBriefing(groqQuery, upsertDocument, client, options = {}) {
  const { date, hours } = options;
  const now = new Date(`${date}T23:59:59.000Z`);
  const periodEnd = now.toISOString();
  let periodStart = new Date(now.getTime() - hours * 60 * 60 * 1000).toISOString();
  const briefingId = `operatorDailyBriefing.${date}`;

  let [interactions, learnings, patterns, userPatterns, enrichJobs] = await Promise.all([
    groqQuery(client, `*[_type == "interaction" && coalesce(timestamp, createdAt) >= $periodStart && coalesce(timestamp, createdAt) <= $periodEnd] | order(coalesce(timestamp, createdAt) desc)[0...300]{
      _id, domain, accountKey, userPrompt, gptResponse, contextTags, importance, followUpNeeded, derivedInsight, timestamp
    }`, { periodStart, periodEnd }) || [],
    groqQuery(client, `*[_type == "learning" && createdAt >= $periodStart && createdAt <= $periodEnd] | order(createdAt desc)[0...100]{
      _id, title, summary, patternType, relevanceScore, contextTags, recommendedActions, createdAt
    }`, { periodStart, periodEnd }) || [],
    groqQuery(client, `*[_type == "molt.pattern"] | order(coalesce(lastUpdated, _updatedAt) desc)[0...50]{
      _id, patternType, summary, recommendedMoves, lastUpdated
    }`) || [],
    groqQuery(client, `*[_type == "userPattern" && timestamp >= $periodStart && timestamp <= $periodEnd] | order(timestamp desc)[0...100]{
      _id, action, approach, outcome, toolsUsed, sequence, thinking, context, timestamp
    }`, { periodStart, periodEnd }) || [],
    groqQuery(client, `*[_type in ["enrich.job", "enrichmentJob"] && coalesce(createdAt, startedAt, _createdAt) >= $periodStart] | order(coalesce(createdAt, startedAt, _createdAt) desc)[0...200]{
      _id, _type, status, priority, goal, goalKey, entityType, entityId, accountKey, createdAt, startedAt, updatedAt
    }`, { periodStart }) || [],
  ]);

  if (interactions.length === 0) {
    periodStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    [interactions, learnings, userPatterns, enrichJobs] = await Promise.all([
      groqQuery(client, `*[_type == "interaction" && coalesce(timestamp, createdAt) >= $periodStart && coalesce(timestamp, createdAt) <= $periodEnd] | order(coalesce(timestamp, createdAt) desc)[0...300]{
        _id, domain, accountKey, userPrompt, gptResponse, contextTags, importance, followUpNeeded, derivedInsight, timestamp
      }`, { periodStart, periodEnd }) || [],
      groqQuery(client, `*[_type == "learning" && createdAt >= $periodStart && createdAt <= $periodEnd] | order(createdAt desc)[0...100]{
        _id, title, summary, patternType, relevanceScore, contextTags, recommendedActions, createdAt
      }`, { periodStart, periodEnd }) || [],
      groqQuery(client, `*[_type == "userPattern" && timestamp >= $periodStart && timestamp <= $periodEnd] | order(timestamp desc)[0...100]{
        _id, action, approach, outcome, toolsUsed, sequence, thinking, context, timestamp
      }`, { periodStart, periodEnd }) || [],
      groqQuery(client, `*[_type in ["enrich.job", "enrichmentJob"] && coalesce(createdAt, startedAt, _createdAt) >= $periodStart] | order(coalesce(createdAt, startedAt, _createdAt) desc)[0...200]{
        _id, _type, status, priority, goal, goalKey, entityType, entityId, accountKey, createdAt, startedAt, updatedAt
      }`, { periodStart }) || [],
    ]);
  }

  const accountActivity = buildAccountActivity(interactions);
  const accountKeys = [...new Set(accountActivity.map((entry) => entry.accountKey).filter(Boolean))];
  const accounts = accountKeys.length > 0
    ? await groqQuery(client, `*[_type == "account" && accountKey in $accountKeys]{
      _id,
      accountKey,
      domain,
      rootDomain,
      canonicalUrl,
      companyName,
      name,
      industry,
      classification,
      opportunityScore,
      technologyStack,
      signals,
      painPoints,
      benchmarks,
      profileCompleteness,
      lastScannedAt,
      lastEnrichedAt,
      leadership[]->{
        _id,
        name,
        title,
        buyerPersona,
        isDecisionMaker
      }
    }`, { accountKeys }) || []
    : [];
  const accountPacks = accountKeys.length > 0
    ? await groqQuery(client, `*[_type == "accountPack" && accountKey in $accountKeys]{
      _id, accountKey, domain, payload, updatedAt
    }`, { accountKeys }) || []
    : [];

  const accountByKey = new Map(accounts.map((account) => [account.accountKey, account]));
  const packByKey = new Map(accountPacks.map((pack) => [pack.accountKey, pack]));

  const topAccounts = accountActivity
    .map((activity) => buildAccountFocus(activity, accountByKey.get(activity.accountKey), packByKey.get(activity.accountKey)))
    .sort((a, b) => b.priorityScore - a.priorityScore)
    .slice(0, 8);

  const workflowSummary = summarizeUserWorkflow(userPatterns, interactions);
  const systemImprovements = buildSystemImprovements({
    interactions,
    learnings,
    enrichJobs,
    topAccounts,
  });

  const summaryJson = {
    periodStart,
    periodEnd,
    totals: {
      interactions: interactions.length,
      learnings: learnings.length,
      patterns: patterns.length,
      userPatterns: userPatterns.length,
      enrichJobs: enrichJobs.length,
      touchedAccounts: topAccounts.length,
    },
    workflowSummary,
    topAccounts,
    systemImprovements,
    highlightedLearnings: learnings.slice(0, 10),
    highlightedPatterns: patterns.slice(0, 10),
  };

  const summaryMarkdown = buildBriefingMarkdown(summaryJson);
  const briefingDoc = {
    _type: 'operatorDailyBriefing',
    _id: briefingId,
    date: periodEnd,
    periodStart,
    periodEnd,
    summaryMarkdown,
    summaryJson,
    suggestedCodeChanges: systemImprovements.codeChanges,
    suggestedWorkflowImprovements: systemImprovements.workflowChanges,
    accountRefs: topAccounts.map((account) => account.accountRef).filter(Boolean).map((ref) => ({
      _type: 'reference',
      _ref: ref,
      _weak: false,
    })),
    learningRefs: learnings.slice(0, 10).map((learning) => ({
      _type: 'reference',
      _ref: learning._id,
      _weak: false,
    })),
    patternRefs: patterns.slice(0, 10).map((pattern) => ({
      _type: 'reference',
      _ref: pattern._id,
      _weak: false,
    })),
  };

  await upsertDocument(client, briefingDoc);
  return briefingDoc;
}

function buildAccountActivity(interactions = []) {
  const byKey = new Map();

  for (const interaction of interactions) {
    const accountKey = interaction.accountKey || (interaction.domain ? `domain:${interaction.domain}` : null);
    if (!accountKey) continue;

    if (!byKey.has(accountKey)) {
      byKey.set(accountKey, {
        accountKey: interaction.accountKey || null,
        domain: interaction.domain || null,
        interactionCount: 0,
        followUps: 0,
        insights: 0,
        tags: new Set(),
        prompts: [],
        responses: [],
      });
    }

    const entry = byKey.get(accountKey);
    entry.interactionCount += 1;
    if (interaction.followUpNeeded) entry.followUps += 1;
    if (interaction.derivedInsight) entry.insights += 1;
    (interaction.contextTags || []).forEach((tag) => entry.tags.add(tag));
    if (interaction.userPrompt) entry.prompts.push(interaction.userPrompt);
    if (interaction.gptResponse) entry.responses.push(interaction.gptResponse);
  }

  return [...byKey.values()].map((entry) => ({
    ...entry,
    tags: [...entry.tags],
  }));
}

function buildAccountFocus(activity, account = null, pack = null) {
  const tech = account?.technologyStack || {};
  const completeness = account?.profileCompleteness || {};
  const themes = inferThemes(account, pack, activity);
  const personas = inferTargetPersonas(account, themes);
  const plan = inferPlanTimeline(account, pack, activity, themes);
  const priorityScore =
    (activity.interactionCount * 10) +
    (activity.followUps * 8) +
    (activity.insights * 6) +
    (account?.opportunityScore || 0) +
    Math.max(0, 100 - (completeness.score || 0));

  return {
    accountRef: account?._id || null,
    accountKey: account?.accountKey || activity.accountKey,
    domain: account?.domain || account?.rootDomain || activity.domain,
    companyName: account?.companyName || account?.name || activity.domain,
    interactionCount: activity.interactionCount,
    followUps: activity.followUps,
    insights: activity.insights,
    tags: activity.tags,
    opportunityScore: account?.opportunityScore ?? null,
    completenessScore: completeness.score ?? null,
    gaps: completeness.gaps || [],
    currentSignals: (account?.signals || []).slice(0, 6),
    likelyInitiatives: themes,
    targetPersonas: personas,
    planTimeline: plan,
    suggestedEntryPoints: buildEntryPoints(account, personas),
    leadership: (account?.leadership || []).slice(0, 5),
    techSnapshot: {
      cms: tech.cms || [],
      frameworks: tech.frameworks || [],
      analytics: tech.analytics || [],
      ecommerce: tech.ecommerce || [],
      hosting: tech.hosting || [],
      payments: tech.payments || [],
    },
    priorityScore,
  };
}

function inferThemes(account, pack, activity) {
  const themes = new Set();
  const text = [
    ...(account?.signals || []),
    ...(activity.prompts || []).slice(0, 6),
    ...(activity.responses || []).slice(0, 6),
    stringifyMaybe(pack?.payload?.researchSet?.brief?.executiveSummary),
    stringifyMaybe(pack?.payload?.brief?.executiveSummary),
    stringifyMaybe(pack?.payload?.researchSet?.evidence),
  ].filter(Boolean).join('\n').toLowerCase();

  if (/ai|automation|copilot|agent/.test(text)) themes.add('ai-adoption');
  if (/migrat|replatform|headless|cms|content/.test(text)) themes.add('content-platform-change');
  if (/security|compliance|auth|risk|governance/.test(text)) themes.add('security-hardening');
  if (/hiring|career|job|recruit|open role/.test(text)) themes.add('team-expansion');
  if (/growth|enterprise|pricing|expansion|scale/.test(text)) themes.add('go-to-market-expansion');
  if (/analytics|measurement|attribution|data/.test(text)) themes.add('measurement-maturity');
  if (/performance|speed|latency|core web vitals/.test(text)) themes.add('performance-optimization');

  if ((account?.technologyStack?.ecommerce || []).length > 0) themes.add('commerce-optimization');
  if ((account?.technologyStack?.payments || []).length > 0) themes.add('checkout-and-payments');
  if ((account?.technologyStack?.cms || []).length > 0 && !themes.has('content-platform-change')) themes.add('content-operations');

  return [...themes].slice(0, 5);
}

function inferTargetPersonas(account, themes) {
  const personas = [];
  const leadership = account?.leadership || [];

  const addPersona = (title, reason) => {
    if (!personas.some((persona) => persona.title === title)) {
      const matchingLeader = leadership.find((leader) => new RegExp(title.split('/')[0].trim(), 'i').test(leader.title || ''));
      personas.push({
        title,
        reason,
        person: matchingLeader ? { name: matchingLeader.name, title: matchingLeader.title } : null,
      });
    }
  };

  if (themes.includes('content-platform-change') || themes.includes('performance-optimization')) {
    addPersona('CTO / VP Engineering', 'Most likely owner of replatforming, integration, and performance decisions.');
  }
  if (themes.includes('commerce-optimization') || themes.includes('checkout-and-payments')) {
    addPersona('VP Ecommerce / Head of Digital', 'Likely sponsor for checkout, merchandising, and digital revenue improvements.');
  }
  if (themes.includes('measurement-maturity') || themes.includes('go-to-market-expansion')) {
    addPersona('VP Marketing / Growth Lead', 'Likely stakeholder for measurement, experimentation, and funnel optimization.');
  }
  if (themes.includes('security-hardening')) {
    addPersona('CISO / CIO / Platform Lead', 'Security and compliance themes suggest an infrastructure or governance buyer.');
  }
  if (personas.length === 0) {
    addPersona('Head of Digital / Product Lead', 'Best default entry point when the initiative owner is still ambiguous.');
  }

  return personas.slice(0, 3);
}

function inferPlanTimeline(account, pack, activity, themes) {
  const last12Months = [];
  const current = [];
  const next12Months = [];

  if (activity.interactionCount >= 3) last12Months.push('This account has drawn repeated attention recently, indicating a live or recurring research thread.');
  if ((account?.signals || []).length > 0) last12Months.push(`Signals observed: ${(account.signals || []).slice(0, 3).join('; ')}`);
  if ((account?.benchmarks?.estimatedRevenue || account?.benchmarks?.estimatedTraffic)) {
    current.push(`Current scale indicators: revenue ${account?.benchmarks?.estimatedRevenue || 'unknown'}, traffic ${account?.benchmarks?.estimatedTraffic || 'unknown'}.`);
  }
  if (account?.profileCompleteness?.gaps?.length) {
    current.push(`Current knowledge gaps: ${(account.profileCompleteness.gaps || []).slice(0, 5).join(', ')}.`);
  }

  if (themes.includes('content-platform-change')) {
    next12Months.push('Likely evaluating platform modernization, migration, or content architecture changes.');
  }
  if (themes.includes('ai-adoption')) {
    next12Months.push('Likely to test AI-assisted workflows, automation, or agent-enabled customer/employee experiences.');
  }
  if (themes.includes('team-expansion')) {
    next12Months.push('Hiring signals suggest budget allocation and execution capacity are increasing.');
  }
  if (themes.includes('measurement-maturity')) {
    next12Months.push('Likely to invest in analytics, attribution, or experimentation to support growth goals.');
  }
  if (themes.includes('security-hardening')) {
    next12Months.push('Security or compliance work may become a gating requirement for other roadmap changes.');
  }

  const briefSummary = stringifyMaybe(pack?.payload?.researchSet?.brief?.executiveSummary || pack?.payload?.brief?.executiveSummary);
  if (briefSummary) current.push(`Brief signal: ${truncate(briefSummary, 220)}`);

  return {
    last12Months: dedupeStrings(last12Months).slice(0, 3),
    current: dedupeStrings(current).slice(0, 3),
    next12Months: dedupeStrings(next12Months).slice(0, 4),
  };
}

function buildEntryPoints(account, personas) {
  const entryPoints = [];
  if ((account?.painPoints || []).length > 0) {
    entryPoints.push(`Lead with pain points around ${(account.painPoints || []).slice(0, 2).map((item) => item.category || item.description).join(', ')}.`);
  }
  for (const persona of personas) {
    entryPoints.push(`${persona.title}: ${persona.reason}`);
  }
  if ((account?.signals || []).length > 0) {
    entryPoints.push(`Use observed signals as proof points: ${(account.signals || []).slice(0, 3).join('; ')}`);
  }
  return entryPoints.slice(0, 4);
}

function summarizeUserWorkflow(userPatterns, interactions) {
  const actions = {};
  const toolCounts = {};
  const tagCounts = {};

  for (const pattern of userPatterns) {
    actions[pattern.action || 'unknown'] = (actions[pattern.action || 'unknown'] || 0) + 1;
    for (const tool of pattern.toolsUsed || []) {
      toolCounts[tool] = (toolCounts[tool] || 0) + 1;
    }
  }
  for (const interaction of interactions) {
    for (const tag of interaction.contextTags || []) {
      tagCounts[tag] = (tagCounts[tag] || 0) + 1;
    }
  }

  return {
    dominantActions: sortEntries(actions).slice(0, 5),
    dominantTools: sortEntries(toolCounts).slice(0, 5),
    dominantTags: sortEntries(tagCounts).slice(0, 8),
  };
}

function buildSystemImprovements({ interactions, learnings, enrichJobs, topAccounts }) {
  const codeChanges = [];
  const workflowChanges = [];
  const blankContextInteractions = interactions.filter((item) => !item.accountKey && !item.domain).length;
  const unresolvedFollowUps = interactions.filter((item) => item.followUpNeeded).length;
  const queuedJobs = enrichJobs.filter((job) => ['queued', 'pending'].includes(job.status || '')).length;
  const duplicateGoals = new Set(
    enrichJobs
      .filter((job) => (job.goal || job.goalKey) && (job.accountKey || job.entityId))
      .map((job) => `${job.accountKey || job.entityId}:${job.goal || job.goalKey}`)
  ).size;

  if (blankContextInteractions > 0) {
    codeChanges.push(`Improve entity resolution before interaction storage. ${blankContextInteractions} recent interactions still lack account/domain anchors.`);
  }
  if (queuedJobs > duplicateGoals) {
    codeChanges.push('Tighten enrichment dedupe and leasing. Queue volume still exceeds distinct account-goal combinations.');
  }
  if (topAccounts.some((account) => (account.completenessScore ?? 100) < 40)) {
    codeChanges.push('Bias the enrichment flywheel toward low-completeness, high-attention accounts before adding more breadth.');
  }
  if (learnings.length < 3) {
    codeChanges.push('Strengthen learning derivation so each day yields more reusable patterns and less raw activity summary.');
  }

  if (topAccounts.length > 0) {
    workflowChanges.push(`Start tomorrow with the top ${Math.min(3, topAccounts.length)} accounts from this briefing before net-new research.`);
  } else {
    workflowChanges.push('If account activity is light today, refresh the highest-opportunity stale accounts before starting net-new research.');
  }
  if (unresolvedFollowUps > 0) {
    workflowChanges.push(`Resolve ${unresolvedFollowUps} open follow-up threads early. They are high-signal carryover work.`);
  }
  if (topAccounts.some((account) => (account.targetPersonas || []).length > 0)) {
    workflowChanges.push('Anchor outreach and research around the inferred initiative owner rather than the company in general.');
  }

  return { codeChanges, workflowChanges };
}

function buildBriefingMarkdown(summary) {
  const lines = [
    '# Operator Daily Briefing',
    `Window: ${summary.periodStart} → ${summary.periodEnd}`,
    '',
    '## System Summary',
    `- Interactions: ${summary.totals.interactions}`,
    `- Learnings: ${summary.totals.learnings}`,
    `- Patterns: ${summary.totals.patterns}`,
    `- User patterns: ${summary.totals.userPatterns}`,
    `- Enrichment jobs touched: ${summary.totals.enrichJobs}`,
    '',
    '## Workflow Pattern',
  ];

  for (const [action, count] of summary.workflowSummary.dominantActions || []) {
    lines.push(`- ${action}: ${count}`);
  }
  if ((summary.workflowSummary.dominantActions || []).length === 0) {
    lines.push('- No dominant action pattern captured today.');
  }

  lines.push('', '## Priority Accounts');
  for (const account of summary.topAccounts.slice(0, 5)) {
    lines.push(`- ${account.companyName || account.domain} — priority ${account.priorityScore}`);
    lines.push(`  Opportunity: ${account.opportunityScore ?? 'unknown'} | Completeness: ${account.completenessScore ?? 'unknown'}`);
    if ((account.likelyInitiatives || []).length) lines.push(`  Likely initiatives: ${account.likelyInitiatives.join(', ')}`);
    if ((account.targetPersonas || []).length) lines.push(`  Entry points: ${account.targetPersonas.map((persona) => persona.title).join(', ')}`);
    if ((account.planTimeline?.next12Months || []).length) lines.push(`  Next 12 months: ${account.planTimeline.next12Months.join(' ')}`);
  }
  if (summary.topAccounts.length === 0) {
    lines.push('- No account activity was strong enough to rank today.');
  }

  lines.push('', '## Suggested Code Changes');
  for (const change of summary.systemImprovements.codeChanges || []) {
    lines.push(`- ${change}`);
  }
  if ((summary.systemImprovements.codeChanges || []).length === 0) {
    lines.push('- No critical code changes inferred today.');
  }

  lines.push('', '## Suggested Workflow Improvements');
  for (const change of summary.systemImprovements.workflowChanges || []) {
    lines.push(`- ${change}`);
  }

  return lines.join('\n');
}

function stringifyMaybe(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return '';
  }
}

function sortEntries(record) {
  return Object.entries(record || {}).sort((a, b) => b[1] - a[1]);
}

function dedupeStrings(values = []) {
  return [...new Set(values.filter(Boolean))];
}

function truncate(value, maxLen) {
  const text = String(value || '');
  return text.length <= maxLen ? text : `${text.slice(0, maxLen)}…`;
}
