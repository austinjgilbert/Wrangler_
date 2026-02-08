/**
 * Gap-Fill Orchestrator
 *
 * The "brain" of the background enrichment system.
 *
 * When ANY user action touches an account (search, scan, store, query, wrangler prompt),
 * this module:
 *   1. Loads the account + accountPack from Sanity
 *   2. Runs gap analysis to see what's missing
 *   3. Queues/triggers the right enrichment stages to fill the gaps
 *   4. On completion, classifies the account and updates the completeness score
 *
 * All work is non-blocking — callers get an immediate response; work happens in background.
 */

import {
  analyseCompleteness,
  buildCompletenessSummary,
  needsBackgroundWork,
} from './account-completeness.js';

// ─── Main Entry Point ───────────────────────────────────────────────────

/**
 * Trigger gap-fill for an account.
 * Call this from any entry point (wrangler, scan, store, query).
 * Runs in background — never blocks the caller.
 *
 * @param {object} opts
 * @param {object} opts.env           – Cloudflare env bindings
 * @param {string} opts.accountKey    – resolved account key
 * @param {string} opts.canonicalUrl  – canonical URL (if known)
 * @param {string} opts.domain        – domain (if known)
 * @param {string} opts.trigger       – what initiated this ('scan', 'store', 'query', 'wrangler')
 * @param {object} opts.scanData      – if caller already has scan data, pass it to skip re-scan
 */
export async function triggerGapFill(opts) {
  try {
    const {
      env,
      accountKey,
      canonicalUrl,
      domain,
      trigger = 'unknown',
      scanData = null,
    } = opts;

    if (!env || !accountKey) return { triggered: false, reason: 'Missing env or accountKey' };

    const {
      initSanityClient,
      groqQuery,
      upsertDocument,
      patchDocument,
      assertSanityConfigured,
      getDocument,
    } = await import('../sanity-client.js');

    const client = initSanityClient(env);
    if (!client) return { triggered: false, reason: 'Sanity not configured' };

    // ── 1. Load current state ──────────────────────────────────────────

    const [account, accountPack, enrichmentJob] = await Promise.all([
      safeQuery(groqQuery, client,
        `*[_type == "account" && accountKey == $key][0]`,
        { key: accountKey }),
      safeQuery(groqQuery, client,
        `*[_type == "accountPack" && accountKey == $key][0]`,
        { key: accountKey }),
      safeQuery(groqQuery, client,
        `*[_type == "enrichmentJob" && accountKey == $key && status in ["pending","in_progress"]] | order(updatedAt desc)[0]`,
        { key: accountKey }),
    ]);

    // ── 2. Gap analysis ────────────────────────────────────────────────

    const work = needsBackgroundWork(account, accountPack, enrichmentJob);

    if (!work.needed) {
      // Still update completeness score if account exists but score is stale
      if (account && !account.profileCompleteness) {
        await updateCompletenessScore(patchDocument, client, account, accountPack, null);
      }

      // Even when pipeline stages are done, Content OS fields may be empty.
      // Run Content OS enrichment if account exists but is missing structured fields.
      if (account && (!account.technologies?.length || !account.painPoints?.length || !account.benchmarks)) {
        try {
          const { enrichContentOS } = await import('./content-os-enrichment.js');
          await enrichContentOS(groqQuery, upsertDocument, patchDocument, client, account, accountPack);
          // Re-compute completeness after Content OS enrichment
          const refreshedAccount = await safeQuery(groqQuery, client,
            `*[_type == "account" && accountKey == $key][0]`, { key: accountKey }) || account;
          await updateCompletenessScore(patchDocument, client, refreshedAccount, accountPack, null);
        } catch (cosErr) {
          console.error('Gap-fill Content OS enrichment error:', cosErr?.message);
        }
      }

      return { triggered: false, reason: work.reason, jobId: work.jobId };
    }

    // ── 3. Resolve canonical URL if we don't have it ────────────────────

    let resolvedUrl = canonicalUrl;
    if (!resolvedUrl && domain) {
      resolvedUrl = `https://${domain.replace(/^www\./, '')}`;
    }
    if (!resolvedUrl && account?.canonicalUrl) {
      resolvedUrl = account.canonicalUrl;
    }
    if (!resolvedUrl && account?.domain) {
      resolvedUrl = `https://${account.domain}`;
    }
    if (!resolvedUrl) {
      return { triggered: false, reason: 'Cannot resolve URL for account' };
    }

    // ── 4. Queue enrichment job with all missing stages ─────────────────

    const { queueEnrichmentJob } = await import('./enrichment-service.js');

    const jobResult = await queueEnrichmentJob(
      groqQuery,
      upsertDocument,
      client,
      resolvedUrl,
      accountKey,
      {
        priority: work.priority === 'urgent' ? 1 : work.priority === 'high' ? 3 : 5,
        source: `gap_fill_${trigger}`,
        auto: true,
        requestedStages: work.stages,
        // If scan data was already provided, inject it so we skip re-scanning
        ...(scanData ? { preFilled: { initial_scan: scanData } } : {}),
      },
    );

    // ── 5. Kickstart the first stage immediately (non-blocking) ─────────

    if (jobResult.success && jobResult.jobId) {
      kickstartFirstStage(
        groqQuery,
        upsertDocument,
        patchDocument,
        client,
        jobResult.jobId,
        env,
      ).catch(() => {}); // fire-and-forget
    }

    // ── 6. Update completeness score on account document ────────────────

    if (account) {
      await updateCompletenessScore(patchDocument, client, account, accountPack, enrichmentJob);
    }

    return {
      triggered: true,
      jobId: jobResult.jobId,
      priority: work.priority,
      stages: work.stages,
      currentScore: work.currentScore,
    };
  } catch (error) {
    console.error('Gap-fill trigger error:', error);
    return { triggered: false, reason: error.message };
  }
}

