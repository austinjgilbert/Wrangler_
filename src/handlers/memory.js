/**
 * Memory Handler — the GPT's "compare notes" action
 *
 * GET  /memory  → Recall account + learning context for the prompt
 * POST /memory  → Store the exchange and return refreshed recall
 */

import { createSuccessResponse, createErrorResponse } from '../utils/response.js';
import {
  getRecentInteractions,
  getRelevantLearnings,
  getUnresolvedFollowUps,
} from '../services/context-retrieval.js';

export async function handleMemoryRecall(request, requestId, env, groqQuery, assertSanityConfigured) {
  try {
    const client = assertSanityConfigured(env);
    const url = new URL(request.url);
    const explicitDomains = splitCsv(url.searchParams.get('domains'));
    const threadId = url.searchParams.get('threadId') || null;
    const prompt = url.searchParams.get('q') || '';
    const limit = Math.min(30, Math.max(1, parseInt(url.searchParams.get('limit') || '10', 10)));

    if (explicitDomains.length === 0 && !threadId && !prompt) {
      return createSuccessResponse({
        recall: null,
        hint: 'Pass ?domains=example.com or ?q=your prompt or ?threadId=xxx to recall context.',
      }, requestId);
    }

    const resolvedAccounts = await resolveAccountsForPrompt(groqQuery, client, {
      prompt,
      explicitDomains,
    });
    const recall = await buildRecall(groqQuery, client, {
      prompt,
      explicitDomains,
      resolvedAccounts,
      threadId,
      limit,
    });

    return createSuccessResponse({ recall, brief: buildRecallBrief(recall) }, requestId);
  } catch (error) {
    return createErrorResponse('MEMORY_ERROR', error.message, {}, 500, requestId);
  }
}

export async function handleMemorySync(request, requestId, env, groqQuery, upsertDocument, patchDocument, assertSanityConfigured) {
  try {
    const client = assertSanityConfigured(env);
    const body = await request.json().catch(() => ({}));

    const {
      userMessage = '',
      assistantMessage = '',
      domains = [],
      threadId = null,
      tags = [],
      importance = 0.6,
      followUpNeeded = false,
      followUpNotes = null,
    } = body;

    if (!userMessage) {
      return createErrorResponse('VALIDATION_ERROR', 'userMessage is required', {}, 400, requestId);
    }
    if (!assistantMessage) {
      return createErrorResponse('VALIDATION_ERROR', 'assistantMessage is required so the exchange can be stored', {}, 400, requestId);
    }

    const explicitDomains = [...new Set(domains.map(normalizeDomain).filter(Boolean))];
    const resolvedAccounts = await resolveAccountsForPrompt(groqQuery, client, {
      prompt: `${userMessage}\n${assistantMessage}`,
      explicitDomains,
    });

    const storeResult = await storeNote(groqQuery, upsertDocument, patchDocument, client, {
      userMessage,
      assistantMessage,
      resolvedAccounts,
      explicitDomains,
      threadId,
      tags,
      importance,
      followUpNeeded,
      followUpNotes,
    });

    const recall = await buildRecall(groqQuery, client, {
      prompt: userMessage,
      explicitDomains,
      resolvedAccounts,
      threadId,
      limit: 10,
    });

    return createSuccessResponse({
      stored: storeResult,
      recall,
      brief: buildRecallBrief(recall),
    }, requestId);
  } catch (error) {
    return createErrorResponse('MEMORY_ERROR', error.message, {}, 500, requestId);
  }
}

