import { buildCompletenessSummary } from './account-completeness.js';
import { buildEventDoc } from '../lib/events.ts';
import { createMoltEvent } from '../lib/sanity.ts';

export async function runAutomaticSelfHeal(env, options = {}) {
  const {
    initSanityClient,
    groqQuery,
    patchDocument,
    getDocument,
  } = await import('../sanity-client.js');

  const client = initSanityClient(env);
  if (!client) {
    return { ok: false, reason: 'Sanity not configured' };
  }

  const result = {
    ok: true,
    duplicateJobsSuperseded: 0,
    completenessRepaired: 0,
    learningsUpgraded: 0,
  };

  result.duplicateJobsSuperseded = await dedupeQueuedEnrichJobs(groqQuery, patchDocument, client);
  result.completenessRepaired = await repairAccountCompleteness(groqQuery, patchDocument, getDocument, client);
  result.learningsUpgraded = await upgradeLegacyLearnings(groqQuery, patchDocument, client);

  if ((result.duplicateJobsSuperseded + result.completenessRepaired + result.learningsUpgraded) > 0) {
    const eventDoc = buildEventDoc({
      type: 'system.self-heal',
      text: `Self-heal run: ${result.duplicateJobsSuperseded} duplicate jobs superseded, ${result.completenessRepaired} completeness docs repaired, ${result.learningsUpgraded} learnings upgraded`,
      channel: 'system',
      actor: 'rabbit',
      entities: [],
      tags: ['self-heal', 'automation'],
      traceId: options.requestId || `self-heal-${Date.now()}`,
      idempotencyKey: `self-heal.${new Date().toISOString().slice(0, 13)}`,
    });
    await createMoltEvent(env, eventDoc);
  }

  return result;
}

async function dedupeQueuedEnrichJobs(groqQuery, patchDocument, client) {
  const jobs = await groqQuery(client, `*[_type == "enrich.job" && status in ["queued", "pending"]] | order(createdAt desc)[0...500]{
    _id, entityId, accountKey, goal, goalKey, createdAt, status
  }`) || [];

  const groups = new Map();
  for (const job of jobs) {
    const key = `${job.entityId || job.accountKey || 'unknown'}::${job.goalKey || job.goal || 'unknown'}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(job);
  }

  let superseded = 0;
  for (const entries of groups.values()) {
    if (!Array.isArray(entries) || entries.length <= 1) continue;
    const [, ...stale] = entries;
    for (const job of stale) {
      await patchDocument(client, job._id, {
        set: {
          status: 'superseded',
          updatedAt: new Date().toISOString(),
          resolution: 'Superseded automatically by self-heal duplicate compaction',
        },
      }).catch(() => {});
      superseded += 1;
    }
  }
  return superseded;
}

async function repairAccountCompleteness(groqQuery, patchDocument, getDocument, client) {
  const accounts = await groqQuery(client, `*[_type == "account" && (!defined(profileCompleteness.score) || profileCompleteness.score == 0)][0...100]{
    _id, accountKey
  }`) || [];

  let repaired = 0;
  for (const account of accounts) {
    if (!account?._id || !account?.accountKey) continue;
    const [fullAccount, pack] = await Promise.all([
      getDocument(client, account._id).catch(() => null),
      groqQuery(client, `*[_type == "accountPack" && accountKey == $accountKey][0]`, { accountKey: account.accountKey }).catch(() => null),
    ]);
    if (!fullAccount) continue;

    const summary = buildCompletenessSummary(fullAccount, pack, null);
    if (!summary || typeof summary.score !== 'number') continue;
    await patchDocument(client, account._id, {
      set: {
        profileCompleteness: summary,
        updatedAt: new Date().toISOString(),
      },
    }).catch(() => {});
    repaired += 1;
  }

  return repaired;
}

async function upgradeLegacyLearnings(groqQuery, patchDocument, client) {
  const learnings = await groqQuery(client, `*[_type == "learning" && (!defined(patternType) || !defined(recommendedActions))][0...100]{
    _id, title, summary
  }`) || [];

  let upgraded = 0;
  for (const learning of learnings) {
    const title = String(learning.title || '').toLowerCase();
    const patch = {
      patternType: inferPatternType(title),
      recommendedActions: inferRecommendedActions(title),
      updatedAt: new Date().toISOString(),
    };
    await patchDocument(client, learning._id, { set: patch }).catch(() => {});
    upgraded += 1;
  }

  return upgraded;
}

function inferPatternType(title) {
  if (title.includes('high-interest account')) return 'account_interest';
  if (title.includes('follow-up')) return 'follow_up_chain';
  if (title.includes('insight')) return 'insight_cluster';
  if (title.includes('workflow')) return 'workflow_pattern';
  if (title.includes('tech')) return 'tech_pattern';
  return 'learning';
}

function inferRecommendedActions(title) {
  if (title.includes('high-interest account')) {
    return ['Queue proactive enrichment', 'Refresh strategy brief', 'Surface before net-new research'];
  }
  if (title.includes('follow-up')) {
    return ['Resolve open follow-up thread', 'Bring this back into next-turn memory'];
  }
  if (title.includes('insight')) {
    return ['Promote recurring insight to operator briefing', 'Link insight to target account'];
  }
  if (title.includes('tech')) {
    return ['Group repeated tech signals into segment patterns', 'Suggest tech-specific plays'];
  }
  return ['Surface in memory recall', 'Review in operator briefing'];
}
