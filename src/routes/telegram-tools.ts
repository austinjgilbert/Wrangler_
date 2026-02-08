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
  | 'status'
  | 'help'
  | 'unknown';

export interface ParsedIntent {
  intent: Intent;
  domains?: string[];
  tech?: string;
  industry?: string;
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
    '/status — system health\n\n' +
    '<b>Or just say it</b>\n' +
    '• "what do we know about example.com"\n' +
    '• "enrich fleetfeet.com" • "competitors of Acme"\n' +
    '• "compare X and Y" • "people at example.com"\n' +
    '• "accounts using React" • "good morning" • "recent captures"\n\n' +
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
    case 'accounts_by_tech':
      return `${base}/account-page`;
    default:
      return null;
  }
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
        return '<b>Network updates & insights</b>\n\n' + sections.join('\n\n');
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
