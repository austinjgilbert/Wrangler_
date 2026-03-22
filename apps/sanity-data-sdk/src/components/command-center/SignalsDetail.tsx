/**
 * SignalsDetail — Expanded detail view for the Signals module.
 *
 * Renders the Signal Timeline graph for the selected account.
 * Data comes from two sources (both may be empty in production):
 *   1. GlanceContext.signals (Worker snapshot signals.recent[]) — filtered by account
 *   2. account.signals[] (flat strings from Sanity) — fetched via useDocuments
 *
 * In production, both sources are currently empty. The timeline shows an honest
 * empty state. When signal data populates, the graph renders automatically.
 *
 * Worker signals (source 1) are richer — they have signalType, timestamp, source.
 * Account signals (source 2) are flat strings — type is inferred via keywords.
 * We prefer source 1 when available, fall back to source 2.
 */

import { useMemo } from 'react';
import { useNavigation } from '../../lib/navigation';
import { SignalTimeline } from './graphs';
import { deriveSignalTimeline } from './graphs/signal-timeline-adapter';
import type { TimelineSignal } from './graphs/signal-timeline-adapter';
import type { Signal } from '../../lib/adapters/types';

export interface SignalsDetailProps {
  accountKey: string;
  accountId: string;            // Sanity _id — used for signal matching (CC-4)
  accountName: string;
  /** Worker snapshot signals (system-wide — we filter for this account) */
  signals: Signal[];
  /** Flat signal strings from account.signals[] (Sanity doc) */
  accountSignalStrings?: string[];
  /** ISO date of last account update — used as detectedAt fallback */
  updatedAt?: string;
}

export function SignalsDetail({
  accountKey,
  accountId,
  accountName,
  signals,
  accountSignalStrings,
  updatedAt,
}: SignalsDetailProps) {
  const { navigateToView } = useNavigation();
  const timelineSignals = useMemo((): TimelineSignal[] => {
    // Source 1: Worker snapshot signals filtered for this account (CC-4: match on accountId, not name)
    const workerSignals = signals.filter(
      (s) => s.accountId === accountId,
    );

    if (workerSignals.length > 0) {
      // Rich path — Worker signals have type, timestamp, source
      const now = Date.now();
      return workerSignals.map((s, i) => {
        const detectedMs = s.timestamp ? new Date(s.timestamp).getTime() : now;
        const dayDiff = Math.max(0, Math.round((now - detectedMs) / 86_400_000));
        return {
          id: s.id ?? `${accountKey}-ws-${i}`,
          day: dayDiff,
          account: s.accountName ?? accountName,
          accountKey,
          type: mapWorkerSignalType(s.signalType),
          text: s.summary ?? s.signalType ?? 'Signal detected',
          confidence: 0.7,  // Worker signals are structured — higher confidence
          strength: 0.6,
          isActive: true,
          detectedAt: s.timestamp ?? new Date().toISOString(),
        };
      });
    }

    // Source 2: Flat strings from account.signals[] — degraded mode
    if (accountSignalStrings && accountSignalStrings.length > 0) {
      return deriveSignalTimeline(
        accountKey,
        accountName,
        accountSignalStrings,
        updatedAt ?? new Date().toISOString(),
      );
    }

    return [];
  }, [accountKey, accountId, accountName, signals, accountSignalStrings, updatedAt]);

  return (
    <div className="signals-detail">
      <SignalTimeline
        signals={timelineSignals}
        days={14}
        onSignalClick={() => {
          navigateToView('accounts');
        }}
        width={680}
        height={380}
      />
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────

/** Map Worker signal types to timeline signal types */
function mapWorkerSignalType(
  signalType: string | undefined,
): TimelineSignal['type'] {
  if (!signalType) return 'engagement';
  const lower = signalType.toLowerCase();
  if (lower.includes('fund') || lower.includes('revenue')) return 'funding';
  if (lower.includes('hir') || lower.includes('leadership')) return 'hiring';
  if (lower.includes('tech') || lower.includes('stack') || lower.includes('migrat')) return 'tech-change';
  if (lower.includes('expan') || lower.includes('acqui') || lower.includes('launch')) return 'expansion';
  if (lower.includes('churn') || lower.includes('risk') || lower.includes('compet')) return 'churn';
  return 'engagement';
}