async function buildRecall(groqQuery, client, options = {}) {
  const {
    prompt = '',
    explicitDomains = [],
    resolvedAccounts = [],
    threadId = null,
    limit = 10,
  } = options;

  const accountBundles = await Promise.all(
    resolvedAccounts.map(async (account) => {
      const domain = normalizeDomain(account.domain || account.rootDomain);
      const [recentNotes, learnings, followUps] = await Promise.all([
        getRecentInteractions(groqQuery, client, {
          accountId: account._id,
          accountKey: account.accountKey,
          domain,
        }, limit),
        getRelevantLearnings(groqQuery, client, {
          accountId: account._id,
          accountKey: account.accountKey,
          domain,
          minRelevanceScore: 0,
        }, Math.min(limit, 10)),
        getUnresolvedFollowUps(groqQuery, client, {
          accountId: account._id,
          accountKey: account.accountKey,
          domain,
        }, 5),
      ]);

      return { account, recentNotes, learnings, followUps };
    }),
  );

  const unmatchedDomains = explicitDomains.filter(
    (domain) => !resolvedAccounts.some((account) => normalizeDomain(account.domain || account.rootDomain) === domain),
  );

  const fallbackDomainBundles = await Promise.all(
    unmatchedDomains.map(async (domain) => {
      const [recentNotes, followUps] = await Promise.all([
        getRecentInteractions(groqQuery, client, { domain }, limit),
        getUnresolvedFollowUps(groqQuery, client, { domain }, 5),
      ]);
      return { domain, recentNotes, followUps };
    }),
  );

  const threadHistory = threadId
    ? await recallThreadHistory(groqQuery, client, threadId, limit)
    : [];

  return {
    prompt,
    entities: {
      domains: [...new Set([
        ...explicitDomains,
        ...resolvedAccounts.map((account) => normalizeDomain(account.domain || account.rootDomain)).filter(Boolean),
      ])],
      accountKeys: resolvedAccounts.map((account) => account.accountKey).filter(Boolean),
      names: resolvedAccounts.map((account) => account.companyName || account.name).filter(Boolean),
    },
    threadId,
    accounts: resolvedAccounts.map(formatAccount),
    recentNotes: dedupeById([
      ...accountBundles.flatMap((bundle) => bundle.recentNotes),
      ...fallbackDomainBundles.flatMap((bundle) => bundle.recentNotes),
    ]).sort(sortByTimestampDesc).slice(0, limit).map(formatNote),
    learnings: dedupeById(accountBundles.flatMap((bundle) => bundle.learnings))
      .sort(sortByCreatedDesc)
      .slice(0, Math.min(limit, 10))
      .map(formatLearning),
    followUps: dedupeById([
      ...accountBundles.flatMap((bundle) => bundle.followUps),
      ...fallbackDomainBundles.flatMap((bundle) => bundle.followUps),
    ]).sort(sortByTimestampDesc).slice(0, 5).map(formatFollowUp),
    threadHistory: threadHistory.map(formatNote),
    stats: await recallSystemStats(groqQuery, client),
    warnings: resolvedAccounts.length === 0
      ? ['No account entity was resolved from this prompt. Results rely on thread history and domain-scoped notes only.']
      : [],
  };
}

async function resolveAccountsForPrompt(groqQuery, client, options = {}) {
  const { prompt = '', explicitDomains = [] } = options;
  const promptText = String(prompt || '').toLowerCase();
  const allDomains = [...new Set([
    ...explicitDomains,
    ...extractDomainsFromText(prompt),
  ].map(normalizeDomain).filter(Boolean))];
  const companyHints = extractCompanyNameHints(promptText);

  const accounts = await groqQuery(client, `*[_type == "account"][0...200]{
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
    "aiReadiness": aiReadiness.score,
    "performanceScore": performance.performanceScore,
    technologyStack,
    signals,
    "leadershipCount": count(leadership),
    "competitorCount": count(competitors),
    "painPointCount": count(painPoints),
    benchmarks,
    profileCompleteness,
    lastScannedAt,
    lastEnrichedAt
  }`) || [];

  return accounts
    .map((account) => ({ ...account, _score: scoreAccountMatch(account, promptText, allDomains, companyHints) }))
    .filter((account) => account._score > 0)
    .sort((a, b) => b._score - a._score)
    .slice(0, 5);
}

