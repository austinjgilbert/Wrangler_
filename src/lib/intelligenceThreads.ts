/**
 * Intelligence Threads — Persistent, Evolving Investigations
 *
 * Turns one-shot copilot queries into ongoing research threads that
 * accumulate context over time. New signals, OSINT results, and
 * operator interactions all append to matching threads.
 *
 * Storage: Cloudflare KV (MOLTBOOK_ACTIVITY_KV)
 * Key pattern: thread:{id}
 * Index key:  thread:index:active  (list of active thread IDs)
 *
 * Uses KV instead of Sanity to avoid the 2000-attribute dataset limit.
 */

import { callLlm } from './llm.ts';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ThreadEntry {
  timestamp: string;
  source: 'copilot' | 'osint' | 'signal' | 'cron' | 'operator' | 'enrichment';
  content: string;
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

// ─── KV helpers ─────────────────────────────────────────────────────────────

function getKV(env: any): KVNamespace {
  const kv = env.MOLTBOOK_ACTIVITY_KV;
  if (!kv) throw new Error('MOLTBOOK_ACTIVITY_KV not bound');
  return kv;
}

const THREAD_PREFIX = 'thread:';
const INDEX_KEY = 'thread:index:all';

async function kvGetThread(kv: KVNamespace, threadId: string): Promise<IntelligenceThread | null> {
  const raw = await kv.get(`${THREAD_PREFIX}${threadId}`, 'json');
  return raw as IntelligenceThread | null;
}

async function kvPutThread(kv: KVNamespace, thread: IntelligenceThread): Promise<void> {
  await kv.put(`${THREAD_PREFIX}${thread._id}`, JSON.stringify(thread));
}

/**
 * Maintain a lightweight index of all thread IDs + metadata for listing.
 */
interface ThreadIndexEntry {
  id: string;
  title: string;
  status: string;
  lastUpdated: string;
  priority: number;
}

async function kvGetIndex(kv: KVNamespace): Promise<ThreadIndexEntry[]> {
  const raw = await kv.get(INDEX_KEY, 'json');
  return (raw as ThreadIndexEntry[]) || [];
}

async function kvUpdateIndex(kv: KVNamespace, thread: IntelligenceThread): Promise<void> {
  const index = await kvGetIndex(kv);
  const entry: ThreadIndexEntry = {
    id: thread._id,
    title: thread.title,
    status: thread.status,
    lastUpdated: thread.lastUpdated,
    priority: thread.priority,
  };

  const existing = index.findIndex(e => e.id === thread._id);
  if (existing >= 0) {
    index[existing] = entry;
  } else {
    index.push(entry);
  }

  // Keep index sorted by lastUpdated desc, capped at 200
  index.sort((a, b) => b.lastUpdated.localeCompare(a.lastUpdated));
  await kv.put(INDEX_KEY, JSON.stringify(index.slice(0, 200)));
}

// ─── Core Thread Operations ─────────────────────────────────────────────────

/**
 * Find an existing active thread with a matching query (for deduplication).
 */
export async function findExistingThread(env: any, query: string): Promise<IntelligenceThread | null> {
  const kv = getKV(env);
  const slug = sanitizeId(query);
  const prefix = `molt.thread.${slug}`;

  const index = await kvGetIndex(kv);
  const match = index.find(e =>
    e.id.startsWith(prefix) && (e.status === 'active' || e.status === 'paused'),
  );

  if (!match) return null;
  return kvGetThread(kv, match.id);
}

/**
 * Create a new intelligence thread from a copilot query.
 * If an existing active thread with the same query exists, appends to it instead.
 */
export async function createThread(env: any, input: ThreadCreateInput): Promise<IntelligenceThread> {
  const kv = getKV(env);

  // Check for existing thread first (deduplication)
  const existing = await findExistingThread(env, input.query).catch(() => null);
  if (existing) {
    await appendToThread(env, existing._id, {
      source: 'copilot',
      content: input.initialResponse,
    });
    return existing;
  }

  const now = new Date().toISOString();
  const thread: IntelligenceThread = {
    _type: 'molt.intelligenceThread',
    _id: generateThreadId(input.query),
    title: input.query.length > 80 ? input.query.slice(0, 77) + '...' : input.query,
    query: input.query,
    accountRefs: (input.accountIds || []).map(id => ({ _type: 'reference' as const, _ref: id })),
    accountNames: input.accountNames || [],
    signalWatch: input.signalWatch || [],
    entries: [
      { timestamp: now, source: 'copilot', content: input.initialResponse },
    ],
    status: 'active',
    lastUpdated: now,
    createdAt: now,
    priority: input.priority || 50,
  };

  await kvPutThread(kv, thread);
  await kvUpdateIndex(kv, thread);
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
  const kv = getKV(env);
  const thread = await kvGetThread(kv, threadId);
  if (!thread) throw new Error(`Thread ${threadId} not found for append`);

  const now = new Date().toISOString();
  thread.entries.push({ ...entry, timestamp: now });
  thread.lastUpdated = now;

  // Cap entries at 100 to keep KV value size manageable
  if (thread.entries.length > 100) {
    thread.entries = thread.entries.slice(-100);
  }

  await kvPutThread(kv, thread);
  await kvUpdateIndex(kv, thread);
}

/**
 * Fetch all active intelligence threads.
 */
export async function fetchActiveThreads(env: any): Promise<IntelligenceThread[]> {
  const kv = getKV(env);
  const index = await kvGetIndex(kv);
  const activeIds = index
    .filter(e => e.status === 'active' || e.status === 'stale')
    .slice(0, 50)
    .map(e => e.id);

  const threads: IntelligenceThread[] = [];
  for (const id of activeIds) {
    const t = await kvGetThread(kv, id);
    if (t) threads.push(t);
  }
  return threads;
}

/**
 * Fetch a single thread by ID.
 */
export async function fetchThread(env: any, threadId: string): Promise<IntelligenceThread | null> {
  const kv = getKV(env);
  return kvGetThread(kv, threadId);
}

/**
 * Find threads that watch a given account.
 */
export async function findThreadsForAccount(env: any, accountId: string): Promise<IntelligenceThread[]> {
  const threads = await fetchActiveThreads(env);
  return threads.filter(t =>
    t.accountRefs.some(ref => ref._ref === accountId),
  );
}

/**
 * Find threads that watch a given signal type.
 */
export async function findThreadsForSignalType(env: any, signalType: string): Promise<IntelligenceThread[]> {
  const threads = await fetchActiveThreads(env);
  return threads.filter(t => t.signalWatch.includes(signalType));
}

/**
 * Update thread status.
 */
export async function updateThreadStatus(env: any, threadId: string, status: IntelligenceThread['status']): Promise<void> {
  const kv = getKV(env);
  const thread = await kvGetThread(kv, threadId);
  if (!thread) throw new Error(`Thread ${threadId} not found`);

  thread.status = status;
  thread.lastUpdated = new Date().toISOString();

  await kvPutThread(kv, thread);
  await kvUpdateIndex(kv, thread);
}

// ─── Thread Watcher (runs on 15-min cron) ───────────────────────────────────

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

  const STALE_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000;

  for (const thread of threads) {
    const lastUpdatedMs = new Date(thread.lastUpdated).getTime();
    const age = Date.now() - lastUpdatedMs;

    if (age > STALE_THRESHOLD_MS && thread.status === 'active') {
      await updateThreadStatus(env, thread._id, 'stale');
      threadsMarkedStale++;
      continue;
    }

    const watchedAccountIds = new Set(thread.accountRefs.map(ref => ref._ref));
    const watchedSignalTypes = new Set(thread.signalWatch);

    const matchingSignals = recentSignals.filter(sig =>
      watchedAccountIds.has(sig.accountId) || watchedSignalTypes.has(sig.signalType),
    );

    if (matchingSignals.length > 0) {
      const signalSummary = matchingSignals.map(sig =>
        `${sig.signalType} for ${sig.accountName} (strength: ${Math.round(sig.strength * 100)}%)`,
      ).join('; ');

      await appendToThread(env, thread._id, {
        source: 'signal',
        content: `New signals detected: ${signalSummary}`,
      });
      threadsUpdated++;
    }
  }

  return { threadsUpdated, threadsMarkedStale };
}

