/**
 * ActivityFeed — Filterable event feed reading molt.event docs.
 *
 * Replaces InteractionList in ActivityView.tsx.
 * Uses useDocuments with filter param for built-in reactivity.
 * All blob parsing delegated to parseActivityEvent() adapter.
 *
 * Phase 1: filter tabs, status dropdown, sort, NavigationContext actions.
 * Phase 2: account grouping, Sanity listener for live updates.
 *
 * @see activity-system-ux-spec v1.0
 * @see activity-system-architecture v1.0
 */

import { useClient, useDocuments } from '@sanity/sdk-react';
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  parseActivityEvent,
  buildActivityFilter,
  type ActivityFilterTab,
  type ParsedActivityEvent,
  type MoltEventDoc,
} from '../lib/adapters/activity';
import {
  formatRelativeTime,
  humanizeEventSource,
  humanizeEventStatus,
  eventStatusCssClass,
} from '../lib/formatters';
import { useNavigation } from '../lib/navigation';
import { isView } from '../lib/view-state';
import './ActivityFeed.css';

// ── Types ───────────────────────────────────────────────────────────

type StatusFilter = 'all' | 'active' | 'completed' | 'failed';
type SortOrder = 'desc' | 'asc';

interface FilterTab {
  key: ActivityFilterTab;
  label: string;
  icon: string;
}

const FILTER_TABS: FilterTab[] = [
  { key: 'all', label: 'All', icon: '' },
  { key: 'prompt', label: 'Prompts', icon: '💬' },
  { key: 'job', label: 'Jobs', icon: '⚙️' },
  { key: 'data_write', label: 'Data', icon: '📝' },
  { key: 'system', label: 'System', icon: '🔔' },
  { key: 'capture', label: 'Captures', icon: '📸' },
];

/** Group events by accountKey. null/undefined → 'system' bucket. */
interface AccountGroup {
  accountKey: string | null;
  label: string;
  events: ParsedActivityEvent[];
}

function groupEventsByAccount(events: ParsedActivityEvent[]): AccountGroup[] {
  const map = new Map<string, ParsedActivityEvent[]>();

  for (const event of events) {
    const key = event.accountKey || '__system__';
    const existing = map.get(key);
    if (existing) {
      existing.push(event);
    } else {
      map.set(key, [event]);
    }
  }

  const groups: AccountGroup[] = [];
  for (const [key, groupEvents] of map) {
    const isSystem = key === '__system__';
    // Use accountName from blob if available, otherwise accountKey
    const label = isSystem
      ? 'System & Global'
      : groupEvents[0]?.accountName || key;
    groups.push({
      accountKey: isSystem ? null : key,
      label,
      events: groupEvents,
    });
  }

  // Sort: groups with most events first, system last
  groups.sort((a, b) => {
    if (a.accountKey === null) return 1;
    if (b.accountKey === null) return -1;
    return b.events.length - a.events.length;
  });

  return groups;
}

// ── Inner component (inside Suspense) ───────────────────────────────

