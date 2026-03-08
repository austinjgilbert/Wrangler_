import type { ConsoleSnapshot, TerritorySegment, TerritoryRep } from '@/lib/types';
import { getMarketClustersFromSnapshot } from '@/lib/intelligence-map-data';

/**
 * Derives territory segments from snapshot (clusters as segments).
 * In production would include saved segments and rep assignments from API.
 */
export function getTerritorySegmentsFromSnapshot(snapshot: ConsoleSnapshot): TerritorySegment[] {
  const clusters = getMarketClustersFromSnapshot(snapshot);
  const now = new Date().toISOString();
  return clusters.map((c, i) => ({
    id: c.id,
    name: c.name,
    description: `${c.clusterType} segment · ${c.accountIds.length} accounts`,
    accountIds: c.accountIds,
    ownerId: null,
    ownerName: null,
    source: 'cluster' as const,
    opportunityScore: c.averageOpportunityScore,
    updatedAt: now,
  }));
}

/**
 * Derives reps from segments (placeholder: one "Unassigned" rep for all unowned segments).
 */
export function getTerritoryRepsFromSnapshot(snapshot: ConsoleSnapshot): TerritoryRep[] {
  const segments = getTerritorySegmentsFromSnapshot(snapshot);
  const unassigned = segments.filter((s) => !s.ownerId);
  return [
    { id: 'unassigned', name: 'Unassigned', segmentIds: unassigned.map((s) => s.id), accountCount: unassigned.reduce((n, s) => n + s.accountIds.length, 0) },
  ];
}
