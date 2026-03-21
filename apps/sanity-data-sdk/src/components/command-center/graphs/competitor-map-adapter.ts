/**
 * competitor-map-adapter.ts — Transform competitor research data into graph props.
 *
 * Data source: GET /competitors/research?accountKey=X
 * Response shape: { research: { comparison: { competitors: [...] } } }
 *
 * Production reality:
 *   - Most accounts have no competitor data (empty state is common)
 *   - When data exists: name, domain, overlapScore, strengths, weaknesses
 *   - No funding or teamSize in the API response — defaults used
 *   - Name may be missing — fall back to domain with TLD stripped
 */

// ── Types ───────────────────────────────────────────────────────────

export interface MapCompetitor {
  domain: string;
  name: string;
  threat: number;       // 0-1, Y-axis position
  similarity: number;   // 0-1, X-axis position (from overlapScore)
  funding: string;      // Display string — "Unknown" when not available
  teamSize: number;     // Bubble radius — default 50 when not available
  overlap: string[];    // Shared categories for overlap lines
}

export interface CompetitorMapProps {
  competitors: MapCompetitor[];
  onCompetitorClick: (domain: string) => void;
  width: number;
  height: number;
}

// ── Raw API Types ───────────────────────────────────────────────────

interface RawCompetitor {
  name?: string;
  domain?: string;
  overlapScore?: number;
  strengths?: string[];
  weaknesses?: string[];
}

// ── Adapter ─────────────────────────────────────────────────────────

/**
 * Transform competitor research response into graph props.
 *
 * Threat derivation:
 *   - overlapScore contributes 60% (how similar they are)
 *   - strengths count contributes 40% (how capable they are)
 *   - Capped at 1.0
 *
 * Similarity = overlapScore directly (0-1).
 */
export function deriveCompetitorMap(
  competitors: RawCompetitor[],
): MapCompetitor[] {
  if (!Array.isArray(competitors) || competitors.length === 0) return [];

  return competitors
    .filter((c) => c.domain || c.name) // skip entries with no identifier
    .map((comp) => {
      const similarity = comp.overlapScore ?? 0.5;
      const strengthCount = comp.strengths?.length ?? 0;
      const threat = Math.min(1, similarity * 0.6 + (strengthCount / 5) * 0.4);

      return {
        domain: comp.domain ?? '',
        name: comp.name ?? (comp.domain?.replace(/\..+$/, '') ?? 'Unknown'),
        threat,
        similarity,
        funding: 'Unknown',   // GAP: not in API response
        teamSize: 50,         // GAP: not in API response, default
        overlap: comp.strengths ?? [], // Use strengths as overlap categories
      };
    });
}
