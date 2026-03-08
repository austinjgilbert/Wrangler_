import type { ConsoleSnapshot, DiscoveredPattern, PatternInsight } from '@/lib/types';

/**
 * Derives discovered patterns and insights from the console snapshot.
 * In production this would be backed by a dedicated discovery engine.
 */
export function getDiscoveredPatternsFromSnapshot(snapshot: ConsoleSnapshot): DiscoveredPattern[] {
  const radar = snapshot.overview.opportunityRadar;
  const accounts = snapshot.entities.accounts;
  const patterns = snapshot.patterns.active;
  const now = new Date().toISOString();
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // Group opportunities by pattern name and collect signals/tech/personas
  const byPattern = new Map<
    string,
    { pattern: string; signals: Set<string>; accounts: Set<string>; confidences: number[]; accountNames: string[] }
  >();

  for (const o of radar) {
    const key = o.pattern || 'Unnamed pattern';
    if (!byPattern.has(key)) {
      byPattern.set(key, {
        pattern: key,
        signals: new Set(),
        accounts: new Set(),
        confidences: [],
        accountNames: [],
      });
    }
    const g = byPattern.get(key)!;
    g.signals.add(o.signal);
    if (o.accountId) g.accounts.add(o.accountId);
    g.accountNames.push(o.accountName);
    g.confidences.push(o.confidence);
  }

  // Build tech set from accounts that appear in radar
  const radarAccountIds = new Set(radar.map((o) => o.accountId).filter(Boolean) as string[]);
  const accountTech = new Map<string, string[]>();
  for (const a of accounts) {
    if (radarAccountIds.has(a.id)) accountTech.set(a.id, a.technologies || []);
  }

  const knownPatternIds = new Set(patterns.map((p) => p.type));
  const discovered: DiscoveredPattern[] = [];
  let idx = 0;

  for (const [name, g] of byPattern.entries()) {
    const supportCount = g.accounts.size || g.accountNames.length;
    const avgConfidence = g.confidences.length ? g.confidences.reduce((a, b) => a + b, 0) / g.confidences.length : 0;
    const allTech = new Set<string>();
    for (const aid of g.accounts) {
      (accountTech.get(aid) || []).forEach((t) => allTech.add(t));
    }
    const isKnown = knownPatternIds.has(name);
    idx++;
    discovered.push({
      id: `discovered-${idx}`,
      name: name,
      description: `Emerging pattern: ${name}. Observed across ${supportCount} accounts with signals: ${[...g.signals].slice(0, 3).join(', ')}.`,
      patternType: isKnown ? 'validated' : 'emerging',
      sourceSignals: [...g.signals],
      sourceTechnologies: [...allTech],
      sourcePersonas: [], // snapshot has no persona labels; could derive from people titles
      sourceIndustries: [], // snapshot has no industry; could add from enrichment
      matchedAccounts: [...g.accounts],
      supportCount,
      conversionAssociation: Math.min(0.95, 0.2 + avgConfidence / 120),
      confidence: Math.round(avgConfidence),
      noveltyScore: isKnown ? 0.3 : 0.8,
      recencyScore: 0.7,
      status: 'suggested',
      createdAt: weekAgo,
      lastValidatedAt: now,
    });
  }

  // Sort by support count then confidence
  discovered.sort((a, b) => b.supportCount - a.supportCount || b.confidence - a.confidence);
  return discovered;
}

export function getPatternInsightsFromSnapshot(
  snapshot: ConsoleSnapshot,
  patternId: string
): PatternInsight[] {
  const insights: PatternInsight[] = [];
  const now = new Date().toISOString();

  const pattern = snapshot.patterns.active.find((p) => p.id === patternId || p.type === patternId);
  if (pattern) {
    insights.push({
      id: `insight-${patternId}-1`,
      patternId,
      insightType: 'high-conversion',
      summary: `Pattern "${pattern.type}" shows ${pattern.conversionAssociation} conversion association with ${pattern.matchFrequency} matches.`,
      evidence: ['Active pattern in engine', `Lifecycle: ${pattern.lifecycleState}`],
      confidence: Math.round((pattern.conversionAssociation ?? 0) * 100),
      createdAt: now,
    });
  }

  insights.push({
    id: `insight-${patternId}-2`,
    patternId,
    insightType: 'emerging-cluster',
    summary: 'This pattern appears across multiple accounts with similar signal combinations.',
    evidence: ['Derived from opportunity radar co-occurrence'],
    confidence: 72,
    createdAt: now,
  });

  return insights;
}
