/**
 * Auto-Learning Service
 *
 * Periodically reviews recent interactions and derives learning documents.
 * Runs as a cron job to identify recurring patterns, frequently-asked topics,
 * follow-up chains, and high-value insights — then persists them as
 * learning documents in Sanity.
 *
 * This makes the system smarter over time by surfacing patterns that
 * the GPT can use in future context recalls.
 */

import { extractQueryPatterns } from './learning-service.js';

const LEARNING_WINDOW_HOURS = 24;
const MIN_INTERACTIONS_FOR_PATTERN = 2;

/**
 * Main entry point — called by the cron job.
 * Reviews recent interactions and creates learning documents from patterns.
 */
export async function deriveAutomaticLearnings(env) {
  const { initSanityClient, groqQuery, upsertDocument, patchDocument } = await import('../sanity-client.js');
  const client = initSanityClient(env);
  if (!client) return { derived: 0, reason: 'Sanity not configured' };

  const cutoff = new Date(Date.now() - LEARNING_WINDOW_HOURS * 60 * 60 * 1000).toISOString();

  // Fetch recent interactions from the unified memory corpus.
  // A single interaction can contribute to multiple reusable patterns.
  const interactions = await groqQuery(client,
    `*[_type == "interaction" && createdAt > $cutoff] | order(timestamp desc)[0...150]{
      _id, userPrompt, gptResponse, domain, accountKey, contextTags, importance, followUpNeeded, derivedInsight, timestamp
    }`,
    { cutoff }
  );

  if (!Array.isArray(interactions) || interactions.length < MIN_INTERACTIONS_FOR_PATTERN) {
    return { derived: 0, reason: 'Not enough new interactions' };
  }

  const learnings = [];
  const patterns = [];

  // Pattern 1: Frequently researched domains
  const domainCounts = {};
  for (const ix of interactions) {
    if (ix.domain) {
      domainCounts[ix.domain] = (domainCounts[ix.domain] || 0) + 1;
    }
  }
  for (const [domain, count] of Object.entries(domainCounts)) {
    if (count >= 3) {
      const domainInteractions = interactions.filter(ix => ix.domain === domain);
      const tags = new Set();
      domainInteractions.forEach(ix => (ix.contextTags || []).forEach(t => tags.add(t)));

      learnings.push({
        title: `High-interest account: ${domain}`,
        summary: `${domain} was researched ${count} times in the last ${LEARNING_WINDOW_HOURS}h. Activities: ${[...tags].join(', ') || 'general research'}. This account deserves proactive monitoring and enrichment.`,
        derivedFrom: domainInteractions.map(ix => ix._id),
        contextTags: ['high-interest', 'pattern', ...tags],
        relevanceScore: Math.min(1, 0.5 + count * 0.1),
        domain,
        patternType: 'account_interest',
        recommendedActions: [
          'Queue proactive enrichment',
          'Summarize repeated operator intent',
          'Watch for competitor and tech-stack follow-ups',
        ],
      });
      patterns.push({
        patternId: `molt.pattern.account-interest.${sanitizeKey(domain)}`,
        patternType: 'account_interest',
        summary: `${domain} is repeatedly researched and should stay in the proactive monitoring set.`,
        recommendedMoves: [
          'Run enrichment on stale gaps',
          'Persist high-signal summaries back to account intelligence',
          'Promote this account for auto-brief refresh',
        ],
        evidenceInteractionIds: domainInteractions.map(ix => ix._id),
        conditions: {
          domain,
          interactionCount: count,
          tags: [...tags],
        },
        successStats: {
          interactionCount: count,
          dominantTags: [...tags],
        },
      });
    }
  }

  // Pattern 2: Follow-up chains (interactions flagged as needing follow-up)
  const followUps = interactions.filter(ix => ix.followUpNeeded);
  if (followUps.length >= 2) {
    const domains = [...new Set(followUps.map(ix => ix.domain).filter(Boolean))];
    learnings.push({
      title: `Unresolved follow-ups (${followUps.length})`,
      summary: `${followUps.length} interactions flagged for follow-up across ${domains.length} accounts: ${domains.slice(0, 5).join(', ')}. These represent open threads that need resolution.`,
      derivedFrom: followUps.map(ix => ix._id),
      contextTags: ['follow-up', 'action-required'],
      relevanceScore: 0.8,
      patternType: 'follow_up_chain',
      recommendedActions: [
        'Surface these follow-ups early in memory recall',
        'Prioritize accounts with repeated unresolved threads',
      ],
    });
    patterns.push({
      patternId: 'molt.pattern.follow-up-chain',
      patternType: 'follow_up_chain',
      summary: 'Open follow-up chains are accumulating and should be prioritized in future recall.',
      recommendedMoves: [
        'Prioritize open follow-ups in next-turn recall',
        'Promote unresolved items into job planning',
      ],
      evidenceInteractionIds: followUps.map(ix => ix._id),
      conditions: {
        domains,
        followUpCount: followUps.length,
      },
      successStats: {
        followUpCount: followUps.length,
        affectedAccounts: domains.length,
      },
    });
  }

  // Pattern 3: Derived insights (auto-flagged by interaction-storage)
  const insights = interactions.filter(ix => ix.derivedInsight);
  if (insights.length >= 2) {
    const summaries = insights.map(ix => {
      const snippet = (ix.gptResponse || '').substring(0, 150);
      return `[${ix.domain || 'general'}] ${snippet}`;
    });
    learnings.push({
      title: `Insight cluster (${insights.length} findings)`,
      summary: summaries.join('\n'),
      derivedFrom: insights.map(ix => ix._id),
      contextTags: ['insight-cluster', 'pattern'],
      relevanceScore: 0.85,
      patternType: 'insight_cluster',
      recommendedActions: [
        'Surface clustered insights in memory recall',
        'Convert recurring insight themes into reusable prompts',
      ],
    });
  }

  // Pattern 4: Intent patterns across interactions
  const intentCounts = {};
  for (const ix of interactions) {
    const patterns = extractQueryPatterns(ix.userPrompt || '', {});
    if (patterns.intent && patterns.intent !== 'unknown') {
      intentCounts[patterns.intent] = (intentCounts[patterns.intent] || 0) + 1;
    }
  }
  const dominantIntent = Object.entries(intentCounts).sort((a, b) => b[1] - a[1])[0];
  if (dominantIntent && dominantIntent[1] >= 3) {
    learnings.push({
      title: `Dominant research pattern: ${dominantIntent[0]}`,
      summary: `The operator's primary activity in the last ${LEARNING_WINDOW_HOURS}h has been "${dominantIntent[0]}" (${dominantIntent[1]} times). Optimize responses and pre-fetch data for this workflow.`,
      derivedFrom: interactions.slice(0, 5).map(ix => ix._id),
      contextTags: ['workflow-pattern', dominantIntent[0]],
      relevanceScore: 0.7,
      patternType: 'workflow_pattern',
      recommendedActions: [
        `Pre-fetch context for ${dominantIntent[0]} workflows`,
        'Bias memory ranking toward this intent when relevant',
      ],
    });
    patterns.push({
      patternId: `molt.pattern.workflow.${sanitizeKey(dominantIntent[0])}`,
      patternType: 'workflow_pattern',
      summary: `The dominant operator workflow is ${dominantIntent[0]}; future recall and next-step suggestions should bias toward it.`,
      recommendedMoves: [
        `Bias recall toward ${dominantIntent[0]} context`,
        'Suggest the next likely action sequence',
      ],
      evidenceInteractionIds: interactions.slice(0, 10).map(ix => ix._id),
      conditions: {
        intent: dominantIntent[0],
      },
      successStats: {
        count: dominantIntent[1],
      },
    });
  }

  // Pattern 5: Cross-account technology patterns
  const techMentions = {};
  for (const ix of interactions) {
    const tags = ix.contextTags || [];
    if (tags.includes('scan') && ix.gptResponse) {
      const techMatches = ix.gptResponse.match(/Tech detected: ([^.]+)/);
      if (techMatches) {
        for (const tech of techMatches[1].split(', ')) {
          techMentions[tech.trim()] = (techMentions[tech.trim()] || 0) + 1;
        }
      }
    }
  }
  const recurringTechs = Object.entries(techMentions).filter(([, count]) => count >= 2);
  if (recurringTechs.length >= 2) {
    learnings.push({
      title: `Recurring tech stack pattern`,
      summary: `Technologies appearing across multiple scanned accounts: ${recurringTechs.map(([t, c]) => `${t} (${c}x)`).join(', ')}. These may indicate industry trends or target segment characteristics.`,
      derivedFrom: interactions.filter(ix => (ix.contextTags || []).includes('scan')).slice(0, 5).map(ix => ix._id),
      contextTags: ['tech-pattern', 'segment-insight'],
      relevanceScore: 0.75,
      patternType: 'tech_pattern',
      recommendedActions: [
        'Use recurring tech combinations as segment signals',
        'Suggest migration or integration plays when these stacks recur',
      ],
    });
    patterns.push({
      patternId: 'molt.pattern.tech-recurring',
      patternType: 'tech_pattern',
      summary: `Recurring technologies detected across accounts: ${recurringTechs.map(([t]) => t).join(', ')}.`,
      recommendedMoves: [
        'Build segment hypotheses from repeated stack combinations',
        'Generate reusable opportunity narratives from recurring technologies',
      ],
      evidenceInteractionIds: interactions.filter(ix => (ix.contextTags || []).includes('scan')).slice(0, 10).map(ix => ix._id),
      conditions: {
        technologies: recurringTechs.map(([tech]) => tech),
      },
      successStats: {
        recurringTechs: recurringTechs.map(([tech, count]) => ({ tech, count })),
      },
    });
  }

  // Persist the learnings
  const { deriveLearning } = await import('./interaction-storage.js');
  let derived = 0;
  for (const learning of learnings) {
    try {
      const result = await deriveLearning(groqQuery, upsertDocument, client, {
        title: learning.title,
        summary: learning.summary,
        derivedFrom: learning.derivedFrom,
        contextTags: learning.contextTags,
        relevanceScore: learning.relevanceScore,
        memoryPhrase: learning.title,
        patternType: learning.patternType,
        recommendedActions: learning.recommendedActions,
        confidence: learning.relevanceScore,
        applicableToAccounts: learning.domain
          ? await resolveAccountIds(groqQuery, client, [learning.domain])
          : [],
      });
      if (result?.success) derived++;
    } catch (err) {
      console.error('[auto-learning] Failed to derive learning:', err?.message);
    }
  }

  let patternDocs = 0;
  for (const pattern of patterns) {
    try {
      await upsertDocument(client, {
        _type: 'molt.pattern',
        _id: pattern.patternId,
        patternType: pattern.patternType,
        summary: pattern.summary,
        conditions: pattern.conditions,
        recommendedMoves: pattern.recommendedMoves,
        evidenceInteractions: (pattern.evidenceInteractionIds || []).map(id => ({
          _type: 'reference',
          _ref: id,
          _weak: false,
        })),
        successStats: pattern.successStats,
        lastUpdated: new Date().toISOString(),
      });
      patternDocs++;
    } catch (err) {
      console.error('[auto-learning] Failed to persist pattern:', err?.message);
    }
  }

  return { derived, patternDocs, patterns: learnings.length, interactionsReviewed: interactions.length };
}

async function resolveAccountIds(groqQuery, client, domains) {
  const ids = [];
  for (const domain of domains) {
    try {
      const raw = await groqQuery(client,
        `*[_type == "account" && (domain == $d || rootDomain == $d)][0]._id`,
        { d: domain });
      const id = Array.isArray(raw) ? raw[0] : raw;
      if (id) ids.push(id);
    } catch { /* skip */ }
  }
  return ids;
}

function sanitizeKey(value) {
  return String(value || 'unknown')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
