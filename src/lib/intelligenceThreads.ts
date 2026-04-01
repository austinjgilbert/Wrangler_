/**
 * Intelligence Threads — Persistent, Evolving Investigations
 *
 * Turns one-shot copilot queries into ongoing research threads that
 * accumulate context over time. New signals, OSINT results, and
 * operator interactions all append to matching threads.
 *
 * Sanity document type: molt.intelligenceThread
 */

import { fetchDocumentsByType } from './sanity.ts';
import { callLlm } from './llm.ts';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ThreadEntry {
  timestamp: string;
  source: 'copilot' | 'osint' | 'signal' | 'cron' | 'operator' | 'enrichment';
  content: string;
  data?: any;
}

export interface IntelligenceThread {
  _type: 'molt.intelligenceThread';
  _id: string;
  title: string;
  query: string;
  accountRefs: Array<{ _type: 'reference'; _ref: string }>;
  accountNames: string[];
  signalWatch: string[];
  entries: ThreadEntry[];
  status: 'active' | 'paused' | 'resolved' | 'stale';
  lastUpdated: string;
  createdAt: string;
  priority: number;
  summary?: string;
}

export interface ThreadCreateInput {
  query: string;
  initialResponse: string;
  accountIds?: string[];
  accountNames?: string[];
  signalWatch?: string[];
  priority?: number;
  data?: any;
}

// ─── Thread ID generation ───────────────────────────────────────────────────

function sanitizeId(value: string): string {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}

function generateThreadId(query: string): string {
  const slug = sanitizeId(query);
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 7);
  return `molt.thread.${slug}.${ts}-${rand}`;
}

// ─── Sanity helpers (direct client calls) ───────────────────────────────────

async function getSanityClient(env: any) {
  const projectId = env.SANITY_PROJECT_ID;
  const token = env.SANITY_TOKEN;
  const dataset = env.SANITY_DATASET || 'production';
  if (!projectId || !token) throw new Error('Sanity not configured');
  return { projectId, token, dataset };
}

async function sanityMutate(env: any, mutations: any[]): Promise<any> {
  const { projectId, token, dataset } = await getSanityClient(env);
  const url = `https://${projectId}.api.sanity.io/v2024-01-01/data/mutate/${dataset}`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ mutations }),
  });
  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Sanity mutate failed: ${resp.status} ${body.slice(0, 200)}`);
  }
  return resp.json();
}

async function sanityQuery(env: any, query: string, params: Record<string, any> = {}): Promise<any> {
  const { projectId, token, dataset } = await getSanityClient(env);
  const encodedQuery = encodeURIComponent(query);
  const paramString = Object.entries(params)
    .map(([k, v]) => `$${k}=${encodeURIComponent(JSON.stringify(v))}`)
    .join('&');
  const url = `https://${projectId}.apicdn.sanity.io/v2024-01-01/data/query/${dataset}?query=${encodedQuery}${paramString ? '&' + paramString : ''}`;
  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Sanity query failed: ${resp.status} ${body.slice(0, 200)}`);
  }
  const data = await resp.json();
  return data.result;
}

// ─── Core Thread Operations ─────────────────────────────────────────────────

/**
 * Find an existing active thread with a matching query (for deduplication).
 */
export async function findExistingThread(env: any, query: string): Promise<IntelligenceThread | null> {
  // Normalize: first 60 chars lowercase, stripped of punctuation
  const slug = sanitizeId(query);
  // Search for active threads whose _id starts with the same slug prefix
  const prefix = `molt.thread.${slug}`;
  const result = await sanityQuery(
    env,
    '*[_type == "molt.intelligenceThread" && status in ["active", "paused"] && _id > $prefixStart && _id < $prefixEnd] | order(lastUpdated desc)[0]',
    { prefixStart: prefix, prefixEnd: prefix + '￿' },
  );
  return result || null;
}

/**
 * Create a new intelligence thread from a copilot query.
 * If an existing active thread with the same query exists, appends to it instead.
 */
export async function createThread(env: any, input: ThreadCreateInput): Promise<IntelligenceThread> {
  // Check for existing thread first (deduplication)
  const existing = await findExistingThread(env, input.query).catch(() => null);
  if (existing) {
    // Append the new response to the existing thread instead of creating a duplicate
    await appendToThread(env, existing._id, {
      source: 'copilot',
      content: input.initialResponse,
      data: input.data || undefined,
    });
    return existing;
  }

  const now = new Date().toISOString();
  const thread: IntelligenceThread = {
    _type: 'molt.intelligenceThread',
    _id: generateThreadId(input.query),
    title: input.query.length > 80 ? input.query.slice(0, 77) + '...' : input.query,
    query: input.query,
    accountRefs: (input.accountIds || []).map((id, i) => ({ _key: `ref-${i}`, _type: 'reference', _ref: id })),
    accountNames: input.accountNames || [],
    signalWatch: input.signalWatch || [],
    entries: [
      {
        _key: `entry-${Date.now().toString(36)}`,
        timestamp: now,
        source: 'copilot',
        content: input.initialResponse,
        data: input.data || undefined,
      },
    ],
    status: 'active',
    lastUpdated: now,
    createdAt: now,
    priority: input.priority || 50,
  };

  await sanityMutate(env, [{ createOrReplace: thread }]);
  return thread;
}

/**
 * Append an entry to an existing thread.
 */
export async function appendToThread(
  env: any,
  threadId: string,
  entry: Omit<ThreadEntry, 'timestamp'>,
): Promise<void> {
  const now = new Date().toISOString();
  const fullEntry = {
    _key: `entry-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    ...entry,
    timestamp: now,
  };

  await sanityMutate(env, [{
    patch: {
      id: threadId,
      insert: {
        after: 'entries[-1]',
        items: [fullEntry],
      },
      set: { lastUpdated: now },
    },
  }]);
}