function scoreAccountMatch(account, promptText, domains, companyHints) {
  let score = 0;
  const domain = normalizeDomain(account.domain);
  const rootDomain = normalizeDomain(account.rootDomain);
  const names = [account.companyName, account.name].filter(Boolean).map((value) => String(value).toLowerCase());

  if (domains.some((value) => value === domain || value === rootDomain)) score += 100;
  if (domain && promptText.includes(domain)) score += 80;
  if (rootDomain && promptText.includes(rootDomain)) score += 75;

  for (const name of names) {
    if (promptText.includes(name)) score += 70;
    if (companyHints.some((hint) => hint.includes(name) || name.includes(hint))) score += 40;
  }

  return score;
}

async function recallThreadHistory(groqQuery, client, threadId, limit) {
  const query = `*[_type == "interaction" && (
    requestId == $threadId || sessionId->sessionId == $threadId
  )] | order(timestamp desc) [0...$limit] {
    _id, userPrompt, gptResponse, timestamp, domain, accountKey,
    contextTags, importance, followUpNeeded, followUpNotes, derivedInsight
  }`;
  return await groqQuery(client, query, { threadId, limit }) || [];
}

async function recallSystemStats(groqQuery, client) {
  const query = `{
    "totalAccounts": count(*[_type == "account"]),
    "totalInteractions": count(*[_type == "interaction"]),
    "totalPersons": count(*[_type == "person"]),
    "totalTechnologies": count(*[_type == "technology"]),
    "totalLearnings": count(*[_type == "learning"]),
    "totalPatterns": count(*[_type == "molt.pattern"]),
    "recentInteractions24h": count(*[_type == "interaction" && _createdAt > $since])
  }`;
  return await groqQuery(client, query, {
    since: new Date(Date.now() - 86400000).toISOString(),
  }) || {};
}

async function storeNote(groqQuery, upsertDocument, patchDocument, client, data) {
  const {
    userMessage,
    assistantMessage,
    resolvedAccounts,
    explicitDomains,
    threadId,
    tags,
    importance,
    followUpNeeded,
    followUpNotes,
  } = data;

  const { storeInteraction } = await import('../services/interaction-storage.js');
  const primaryAccount = resolvedAccounts[0] || null;
  const primaryDomain = normalizeDomain(primaryAccount?.domain || primaryAccount?.rootDomain || explicitDomains[0] || null);
  let primaryAccountKey = primaryAccount?.accountKey || '';

  if (!primaryAccountKey && primaryDomain) {
    const { generateAccountKey } = await import('../sanity-client.js');
    primaryAccountKey = await generateAccountKey(`https://${primaryDomain}`);
  }

  const mergedTags = [...new Set([...tags, ...autoDeriveTags(`${userMessage}\n${assistantMessage}`)])];
  const result = await storeInteraction(
    groqQuery,
    upsertDocument,
    patchDocument,
    client,
    {
      sessionId: threadId,
      userPrompt: userMessage.substring(0, 5000),
      gptResponse: assistantMessage.substring(0, 5000),
      referencedAccounts: resolvedAccounts.map((account) => account._id),
      contextTags: mergedTags,
      importance,
      followUpNeeded,
      followUpNotes,
      requestId: threadId,
      domain: primaryDomain || '',
      accountKey: primaryAccountKey || '',
    },
  );

  if (!result?.success) {
    throw new Error(result?.error || 'Failed to store interaction');
  }

  return {
    id: result.interaction?._id || `interaction.${result.interactionId}`,
    interactionId: result.interactionId,
    sessionId: result.sessionId,
    domains: [...new Set([
      ...resolvedAccounts.map((account) => normalizeDomain(account.domain || account.rootDomain)).filter(Boolean),
      ...explicitDomains,
    ])],
    accountKeys: resolvedAccounts.map((account) => account.accountKey).filter(Boolean),
    tags: mergedTags,
    followUpNeeded: result.interaction?.followUpNeeded ?? followUpNeeded,
    derivedInsight: result.interaction?.derivedInsight ?? false,
  };
}

