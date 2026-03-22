/**
 * signal-timeline-adapter.ts — Transform flat signal strings into timeline data.
 *
 * Production reality:
 *   - account.signals[] is string[] — flat text, no types, no timestamps
 *   - Type is INFERRED via keyword matching (confidence locked at 0.5)
 *   - All signals land on day 0 (no timestamp granularity)
 *   - This is the "degraded mode" — honest about data quality
 *
 * Phase 2 (when signal docs ship):
 *   - Signal docs have: signalType, strength, confidence, observedAt, expiresAt
 *   - Adapter switches to direct mapping — no inference needed
 *   - Timeline spreads across real dates with density curve
 */

// ── Types ───────────────────────────────────────────────────────────

export type SignalType =
  | 'funding'
  | 'hiring'
  | 'tech-change'
  | 'expansion'
  | 'engagement'
  | 'churn';

// ── Decay Constants ─────────────────────────────────────────────────
// Duplicated from src/lib/signalIngestion.ts SIGNAL_HALF_LIFE_HOURS.
// 15 lines of pure math — not worth a cross-package import.
// Maps SDK signal types → half-life in hours for exponential decay.

export const SIGNAL_HALF_LIFE_HOURS: Record<string, number> = {
  'funding':     24 * 14,   // ~job_posting: long-lived business event
  'hiring':      24 * 14,   // ~job_posting: hiring signals persist
  'tech-change': 24 * 7,    // ~website_scan: tech changes are durable
  'expansion':   24 * 7,    // ~operator_note: expansion news persists
  'engagement':  48,         // ~pricing_page_visit: engagement decays fast
  'churn':       72,         // ~intent_spike: churn risk is urgent
};

const DEFAULT_HALF_LIFE_HOURS = 24 * 7; // 7 days fallback

/**
 * Exponential decay: baseStrength × 0.5^(ageHours / halfLifeHours)
 * Same formula as Worker's calculateDecayedSignalStrength.
 */
export function decayedStrength(
  baseStrength: number,
  signalType: string,
  detectedAt: string,
  now?: string,
): number {
  const nowMs = now ? new Date(now).getTime() : Date.now();
  const detectedMs = new Date(detectedAt).getTime();
  const ageHours = Math.max(0, (nowMs - detectedMs) / (1000 * 60 * 60));
  const halfLife = SIGNAL_HALF_LIFE_HOURS[signalType] ?? DEFAULT_HALF_LIFE_HOURS;
  return Math.max(0, Math.min(1, baseStrength * Math.pow(0.5, ageHours / halfLife)));
}

export interface TimelineSignal {
  id: string;
  day: number;            // Days ago (0 = today). All 0 in degraded mode.
  account: string;
  accountKey: string;
  type: SignalType;
  text: string;
  confidence: number;     // 0-1. Locked at 0.5 in degraded mode.
  strength: number;       // 0-1. Locked at 0.5 in degraded mode.
  isActive: boolean;
  detectedAt: string;     // ISO date string
  expiresAt?: string;     // ISO date string — enables decay visualization
}

export interface SignalTimelineProps {
  signals: TimelineSignal[];
  days: number;
  onSignalClick: (signal: TimelineSignal) => void;
  width: number;
  height: number;
}

export interface SpikeCallout {
  day: number;
  count: number;
  accounts: string[];
}

// ── Type Colors ─────────────────────────────────────────────────────

export const SIGNAL_TYPE_COLORS: Record<SignalType, string> = {
  'funding': '#ef4444',
  'hiring': '#22c55e',
  'tech-change': '#3b82f6',
  'expansion': '#8b5cf6',
  'engagement': '#06b6d4',
  'churn': '#f97316',
};

// ── Keyword Inference ───────────────────────────────────────────────

const SIGNAL_TYPE_KEYWORDS: Record<SignalType, string[]> = {
  'funding': ['funding', 'raised', 'series', 'investment', 'ipo', 'revenue'],
  'hiring': ['hiring', 'job posting', 'new vp', 'new cto', 'engineer', 'headcount'],
  'tech-change': ['tech', 'adopted', 'migrated', 'stack', 'framework', 'cms', 'platform'],
  'expansion': ['expansion', 'office', 'acquired', 'launch', 'new market', 'international'],
  'engagement': ['demo', 'pricing', 'visited', 'downloaded', 'clicked', 'webinar'],
  'churn': ['churn', 'at-risk', 'left company', 'competitor', 'downgrade', 'cancel'],
};

function inferSignalType(text: string): SignalType {
  const lower = text.toLowerCase();
  for (const [type, keywords] of Object.entries(SIGNAL_TYPE_KEYWORDS)) {
    if (keywords.some((kw) => lower.includes(kw))) {
      return type as SignalType;
    }
  }
  return 'engagement'; // fallback
}

// ── Adapter (Degraded Mode) ─────────────────────────────────────────

/**
 * Transform flat signal strings from account.signals[] into timeline data.
 *
 * This is degraded mode — all signals land on day 0, types are inferred,
 * confidence is locked at 0.5. The graph renders honestly: no density curve,
 * banner explains the limitation.
 */
export function deriveSignalTimeline(
  accountKey: string,
  accountName: string,
  signals: string[],
  updatedAt: string,
): TimelineSignal[] {
  if (!Array.isArray(signals)) return [];

  return signals
    .filter((text) => typeof text === 'string' && text.trim().length > 0)
    .map((text, i) => ({
      id: `${accountKey}-sig-${i}`,
      day: 0,                    // No timestamp data — all show as "today"
      account: accountName,
      accountKey,
      type: inferSignalType(text),
      text,
      confidence: 0.5,           // Medium — type is inferred, not declared
      strength: 0.5,
      isActive: true,
      detectedAt: updatedAt,
    }));
}

// ── Spike Detection ─────────────────────────────────────────────────

export function computeDensity(signals: TimelineSignal[], days: number): number[] {
  const density = new Array(days + 1).fill(0);
  for (const s of signals) {
    if (s.day >= 0 && s.day <= days) density[s.day]++;
  }
  return density;
}

export function findSpikes(signals: TimelineSignal[], days: number): SpikeCallout[] {
  const density = computeDensity(signals, days);
  const spikes: SpikeCallout[] = [];
  for (let d = 0; d <= days; d++) {
    if (density[d] >= 3) {
      const accounts = [
        ...new Set(signals.filter((s) => s.day === d).map((s) => s.account)),
      ];
      spikes.push({ day: d, count: density[d], accounts });
    }
  }
  return spikes;
}