/**
 * Fetch all active intelligence threads.
 */
export async function fetchActiveThreads(env: any): Promise<IntelligenceThread[]> {
  const result = await sanityQuery(
    env,
    '*[_type == "molt.intelligenceThread" && status in ["active", "stale"]] | order(lastUpdated desc)[0...50]',
  );
  return Array.isArray(result) ? result : [];
}

/**
 * Fetch a single thread by ID.
 */
export async function fetchThread(env: any, threadId: string): Promise<IntelligenceThread | null> {
  const result = await sanityQuery(
    env,
    '*[_type == "molt.intelligenceThread" && _id == $id][0]',
    { id: threadId },
  );
  return result || null;
}

/**
 * Find threads that watch a given account.
 */
export async function findThreadsForAccount(env: any, accountId: string): Promise<IntelligenceThread[]> {
  const result = await sanityQuery(
    env,
    '*[_type == "molt.intelligenceThread" && status == "active" && $accountId in accountRefs[]._ref] | order(priority desc)[0...20]',
    { accountId },
  );
  return Array.isArray(result) ? result : [];
}

/**
 * Find threads that watch a given signal type.
 */
export async function findThreadsForSignalType(env: any, signalType: string): Promise<IntelligenceThread[]> {
  const result = await sanityQuery(
    env,
    '*[_type == "molt.intelligenceThread" && status == "active" && $signalType in signalWatch] | order(priority desc)[0...20]',
    { signalType },
  );
  return Array.isArray(result) ? result : [];
}

/**
 * Update thread status.
 */
export async function updateThreadStatus(env: any, threadId: string, status: IntelligenceThread['status']): Promise<void> {
  await sanityMutate(env, [{
    patch: {
      id: threadId,
      set: { status, lastUpdated: new Date().toISOString() },
    },
  }]);
}

// ─── Thread Watcher (runs on 15-min cron) ───────────────────────────────────

/**
 * Check active threads for staleness and new matching signals.
 * Called by the 15-minute cron.
 */
export async function watchThreads(env: any, recentSignals: Array<{
  signalType: string;
  accountId: string;
  accountName: string;
  strength: number;
  timestamp: string;
}>): Promise<{
  threadsUpdated: number;
  threadsMarkedStale: number;
}> {
  const threads = await fetchActiveThreads(env);
  let threadsUpdated = 0;
  let threadsMarkedStale = 0;

  const STALE_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000; // 7 days with no updates

  for (const thread of threads) {
    // Check for staleness
    const lastUpdatedMs = new Date(thread.lastUpdated).getTime();
    const age = Date.now() - lastUpdatedMs;

    if (age > STALE_THRESHOLD_MS && thread.status === 'active') {
      await updateThreadStatus(env, thread._id, 'stale');
      threadsMarkedStale++;
      continue;
    }

    // Check if any recent signals match this thread's watch criteria
    const watchedAccountIds = new Set(thread.accountRefs.map(ref => ref._ref));
    const watchedSignalTypes = new Set(thread.signalWatch);

    const matchingSignals = recentSignals.filter(sig =>
      watchedAccountIds.has(sig.accountId) || watchedSignalTypes.has(sig.signalType),
    );

    if (matchingSignals.length > 0) {
      // Append a summary of matching signals to the thread
      const signalSummary = matchingSignals.map(sig =>
        `${sig.signalType} for ${sig.accountName} (strength: ${Math.round(sig.strength * 100)}%)`,
      ).join('; ');

      await appendToThread(env, thread._id, {
        source: 'signal',
        content: `New signals detected: ${signalSummary}`,
        data: { signals: matchingSignals.slice(0, 10) },
      });
      threadsUpdated++;
    }
  }

  return { threadsUpdated, threadsMarkedStale };
}

