/**
 * Scoring utilities for Network Conversation Engine.
 * Assumptions:
 * - tier is one of "A", "B", "C", "D" (or numeric string); A is highest.
 * - relationshipStrength is 0-100 (fallback to 50 if missing).
 * - signalStrength is 0-100 (computed in matching).
 */

export function normalizeTier(tier: string | number | undefined): number {
  if (typeof tier === 'number') return Math.max(0, Math.min(1, tier / 100));
  const t = (tier || '').toString().toUpperCase();
  const map: Record<string, number> = { A: 1.0, B: 0.75, C: 0.5, D: 0.25 };
  return map[t] ?? 0.5;
}

export function normalizeRelationshipStrength(value: number | undefined): number {
  const v = typeof value === 'number' ? value : 50;
  return Math.max(0, Math.min(1, v / 100));
}

export function computeRecencyScore(signalDateIso: string): number {
  const now = Date.now();
  const signalTime = new Date(signalDateIso).getTime();
  const hours = Math.max(0, (now - signalTime) / (1000 * 60 * 60));
  // 72h half-life-ish: recent signals matter more.
  return Math.max(0, 1 - hours / 72);
}

export function computeFatiguePenalty(lastTouchedAt?: string, lastSuggestedAt?: string): number {
  const now = Date.now();
  const touchDays = lastTouchedAt ? (now - new Date(lastTouchedAt).getTime()) / (1000 * 60 * 60 * 24) : 999;
  const suggestedDays = lastSuggestedAt ? (now - new Date(lastSuggestedAt).getTime()) / (1000 * 60 * 60 * 24) : 999;
  const minDays = Math.min(touchDays, suggestedDays);
  // If touched/suggested within 7 days, apply strong penalty.
  if (minDays < 2) return 0.15;
  if (minDays < 7) return 0.4;
  if (minDays < 14) return 0.7;
  return 1.0;
}

export function computeVarietyPenalty(recentCount: number): number {
  // Penalize if the person appears too often in recent starters.
  if (recentCount >= 3) return 0.4;
  if (recentCount === 2) return 0.7;
  if (recentCount === 1) return 0.85;
  return 1.0;
}

export function computeRelevanceScore({
  signalDate,
  tier,
  relationshipStrength,
  signalStrength,
  lastTouchedAt,
  lastSuggestedAt,
  recentStarterCount,
}: {
  signalDate: string;
  tier?: string | number;
  relationshipStrength?: number;
  signalStrength: number;
  lastTouchedAt?: string;
  lastSuggestedAt?: string;
  recentStarterCount: number;
}): number {
  const recency = computeRecencyScore(signalDate);
  const tierScore = normalizeTier(tier);
  const relationship = normalizeRelationshipStrength(relationshipStrength);
  const signalScore = Math.max(0, Math.min(1, signalStrength / 100));
  const fatigue = computeFatiguePenalty(lastTouchedAt, lastSuggestedAt);
  const variety = computeVarietyPenalty(recentStarterCount);

  // Weighted sum (documented and deterministic):
  // recency 30%, tier 20%, relationship 15%, signalStrength 25%, fatigue*variety 10%
  const base =
    recency * 0.3 +
    tierScore * 0.2 +
    relationship * 0.15 +
    signalScore * 0.25 +
    (fatigue * variety) * 0.1;

  return Math.round(base * 100);
}

/**
 * Priority scoring for DQ findings and enrichment jobs.
 * Higher severity + older data + missing core fields => higher priority.
 */
export function computeDqPriority({
  severity,
  missingCoreField,
  staleDays,
}: {
  severity: 'low' | 'med' | 'high';
  missingCoreField: boolean;
  staleDays: number;
}): number {
  const severityScore = severity === 'high' ? 90 : severity === 'med' ? 65 : 40;
  const missingScore = missingCoreField ? 15 : 0;
  const staleScore = Math.min(30, Math.max(0, Math.floor(staleDays / 10)));
  return Math.min(100, severityScore + missingScore + staleScore);
}