function formatAccount(account) {
  return {
    _id: account._id,
    accountKey: account.accountKey,
    domain: account.domain,
    rootDomain: account.rootDomain,
    canonicalUrl: account.canonicalUrl,
    companyName: account.companyName || account.name,
    industry: account.industry || account.classification?.industry || null,
    opportunityScore: account.opportunityScore,
    aiReadiness: account.aiReadiness,
    performanceScore: account.performanceScore,
    technologyStack: account.technologyStack || {},
    signals: account.signals || [],
    leadershipCount: account.leadershipCount || 0,
    competitorCount: account.competitorCount || 0,
    painPointCount: account.painPointCount || 0,
    benchmarks: account.benchmarks || null,
    profileCompleteness: account.profileCompleteness || null,
    lastScannedAt: account.lastScannedAt || null,
    lastEnrichedAt: account.lastEnrichedAt || null,
  };
}

function formatNote(interaction) {
  return {
    _id: interaction._id,
    date: interaction.timestamp,
    domain: interaction.domain,
    userSaid: truncate(interaction.userPrompt, 300),
    assistantSaid: truncate(interaction.gptResponse, 500),
    tags: interaction.contextTags || [],
    importance: interaction.importance,
    isInsight: interaction.derivedInsight || false,
    needsFollowUp: interaction.followUpNeeded || false,
  };
}

function formatLearning(learning) {
  return {
    _id: learning._id,
    title: learning.title || learning.memoryPhrase || 'Learning',
    summary: truncate(learning.summary, 400),
    tags: learning.contextTags || learning.tags || [],
    relevanceScore: learning.relevanceScore ?? learning.confidence ?? null,
    patternType: learning.patternType || null,
    recommendedActions: learning.recommendedActions || [],
    createdAt: learning.createdAt,
  };
}

function formatFollowUp(interaction) {
  return {
    _id: interaction._id,
    date: interaction.timestamp,
    domain: interaction.domain,
    question: truncate(interaction.userPrompt, 200),
    notes: interaction.followUpNotes,
  };
}

function buildRecallBrief(recall) {
  const parts = [];
  const stats = recall.stats || {};

  parts.push(`[System: ${stats.totalAccounts || 0} accounts, ${stats.totalPersons || 0} people, ${stats.totalInteractions || 0} interactions, ${stats.totalLearnings || 0} learnings, ${stats.totalPatterns || 0} patterns]`);

  for (const account of recall.accounts) {
    const lines = [`## ${account.companyName || account.domain || account.accountKey}`];
    if (account.industry) lines.push(`Industry: ${account.industry}`);
    if (account.opportunityScore != null) lines.push(`Opportunity: ${account.opportunityScore}`);
    if (account.aiReadiness != null) lines.push(`AI Readiness: ${account.aiReadiness}/100`);

    const tech = account.technologyStack || {};
    const techParts = [];
    if (tech.cms?.length) techParts.push(`CMS: ${tech.cms.join(', ')}`);
    if (tech.frameworks?.length) techParts.push(`Frameworks: ${tech.frameworks.join(', ')}`);
    if (tech.analytics?.length) techParts.push(`Analytics: ${tech.analytics.join(', ')}`);
    if (tech.ecommerce?.length) techParts.push(`E-commerce: ${tech.ecommerce.join(', ')}`);
    if (tech.hosting?.length) techParts.push(`Hosting: ${tech.hosting.join(', ')}`);
    if (tech.payments?.length) techParts.push(`Payments: ${tech.payments.join(', ')}`);
    if (techParts.length > 0) lines.push(techParts.join(' | '));

    if (account.profileCompleteness?.score != null) {
      lines.push(`Profile: ${account.profileCompleteness.score}% complete${account.profileCompleteness.gaps?.length ? ` (gaps: ${account.profileCompleteness.gaps.join(', ')})` : ''}`);
    }

    parts.push(lines.join('\n'));
  }

  if (recall.learnings.length > 0) {
    parts.push('## Reusable learnings');
    for (const learning of recall.learnings.slice(0, 5)) {
      parts.push(`- ${learning.title}: ${learning.summary}`);
    }
  }

  if (recall.followUps.length > 0) {
    parts.push('## Open follow-ups');
    for (const followUp of recall.followUps) {
      parts.push(`- [${followUp.domain || 'general'}] ${followUp.question}${followUp.notes ? ` → ${followUp.notes}` : ''}`);
    }
  }

  if (recall.recentNotes.length > 0) {
    parts.push('## Recent notes');
    for (const note of recall.recentNotes.slice(0, 5)) {
      parts.push(`- User: ${note.userSaid}\n  Agent: ${note.assistantSaid}`);
    }
  }

  if (recall.threadHistory.length > 0) {
    parts.push('## This thread');
    for (const note of recall.threadHistory.slice(0, 5)) {
      parts.push(`- User: ${note.userSaid}\n  Agent: ${note.assistantSaid}`);
    }
  }

  if (recall.warnings?.length) {
    parts.push('## Warnings');
    recall.warnings.forEach((warning) => parts.push(`- ${warning}`));
  }

  return parts.join('\n\n');
}

