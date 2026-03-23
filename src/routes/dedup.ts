/**
 * Deduplication API route — /operator/dedup
 *
 * Endpoints:
 *   POST /operator/dedup/scan     — Scan for duplicates (dry run)
 *   POST /operator/dedup/execute  — Execute merge for all clusters
 *   POST /operator/dedup/merge    — Merge a single cluster by domain/matchKey
 *
 * All endpoints require API key auth (same as other operator endpoints).
 */

import { scanAccountDuplicates, scanPersonDuplicates } from '../services/dedup-scanner.js';
import { mergeAccountCluster, mergePersonCluster } from '../services/dedup-merger.js';

// Re-use the existing Sanity client helpers from sanity-client.js
// These are passed in from index.js via the handler params

interface DedupEnv {
  groqQuery: (client: any, query: string, params?: any) => Promise<any>;
  client: any;
  mutate: (client: any, mutations: any[]) => Promise<any>;
}

function createResponse(data: any, status = 200, requestId?: string) {
  return new Response(JSON.stringify({ ok: status < 400, requestId, ...data }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function sanitizeError(error: string): string {
  // Strip internal paths, stack traces, and sensitive details from error messages
  return error
    .replace(/\/[\w\-./]+\.(js|ts)/g, '[internal]')
    .replace(/at\s+\S+\s+\(.*?\)/g, '')
    .replace(/SANITY_TOKEN|SANITY_API_TOKEN|ADMIN_TOKEN|WORKER_API_KEY|MOLT_API_KEY|CHATGPT_API_KEY/gi, '[REDACTED]')
    .substring(0, 200);
}

/**
 * POST /operator/dedup/scan
 * Scans for duplicate accounts and persons. Returns clusters without modifying data.
 *
 * Body: { type?: "accounts" | "persons" | "all" }
 */
export async function handleDedupScan(
  request: Request,
  requestId: string,
  env: any,
  sanity: DedupEnv
) {
  try {
    const body = await request.json().catch(() => ({})) as Record<string, any>;
    const type = body.type || 'all';

    const result: Record<string, any> = {};

    if (type === 'all' || type === 'accounts') {
      result.accounts = await scanAccountDuplicates(sanity.groqQuery, sanity.client);
    }

    if (type === 'all' || type === 'persons') {
      result.persons = await scanPersonDuplicates(sanity.groqQuery, sanity.client);
    }

    // Summary
    const accountDupes = result.accounts?.totalDuplicates || 0;
    const personDupes = result.persons?.totalDuplicates || 0;

    return createResponse({
      summary: {
        totalDuplicateAccounts: accountDupes,
        totalDuplicatePersons: personDupes,
        accountClusters: result.accounts?.clusters?.length || 0,
        personClusters: result.persons?.clusters?.length || 0,
      },
      ...result,
    }, 200, requestId);
  } catch (error: any) {
    return createResponse({ error: sanitizeError(error.message) }, 500, requestId);
  }
}

/**
 * POST /operator/dedup/execute
 * Executes merge for all duplicate clusters found by scan.
 *
 * Body: {
 *   type?: "accounts" | "persons" | "all",
 *   dryRun?: boolean (default: true — set to false to actually merge),
 *   limit?: number (max clusters to process, default: 50)
 * }
 */
export async function handleDedupExecute(
  request: Request,
  requestId: string,
  env: any,
  sanity: DedupEnv
) {
  try {
    const body = await request.json().catch(() => ({})) as Record<string, any>;
    const type = body.type || 'all';
    const dryRun = body.dryRun !== false; // Default true for safety
    const limit = Math.min(body.limit || 50, 200);

    const results: Record<string, any> = { dryRun };
    let totalMerged = 0;
    let totalDeleted = 0;
    const errors: any[] = [];

    // Process accounts
    if (type === 'all' || type === 'accounts') {
      const scan = await scanAccountDuplicates(sanity.groqQuery, sanity.client);
      const accountResults = [];

      for (const cluster of scan.clusters.slice(0, limit)) {
        try {
          const mergeResult = await mergeAccountCluster(
            sanity.groqQuery,
            sanity.client,
            sanity.mutate,
            cluster,
            { dryRun }
          );
          accountResults.push(mergeResult);
          if (mergeResult.executed && !mergeResult.error && !mergeResult.partialFailure) {
            totalMerged++;
            totalDeleted += mergeResult.loserIds?.length || 0;
          } else if (mergeResult.error || mergeResult.partialFailure) {
            errors.push({ type: 'account', cluster: cluster.domain, error: mergeResult.error || 'partial failure' });
          }
        } catch (err: any) {
          errors.push({ type: 'account', cluster: cluster.domain, error: sanitizeError(err.message) });
        }
      }

      results.accounts = {
        scanned: scan.totalAccounts,
        clustersFound: scan.clusters.length,
        clustersProcessed: accountResults.length,
        mergeResults: accountResults,
      };
    }

    // Process persons
    if (type === 'all' || type === 'persons') {
      const scan = await scanPersonDuplicates(sanity.groqQuery, sanity.client);
      const personResults = [];

      for (const cluster of scan.clusters.slice(0, limit)) {
        try {
          const mergeResult = await mergePersonCluster(
            sanity.groqQuery,
            sanity.client,
            sanity.mutate,
            cluster,
            { dryRun }
          );
          personResults.push(mergeResult);
          if (mergeResult.executed && !mergeResult.error && !mergeResult.partialFailure) {
            totalMerged++;
            totalDeleted += mergeResult.loserIds?.length || 0;
          } else if (mergeResult.error || mergeResult.partialFailure) {
            errors.push({ type: 'person', cluster: cluster.matchKey, error: mergeResult.error || 'partial failure' });
          }
        } catch (err: any) {
          errors.push({ type: 'person', cluster: cluster.matchKey, error: sanitizeError(err.message) });
        }
      }

      results.persons = {
        scanned: scan.totalPersons,
        clustersFound: scan.clusters.length,
        clustersProcessed: personResults.length,
        mergeResults: personResults,
      };
    }

    results.summary = {
      clustersMerged: totalMerged,
      documentsDeleted: totalDeleted,
      errors: errors.length,
    };

    if (errors.length > 0) {
      results.errors = errors;
    }

    // Check for partial failures from mutation result checking
    const allMergeResults = [
      ...(results.accounts?.mergeResults || []),
      ...(results.persons?.mergeResults || []),
    ];
    const partialFailures = allMergeResults.filter((r: any) => r.partialFailure);
    if (partialFailures.length > 0) {
      results.summary.partialFailures = partialFailures.length;
      results.warning = 'Some mutations had partial failures — check individual merge results for details';
    }

    // Fire-and-forget activity event for actual merges (not dry runs)
    if (!dryRun && totalMerged > 0) {
      const { emitActivityEvent } = await import('../lib/sanity.ts');
      emitActivityEvent(env, {
        eventType: 'system',
        status: errors.length > 0 ? 'failed' : 'completed',
        source: 'app',
        accountKey: null,
        category: 'system',
        message: `Dedup merge: ${totalMerged} clusters merged, ${totalDeleted} documents deleted`,
        data: {
          clustersMerged: totalMerged,
          documentsDeleted: totalDeleted,
          errorCount: errors.length,
          type,
        },
        idempotencyKey: `dedup-execute.${type}.${Date.now()}`,
      }).catch(() => {});
    }

    // Return 207 Multi-Status if there were errors or partial failures, 200 if clean
    const status = (errors.length > 0 || partialFailures.length > 0) ? 207 : 200;
    return createResponse(results, status, requestId);
  } catch (error: any) {
    return createResponse({ error: sanitizeError(error.message) }, 500, requestId);
  }
}

/**
 * POST /operator/dedup/merge
 * Merge a single cluster by specifying the match key.
 *
 * Body: {
 *   type: "account" | "person",
 *   matchKey: string (domain for accounts, linkedin URL or name|company for persons),
 *   dryRun?: boolean (default: true)
 * }
 */
export async function handleDedupMerge(
  request: Request,
  requestId: string,
  env: any,
  sanity: DedupEnv
) {
  try {
    const body = await request.json().catch(() => ({})) as Record<string, any>;
    const { type, matchKey } = body;
    const dryRun = body.dryRun !== false;

    if (!type || !matchKey) {
      return createResponse({ error: 'type and matchKey are required' }, 400, requestId);
    }

    if (type === 'account') {
      const scan = await scanAccountDuplicates(sanity.groqQuery, sanity.client);
      const cluster = scan.clusters.find(c => c.domain === matchKey);
      if (!cluster) {
        return createResponse({ error: `No duplicate cluster found for domain: ${matchKey}` }, 404, requestId);
      }

      const result = await mergeAccountCluster(
        sanity.groqQuery,
        sanity.client,
        sanity.mutate,
        cluster,
        { dryRun }
      );
      return createResponse({ dryRun, result }, 200, requestId);
    }

    if (type === 'person') {
      const scan = await scanPersonDuplicates(sanity.groqQuery, sanity.client);
      const cluster = scan.clusters.find(c => c.matchKey === matchKey);
      if (!cluster) {
        return createResponse({ error: `No duplicate cluster found for key: ${matchKey}` }, 404, requestId);
      }

      const result = await mergePersonCluster(
        sanity.groqQuery,
        sanity.client,
        sanity.mutate,
        cluster,
        { dryRun }
      );
      return createResponse({ dryRun, result }, 200, requestId);
    }

    return createResponse({ error: 'type must be "account" or "person"' }, 400, requestId);
  } catch (error: any) {
    return createResponse({ error: sanitizeError(error.message) }, 500, requestId);
  }
}