function ActivityFeedInner() {
  const [activeTab, setActiveTab] = useState<ActivityFilterTab>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [groupByAccount, setGroupByAccount] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const { navigateToView } = useNavigation();

  // ── Sanity listener for live updates ────────────────────────────
  const [liveEvents, setLiveEvents] = useState<ParsedActivityEvent[]>([]);
  const seenIdsRef = useRef<Set<string>>(new Set());
  let client: ReturnType<typeof useClient> | null = null;
  try {
    client = useClient({ apiVersion: '2024-01-01' });
  } catch {
    // useClient may throw if not in a valid SDK context — degrade gracefully
    client = null;
  }

  useEffect(() => {
    if (!client) return;

    let subscription: { unsubscribe: () => void } | null = null;
    try {
      subscription = client.listen(
        '*[_type == "molt.event" && defined(eventType)] | order(timestamp desc) [0]',
        {},
        { includeResult: true }
      ).subscribe({
        next: (event) => {
          if (event.type !== 'mutation' || !event.result) return;
          const raw = event.result;
          // client.listen returns _id, useDocuments returns documentId — normalize
          const doc: MoltEventDoc = {
            documentId: raw._id || raw.documentId || '',
            eventType: raw.eventType as string | undefined,
            status: raw.status as string | undefined,
            source: raw.source as string | undefined,
            accountKey: raw.accountKey as string | null | undefined,
            timestamp: raw.timestamp as string | undefined,
            category: raw.category as string | undefined,
            eventData: raw.eventData as string | undefined,
            _createdAt: raw._createdAt as string | undefined,
          };
          if (!doc.documentId) return;
          const parsed = parseActivityEvent(doc);
          if (seenIdsRef.current.has(parsed.id)) return;
          seenIdsRef.current.add(parsed.id);
          setLiveEvents((prev) => [parsed, ...prev].slice(0, 100));
        },
        error: (err: unknown) => {
          console.warn('[ActivityFeed] Listener error, falling back to polling:', err);
        },
      });
    } catch {
      // Listener not available — degrade to polling-only
    }

    return () => {
      subscription?.unsubscribe();
    };
  }, [client]);

  // ── Data from useDocuments (polling baseline) ───────────────────
  const filter = useMemo(
    () => buildActivityFilter(activeTab, statusFilter),
    [activeTab, statusFilter]
  );

  const orderings = useMemo(
    () => [{ field: 'timestamp', direction: sortOrder as 'asc' | 'desc' }],
    [sortOrder]
  );

  const { data, hasMore, loadMore, isPending } = useDocuments({
    documentType: 'molt.event',
    batchSize: 50,
    filter,
    orderings,
  });

  const polledEvents: ParsedActivityEvent[] = useMemo(
    () => ((data || []) as MoltEventDoc[]).map(parseActivityEvent),
    [data]
  );

  // Merge live events with polled events, dedup by id
  const events: ParsedActivityEvent[] = useMemo(() => {
    if (liveEvents.length === 0) return polledEvents;

    const seen = new Set<string>();
    const merged: ParsedActivityEvent[] = [];

    // Live events first (newest), then polled
    for (const e of liveEvents) {
      if (!seen.has(e.id)) {
        seen.add(e.id);
        merged.push(e);
      }
    }
    for (const e of polledEvents) {
      if (!seen.has(e.id)) {
        seen.add(e.id);
        merged.push(e);
      }
    }

    // Re-sort based on current sort order
    merged.sort((a, b) => {
      const cmp = a.timestamp < b.timestamp ? -1 : a.timestamp > b.timestamp ? 1 : 0;
      return sortOrder === 'desc' ? -cmp : cmp;
    });

    return merged;
  }, [liveEvents, polledEvents, sortOrder]);

  // Track polled IDs so listener doesn't duplicate them
  useEffect(() => {
    for (const e of polledEvents) {
      seenIdsRef.current.add(e.id);
    }
  }, [polledEvents]);

  // ── Account groups ──────────────────────────────────────────────
  const accountGroups = useMemo(
    () => (groupByAccount ? groupEventsByAccount(events) : []),
    [events, groupByAccount]
  );

  const toggleGroupCollapse = useCallback((key: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  // ── Summary stats ─────────────────────────────────────────────
  const summary = useMemo(() => {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const todayEvents = events.filter((e) => e.timestamp >= startOfDay);
    return {
      total: todayEvents.length,
      jobsRunning: todayEvents.filter(
        (e) => e.eventType === 'job' && (e.status === 'queued' || e.status === 'processing')
      ).length,
      prompts: todayEvents.filter((e) => e.eventType === 'prompt').length,
      failed: todayEvents.filter((e) => e.status === 'failed').length,
    };
  }, [events]);

  // ── Handlers ──────────────────────────────────────────────────
  const handleNavigate = useCallback(
    (view: string) => {
      if (isView(view)) navigateToView(view);
    },
    [navigateToView]
  );

  const hasActiveFilters = activeTab !== 'all' || statusFilter !== 'all';

  const clearFilters = useCallback(() => {
    setActiveTab('all');
    setStatusFilter('all');
  }, []);

  // ── Render ────────────────────────────────────────────────────
  return (
    <div className="activity-feed">
      {/* Summary bar */}
      <div className={`activity-feed__summary${summary.failed > 0 ? ' activity-feed__summary--alert' : ''}`}>
        <span>{summary.total} events today</span>
        <span className="activity-feed__summary-sep">·</span>
        <span>{summary.jobsRunning} jobs running</span>
        <span className="activity-feed__summary-sep">·</span>
        <span>{summary.prompts} prompts</span>
        {summary.failed > 0 && (
          <>
            <span className="activity-feed__summary-sep">·</span>
            <span className="activity-feed__summary-failed">{summary.failed} failed</span>
          </>
        )}
        {liveEvents.length > 0 && (
          <>
            <span className="activity-feed__summary-sep">·</span>
            <span className="activity-feed__summary-live">🔴 Live</span>
          </>
        )}
      </div>

      {/* Filter bar */}
      <div className="activity-feed__filters">
        <div className="activity-feed__tabs">
          {FILTER_TABS.map((tab) => (
            <button
              key={tab.key}
              className={`activity-feed__tab${activeTab === tab.key ? ' activity-feed__tab--active' : ''}`}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.icon && <span className="activity-feed__tab-icon">{tab.icon}</span>}
              {tab.label}
            </button>
          ))}
        </div>
        <div className="activity-feed__secondary-filters">
          <label className="activity-feed__toggle">
            <input
              type="checkbox"
              checked={groupByAccount}
              onChange={(e) => setGroupByAccount(e.target.checked)}
            />
            Group by account
          </label>
          <select
            className="activity-feed__select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          >
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="completed">Completed</option>
            <option value="failed">Failed</option>
          </select>
          <select
            className="activity-feed__select"
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value as SortOrder)}
          >
            <option value="desc">Recent first</option>
            <option value="asc">Oldest first</option>
          </select>
          {hasActiveFilters && (
            <button className="activity-feed__clear-filters" onClick={clearFilters}>
              Clear filters
            </button>
          )}
        </div>
      </div>

      {/* Event list */}
      {isPending && events.length === 0 ? (
        <div className="activity-feed__loading">Loading activity…</div>
      ) : events.length === 0 ? (
        hasActiveFilters ? (
          <div className="activity-feed__empty">
            <p>No events match your filters.</p>
            <button className="activity-feed__clear-filters" onClick={clearFilters}>
              Clear filters
            </button>
          </div>
        ) : (
          <div className="activity-feed__empty">
            <div className="activity-feed__empty-icon">📡</div>
            <p className="activity-feed__empty-title">No activity yet</p>
            <p className="activity-feed__empty-desc">
              Events appear here as you research accounts, capture pages, and run research jobs.
            </p>
            <button
              className="activity-action"
              onClick={() => handleNavigate('command-center')}
            >
              Go to Command Center →
            </button>
          </div>
        )
      ) : groupByAccount ? (
        /* Grouped view */
        <>
          <div className="activity-feed__groups">
            {accountGroups.map((group) => {
              const groupKey = group.accountKey || '__system__';
              const isCollapsed = collapsedGroups.has(groupKey);
              return (
                <div key={groupKey} className="activity-group">
                  <button
                    className="activity-group__header"
                    onClick={() => toggleGroupCollapse(groupKey)}
                    aria-expanded={!isCollapsed}
                  >
                    <span className="activity-group__toggle">{isCollapsed ? '▸' : '▾'}</span>
                    <span className="activity-group__label">{group.label}</span>
                    <span className="activity-group__count">{group.events.length}</span>
                  </button>
                  {!isCollapsed && (
                    <div className="activity-group__events">
                      {group.events.map((event) => (
                        <ActivityCard
                          key={event.id}
                          event={event}
                          onNavigate={handleNavigate}
                          compact
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {hasMore && (
            <button
              className="activity-feed__load-more"
              disabled={isPending}
              onClick={() => loadMore()}
            >
              {isPending ? 'Loading…' : 'Load more events'}
            </button>
          )}
        </>
      ) : (
        /* Flat view */
        <>
          <div className="activity-feed__list">
            {events.map((event) => (
              <ActivityCard
                key={event.id}
                event={event}
                onNavigate={handleNavigate}
              />
            ))}
          </div>
          {hasMore && (
            <button
              className="activity-feed__load-more"
              disabled={isPending}
              onClick={() => loadMore()}
            >
              {isPending ? 'Loading…' : 'Load more events'}
            </button>
          )}
        </>
      )}
    </div>
  );
}

// ── ActivityCard ─────────────────────────────────────────────────────

const EVENT_ICONS: Record<string, string> = {
  prompt: '💬',
  job: '⚙️',
  data_write: '📝',
  system: '🔔',
  capture: '📸',
};

const STATUS_ICONS: Record<string, string> = {
  queued: '⏳',
  processing: '🔄',
  completed: '✅',
  failed: '❌',
};

function ActivityCard({
  event,
  onNavigate,
  compact,
}: {
  event: ParsedActivityEvent;
  onNavigate: (view: string) => void;
  compact?: boolean;
}) {
  const statusClass = eventStatusCssClass(event.status);

  return (
    <div
      className={`activity-card activity-card--${event.eventType}${compact ? ' activity-card--compact' : ''}`}
      data-status={event.status}
    >
      {/* Icon */}
      <div className="activity-card__icon">
        {EVENT_ICONS[event.eventType] || '📋'}
      </div>

      {/* Body */}
      <div className="activity-card__body">
        <div className="activity-card__header">
          <span className="activity-card__message">
            {event.eventType === 'prompt' && event.promptText
              ? `Prompt: "${event.promptText.length > 80 ? event.promptText.slice(0, 80) + '…' : event.promptText}"`
              : event.message}
          </span>
          <span className={`activity-status activity-status--${statusClass}`}>
            <span className="activity-status__icon">{STATUS_ICONS[event.status] || '•'}</span>
            {humanizeEventStatus(event.status)}
          </span>
        </div>

        <div className="activity-card__meta">
          <span className={`activity-source activity-source--${event.source}`}>
            {humanizeEventSource(event.source)}
          </span>
          {event.domain && (
            <>
              <span className="activity-card__meta-sep">·</span>
              <span>{event.domain}</span>
            </>
          )}
          <span className="activity-card__meta-sep">·</span>
          <span>{formatRelativeTime(event.timestamp)}</span>
        </div>

        {/* Error detail for failed events */}
        {event.status === 'failed' && event.error && (
          <div className="activity-card__error">{event.error}</div>
        )}

        {/* Stage detail for job events */}
        {event.eventType === 'job' && event.stage && event.status === 'processing' && (
          <div className="activity-card__detail">Stage: {event.stage}</div>
        )}

        {/* Actions — hidden in compact mode */}
        {!compact && (
          <div className="activity-card__actions">
            {event.eventType === 'job' && (
              <button
                className="activity-action"
                onClick={() => onNavigate('command-center')}
              >
                View in Command Center
              </button>
            )}
            {event.accountKey && (
              <button
                className="activity-action"
                onClick={() => onNavigate('command-center')}
              >
                View Account ↗
              </button>
            )}
            {event.eventType === 'capture' && event.personName && (
              <button
                className="activity-action"
                onClick={() => onNavigate('people')}
              >
                View Person
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Exported wrapper with Suspense ──────────────────────────────────

export function ActivityFeed() {
  return (
    <Suspense fallback={<div className="activity-feed__loading">Loading activity…</div>}>
      <ActivityFeedInner />
    </Suspense>
  );
}