// ─── LLM-Powered Thread Synthesis ───────────────────────────────────────────

export async function synthesizeThread(env: any, threadId: string): Promise<string> {
  const thread = await fetchThread(env, threadId);
  if (!thread) return 'Thread not found.';

  const hasLlm = !!(env.LLM_API_KEY || env.ANTHROPIC_API_KEY || env.OPENAI_API_KEY);
  if (!hasLlm) {
    return `Thread "${thread.title}" has ${thread.entries.length} entries. Last updated ${thread.lastUpdated}.`;
  }

  const entriesSummary = thread.entries
    .slice(-20)
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

    // Save summary back to KV
    const kv = getKV(env);
    thread.summary = result.content;
    thread.lastUpdated = new Date().toISOString();
    await kvPutThread(kv, thread);
    await kvUpdateIndex(kv, thread);

    return result.content;
  } catch (err: any) {
    console.warn('[intelligenceThreads] synthesis failed:', err?.message);
    return `Thread "${thread.title}" has ${thread.entries.length} entries across ${thread.accountNames.length} accounts. Status: ${thread.status}.`;
  }
}

// ─── Copilot Integration: Should This Query Become a Thread? ────────────────

export function shouldCreateThread(prompt: string, intent: string): boolean {
  const lower = prompt.toLowerCase();

  if (/\bresearch\b|\binvestigat|\btrack\b|\bmonitor\b|\bwatch\b|\bfollow\b|\bdig into\b|\bdeep dive\b/.test(lower)) {
    return true;
  }

  if (/\bstrategy\b|\broadmap\b|\bwhat.*plan\b|\bwhy.*buying\b|\bwhen.*will\b/.test(lower) &&
      /\baccount\b|\bcompany\b|\b[A-Z][a-z]+\s[A-Z]/.test(prompt)) {
    return true;
  }

  if (/\bkeep\b.*\bwatch|\btrack\b.*\bthis|\bfollow\b.*\bup|\bsave\b.*\bthread/.test(lower)) {
    return true;
  }

  if (intent === 'search' && /\bshow\b|\blist\b|\bhow many\b|\bcount\b/.test(lower)) {
    return false;
  }

  return false;
}

export function extractThreadWatchTargets(response: any): {
  accountIds: string[];
  accountNames: string[];
  signalWatch: string[];
} {
  const accountIds: string[] = [];
  const accountNames: string[] = [];
  const signalWatch: string[] = [];

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