// ─── LLM-Powered Thread Synthesis ───────────────────────────────────────────

/**
 * Synthesize a thread's accumulated entries into an updated summary.
 * Called when a thread has new entries or when the operator asks for a recap.
 */
export async function synthesizeThread(env: any, threadId: string): Promise<string> {
  const thread = await fetchThread(env, threadId);
  if (!thread) return 'Thread not found.';

  const hasLlm = !!(env.LLM_API_KEY || env.ANTHROPIC_API_KEY || env.OPENAI_API_KEY);
  if (!hasLlm) {
    return `Thread "${thread.title}" has ${thread.entries.length} entries. Last updated ${thread.lastUpdated}.`;
  }

  const entriesSummary = thread.entries
    .slice(-20) // Last 20 entries
    .map(e => `[${e.timestamp}] (${e.source}) ${e.content}`)
    .join('\n');

  try {
    const result = await callLlm(env, [
      {
        role: 'system',
        content: `You are synthesizing an intelligence investigation thread. Produce a 3-5 sentence summary of the thread's current state: what was the original question, what has been learned, what changed recently, and what should the operator do next. Be specific — reference account names, signal types, and dates.`,
      },
      {
        role: 'user',
        content: `Thread: "${thread.title}"\nOriginal query: ${thread.query}\nAccounts: ${thread.accountNames.join(', ') || 'none specified'}\nStatus: ${thread.status}\n\nEntries:\n${entriesSummary}`,
      },
    ], { maxTokens: 400, temperature: 0.2 });

    // Save the summary back to the thread
    await sanityMutate(env, [{
      patch: {
        id: threadId,
        set: { summary: result.content, lastUpdated: new Date().toISOString() },
      },
    }]);

    return result.content;
  } catch (err: any) {
    console.warn('[intelligenceThreads] synthesis failed:', err?.message);
    return `Thread "${thread.title}" has ${thread.entries.length} entries across ${thread.accountNames.length} accounts. Status: ${thread.status}.`;
  }
}

// ─── Copilot Integration: Should This Query Become a Thread? ────────────────

/**
 * Determine if a copilot query should spawn an intelligence thread.
 * Research-oriented questions (about specific accounts or investigations)
 * become threads. Quick lookups do not.
 */
export function shouldCreateThread(prompt: string, intent: string): boolean {
  const lower = prompt.toLowerCase();

  // Explicit thread triggers
  if (/\bresearch\b|\binvestigat|\btrack\b|\bmonitor\b|\bwatch\b|\bfollow\b|\bdig into\b|\bdeep dive\b/.test(lower)) {
    return true;
  }

  // Account-specific strategic questions
  if (/\bstrategy\b|\broadmap\b|\bwhat.*plan\b|\bwhy.*buying\b|\bwhen.*will\b/.test(lower) &&
      /\baccount\b|\bcompany\b|\b[A-Z][a-z]+\s[A-Z]/.test(prompt)) {
    return true;
  }

  // Explicit "keep watching" or "track this"
  if (/\bkeep\b.*\bwatch|\btrack\b.*\bthis|\bfollow\b.*\bup|\bsave\b.*\bthread/.test(lower)) {
    return true;
  }

  // Quick lookups should NOT create threads
  if (intent === 'search' && /\bshow\b|\blist\b|\bhow many\b|\bcount\b/.test(lower)) {
    return false;
  }

  return false;
}

/**
 * Extract account references and signal types to watch from a copilot response.
 */
export function extractThreadWatchTargets(response: any): {
  accountIds: string[];
  accountNames: string[];
  signalWatch: string[];
} {
  const accountIds: string[] = [];
  const accountNames: string[] = [];
  const signalWatch: string[] = [];

  // Extract from results if present
  if (response?.results) {
    const results = response.results;
    if (Array.isArray(results.accounts)) {
      for (const acct of results.accounts) {
        if (acct.id) accountIds.push(acct.id);
        if (acct.name) accountNames.push(acct.name);
      }
    }
    if (Array.isArray(results.actions)) {
      for (const action of results.actions) {
        if (action.patternMatch) signalWatch.push(action.patternMatch);
      }
    }
    // Handle topOpportunities or topPriorityAccounts
    for (const key of ['topOpportunities', 'topPriorityAccounts']) {
      if (Array.isArray(results[key])) {
        for (const item of results[key]) {
          if (item.name) accountNames.push(item.name);
        }
      }
    }
  }

  return {
    accountIds: Array.from(new Set(accountIds)),
    accountNames: Array.from(new Set(accountNames)),
    signalWatch: Array.from(new Set(signalWatch)),
  };
}
