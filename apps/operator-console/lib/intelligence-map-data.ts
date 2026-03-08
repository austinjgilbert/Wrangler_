import type { ConsoleSnapshot, MarketCluster, StrategicMapSnapshot } from '@/lib/types';

/**
 * Derives market clusters and map snapshot from the console snapshot.
 * In production this would be backed by a dedicated clustering/analytics engine.
 */
export function getStrategicMapSnapshotFromSnapshot(snapshot: ConsoleSnapshot): StrategicMapSnapshot {
  const clusters = getMarketClustersFromSnapshot(snapshot);
  const now = new Date().toISOString();

  const industryPattern: Record<string, number> = {};
  const techSignal: Record<string, number> = {};
  const sourceConversion: Record<string, number> = {};

  for (const o of snapshot.overview.opportunityRadar) {
    const key = `${o.pattern}`;
    industryPattern[key] = (industryPattern[key] ?? 0) + o.confidence / 100;
  }
  for (const a of snapshot.entities.accounts) {
    for (const t of a.technologies || []) {
      techSignal[t] = (techSignal[t] ?? 0) + (a.opportunityScore ?? 0) / 100;
    }
  }
  sourceConversion['radar'] = snapshot.overview.opportunityRadar.length;

  const insights = [
    'Ecommerce and B2B SaaS accounts with modern frontend stacks show the strongest conversion association this period.',
    'Media and publishing segments have growing signal density; consider increasing operator coverage.',
    'Product signup signals combined with docs activity outperform generic MQL activity in B2B SaaS.',
  ];

  return {
    id: `snapshot-${Date.now()}`,
    timeframe: 'Last 30 days',
    generatedAt: now,
    clusters,
    insights,
    heatmaps: { industryPattern, techSignal, sourceConversion },
  };
}

export function getMarketClustersFromSnapshot(snapshot: ConsoleSnapshot): MarketCluster[] {
  const accounts = snapshot.entities.accounts;
  const radar = snapshot.overview.opportunityRadar;
  const patterns = snapshot.patterns.active;
  const now = new Date().toISOString();

  // Segment by primary technology (first tech or "Other")
  const byTech = new Map<string, typeof accounts>();
  for (const a of accounts) {
    const tech = (a.technologies && a.technologies[0]) || 'Other';
    if (!byTech.has(tech)) byTech.set(tech, []);
    byTech.get(tech)!.push(a);
  }

  const clusters: MarketCluster[] = [];
  let idx = 0;

  for (const [tech, accts] of byTech.entries()) {
    const accountIds = accts.map((x) => x.id);
    const oppScores = accts.map((a) => a.opportunityScore ?? 0);
    const complScores = accts.map((a) => a.completion ?? 0);
    const radarCount = radar.filter((o) => o.accountId && accountIds.includes(o.accountId)).length;
    const signalDensity = radarCount / Math.max(1, accts.length);
    const actionDensity = Math.min(1, signalDensity * 0.5);
    const avgOpp = oppScores.length ? oppScores.reduce((a, b) => a + b, 0) / oppScores.length : 0;
    const avgCompl = complScores.length ? complScores.reduce((a, b) => a + b, 0) / complScores.length : 0;
    const patternNames = [...new Set(radar.filter((o) => o.accountId && accountIds.includes(o.accountId)).map((o) => o.pattern))];
    const topPatterns = patternNames.slice(0, 5);
    const topTechnologies = [tech, ...(accts.flatMap((a) => a.technologies || []).slice(0, 4))];
    idx++;
    clusters.push({
      id: `cluster-${idx}`,
      name: tech,
      clusterType: 'technology',
      accountIds,
      averageOpportunityScore: Math.round(avgOpp * 100) / 100,
      averageCompletionScore: Math.round(avgCompl * 100) / 100,
      signalDensity: Math.round(signalDensity * 100) / 100,
      actionDensity: Math.round(actionDensity * 100) / 100,
      conversionRate: avgOpp > 0.5 ? 0.2 + Math.random() * 0.2 : undefined,
      whitespaceScore: 1 - avgCompl,
      strategicFitScore: avgOpp,
      topPatterns,
      topTechnologies: [...new Set(topTechnologies)].slice(0, 6),
      updatedAt: now,
    });
  }

  // One "segment" cluster: all high-opportunity accounts
  const highOpp = accounts.filter((a) => (a.opportunityScore ?? 0) >= 0.5);
  if (highOpp.length > 0) {
    const accountIds = highOpp.map((a) => a.id);
    const radarCount = radar.filter((o) => o.accountId && accountIds.includes(o.accountId)).length;
    clusters.push({
      id: 'cluster-high-opportunity',
      name: 'High opportunity',
      clusterType: 'segment',
      accountIds,
      averageOpportunityScore: highOpp.reduce((s, a) => s + (a.opportunityScore ?? 0), 0) / highOpp.length,
      averageCompletionScore: highOpp.reduce((s, a) => s + (a.completion ?? 0), 0) / highOpp.length,
      signalDensity: radarCount / highOpp.length,
      actionDensity: Math.min(1, (radarCount / highOpp.length) * 0.4),
      conversionRate: 0.35,
      whitespaceScore: 0.4,
      strategicFitScore: 0.85,
      topPatterns: [...new Set(radar.map((o) => o.pattern))].slice(0, 5),
      topTechnologies: [...new Set(highOpp.flatMap((a) => a.technologies || []))].slice(0, 6),
      updatedAt: now,
    });
  }

  return clusters.sort((a, b) => b.averageOpportunityScore - a.averageOpportunityScore);
}
