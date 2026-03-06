/**
 * Telegram Intent Parser & Tool Handlers
 *
 * Maps simple human language to tools and executes them.
 * Phrase variations make it easy to talk to the bot naturally.
 */

const DOMAIN_REGEX = /[a-z0-9][-a-z0-9]*\.[a-z]{2,}(?:\.[a-z]{2,})?/gi;

export type Intent =
  | 'account_lookup'
  | 'enrich_account'
  | 'patterns'
  | 'accounts_by_tech'
  | 'competitors'
  | 'compare'
  | 'person_lookup'
  | 'recent_captures'
  | 'sdr_briefing'
  | 'jobs_list'
  | 'network_updates'
  | 'network_teach'
  | 'network_trends'
  | 'moltbook_post'
  | 'status'
  | 'help'
  | 'unknown';

export interface ParsedIntent {
  intent: Intent;
  domains?: string[];
  tech?: string;
  industry?: string;
  /** Message to post to Moltbook (for moltbook_post intent) */
  moltbookMessage?: string;
}

/** Optional conversational prefix (can you, please, I need, etc.) */
const P = '(?:(?:can you|could you|would you|please|i need|i want|show me|give me|get me|tell me|run|find|look up)\\s+)?';

/** Phrase patterns for natural language. Order matters — first match wins. */
const INTENT_PATTERNS: { intent: Intent; patterns: RegExp[] }[] = [
  // Compare (two entities)
  { intent: 'compare', patterns: [/compare\s+(.+?)\s+(?:and|vs\.?|vs)\s+(.+)/i, /(.+?)\s+vs\.?\s+(.+)/i, /(?:difference|diff)\s+between\s+(.+?)\s+and\s+(.+)/i] },
  // Competitors
  { intent: 'competitors', patterns: [/competitors?\s+(?:of|for)?\s*(.+)/i, /who\s+(?:are\s+)?(.+?)'?s?\s+competitors/i, /who\s+competes\s+with\s+(.+)/i, /competition\s+(?:for|of)\s+(.+)/i, /rivals?\s+of\s+(.+)/i, new RegExp(P + 'competitors?\\s+(?:of\\s+)?(.+)', 'i')] },
  // Enrich
  { intent: 'enrich_account', patterns: [/enrich\s+(.+)/i, /fill\s+(?:in\s+)?gaps?\s+(?:for\s+)?(.+)/i, /run\s+enrichment\s+(?:on\s+)?(.+)/i, /update\s+(?:profile\s+)?(?:for\s+)?(.+)/i, /refresh\s+(.+)/i, new RegExp(P + '(?:enrich|update|refresh)\\s+(.+)', 'i')] },
  // Accounts by tech
  { intent: 'accounts_by_tech', patterns: [/accounts?\s+using\s+(.+)/i, /who\s+uses?\s+(.+)/i, /companies?\s+(?:with|using)\s+(.+)/i, /(.+)\s+accounts/i, /which\s+(?:companies|accounts)\s+use\s+(.+)/i, /who\s+has\s+(.+)/i] },
  // People at company
  { intent: 'person_lookup', patterns: [/people\s+at\s+(.+)/i, /leadership\s+(?:at\s+)?(.+)/i, /who\s+works?\s+(?:at\s+)?(.+)/i, /contacts?\s+(?:at\s+)?(.+)/i, /team\s+at\s+(.+)/i, /who\'?s\s+at\s+(.+)/i, /employees?\s+at\s+(.+)/i] },
  // Account lookup (broad conversational)
  { intent: 'account_lookup', patterns: [
    /what\s+(?:do\s+we\s+)?know\s+about\s+(.+)/i,
    /(?:look\s+up|find|get)\s+(.+)/i,
    /tell\s+me\s+about\s+(.+)/i,
    /(?:recall|summarize)\s+(.+)/i,
    /find\s+patterns?\s+for\s+(.+)/i,
    /(?:info|information|details?|brief)\s+(?:on|for|about)\s+(.+)/i,
    /what\s+(?:do\s+we\s+have|have\s+we)\s+on\s+(.+)/i,
    /(?:run\s+)?(?:a\s+)?(?:quick\s+)?(?:lookup|look\s+up)\s+(?:on\s+)?(.+)/i,
    new RegExp(P + '(?:look up|find|info on|details for)\\s+(.+)', 'i'),
    /(?:anything|something)\s+on\s+(.+)/i,
  ] },
  // Recent captures
  { intent: 'recent_captures', patterns: [/recent\s+captures?/i, /latest\s+captures?/i, /last\s+captures?/i, /what\s+(?:did\s+we\s+)?capture/i, /show\s+(?:me\s+)?captures?/i, /(?:any\s+)?new\s+captures?/i] },
  // SDR briefing
  { intent: 'sdr_briefing', patterns: [/good\s+morning/i, /daily\s+briefing/i, /sdr\s+briefing/i, /morning\s+brief/i, /(?:what\'?s|whats)\s+my\s+briefing/i, /(?:give\s+me\s+)?(?:my\s+)?(?:daily\s+)?brief/i] },
  // Patterns
  { intent: 'patterns', patterns: [/^patterns?$/i, /show\s+patterns?/i, /tech\s+patterns?/i, /what\s+patterns?\s+(?:do\s+we\s+have|are\s+we\s+seeing)/i] },
  // Jobs list
  { intent: 'jobs_list', patterns: [/^jobs?$/i, /(?:list\s+)?(?:enrichment\s+)?jobs?/i, /recent\s+jobs?/i, /(?:what\s+)?jobs?\s+(?:are\s+)?(?:running|pending|recent)/i] },
  // Network / Moltbook updates (what bots are doing, insights)
  { intent: 'network_updates', patterns: [/what(?:'s|\s+is)\s+(?:happening\s+)?(?:in\s+)?(?:the\s+)?network/i, /moltbook\s+(?:updates?|insights?|activity)/i, /(?:what\s+)?(?:are\s+)?(?:the\s+)?bots?\s+(?:doing|finding|learning)/i, /network\s+(?:updates?|insights?|activity|news)/i, /(?:latest|recent)\s+(?:from\s+)?(?:moltbook|the\s+network)/i, /(?:any\s+)?(?:new\s+)?(?:network|moltbook)\s+updates?/i, new RegExp(P + '(?:network|moltbook)\\s+(?:updates?|insights?)', 'i')] },
  // Teach me / cutting edge (research network and explain)
  { intent: 'network_teach', patterns: [/what(?:'s|\s+is)\s+(?:on\s+)?(?:the\s+)?cutting\s+edge/i, /teach\s+me\s+(?:what\s+)?(?:the\s+)?network\s+(?:knows|is\s+learning|learned)/i, /explain\s+(?:the\s+)?network/i, /what\s+is\s+the\s+network\s+learning/i, /research\s+(?:the\s+)?network/i, /cutting\s+edge/i, /(?:what\s+)?(?:are\s+)?(?:we\s+)?(?:learning|seeing)\s+(?:from\s+)?(?:the\s+)?network/i, new RegExp(P + '(?:teach|explain|summarize)\\s+(?:the\\s+)?(?:network|moltbook)', 'i')] },
  // Network trends (rising/falling themes over last 7d vs 7–14d)
  { intent: 'network_trends', patterns: [/network\s+trends?/i, /(?:what\s+)?(?:are\s+)?(?:the\s+)?trends?/i, /(?:show\s+)?(?:me\s+)?trends?/i, /rising\s+(?:themes?|topics?)/i, /(?:what\s+)?(?:is\s+)?(?:trending|rising|falling)\s+(?:in\s+)?(?:the\s+)?network/i, /(?:see|gather)\s+(?:data\s+and\s+)?(?:see\s+)?trends?/i, new RegExp(P + '(?:trends?|rising|falling)\\s+(?:in\\s+)?(?:network|moltbook)', 'i')] },
  // Post to Moltbook / network (must come after network_updates so "moltbook post X" is not read as updates)
  { intent: 'moltbook_post', patterns: [/post\s+to\s+(?:moltbook|the\s+network)\s*[:\-]?\s*(.+)/i, /moltbook\s+post\s+(.+)/i, /share\s+with\s+(?:moltbook|the\s+network)\s*[:\-]?\s*(.+)/i, /(?:tell|announce)\s+(?:to\s+)?(?:moltbook|the\s+network)\s*[:\-]?\s*(.+)/i, new RegExp(P + '(?:post|share)\\s+(?:to\\s+)?(?:moltbook|network)\\s*[:\\-]?\\s*(.+)', 'i')] },
  // Status
  { intent: 'status', patterns: [/^status$/i, /^health$/i, /system\s+status/i, /(?:are\s+you\s+)?(?:there|up)/i, /how\s+are\s+we\s+doing/i, /(?:everything\s+)?(?:ok|working)/i, /ping/i] },
  // Help
  { intent: 'help', patterns: [/^help$/i, /what\s+can\s+you\s+do/i, /how\s+do\s+i\s+use/i, /help\s+me/i, /how\s+does\s+this\s+work/i, /what\s+do\s+you\s+support/i] },
];

/** Extract domain(s) from text */
function extractDomains(text: string): string[] {
  const matches = text.match(DOMAIN_REGEX) || [];
  return [...new Set(matches.map(d => d.replace(/^www\./, '').toLowerCase()))];
}

/** Extract first domain from text or any domain-like segment */
function extractDomain(text: string): string | null {
  const domains = extractDomains(text);
  if (domains.length) return domains[0];
  // Fallback: last segment that looks like a domain (e.g. "tell me about fleetfeet.com")
  const m = text.match(/(?:about|for|at)\s+([a-z0-9][-a-z0-9]*\.[a-z]{2,})/i);
  return m ? m[1].replace(/^www\./, '').toLowerCase() : null;
}

/** Parse user message into intent + entities */
export function parseIntent(text: string): ParsedIntent {
  const trimmed = text.trim();
  if (!trimmed) return { intent: 'unknown' };

  for (const { intent, patterns } of INTENT_PATTERNS) {
    for (const p of patterns) {
      const m = trimmed.match(p);
      if (!m) continue;
      const domains = extractDomains(trimmed);
      let tech: string | undefined;
      let domainFromCapture: string | undefined;

      if (intent === 'compare' && m[1] && m[2]) {
        const d1 = extractDomains(m[1])[0] || m[1].trim();
        const d2 = extractDomains(m[2])[0] || m[2].trim();
        return { intent, domains: [d1, d2] };
      }
      if (intent === 'moltbook_post' && m[1]) {
        return { intent, moltbookMessage: m[1].trim().slice(0, 2000) };
      }
      if (intent === 'competitors' || intent === 'enrich_account' || intent === 'account_lookup' || intent === 'person_lookup') {
        domainFromCapture = m[1]?.trim();
        const d = extractDomains(domainFromCapture)[0];
        return { intent, domains: d ? [d] : (domainFromCapture ? [domainFromCapture.replace(/^www\./, '').toLowerCase()] : []) };
      }
      if (intent === 'accounts_by_tech') {
        tech = m[1]?.trim();
        return { intent, tech: tech || undefined };
      }

      if (domains.length) return { intent, domains };
      return { intent };
    }
  }

  // Fallback: bare domain → account lookup
  const domain = extractDomain(trimmed);
  if (domain) return { intent: 'account_lookup', domains: [domain] };

  // Fallback: short phrase (e.g. "Stripe", "acme corp") → try account lookup
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length >= 1 && words.length <= 5 && trimmed.length <= 50 && !trimmed.startsWith('/')) {
    return { intent: 'account_lookup', domains: [trimmed.toLowerCase().replace(/\s+/g, ' ').trim()] };
  }

  return { intent: 'unknown' };
}

/** Get help text with all supported commands and phrases */
export function getHelpText(): string {
  return (
    '<b>Molt Content OS Bot</b>\n\n' +
    '<b>Slash commands</b>\n' +
    '/account &lt;domain&gt; — account summary\n' +
    '/enrich &lt;domain&gt; — run enrichment\n' +
    '/competitors &lt;domain&gt; — competitor research\n' +
    '/compare &lt;d1&gt; &lt;d2&gt; — compare two accounts\n' +
    '/people &lt;domain&gt; — people at company\n' +
    '/tech &lt;name&gt; — accounts using this tech\n' +
    '/patterns — tech & pain point patterns\n' +
    '/captures — recent extension captures\n' +
    '/briefing — daily SDR briefing\n' +
    '/jobs — recent enrichment jobs\n' +
    '/network — Moltbook & network updates\n' +
    '/teach — research network & explain cutting edge\n' +
    '/trends — rising/falling themes in the network\n' +
    '/moltbook [post <message>] — feed or post to Moltbook\n' +
    '/status — system health\n\n' +
    '<b>Or just say it</b>\n' +
    '• "what do we know about example.com"\n' +
    '• "enrich fleetfeet.com" • "competitors of Acme"\n' +
    '• "compare X and Y" • "people at example.com"\n' +
    '• "accounts using React" • "good morning" • "recent captures"\n' +
    '• "post to moltbook: your message" • "/moltbook post &lt;message&gt;"\n' +
    '• "what\'s on the cutting edge" • "teach me what the network knows" • /teach\n' +
    '• "network trends" • "what are the trends" • /trends\n\n' +
    'You can also say: "can you look up X", "info on example.com", "who competes with X", "what\'s my briefing", "how are we doing".'
  );
}

/** Progress message shown while the tool runs */
export function getProgressMessage(parsed: ParsedIntent): string {
  const d = parsed.domains?.[0];
  const d2 = parsed.domains?.[1];
  const tech = parsed.tech;
  switch (parsed.intent) {
    case 'account_lookup': return d ? `🔍 Looking up ${d}...` : '🔍 Looking up account...';
    case 'enrich_account': return d ? `⏳ Running enrichment for ${d}...` : '⏳ Running enrichment...';
    case 'competitors': return d ? `🔍 Finding competitors for ${d}...` : '🔍 Finding competitors...';
    case 'compare': return d && d2 ? `🔍 Comparing ${d} and ${d2}...` : '🔍 Comparing accounts...';
    case 'person_lookup': return d ? `🔍 Finding people at ${d}...` : '🔍 Finding people...';
    case 'accounts_by_tech': return tech ? `🔍 Finding accounts using ${tech}...` : '🔍 Finding accounts...';
    case 'recent_captures': return '🔍 Loading recent captures...';
    case 'sdr_briefing': return '🔍 Building daily briefing...';
    case 'patterns': return '🔍 Loading patterns...';
    case 'jobs_list': return '🔍 Loading recent jobs...';
    case 'network_updates': return '🔍 Fetching network updates...';
    case 'network_teach': return '🔬 Researching the network and summarizing...';
    case 'network_trends': return '📈 Analyzing network trends...';
    case 'moltbook_post': return '📤 Posting to Moltbook...';
    case 'status': return '🔍 Checking status...';
    default: return '🔍 Working on it...';
  }
}

/** View URL for the result (account page, etc.). Returns null if no dedicated page. */
export function getViewUrl(parsed: ParsedIntent, baseUrl: string): string | null {
  const base = (baseUrl || '').replace(/\/$/, '');
  if (!base) return null;
  const d = parsed.domains?.[0];
  const d2 = parsed.domains?.[1];
  switch (parsed.intent) {
    case 'account_lookup':
    case 'enrich_account':
    case 'person_lookup':
      return d ? `${base}/accounts/${encodeURIComponent(d)}` : null;
    case 'competitors':
      return d ? `${base}/accounts/${encodeURIComponent(d)}` : null;
    case 'compare':
      if (d && d2) return `${base}/accounts/${encodeURIComponent(d)}\n${base}/accounts/${encodeURIComponent(d2)}`;
      return d ? `${base}/accounts/${encodeURIComponent(d)}` : null;
    case 'patterns':
    case 'recent_captures':
    case 'sdr_briefing':
    case 'jobs_list':
    case 'network_updates':
      return `${base}/account-page`;
    case 'network_teach':
    case 'network_trends':
    case 'moltbook_post':
      return null;
    case 'accounts_by_tech':
      return `${base}/account-page`;
    default:
      return null;
  }
}

/** Build a "teaching" summary from live + stored network posts (themes, takeaways, go-deeper). */
function buildTeachingSummary(
  live: { rawText: string; author: string }[],
  stored: { rawText?: string; author?: string; sanitized?: { sanitizedSummary?: string }; fetchedAt?: string }[],
): string {
  const stopwords = new Set(
    'a an the and or but of to in on at by for with is are was were be been being have has had do does did will would could should may might must can it its we they our your i you he she'.split(/\s+/),
  );
  const allText: { author: string; text: string }[] = [];
  for (const p of live) {
    const t = (p.rawText || '').trim();
    if (t) allText.push({ author: p.author || 'bot', text: t });
  }
  for (const p of stored) {
    const t = (p.sanitized?.sanitizedSummary || p.rawText || '').trim();
    if (t) allText.push({ author: p.author || 'agent', text: t });
  }
  if (allText.length === 0) {
    return (
      "<b>Cutting edge (network research)</b>\n\n" +
      "No network activity to summarize yet. Post from Telegram with /moltbook post &lt;message&gt;, or connect an external Moltbook (MOLTBOOK_BASE_URL). " +
      "Then ask again: \"what's on the cutting edge\" or /teach."
    );
  }

  const wordCount: Record<string, number> = {};
  const fullText = allText.map((x) => x.text).join(' ').toLowerCase();
  for (const w of fullText.match(/\b[a-z0-9]{3,}\b/g) || []) {
    if (!stopwords.has(w)) wordCount[w] = (wordCount[w] || 0) + 1;
  }
  const themes = Object.entries(wordCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([w]) => w)
    .join(', ');

  const contributors = new Set(allText.map((x) => x.author)).size;
  const takeaways = allText.slice(0, 5).map((x) => {
    const one = (x.text.split(/[.!?]/)[0] || x.text).trim().slice(0, 100);
    return one + (one.length >= 100 ? '…' : '');
  });

  const intro =
    `<b>What's on the cutting edge</b>\n\n` +
    `I pulled the latest from the Moltbook network (${allText.length} update(s), ${contributors} contributor(s)). ` +
    `Here's the distilled view.\n\n`;
  const themeBlock = themes ? `<b>Themes:</b> ${themes}\n\n` : '';
  const takeawayBlock =
    '<b>Key takeaways</b>\n' + takeaways.map((t) => `• ${t.replace(/</g, '&lt;')}`).join('\n') + '\n\n';
  const deeper = 'To see raw updates and who said what: /network or ask "what\'s happening in the network".';
  return intro + themeBlock + takeawayBlock + deeper;
}

/** Build rising/falling theme trends from stored community posts (last 7d vs 7–14d). */
async function buildTrendsSummary(env: any): Promise<string> {
  const { fetchCommunityPostRawSince } = await import('../lib/sanity.ts');
  const stopwords = new Set(
    'a an the and or but of to in on at by for with is are was were be been being have has had do does did will would could should may might must can it its we they our your i you he she'.split(/\s+/),
  );
  const since14 = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const since7 = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  let posts: { fetchedAt?: string; rawText?: string }[] = [];
  try {
    posts = await fetchCommunityPostRawSince(env, since14);
  } catch (_) {
    return (
      '<b>Network trends</b>\n\n' +
      'No stored network data yet. The worker crawls Moltbook every 6 hours and stores posts here. ' +
      'Post with /moltbook post &lt;message&gt; or wait for the next crawl, then ask /trends again.'
    );
  }
  const recent = posts.filter((p) => (p.fetchedAt || '') >= since7);
  const older = posts.filter((p) => {
    const t = p.fetchedAt || '';
    return t >= since14 && t < since7;
  });
  const wordFreq = (list: { rawText?: string }[]): Record<string, number> => {
    const out: Record<string, number> = {};
    const text = list.map((x) => (x.rawText || '').toLowerCase()).join(' ');
    for (const w of text.match(/\b[a-z0-9]{3,}\b/g) || []) {
      if (!stopwords.has(w)) out[w] = (out[w] || 0) + 1;
    }
    return out;
  };
  const recentFreq = wordFreq(recent);
  const olderFreq = wordFreq(older);
  const allWords = new Set([...Object.keys(recentFreq), ...Object.keys(olderFreq)]);
  const delta: { word: string; recent: number; older: number; diff: number }[] = [];
  for (const w of allWords) {
    const r = recentFreq[w] || 0;
    const o = olderFreq[w] || 0;
    delta.push({ word: w, recent: r, older: o, diff: r - o });
  }
  const rising = delta.filter((d) => d.diff > 0).sort((a, b) => b.diff - a.diff).slice(0, 7).map((d) => d.word);
  const falling = delta.filter((d) => d.diff < 0).sort((a, b) => a.diff - b.diff).slice(0, 7).map((d) => d.word);

  const intro =
    '<b>Network trends</b> (last 7 days vs previous 7 days)\n\n' +
    `Based on ${recent.length} recent post(s) and ${older.length} older post(s) in the network.\n\n`;
  const risingBlock =
    rising.length > 0
      ? '<b>📈 Rising</b> ' + rising.join(', ') + '\n\n'
      : '';
  const fallingBlock =
    falling.length > 0
      ? '<b>📉 Falling</b> ' + falling.join(', ') + '\n\n'
      : '';
  if (rising.length === 0 && falling.length === 0) {
    return intro + 'Not enough data yet to show trends. Post more or run /moltbook post to seed the feed, and use /network to see updates.';
  }
  return intro + risingBlock + fallingBlock + 'Data is gathered by the worker every 6h (GET /moltbook/crawl). Use /teach for a summary of what\'s on the cutting edge.';
}

/** Create a synthetic POST Request with JSON body */
function syntheticRequest(body: Record<string, unknown>): Request {
  return new Request('https://internal/telegram', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** Execute a parsed intent and return formatted reply text */
export async function executeTool(
  parsed: ParsedIntent,
  env: any,
  requestId: string,
): Promise<string> {
  const {
    initSanityClient,
    groqQuery,
    upsertDocument,
    patchDocument,
    assertSanityConfigured,
    generateAccountKey,
  } = await import('../sanity-client.js');
  const client = initSanityClient(env);

  if (!client) {
    return 'Sanity not configured. Set SANITY_PROJECT_ID and SANITY_TOKEN.';
  }

  const domain = parsed.domains?.[0];
  const tech = parsed.tech;

  try {
    switch (parsed.intent) {
      case 'account_lookup': {
        if (!domain) return 'Which account? Try "what do we know about example.com"';
        const d = domain.trim();
        const account = (await groqQuery(
          client,
          `*[_type == "account" && (
            rootDomain == $d || domain == $d || accountKey == $d ||
            lower(companyName) == lower($d)
          )][0]{
            domain,
            rootDomain,
            companyName,
            "technologies": technologies[]->{name},
            painPoints,
            profileCompleteness
          }`,
          { d },
        )) as any;
        if (!account) {
          return `No account found for ${domain}. Capture it via the extension or GPT first.`;
        }
        const name = account.companyName || account.rootDomain || account.domain || domain;
        const techs = (account.technologies || [])
          .map((t: any) => (typeof t === 'object' && t?.name != null ? t.name : t))
          .filter(Boolean)
          .slice(0, 5)
          .join(', ') || '—';
        const pains = Array.isArray(account.painPoints)
          ? account.painPoints.slice(0, 3).map((p: any) => p.category || p.description?.slice(0, 40)).join(', ')
          : '—';
        const score = account.profileCompleteness?.score ?? '?';
        return (
          `<b>${name}</b>\n` +
          `Completeness: ${score}%\n\n` +
          `<b>Tech:</b> ${techs}\n` +
          `<b>Pain points:</b> ${pains}`
        );
      }

      case 'enrich_account': {
        if (!domain) return 'Which account? Try "enrich example.com"';
        const canonicalUrl = domain.startsWith('http') ? domain : `https://${domain}`;
        const accountKey = await generateAccountKey(canonicalUrl);
        if (!accountKey) return `Could not derive account key for ${domain}`;
        const { triggerGapFill } = await import('../services/gap-fill-orchestrator.js');
        const result = await triggerGapFill({
          env,
          accountKey,
          domain,
          canonicalUrl,
          trigger: 'telegram',
        });
        if (!result.triggered) {
          return result.reason || `Enrichment not triggered for ${domain}.`;
        }
        return (
          `Enrichment queued for ${domain}. ` +
          `Research pipeline (scan → discovery → crawl → brief) is running in the background. ` +
          `Data will be stored in Sanity and the worker cron advances stages every 15 min.`
        );
      }

      case 'competitors': {
        if (!domain) return 'Which company? Try "competitors of example.com"';
        const canonicalUrl = domain.startsWith('http') ? domain : `https://${domain}`;
        const { handleResearchCompetitors } = await import('../handlers/competitors.js');
        const req = syntheticRequest({ canonicalUrl });
        const res = await handleResearchCompetitors(
          req,
          requestId,
          env,
          groqQuery,
          upsertDocument,
          patchDocument,
          assertSanityConfigured,
          null,
        );
        const json = (await res.json()) as { ok?: boolean; error?: string | { message?: string }; data?: { competitors?: any[] } };
        if (!json.ok) return (typeof json.error === 'string' ? json.error : json.error?.message) || 'Competitor research failed.';
        const comps = (json.data?.competitors || []).slice(0, 5).map((c: any) => c.name || c.domain || '?').join(', ');
        return `<b>Competitors of ${domain}</b>\n\n${comps || 'No competitors found.'}`;
      }

      case 'compare': {
        const domains = parsed.domains?.filter(Boolean) || [];
        if (domains.length < 2) return 'Compare two accounts: "compare X and Y"';
        const { handleCompareAccounts } = await import('../handlers/analytics.js');
        const req = syntheticRequest({ domains });
        const res = await handleCompareAccounts(req, requestId, env, groqQuery, assertSanityConfigured);
        const json = (await res.json()) as { ok?: boolean; error?: string | { message?: string }; data?: { summary?: any } };
        if (!json.ok) return (typeof json.error === 'string' ? json.error : json.error?.message) || 'Comparison failed.';
        const sum = json.data?.summary;
        if (!sum) return 'Comparison done.';
        return (
          `<b>Compare: ${domains.join(' vs ')}</b>\n\n` +
          `Avg score: ${sum.averageOpportunityScore ?? '?'}\n` +
          `Highest: ${sum.highestOpportunityScore ?? '?'}\n` +
          `Lowest: ${sum.lowestOpportunityScore ?? '?'}`
        );
      }

      case 'person_lookup': {
        if (!domain) return 'Which account? Try "people at example.com"';
        const accountKey = await generateAccountKey(`https://${domain}`);
        if (!accountKey) return `Could not resolve account for ${domain}`;
        const persons = (await groqQuery(
          client,
          `*[_type == "person" && (companyRef->accountKey == $ak || relatedAccountKey == $ak || rootDomain == $d)] | order(_updatedAt desc)[0...8]{
            name,
            headline,
            linkedInUrl,
            email
          }`,
          { ak: accountKey, d: domain },
        )) as any[];
        if (!Array.isArray(persons) || persons.length === 0) {
          return `No people found for ${domain}. Enrich or capture first.`;
        }
        const lines = persons.map((p: any) => `• ${p.name || '?'} ${p.headline ? `— ${p.headline.slice(0, 40)}` : ''}`).join('\n');
        return `<b>People at ${domain}</b>\n\n${lines}`;
      }

      case 'accounts_by_tech': {
        if (!tech || tech.length < 2) return 'Which tech? Try "accounts using React"';
        const accounts = (await groqQuery(
          client,
          `*[_type == "account" && references(*[_type == "technology" && name == $tech])][0...8]{ rootDomain, companyName }`,
          { tech: tech.trim() },
        )) as any[];
        const lines = Array.isArray(accounts) && accounts.length > 0
          ? accounts.map((a: any) => `• ${a.companyName || a.rootDomain || '?'}`).join('\n')
          : `No accounts found using ${tech}.`;
        return `<b>Accounts using ${tech}</b>\n\n${lines}`;
      }

      case 'recent_captures': {
        const events = (await groqQuery(
          client,
          `*[_type == "molt.event" && type == "extension.capture"] | order(_updatedAt desc)[0...8]{
            payload,
            _updatedAt
          }`,
        )) as any[];
        if (!Array.isArray(events) || events.length === 0) {
          return 'No recent captures. Use the extension to capture pages.';
        }
        const lines = events.map((e: any) => {
          const p = e.payload || {};
          const url = p.url || p.canonicalUrl || '?';
          const title = p.title || url.replace(/^https?:\/\//, '').slice(0, 40);
          return `• ${title}`;
        }).join('\n');
        return `<b>Recent captures</b>\n\n${lines}`;
      }

      case 'sdr_briefing': {
        const { handleGoodMorningRouting } = await import('../handlers/sdr-good-morning.js');
        const req = syntheticRequest({ daysBack: 30, minCallScore: 6, maxCalls: 25 });
        const res = await handleGoodMorningRouting(req, requestId, env, groqQuery, assertSanityConfigured);
        const json = (await res.json()) as { ok?: boolean; error?: string | { message?: string }; data?: any };
        if (!json.ok) return (typeof json.error === 'string' ? json.error : json.error?.message) || 'Briefing failed.';
        const plan = json.data;
        const stats = plan?.stats || {};
        const top = (plan?.top10Accounts || []).slice(0, 5).map((a: any) => `• ${a.account}`).join('\n');
        return (
          '<b>Good morning — Daily briefing</b>\n\n' +
          `Calls queued: ${stats.callsQueued ?? '?'} | LI: ${stats.linkedInQueued ?? '?'} | Emails: ${stats.emailsQueued ?? '?'}\n\n` +
          '<b>Top accounts:</b>\n' + (top || 'None') +
          `\n\nWin condition: ${plan?.winCondition ?? '—'}`
        );
      }

      case 'patterns': {
        const techCounts = (await groqQuery(
          client,
          `*[_type == "account" && defined(technologies) && count(technologies) > 0] | order(count(technologies) desc)[0...10]{
            "domain": rootDomain,
            "techCount": count(technologies),
            "firstTechs": (technologies[]->{name})[0...3]
          }`,
        )) as any[];
        const techLines = Array.isArray(techCounts) && techCounts.length > 0
          ? techCounts.map((a: any) => `• ${a.domain || '?'}: ${a.techCount} techs (${(a.firstTechs || []).map((t: any) => t?.name ?? t).filter(Boolean).join(', ')})`).join('\n')
          : 'No accounts with technologies yet.';
        const painAccounts = (await groqQuery(
          client,
          `*[_type == "account" && defined(painPoints) && count(painPoints) > 0] | order(count(painPoints) desc)[0...5]{
            "domain": rootDomain,
            "count": count(painPoints),
            "categories": painPoints[].category
          }`,
        )) as any[];
        const painLines = Array.isArray(painAccounts) && painAccounts.length > 0
          ? painAccounts.map((a: any) => `• ${a.domain || '?'}: ${a.count} pain points (${(a.categories || []).slice(0, 3).join(', ')})`).join('\n')
          : 'No accounts with pain points yet.';
        return (
          '<b>Patterns from Sanity</b>\n\n' +
          '<b>Tech overlap (top accounts):</b>\n' + techLines + '\n\n' +
          '<b>Pain point correlations:</b>\n' + painLines
        );
      }

      case 'jobs_list': {
        const jobs = (await groqQuery(
          client,
          `*[_type == "enrichmentJob"] | order(updatedAt desc)[0...15]{
            accountKey,
            canonicalUrl,
            status,
            currentStage,
            updatedAt,
            "domain": coalesce(canonicalUrl, accountKey)
          }`,
        )) as any[];
        if (!Array.isArray(jobs) || jobs.length === 0) {
          return 'No enrichment jobs yet. Use /enrich <domain> to queue one.';
        }
        const lines = jobs.map((j: any) => {
          const d = (j.domain || j.canonicalUrl || j.accountKey || '?').replace(/^https?:\/\//, '').replace(/\/$/, '');
          const when = j.updatedAt ? new Date(j.updatedAt).toISOString().slice(0, 10) : '?';
          return `• ${d} — ${j.status || '?'} (${when})`;
        }).join('\n');
        return `<b>Recent enrichment jobs</b>\n\n${lines}`;
      }

      case 'network_updates': {
        const { fetchMoltbookActivity } = await import('../lib/moltbookAdapter.ts');
        const { fetchRecentCommunityPostsForSummary, createCommunitySource, createCommunityPostRaw } = await import('../lib/sanity.ts');

        const sections: string[] = [];
        const live = await fetchMoltbookActivity(env);
        if (live.length > 0) {
          await createCommunitySource(env, {
            _type: 'communitySource',
            _id: 'communitySource.moltbook',
            name: 'Moltbook',
            type: 'moltbook',
            baseUrl: (env?.MOLTBOOK_BASE_URL || 'https://moltbook.local').toString().replace(/\/$/, ''),
            topics: ['network'],
          });
          for (const post of live.slice(0, 15)) {
            try {
              await createCommunityPostRaw(env, {
                _type: 'communityPostRaw',
                _id: `communityPostRaw.${post.externalId}`,
                sourceRef: { _type: 'reference', _ref: 'communitySource.moltbook' },
                externalId: post.externalId,
                url: post.url,
                author: post.author,
                createdAt: post.createdAt,
                rawText: post.rawText,
                rawJson: post.rawJson || {},
                fetchedAt: new Date().toISOString(),
              });
            } catch (_) {
              // ignore duplicate or storage errors
            }
          }
          const liveLines = live.slice(0, 10).map((p: any) => {
            const preview = (p.rawText || '').slice(0, 120).replace(/\n/g, ' ');
            return `• <b>${(p.author || 'bot').toString().replace(/</g, '&lt;')}</b>: ${preview}${preview.length >= 120 ? '…' : ''}`;
          }).join('\n');
          sections.push('<b>Live from Moltbook</b> (what the network is doing)\n\n' + liveLines);
        }

        let stored: any[] = [];
        try {
          stored = await fetchRecentCommunityPostsForSummary(env, { limit: 12, sinceHours: 168 });
        } catch (_) {
          // Sanity may not have community types
        }
        if (stored.length > 0) {
          const storedLines = stored.slice(0, 8).map((p: any) => {
            const summary = p.sanitized?.sanitizedSummary || (p.rawText || '').slice(0, 100).replace(/\n/g, ' ');
            const author = p.author || 'agent';
            const when = p.fetchedAt ? new Date(p.fetchedAt).toISOString().slice(0, 10) : '';
            return `• ${author}${when ? ` (${when})` : ''}: ${summary}…`;
          }).join('\n');
          sections.push('<b>Stored insights</b> (last 7 days)\n\n' + storedLines);
        }

        if (sections.length === 0) {
          return (
            '<b>Network / Moltbook updates</b>\n\n' +
            'No activity yet. To connect Moltbook:\n' +
            '1. Set <code>MOLTBOOK_BASE_URL</code> to your Moltbook API (e.g. https://moltbook.example.com).\n' +
            '2. Ensure it exposes <code>/api/activity</code> or <code>/api/feed</code> (JSON array).\n' +
            '3. Or run <code>POST /moltbook/fetch</code> with <code>{"topics":["network"]}</code> to seed from the adapter.'
          );
        }
        const totalPosts = live.length + (stored?.length || 0);
        const takeaway = `📡 ${totalPosts} update(s) from the network. Ask "/teach" or "what's on the cutting edge" for a research summary.\n\n`;
        return '<b>Network updates & insights</b>\n\n' + takeaway + sections.join('\n\n');
      }

      case 'network_teach': {
        const { fetchMoltbookActivity } = await import('../lib/moltbookAdapter.ts');
        const { fetchRecentCommunityPostsForSummary, createCommunitySource, createCommunityPostRaw } = await import('../lib/sanity.ts');
        const live = await fetchMoltbookActivity(env);
        if (live.length > 0) {
          try {
            await createCommunitySource(env, {
              _type: 'communitySource',
              _id: 'communitySource.moltbook',
              name: 'Moltbook',
              type: 'moltbook',
              baseUrl: (env?.MOLTBOOK_BASE_URL || 'https://moltbook.local').toString().replace(/\/$/, ''),
              topics: ['network'],
            });
            for (const post of live.slice(0, 15)) {
              try {
                await createCommunityPostRaw(env, {
                  _type: 'communityPostRaw',
                  _id: `communityPostRaw.${post.externalId}`,
                  sourceRef: { _type: 'reference', _ref: 'communitySource.moltbook' },
                  externalId: post.externalId,
                  url: post.url,
                  author: post.author,
                  createdAt: post.createdAt,
                  rawText: post.rawText,
                  rawJson: post.rawJson || {},
                  fetchedAt: new Date().toISOString(),
                });
              } catch (_) {}
            }
          } catch (_) {}
        }
        let stored: any[] = [];
        try {
          stored = await fetchRecentCommunityPostsForSummary(env, { limit: 12, sinceHours: 168 });
        } catch (_) {}
        return buildTeachingSummary(live, stored);
      }

      case 'network_trends': {
        return await buildTrendsSummary(env);
      }

      case 'moltbook_post': {
        const msg = parsed.moltbookMessage?.trim();
        if (!msg || msg.length === 0) {
          return 'Nothing to post. Try: /moltbook post <message> or "post to moltbook: your message"';
        }
        const { handleMoltbookApiActivityPost } = await import('../routes/moltbook.ts');
        const req = new Request('https://internal/moltbook/api/activity', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: msg.slice(0, 2000),
            author: 'telegram',
            createdAt: new Date().toISOString(),
          }),
        });
        const res = await handleMoltbookApiActivityPost(req, requestId, env);
        const json = (await res.json()) as { ok?: boolean; error?: string; data?: { appended?: number; total?: number } };
        if (!res.ok || !json.ok) {
          return json.error || 'Failed to post to Moltbook. (Is MOLTBOOK_ACTIVITY_KV bound?)';
        }
        const appended = json.data?.appended ?? 1;
        const total = json.data?.total ?? 0;
        return `Posted to Moltbook. (${appended} item(s); ${total} total in feed.)`;
      }

      case 'status':
        return '<b>Status</b>\n✅ Sanity connected\nWorker: ✅ OK';

      case 'help':
        return getHelpText();

      default:
        return (
          "I didn't quite get that. You can talk to me like this:\n\n" +
          '• "What do we know about example.com"\n' +
          '• "Look up Stripe" / "Tell me about acme.com"\n' +
          '• "Enrich example.com" / "Who are their competitors?"\n' +
          '• "People at example.com" / "Compare a.com and b.com"\n' +
          '• "Good morning" / "Recent captures" / "Patterns" / "What\'s happening in the network"\n\n' +
          'Or type /help for all commands.'
        );
    }
  } catch (err: any) {
    console.error('[Telegram] executeTool error:', err);
    return 'Error: ' + (err?.message || 'Unknown');
  }
}
