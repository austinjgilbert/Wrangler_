/**
 * Calendar-Driven Research — Pre-Meeting Intelligence Briefs
 *
 * Storage: Cloudflare KV (MOLTBOOK_ACTIVITY_KV)
 * Key pattern: brief:{eventId}
 * Index key:  brief:index:upcoming
 *
 * Flow:
 * 1. External events are pushed via /operator/console/calendar/sync
 * 2. For each event with external attendees, we:
 *    - Match domains against Sanity accounts
 *    - Pull latest signals, score, and active threads
 *    - Generate an LLM-powered pre-meeting brief
 *    - Store brief in KV and push to Telegram
 * 3. Briefs are retrievable via /operator/console/calendar/briefs
 */
import { callLlm } from './llm.ts';
import { findThreadsForAccount, createThread, appendToThread, shouldCreateThread } from './intelligenceThreads.ts';
// FIX 1: Top-level imports instead of dynamic imports inside functions
import { fetchAccounts, fetchSignals, createMoltJob } from './sanity.ts';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface CalendarEvent {
  eventId: string;
  title: string;
  start: string;      // ISO 8601
  end: string;
  attendees: Array<{ email: string; name?: string; self?: boolean }>;
  location?: string;
  description?: string;
}

export interface AttendeeIntel {
  email: string;
  name?: string;
  domain: string;
  accountId?: string;
  accountName?: string;
  score?: number;
  industry?: string;
  recentSignals: Array<{ signalType: string; strength: number; timestamp: string }>;
  activeThreads: Array<{ id: string; title: string }>;
}

export interface MeetingBrief {
  eventId: string;
  title: string;
  meetingTime: string;
  generatedAt: string;
  attendeeIntel: AttendeeIntel[];
  briefMarkdown: string;
  researchQueued: string[];  // domains queued for auto-research
  threadId: string | null;
}

// ─── KV Helpers ─────────────────────────────────────────────────────────────

function getKV(env: any): KVNamespace {
  const kv = env.MOLTBOOK_ACTIVITY_KV;
  if (!kv) throw new Error('MOLTBOOK_ACTIVITY_KV not bound');
  return kv;
}

const BRIEF_PREFIX = 'brief:';
const BRIEF_INDEX_KEY = 'brief:index:upcoming';
// FIX 4: Briefs older than this are regenerated even if cached
const BRIEF_REFRESH_THRESHOLD_MS = 2 * 60 * 60 * 1000; // 2 hours

async function kvGetBrief(kv: KVNamespace, eventId: string): Promise<MeetingBrief | null> {
  const raw = await kv.get(`${BRIEF_PREFIX}${eventId}`);
  return raw ? JSON.parse(raw) : null;
}

async function kvPutBrief(kv: KVNamespace, brief: MeetingBrief): Promise<void> {
  // TTL: 7 days — briefs are ephemeral
  await kv.put(`${BRIEF_PREFIX}${brief.eventId}`, JSON.stringify(brief), { expirationTtl: 604800 });
}

interface BriefIndexEntry {
  eventId: string;
  title: string;
  meetingTime: string;
  generatedAt: string;
  domainCount: number;
}

async function kvGetBriefIndex(kv: KVNamespace): Promise<BriefIndexEntry[]> {
  const raw = await kv.get(BRIEF_INDEX_KEY);
  return raw ? JSON.parse(raw) : [];
}

async function kvUpdateBriefIndex(kv: KVNamespace, brief: MeetingBrief): Promise<void> {
  const index = await kvGetBriefIndex(kv);
  const entry: BriefIndexEntry = {
    eventId: brief.eventId,
    title: brief.title,
    meetingTime: brief.meetingTime,
    generatedAt: brief.generatedAt,
    domainCount: brief.attendeeIntel.length,
  };
  const existing = index.findIndex(e => e.eventId === brief.eventId);
  if (existing >= 0) {
    index[existing] = entry;
  } else {
    index.push(entry);
  }
  // Keep only briefs for meetings in the future or last 48h
  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  const filtered = index.filter(e => e.meetingTime >= cutoff);
  // Sort by meeting time ascending
  filtered.sort((a, b) => a.meetingTime.localeCompare(b.meetingTime));
  // Cap at 50
  await kv.put(BRIEF_INDEX_KEY, JSON.stringify(filtered.slice(0, 50)), { expirationTtl: 604800 });
}

// ─── Domain Extraction ──────────────────────────────────────────────────────