/**
 * After enrichment completes, run Content OS enrichment, classify the
 * account, and update scores.
 * Called by the enrichment executor when a job finishes.
 */
export async function onEnrichmentComplete(groqQuery, upsertDocument, patchDocument, client, accountKey) {
  try {
    const [account, accountPack] = await Promise.all([
      safeQuery(groqQuery, client,
        `*[_type == "account" && accountKey == $key][0]`,
        { key: accountKey }),
      safeQuery(groqQuery, client,
        `*[_type == "accountPack" && accountKey == $key][0]`,
        { key: accountKey }),
    ]);

    if (!account) return;

    // ── Run Content OS enrichment (technologies, pain points, benchmarks, leadership) ──
    try {
      const { enrichContentOS } = await import('./content-os-enrichment.js');
      const cosResult = await enrichContentOS(groqQuery, upsertDocument, patchDocument, client, account, accountPack);
      console.log(`[Content OS] account=${accountKey} techs=${cosResult.technologies.linked} painPoints=${cosResult.painPoints.length} leadership=${cosResult.leadership.linked} competitors=${cosResult.competitors.linked}`);
    } catch (cosErr) {
      console.error('Content OS enrichment error:', cosErr?.message);
    }

    // ── Reload account after Content OS enrichment patched it ─────────
    const updatedAccount = await safeQuery(groqQuery, client,
      `*[_type == "account" && accountKey == $key][0]`,
      { key: accountKey }) || account;

    // ── Build classification from enrichment data ─────────────────────

    const classification = buildClassification(updatedAccount, accountPack);

    // ── Update account document ────────────────────────────────────────

    const completeness = buildCompletenessSummary(updatedAccount, accountPack, null);

    const patch = {
      set: {
        profileCompleteness: completeness,
        classification,
        lastEnrichedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    };

    await patchDocument(client, updatedAccount._id, patch);

    // ── Trigger competitor research if not done ────────────────────────

    if (!completeness.dimensionFlags.competitors) {
      triggerCompetitorResearch(groqQuery, upsertDocument, patchDocument, client, accountKey, updatedAccount, accountPack)
        .catch(() => {});
    }
  } catch (error) {
    console.error('onEnrichmentComplete error:', error);
  }
}

// ─── Internal Helpers ────────────────────────────────────────────────────

async function safeQuery(groqQuery, client, query, params) {
  try {
    const raw = await groqQuery(client, query, params);
    return Array.isArray(raw) ? (raw.length ? raw[0] : null) : (raw ?? null);
  } catch {
    return null;
  }
}

async function updateCompletenessScore(patchDocument, client, account, accountPack, enrichmentJob) {
  try {
    const summary = buildCompletenessSummary(account, accountPack, enrichmentJob);
    await patchDocument(client, account._id, {
      set: {
        profileCompleteness: summary,
        updatedAt: new Date().toISOString(),
      },
    });
  } catch {}
}

async function kickstartFirstStage(groqQuery, upsertDocument, patchDocument, client, jobId, env) {
  try {
    const { autoAdvanceEnrichment } = await import('./enrichment-scheduler.js');
    // Get the job to find its accountKey
    const job = await safeQuery(groqQuery, client, `*[_id == $id][0]`, { id: jobId });
    if (job?.accountKey) {
      await autoAdvanceEnrichment(groqQuery, upsertDocument, patchDocument, client, job.accountKey, {}, env, `gapfill-${Date.now()}`);
    }
  } catch {}
}

/**
 * Build a classification object from available account data.
 */
function buildClassification(account, accountPack) {
  const payload = accountPack?.payload || {};
  const scan = payload.scan || payload.researchSet?.scan || {};
  const brief = payload.brief || payload.researchSet?.brief || {};

  // Industry detection from tech stack + brief
  const techStack = scan.technologyStack || account?.technologyStack || {};
  const cms = techStack.cms || [];
  const frameworks = techStack.frameworks || [];

  // Build tags from various signals
  const tags = new Set();

  // Tech-based tags
  if (cms.length) tags.add('has-cms');
  if (frameworks.some(f => /react|vue|angular|next|nuxt|svelte/i.test(f))) tags.add('modern-frontend');
  if (techStack.legacySystems?.length) tags.add('legacy-tech');
  if (techStack.pimSystems?.length) tags.add('has-pim');
  if (techStack.damSystems?.length) tags.add('has-dam');
  if (techStack.lmsSystems?.length) tags.add('has-lms');

  // Scale tags
  const scale = scan.businessScale?.businessScale || account?.businessScale?.businessScale;
  if (scale) tags.add(`scale-${scale.toLowerCase().replace(/\s+/g, '-')}`);

  // Opportunity tags
  const oppScore = scan.opportunityScore || account?.opportunityScore || 0;
  if (oppScore >= 80) tags.add('high-opportunity');
  else if (oppScore >= 50) tags.add('medium-opportunity');

  // AI readiness tags
  const aiScore = scan.aiReadiness?.score ?? account?.aiReadiness?.score ?? 0;
  if (aiScore >= 70) tags.add('ai-ready');
  else if (aiScore <= 30) tags.add('ai-laggard');

  // Industry (simple heuristic from CMS + signals)
  let industry = brief?.industry || null;
  if (!industry) {
    const signals = account?.signals || [];
    if (signals.some(s => /shopify|woocommerce|magento|bigcommerce/i.test(s))) industry = 'E-commerce';
    else if (signals.some(s => /wordpress|drupal|contentful/i.test(s))) industry = 'Content/Media';
    else if (signals.some(s => /salesforce|hubspot|marketo/i.test(s))) industry = 'SaaS/Tech';
  }

  // Segment based on scale + tech signals
  let segment = 'unknown';
  if (scale === 'Enterprise' || scale === 'Large') segment = 'enterprise';
  else if (scale === 'Mid-Market') segment = 'mid-market';
  else if (scale === 'Small' || scale === 'Startup') segment = 'smb';

  return {
    industry: industry || 'Unknown',
    segment,
    tags: Array.from(tags),
    aiReadinessTier: aiScore >= 70 ? 'ready' : aiScore >= 40 ? 'developing' : 'early',
    opportunityTier: oppScore >= 80 ? 'high' : oppScore >= 50 ? 'medium' : 'low',
    classifiedAt: new Date().toISOString(),
  };
}

/**
 * Trigger competitor research for an account (background).
 */
async function triggerCompetitorResearch(groqQuery, upsertDocument, patchDocument, client, accountKey, account, accountPack) {
  try {
    const { researchCompetitors } = await import('./competitor-research.js');
    const researchSet = accountPack?.payload?.researchSet || null;

    const result = await researchCompetitors(
      groqQuery, upsertDocument, patchDocument, client,
      accountKey, account, researchSet,
      { competitorLimit: 5 },
    );

    // Store competitor data in accountPack
    if (result?.competitors?.length) {
      const packId = `accountPack-${accountKey}`;
      await patchDocument(client, packId, {
        set: {
          'payload.competitors': {
            competitors: result.competitors,
            opportunities: result.opportunities || [],
            researchedAt: new Date().toISOString(),
          },
          updatedAt: new Date().toISOString(),
        },
      });

      // Update completeness score
      const updatedPack = await safeQuery(groqQuery, client,
        `*[_type == "accountPack" && accountKey == $key][0]`,
        { key: accountKey });
      const completeness = buildCompletenessSummary(account, updatedPack, null);
      await patchDocument(client, account._id, {
        set: {
          profileCompleteness: completeness,
          competitorResearch: {
            count: result.competitors.length,
            researchedAt: new Date().toISOString(),
          },
          updatedAt: new Date().toISOString(),
        },
      });
    }
  } catch (error) {
    console.error('triggerCompetitorResearch error:', error);
  }
}
