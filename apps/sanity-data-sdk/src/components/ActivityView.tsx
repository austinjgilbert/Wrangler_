import { Suspense, useEffect, useState } from 'react';
import { fetchRecentSignals, type WorkerSignal } from '../lib/adapters/signals';
import { humanizeSignalType, formatTimestamp } from '../lib/formatters';
import { useNavigation } from '../lib/navigation';
import { ActivityFeed } from './ActivityFeed';

// ── SignalList (kept from Batch A — reads Worker snapshot) ──────────

function SignalList() {
  const [signals, setSignals] = useState<WorkerSignal[]>([]);
  const [loading, setLoading] = useState(true);
  const { navigateToView } = useNavigation();

  useEffect(() => {
    fetchRecentSignals()
      .then(setSignals)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="activity-list">
      <div className="section-header">
        <h3>Signals</h3>
        <span className="section-meta">{signals.length} loaded</span>
      </div>
      {loading ? (
        <p className="muted">Loading signals…</p>
      ) : signals.length === 0 ? (
        <p className="muted">No buying signals detected yet — run research to generate signals.</p>
      ) : (
        signals.map((signal) => (
          <div className="activity-card" key={signal.id}>
            <strong>{humanizeSignalType(signal.signalType)}</strong>
            {signal.accountName ? (
              <span
                className="activity-account-link"
                role="button"
                tabIndex={0}
                onClick={() => navigateToView('accounts')}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') navigateToView('accounts') }}
              >
                {signal.accountName}
              </span>
            ) : (
              <span>{signal.summary ?? signal.source ?? signal.id}</span>
            )}
            <span className="activity-meta">
              {[signal.source, formatTimestamp(signal.timestamp)].filter(Boolean).join(' · ')}
            </span>
          </div>
        ))
      )}
    </div>
  );
}

// ── ActivityView (main export) ──────────────────────────────────────

export function ActivityView() {
  return (
    <section className="detail-panel">
      <div className="detail-header">
        <div>
          <p className="eyebrow">Activity &amp; Events</p>
          <h2>Activity Feed</h2>
          <p className="detail-meta">
            Real-time events across your portfolio.
          </p>
        </div>
      </div>
      <Suspense fallback={<div className="loading-state">Loading activity…</div>}>
        <SignalList />
        <div style={{ marginTop: 24 }} />
        <ActivityFeed />
      </Suspense>
    </section>
  );
}