// FIX 2: Expanded internal domains list with additional free email providers
const INTERNAL_DOMAINS = new Set([
  'gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com', 'yahoo.com',
  'icloud.com', 'me.com', 'aol.com', 'protonmail.com', 'proton.me',
  'live.com', 'msn.com', 'mail.com', 'zoho.com', 'yandex.com',
  'fastmail.com', 'tutanota.com', 'gmx.com', 'gmx.net',
]);

function extractDomain(email: string): string {
  return email.split('@')[1]?.toLowerCase() || '';
}

function isExternalBusiness(email: string, selfDomain?: string): boolean {
  const domain = extractDomain(email);
  if (!domain) return false;
  if (INTERNAL_DOMAINS.has(domain)) return false;
  if (selfDomain && domain === selfDomain) return false;
  return true;
}

function getSelfDomain(attendees: CalendarEvent['attendees']): string | undefined {
  const selfAttendee = attendees.find(a => a.self);
  return selfAttendee ? extractDomain(selfAttendee.email) : undefined;
}

// ─── Account Matching ───────────────────────────────────────────────────────

async function matchDomainsToAccounts(env: any, domains: string[]): Promise<Map<string, any>> {
  const accounts = await fetchAccounts(env);
  const domainMap = new Map<string, any>();

  for (const acct of accounts) {
    const acctDomain = (acct.domain || acct.rootDomain || '').toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '');
    if (acctDomain && domains.includes(acctDomain)) {
      domainMap.set(acctDomain, acct);
    }
  }
  return domainMap;
}

async function getRecentSignalsForAccount(env: any, accountId: string): Promise<Array<{ signalType: string; strength: number; timestamp: string }>> {
  const allSignals = await fetchSignals(env);
  const cutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(); // 14 days
  return allSignals
    .filter((s: any) => s.account?._ref === accountId && s.timestamp > cutoff)
    .map((s: any) => ({ signalType: s.signalType || 'unknown', strength: Number(s.strength || 0), timestamp: s.timestamp }))
    .sort((a: any, b: any) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, 10);
}

// ─── Brief Generation ───────────────────────────────────────────────────────

async function generateBriefMarkdown(env: any, event: CalendarEvent, intel: AttendeeIntel[]): Promise<string> {
  const knownAccounts = intel.filter(a => a.accountId);
  const unknownDomains = intel.filter(a => !a.accountId);

  // Build context for LLM
  const contextLines: string[] = [];
  contextLines.push(`Meeting: "${event.title}"`);
  contextLines.push(`Time: ${event.start}`);
  if (event.location) contextLines.push(`Location: ${event.location}`);
  contextLines.push('');

  for (const a of knownAccounts) {
    contextLines.push(`### ${a.accountName || a.domain} (score: ${a.score || 'N/A'}, industry: ${a.industry || 'unknown'})`);
    contextLines.push(`Attendee: ${a.name || a.email}`);
    if (a.recentSignals.length > 0) {
      contextLines.push(`Recent signals: ${a.recentSignals.map(s => `${s.signalType} (${Math.round(s.strength * 100)}%)`).join(', ')}`);
    }
    if (a.activeThreads.length > 0) {
      contextLines.push(`Active threads: ${a.activeThreads.map(t => t.title).join(', ')}`);
    }
    contextLines.push('');
  }

  for (const a of unknownDomains) {
    contextLines.push(`### ${a.domain} (not in CRM)`);
    contextLines.push(`Attendee: ${a.name || a.email}`);
    contextLines.push('');
  }

  const hasLlm = !!(env.LLM_API_KEY || env.ANTHROPIC_API_KEY || env.OPENAI_API_KEY);
  if (!hasLlm) {
    // Fallback: structured summary without LLM
    return [
      `# Pre-Meeting Brief: ${event.title}`,
      `**${event.start}**`,
      '',
      ...contextLines,
      knownAccounts.length === 0 ? '_No matched accounts in CRM._' : '',
      unknownDomains.length > 0 ? `_${unknownDomains.length} unknown domain(s) — research queued._` : '',
    ].join('\n');
  }

  const llmResponse = await callLlm(env, [
    { role: 'system', content: 'You are a pre-meeting intelligence analyst. Given CRM data, signals, and active investigation threads about the companies attending a meeting, produce a concise, actionable brief. Focus on: (1) what the company does and their current tech landscape, (2) recent signals that indicate intent or change, (3) active investigation threads, (4) suggested talking points and questions. Keep it under 400 words. Use markdown.' },
    { role: 'user', content: `Generate a pre-meeting brief for this meeting:\n\n${contextLines.join('\n')}` },
  ], { maxTokens: 800 });

  return [
    `# Pre-Meeting Brief: ${event.title}`,
    `**${event.start}**`,
    '',
    llmResponse.content || '_Brief generation failed._',
  ].join('\n');
}

