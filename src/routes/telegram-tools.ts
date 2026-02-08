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
  | 'status'
  | 'help'
  | 'unknown';

export interface ParsedIntent {
  intent: Intent;
  domains?: string[];
  tech?: string;
  industry?: string;
}

/** Phrase patterns for natural language. Order matters — first match wins. */
const INTENT_PATTERNS: { intent: Intent; patterns: RegExp[] }[] = [
  { intent: 'compare', patterns: [/compare\s+(.+?)\s+(?:and|vs\.?|vs)\s+(.+)/i] },
  { intent: 'competitors', patterns: [/competitors?\s+(?:of|for)?\s*(.+)/i, /who\s+(?:are\s+)?(.+?)'?s?\s+competitors/i] },
  { intent: 'enrich_account', patterns: [/enrich\s+(.+)/i, /fill\s+(?:in\s+)?gaps?\s+(?:for\s+)?(.+)/i, /run\s+enrichment\s+(?:on\s+)?(.+)/i, /update\s+(.+)/i] },
  { intent: 'accounts_by_tech', patterns: [/accounts?\s+using\s+(.+)/i, /who\s+uses?\s+(.+)/i, /companies?\s+with\s+(.+)/i, /(.+)\s+accounts/i] },
  { intent: 'person_lookup', patterns: [/people\s+at\s+(.+)/i, /leadership\s+(?:at\s+)?(.+)/i, /who\s+works?\s+(?:at\s+)?(.+)/i, /contacts?\s+(?:at\s+)?(.+)/i] },
  { intent: 'account_lookup', patterns: [/what\s+(?:do\s+we\s+)?know\s+about\s+(.+)/i, /look\s+up\s+(.+)/i, /tell\s+me\s+about\s+(.+)/i, /recall\s+(.+)/i, /summarize\s+(.+)/i, /find\s+patterns?\s+for\s+(.+)/i] },
  { intent: 'recent_captures', patterns: [/recent\s+captures?/i, /latest\s+captures?/i, /last\s+captures?/i] },
  { intent: 'sdr_briefing', patterns: [/good\s+morning/i, /daily\s+briefing/i, /sdr\s+briefing/i, /morning\s+brief/i] },
  { intent: 'patterns', patterns: [/^patterns?$/i, /show\s+patterns?/i, /tech\s+patterns?/i] },
  { intent: 'status', patterns: [/^status$/i, /^health$/i, /system\s+status/i] },
  { intent: 'help', patterns: [/^help$/i, /what\s+can\s+you\s+do/i, /how\s+do\s+i\s+use/i] },
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

  return { intent: 'unknown' };
}

/** Get help text with all supported phrases */
export function getHelpText(): string {
  return (
    '<b>Molt Content OS Bot</b>\n\n' +
    '<b>Just say it:</b>\n' +
    '• "what do we know about example.com" — account summary\n' +
    '• "enrich fleetfeet.com" — run enrichment\n' +
    '• "competitors of Acme" — competitor research\n' +
    '• "compare X and Y" — side-by-side\n' +
    '• "accounts using React" — tech lookup\n' +
    '• "people at example.com" — leadership\n' +
    '• "patterns" — tech & pain point correlations\n' +
    '• "good morning" — daily briefing\n' +
    '• "recent captures" — latest extension captures\n\n' +
    '<b>Commands:</b> /start /help /patterns /status'
  );
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
        const account = (await groqQuery(
          client,
          `*[_type == "account" && (rootDomain == $d || domain == $d || accountKey == $d)][0]{
            domain,
            rootDomain,
            companyName,
            "technologies": technologies[]->{name},
            painPoints,
            profileCompleteness
          }`,
          { d: domain },
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
        return `Enrichment queued for ${domain}. Profile will update shortly.`;
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
        const json = await res.json();
        if (!json.ok) return json.error?.message || 'Competitor research failed.';
        const comps = (json.data?.competitors || []).slice(0, 5).map((c: any) => c.name || c.domain || '?').join(', ');
        return `<b>Competitors of ${domain}</b>\n\n${comps || 'No competitors found.'}`;
      }

      case 'compare': {
        const domains = parsed.domains?.filter(Boolean) || [];
        if (domains.length < 2) return 'Compare two accounts: "compare X and Y"';
        const { handleCompareAccounts } = await import('../handlers/analytics.js');
        const req = syntheticRequest({ domains });
        const res = await handleCompareAccounts(req, requestId, env, groqQuery, assertSanityConfigured);
        const json = await res.json();
        if (!json.ok) return json.error?.message || 'Comparison failed.';
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
        const json = await res.json();
        if (!json.ok) return json.error?.message || 'Briefing failed.';
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

      case 'status':
        return '<b>Status</b>\n✅ Sanity connected\nWorker: ✅ OK';

      case 'help':
        return getHelpText();

      default:
        return 'Unknown command. Use /help to see what I can do.';
    }
  } catch (err: any) {
    console.error('[Telegram] executeTool error:', err);
    return 'Error: ' + (err?.message || 'Unknown');
  }
}