function splitCsv(value) {
  return [...new Set(String(value || '')
    .split(',')
    .map((item) => normalizeDomain(item))
    .filter(Boolean))];
}

function normalizeDomain(value) {
  if (!value) return null;
  return String(value).trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '') || null;
}

function extractDomainsFromText(text) {
  if (!text) return [];
  const domainRegex = /\b([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}\b/gi;
  const matches = text.match(domainRegex) || [];
  return [...new Set(matches.map((match) => normalizeDomain(match)).filter(Boolean).filter((domain) => !['example.com', 'e.g.', 'i.e.'].includes(domain)))];
}

function extractCompanyNameHints(text) {
  const tokens = String(text || '')
    .replace(/[^a-z0-9\s.&-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  const stopWords = new Set(['what', 'tell', 'about', 'using', 'their', 'they', 'them', 'with', 'from', 'into', 'have', 'this', 'that', 'would', 'could', 'should', 'need']);
  const hints = [];
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (stopWords.has(token) || token.length < 3) continue;
    const next = tokens[i + 1];
    if (next && !stopWords.has(next) && next.length >= 3) {
      hints.push(`${token} ${next}`.trim());
    }
    hints.push(token);
  }
  return [...new Set(hints)];
}

function autoDeriveTags(text) {
  const tags = [];
  const lower = String(text || '').toLowerCase();
  if (/\bscan\b|tech.?stack|technology/i.test(lower)) tags.push('tech');
  if (/\bcompetitor|vs\b|versus|compare/i.test(lower)) tags.push('competitor');
  if (/\bresearch|brief|report/i.test(lower)) tags.push('research');
  if (/\bperson|leader|ceo|cto|vp\b/i.test(lower)) tags.push('person');
  if (/\bpain.?point|challenge|problem/i.test(lower)) tags.push('pain-point');
  if (/\bopportunit|roi|revenue/i.test(lower)) tags.push('opportunity');
  if (/\benrich|pipeline|gap/i.test(lower)) tags.push('enrichment');
  if (/\blinkedin/i.test(lower)) tags.push('linkedin');
  if (/\bplan|initiative|roadmap|forecast|hiring|jobs\b/i.test(lower)) tags.push('planning');
  return tags;
}

function dedupeById(items = []) {
  const seen = new Set();
  const results = [];
  for (const item of items) {
    if (!item) continue;
    const key = item._id || `${item.domain || ''}:${item.timestamp || item.createdAt || ''}:${item.title || ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    results.push(item);
  }
  return results;
}

function sortByTimestampDesc(a, b) {
  return new Date(b.timestamp || b.date || 0).getTime() - new Date(a.timestamp || a.date || 0).getTime();
}

function sortByCreatedDesc(a, b) {
  return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
}

function truncate(str, maxLen) {
  if (!str) return '';
  if (str.length <= maxLen) return str;
  return str.substring(0, maxLen) + '…';
}
