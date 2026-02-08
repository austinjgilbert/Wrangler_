/**
 * Derive reusable insights from enriched data.
 */

export function derivePatternInsights({
  accounts,
  people,
  technologies,
}: {
  accounts: any[];
  people: any[];
  technologies: any[];
}) {
  const techCounts: Record<string, number> = {};
  for (const acc of accounts) {
    (acc.techStack || []).forEach((t: string) => {
      techCounts[t] = (techCounts[t] || 0) + 1;
    });
  }

  const roleCounts: Record<string, number> = {};
  for (const person of people) {
    const role = person.roleCategory || 'unknown';
    roleCounts[role] = (roleCounts[role] || 0) + 1;
  }

  const topTech = Object.entries(techCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const topRoles = Object.entries(roleCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);

  return {
    topTech,
    topRoles,
    insights: [
      `Top technologies: ${topTech.map((t) => `${t[0]} (${t[1]})`).join(', ')}`,
      `Top roles: ${topRoles.map((r) => `${r[0]} (${r[1]})`).join(', ')}`,
    ],
  };
}

/**
 * Molt Growth Loop pattern engine.
 * Patterns:
 * 1) reply rates by persona tag
 * 2) reply rates by industry tag
 * 3) best-performing message length bucket
 * 4) best-performing CTA type
 * 5) best channel by persona
 */

function lengthBucket(text: string) {
  const len = (text || '').length;
  if (len < 80) return 'short';
  if (len < 160) return 'medium';
  return 'long';
}

function ctaType(text: string) {
  const t = (text || '').toLowerCase();
  if (t.includes('call') || t.includes('chat')) return 'call';
  if (t.includes('demo')) return 'demo';
  if (t.includes('reply') || t.includes('thoughts')) return 'reply';
  return 'other';
}

export function updatePatternsFromEvent({
  event,
  person,
  account,
  existingPatterns,
}: {
  event: any;
  person?: any;
  account?: any;
  existingPatterns: Record<string, any>;
}) {
  const outcome = (event.outcome || '').toLowerCase();
  const isReply = outcome.includes('reply') || outcome.includes('positive');
  const text = event?.payload?.text || '';
  const bucket = lengthBucket(text);
  const cta = ctaType(text);
  const channel = event.channel || 'unknown';

  const updates: Record<string, any> = { ...existingPatterns };

  const personaTag = (person?.roleCategory || (person?.tags || [])[0] || 'unknown').toLowerCase();
  const industryTag = (account?.industry || (account?.tags || [])[0] || 'unknown').toLowerCase();

  function bump(patternKey: string, key: string) {
    if (!updates[patternKey]) updates[patternKey] = { counts: {}, replies: {} };
    updates[patternKey].counts[key] = (updates[patternKey].counts[key] || 0) + 1;
    if (isReply) {
      updates[patternKey].replies[key] = (updates[patternKey].replies[key] || 0) + 1;
    }
  }

  bump('reply_by_persona', personaTag);
  bump('reply_by_industry', industryTag);
  bump('reply_by_length', bucket);
  bump('reply_by_cta', cta);
  bump('reply_by_channel', `${personaTag}:${channel}`);

  return updates;
}

export function buildPatternSuggestions(patterns: Record<string, any>) {
  const suggestions: string[] = [];

  function bestKey(patternKey: string) {
    const pattern = patterns[patternKey];
    if (!pattern || !pattern.counts) return null;
    let best = null;
    for (const key of Object.keys(pattern.counts)) {
      const replies = pattern.replies?.[key] || 0;
      const rate = replies / pattern.counts[key];
      if (!best || rate > best.rate) best = { key, rate };
    }
    return best;
  }

  const bestPersona = bestKey('reply_by_persona');
  if (bestPersona) suggestions.push(`Best persona: ${bestPersona.key} (${Math.round(bestPersona.rate * 100)}% reply rate)`);

  const bestIndustry = bestKey('reply_by_industry');
  if (bestIndustry) suggestions.push(`Best industry: ${bestIndustry.key} (${Math.round(bestIndustry.rate * 100)}% reply rate)`);

  const bestLength = bestKey('reply_by_length');
  if (bestLength) suggestions.push(`Best message length: ${bestLength.key}`);

  const bestCta = bestKey('reply_by_cta');
  if (bestCta) suggestions.push(`Best CTA: ${bestCta.key}`);

  const bestChannel = bestKey('reply_by_channel');
  if (bestChannel) suggestions.push(`Best channel by persona: ${bestChannel.key}`);

  return suggestions;
}