// ─── Telegram Push ──────────────────────────────────────────────────────────

// FIX 3: Sanitize markdown/HTML for safe Telegram display
function sanitizeBriefForTelegram(markdown: string): string {
  return markdown
    .replace(/#{1,6}\s*/g, '')       // strip markdown headers
    .replace(/\*\*/g, '')            // strip bold markers
    .replace(/\*/g, '')              // strip italic markers
    .replace(/_/g, '')               // strip underscore emphasis
    .replace(/`{1,3}/g, '')          // strip code markers
    .replace(/&/g, '&amp;')          // escape HTML entities
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

async function pushBriefToTelegram(env: any, brief: MeetingBrief): Promise<boolean> {
  const token = env.TELEGRAM_BOT_TOKEN;
  const chatId = env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return false;

  const knownCount = brief.attendeeIntel.filter(a => a.accountId).length;

  const lines = [
    `<b>📋 Pre-Meeting Brief</b>`,
    `<b>${brief.title}</b>`,
    `🕐 ${brief.meetingTime}`,
    '',
    `${brief.attendeeIntel.length} external attendee(s), ${knownCount} matched in CRM`,
  ];

  if (brief.researchQueued.length > 0) {
    lines.push(`📡 Auto-research queued: ${brief.researchQueued.join(', ')}`);
  }

  // FIX 3: Properly sanitize markdown for HTML parse_mode
  const briefPreview = sanitizeBriefForTelegram(brief.briefMarkdown.slice(0, 2000));
  lines.push('', briefPreview);

  try {
    const resp = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: lines.join('\n').slice(0, 4096),
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    });
    if (!resp.ok) {
      console.warn('[calendarPrep] Telegram push failed:', resp.status, await resp.text().catch(() => ''));
    }
    return resp.ok;
  } catch (err: any) {
    console.warn('[calendarPrep] Telegram push error:', err?.message);
    return false;
  }
}

// ─── Auto-Research Queuing ──────────────────────────────────────────────────

async function queueResearchForUnknown(env: any, domain: string, eventTitle: string): Promise<string | null> {
  const now = new Date().toISOString();
  const jobId = `molt.job.calendar-research.${domain.replace(/[^a-zA-Z0-9.-]/g, '-')}.${Date.now()}`;
  try {
    await createMoltJob(env, {
      _type: 'molt.job',
      _id: jobId,
      jobType: 'auto-research',
      status: 'queued',
      priority: 80, // Higher priority than signal-triggered research
      attempts: 0,
      maxAttempts: 2,
      nextAttemptAt: now,
      leaseExpiresAt: null,
      traceId: null,
      idempotencyKey: `calendar-research.${domain}.${now.slice(0, 13)}`,
      inputRefs: [],
      outputRefs: [],
      payload: {
        domain,
        reason: `Pre-meeting research for "${eventTitle}"`,
        trigger: 'calendar_prep',
      },
      error: null,
      createdAt: now,
      updatedAt: now,
    });
    return jobId;
  } catch {
    return null;
  }
}

// ─── Main Entry Points ─────────────────────────────────────────────────────

/**
 * Process a batch of calendar events and generate briefs.
 * Called from /operator/console/calendar/sync
 */
export async function processCalendarEvents(
  env: any,
  events: CalendarEvent[],
): Promise<{ processed: number; briefs: MeetingBrief[]; errors: string[] }> {
  const kv = getKV(env);
  const briefs: MeetingBrief[] = [];
  const errors: string[] = [];

  // Collect all unique external domains across all events
  const allDomains = new Set<string>();
  const eventDomains = new Map<string, string[]>();

  for (const event of events) {
    const selfDomain = getSelfDomain(event.attendees);
    const domains: string[] = [];
    for (const att of event.attendees) {
      if (att.self) continue;
      if (isExternalBusiness(att.email, selfDomain)) {
        const d = extractDomain(att.email);
        if (d) {
          domains.push(d);
          allDomains.add(d);
        }
      }
    }
    eventDomains.set(event.eventId, domains);
  }

  // Skip events with no external attendees
  const externalEvents = events.filter(e => (eventDomains.get(e.eventId)?.length || 0) > 0);

  if (externalEvents.length === 0) {
    return { processed: 0, briefs: [], errors: [] };
  }

  // Batch-match all domains to accounts
  const accountMap = await matchDomainsToAccounts(env, Array.from(allDomains));

  for (const event of externalEvents) {
    try {
      // FIX 4: Check if existing brief is fresh enough to reuse
      const existing = await kvGetBrief(kv, event.eventId);
      if (existing) {
        const briefAgeMs = Date.now() - new Date(existing.generatedAt).getTime();
        if (briefAgeMs < BRIEF_REFRESH_THRESHOLD_MS) {
          briefs.push(existing);
          continue;
        }
        // Brief is stale — regenerate below
        console.log(`[calendarPrep] Regenerating stale brief for ${event.eventId} (age: ${Math.round(briefAgeMs / 60000)}m)`);
      }

      const selfDomain = getSelfDomain(event.attendees);
      const intel: AttendeeIntel[] = [];
      const researchQueued: string[] = [];

      for (const att of event.attendees) {
        if (att.self) continue;
        const domain = extractDomain(att.email);
        if (!domain || !isExternalBusiness(att.email, selfDomain)) continue;

        const account = accountMap.get(domain);
        if (account) {
          // Known account — pull signals and threads
          const signals = await getRecentSignalsForAccount(env, account._id);
          const threads = await findThreadsForAccount(env, account._id);

          intel.push({
            email: att.email,
            name: att.name,
            domain,
            accountId: account._id,
            accountName: account.companyName || account.name || domain,
            score: account.score || account.currentScore || 0,
            industry: account.industry || undefined,
            recentSignals: signals,
            activeThreads: threads.map(t => ({ id: t._id, title: t.title })),
          });
        } else {
          // Unknown domain — queue research
          intel.push({
            email: att.email,
            name: att.name,
            domain,
            recentSignals: [],
            activeThreads: [],
          });
          const jobId = await queueResearchForUnknown(env, domain, event.title);
          if (jobId) researchQueued.push(domain);
        }
      }

      // Deduplicate intel by domain (multiple attendees from same company)
      const seen = new Set<string>();
      const dedupedIntel = intel.filter(a => {
        if (seen.has(a.domain)) return false;
        seen.add(a.domain);
        return true;
      });

      // Generate the brief
      const briefMarkdown = await generateBriefMarkdown(env, event, dedupedIntel);

      const brief: MeetingBrief = {
        eventId: event.eventId,
        title: event.title,
        meetingTime: event.start,
        generatedAt: new Date().toISOString(),
        attendeeIntel: dedupedIntel,
        briefMarkdown,
        researchQueued,
        threadId: null,
      };

      // Create or append to an intelligence thread for this meeting
      try {
        const accountIds = dedupedIntel.filter(a => a.accountId).map(a => a.accountId!);
        const accountNames = dedupedIntel.filter(a => a.accountName).map(a => a.accountName!);

        if (accountIds.length > 0) {
          const thread = await createThread(env, {
            query: `Pre-meeting prep: ${event.title}`,
            initialResponse: briefMarkdown.slice(0, 1000),
            accountIds,
            accountNames,
            signalWatch: [],
            priority: 80,
          });
          brief.threadId = thread._id;
        }
      } catch (threadErr: any) {
        console.warn('[calendarPrep] thread creation failed:', threadErr?.message);
      }

      // Store brief
      await kvPutBrief(kv, brief);
      await kvUpdateBriefIndex(kv, brief);

      // Push to Telegram
      await pushBriefToTelegram(env, brief);

      briefs.push(brief);
    } catch (err: any) {
      errors.push(`${event.eventId}: ${err?.message || 'unknown error'}`);
    }
  }

  return { processed: briefs.length, briefs, errors };
}

/**
 * Fetch all upcoming briefs from KV.
 */
export async function fetchUpcomingBriefs(env: any): Promise<BriefIndexEntry[]> {
  const kv = getKV(env);
  return kvGetBriefIndex(kv);
}

/**
 * Fetch a single brief by event ID.
 */
export async function fetchBrief(env: any, eventId: string): Promise<MeetingBrief | null> {
  const kv = getKV(env);
  return kvGetBrief(kv, eventId);
}
