/**
 * tech-radar-adapter.ts — Transform tech stack data into radar chart categories.
 *
 * Data source: account.technologyStack (Record<string, string[]>)
 * Each category gets ourScore (placeholder 0.5) and prospectScore (from count).
 * Gap detection: prospect leads by >20%.
 */

import type { TechCategory } from '../../../lib/adapters/techstack';

export interface RadarCategory {
  name: string;
  ourScore: number;       // 0-1, our strength (placeholder until product data exists)
  prospectScore: number;  // 0-1, prospect's adoption (normalized from tech count)
  hasGap: boolean;        // true if prospect leads by >20%
}

/**
 * Transform TechCategory[] into RadarCategory[] for the spider chart.
 * Normalizes tech counts to 0-1 scale based on max category size.
 */
export function deriveRadarCategories(categories: TechCategory[]): RadarCategory[] {
  if (!categories || categories.length === 0) return [];

  const maxCount = Math.max(1, ...categories.map((c) => c.count));

  return categories.map((cat) => {
    const prospectScore = cat.count / maxCount;
    const ourScore = 0.5; // Placeholder — no "our product" data yet
    const hasGap = prospectScore > ourScore + 0.2;

    return {
      name: cat.category,
      ourScore,
      prospectScore,
      hasGap,
    };
  });
}

/**
 * Summary string for the radar chart.
 */
export function radarSummary(categories: RadarCategory[]): string {
  const gaps = categories.filter((c) => c.hasGap);
  if (gaps.length === 0) return 'No significant gaps detected';
  return `${gaps.length} gap${gaps.length > 1 ? 's' : ''}: ${gaps.map((g) => g.name).join(', ')}`;
}
