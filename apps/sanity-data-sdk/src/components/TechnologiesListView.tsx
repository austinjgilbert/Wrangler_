/**
 * TechnologiesListView — Integrated technology stack intelligence page.
 *
 * Two data sources:
 *   1. Sanity useDocuments (technology docs) — portfolio-wide tech list
 *   2. Worker GET /technologies/insights — per-account AI analysis overlay
 *
 * Features (per tech-page-ux-spec):
 *   - Account selector for AI insights context
 *   - Summary bar with signal badges + stack maturity bar
 *   - Stack summary (AI) in header when available
 *   - Filter bar (search, status radio, sort dropdown)
 *   - Fixed category order (CMS first — selling surface)
 *   - Tech cards with status/confidence/border-left accents
 *   - Per-card expandable AI panel (Phase 2 stub)
 *   - 4 empty states
 *   - Rescan button
 */

import { useDocuments } from '@sanity/sdk-react';
import { Suspense, useMemo, useState } from 'react';
import type { Account } from '../lib/adapters';
import { formatTimestamp } from '../lib/formatters';
import { AccountSelector } from './command-center/AccountSelector';
import { useTechInsights, type Technology as AiTechnology } from './useTechInsights';
import './TechnologiesListView.css';

// ─── Types ──────────────────────────────────────────────────────────────

interface TechnologyDoc {
  documentId: string;
  documentType: string;
  name?: string;
  slug?: string;
  category?: string;
  vendor?: string;
  isLegacy?: boolean;
  isMigrationTarget?: boolean;
  lastEnrichedAt?: string;
  accountCount?: number;
  status?: string;
  confidence?: number;
  source?: string;
  description?: string;
  detectionSignals?: string[];
  website?: string;
}

type TechStatus = 'active' | 'legacy' | 'migration-target' | 'unknown';
type SortKey = 'name' | 'category' | 'recent';

interface CategoryGroup {
  category: string;
  label: string;
  technologies: TechnologyDoc[];
}

// ─── Constants ──────────────────────────────────────────────────────────

/** Fixed category display order — CMS first (selling surface). */
const CATEGORY_ORDER = [
  'cms', 'dxp', 'framework', 'analytics', 'cdp', 'crm', 'ecommerce',
  'dam', 'pim', 'lms', 'hosting', 'cdn', 'marketing-automation',
  'legacy', 'other', 'detected', 'uncategorized',
];

/** Categories auto-expanded on load. */
const AUTO_EXPAND_CATEGORIES = new Set(['cms', 'dxp', 'framework']);

/** Modern frontend frameworks for signal badge detection. */
const MODERN_FRAMEWORKS = new Set([
  'react', 'next.js', 'nextjs', 'vue', 'nuxt', 'nuxtjs',
  'svelte', 'astro', 'remix', 'gatsby',
]);

const STATUS_CONFIG: Record<TechStatus, { label: string; className: string }> = {
  active: { label: 'Active', className: 'tech-status--active' },
  legacy: { label: 'Legacy', className: 'tech-status--legacy' },
  'migration-target': { label: 'Migration Target', className: 'tech-status--migration' },
  unknown: { label: 'Detected', className: 'tech-status--unknown' },
};

// ─── Helpers ────────────────────────────────────────────────────────────

/** Derive display status from technology doc fields. AI status takes precedence. */
function getTechStatus(doc: TechnologyDoc, aiTech?: AiTechnology | null): TechStatus {
  // AI status wins when available (richer: at_risk, opportunity mapped to display)
  if (aiTech?.status) {
    const s = aiTech.status;
    if (s === 'legacy') return 'legacy';
    if (s === 'migration-target') return 'migration-target';
    if (s === 'active') return 'active';
    // 'testing', 'at_risk', 'opportunity' etc → 'unknown' for display
    return 'unknown';
  }
  if (doc.isLegacy) return 'legacy';
  if (doc.isMigrationTarget) return 'migration-target';
  if (doc.lastEnrichedAt) return 'active';
  return 'unknown';
}

/** Format raw category slug into display label. */
function formatCategory(cat: string): string {
  const LABELS: Record<string, string> = {
    cms: 'CMS', dxp: 'DXP', cdp: 'CDP', crm: 'CRM', cdn: 'CDN',
    dam: 'DAM', pim: 'PIM', lms: 'LMS',
    'marketing-automation': 'Marketing Automation',
  };
  return LABELS[cat] || cat.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Compute confidence score from available fields (0-100). */
function computeConfidence(doc: TechnologyDoc, aiTech?: AiTechnology | null): number {
  // If AI provides confidence, use it
  if (aiTech?.confidence && aiTech.confidence > 0) return aiTech.confidence;

  // Derive from existing fields (per UX spec)
  let score = 0;
  if (doc.lastEnrichedAt) {
    const daysSince = (Date.now() - new Date(doc.lastEnrichedAt).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSince <= 7) score += 40;
    else if (daysSince <= 30) score += 20;
  }
  if (doc.detectionSignals && doc.detectionSignals.length >= 2) score += 30;
  else if (doc.detectionSignals && doc.detectionSignals.length === 1) score += 15;
  if (doc.vendor) score += 15;
  if (doc.description) score += 15;
  return Math.min(100, score);
}

/** Get color class for a progress value. */
function progressColor(value: number): string {
  if (value < 40) return 'tech-bar--red';
  if (value <= 70) return 'tech-bar--amber';
  return 'tech-bar--green';
}

// formatRelativeTime removed — using shared formatTimestamp from formatters.ts

// ─── Signal Badge Derivation ────────────────────────────────────────────

interface SignalBadge {
  key: string;
  emoji: string;
  label: string;
  variant: 'danger' | 'warning' | 'success';
}

function deriveSignalBadges(list: TechnologyDoc[]): SignalBadge[] {
  const badges: SignalBadge[] = [];

  // 🔴 Legacy CMS detected — any tech in cms/dxp category has isLegacy
  const hasLegacyCms = list.some(
    (d) => (d.category === 'cms' || d.category === 'dxp') && d.isLegacy,
  );
  if (hasLegacyCms) {
    badges.push({ key: 'legacy-cms', emoji: '🔴', label: 'Legacy CMS detected', variant: 'danger' });
  }

  // 🟠 Migration target found
  const hasMigrationTarget = list.some((d) => d.isMigrationTarget);
  if (hasMigrationTarget) {
    badges.push({ key: 'migration', emoji: '🟠', label: 'Migration target found', variant: 'warning' });
  }

  // ⚠️ No DAM/PIM
  const hasDamPim = list.some((d) => d.category === 'dam' || d.category === 'pim');
  if (!hasDamPim && list.length > 0) {
    badges.push({ key: 'no-dam-pim', emoji: '⚠️', label: 'No DAM/PIM', variant: 'warning' });
  }

  // ✅ Modern Frontend
  const hasModernFe = list.some(
    (d) => d.category === 'framework' && !d.isLegacy &&
      MODERN_FRAMEWORKS.has((d.name || '').toLowerCase()),
  );
  if (hasModernFe) {
    badges.push({ key: 'modern-fe', emoji: '✅', label: 'Modern Frontend', variant: 'success' });
  }

  // Max 3 badges, priority order as listed
  return badges.slice(0, 3);
}

// ─── Inner Component (inside Suspense) ──────────────────────────────────

function TechnologiesInner() {
  const { data, hasMore, loadMore, isPending } = useDocuments({
    documentType: 'technology',
    batchSize: 100,
    orderings: [{ field: '_updatedAt', direction: 'desc' }],
  });
  const list = (data || []) as TechnologyDoc[];

  // ── Account Selection (for AI insights overlay) ──
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null);
  const { data: insights, loading: insightsLoading, analyzing, analyze } = useTechInsights(
    selectedAccount?.accountKey ?? null,
  );

  // Build AI tech lookup by slug
  const aiTechMap = useMemo(() => {
    if (!insights?.technologies) return new Map<string, AiTechnology>();
    const map = new Map<string, AiTechnology>();
    for (const t of insights.technologies) {
      map.set(t.slug, t);
      // Also index by lowercase name for fuzzy matching
      map.set(t.name.toLowerCase(), t);
    }
    return map;
  }, [insights]);

  function getAiTech(doc: TechnologyDoc): AiTechnology | null {
    if (!aiTechMap.size) return null;
    return aiTechMap.get(doc.slug || '') || aiTechMap.get((doc.name || '').toLowerCase()) || null;
  }

  // ── State ──
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<TechStatus | 'all'>('all');
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('category');
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(() => {
    // Auto-collapse everything except CMS, DXP, Framework
    const allCats = new Set(list.map((d) => d.category || 'uncategorized'));
    const collapsed = new Set<string>();
    for (const cat of allCats) {
      if (!AUTO_EXPAND_CATEGORIES.has(cat)) collapsed.add(cat);
    }
    return collapsed;
  });
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());

  // ── Derived data ──

  // All unique categories with counts (unfiltered)
  const categoryChips = useMemo(() => {
    const counts = new Map<string, number>();
    for (const doc of list) {
      const cat = doc.category || 'uncategorized';
      counts.set(cat, (counts.get(cat) || 0) + 1);
    }
    // Sort by CATEGORY_ORDER, then alphabetical for unknowns
    return Array.from(counts.entries())
      .sort((a, b) => {
        const ai = CATEGORY_ORDER.indexOf(a[0]);
        const bi = CATEGORY_ORDER.indexOf(b[0]);
        const aIdx = ai >= 0 ? ai : CATEGORY_ORDER.length;
        const bIdx = bi >= 0 ? bi : CATEGORY_ORDER.length;
        if (aIdx !== bIdx) return aIdx - bIdx;
        return a[0].localeCompare(b[0]);
      })
      .map(([cat, count]) => ({ category: cat, label: formatCategory(cat), count }));
  }, [list]);

  // Status counts (unfiltered)
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { all: list.length, active: 0, legacy: 0, 'migration-target': 0, unknown: 0 };
    for (const doc of list) {
      const s = getTechStatus(doc, getAiTech(doc));
      counts[s] = (counts[s] || 0) + 1;
    }
    return counts;
  }, [list, aiTechMap]);

  // Stack maturity (from AI or derived)
  const stackMaturity = useMemo(() => {
    if (insights?.summary?.stackMaturity) return insights.summary;
    // Derive from doc data
    const activeTechs = list.filter((d) => !d.isLegacy).length;
    const maturityPct = list.length > 0 ? (activeTechs / list.length) * 100 : 0;
    return { maturityPct, activeTechs, totalTechs: list.length };
  }, [list, insights]);

  // Signal badges
  const signalBadges = useMemo(() => deriveSignalBadges(list), [list]);

  // Filtered + sorted list
  const filtered = useMemo(() => {
    let result = list;

    // Search filter
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      result = result.filter(
        (doc) =>
          (doc.name || '').toLowerCase().includes(q) ||
          (doc.category || '').toLowerCase().includes(q) ||
          (doc.vendor || '').toLowerCase().includes(q),
      );
    }

    // Status filter
    if (statusFilter !== 'all') {
      result = result.filter((doc) => getTechStatus(doc, getAiTech(doc)) === statusFilter);
    }

    // Category filter
    if (categoryFilter) {
      result = result.filter((doc) => (doc.category || 'uncategorized') === categoryFilter);
    }

    // Sort
    result = [...result].sort((a, b) => {
      if (sortKey === 'name') {
        return (a.name || '').localeCompare(b.name || '');
      }
      if (sortKey === 'category') {
        // Use fixed category order
        const aCat = a.category || 'uncategorized';
        const bCat = b.category || 'uncategorized';
        const aIdx = CATEGORY_ORDER.indexOf(aCat);
        const bIdx = CATEGORY_ORDER.indexOf(bCat);
        const aOrder = aIdx >= 0 ? aIdx : CATEGORY_ORDER.length;
        const bOrder = bIdx >= 0 ? bIdx : CATEGORY_ORDER.length;
        if (aOrder !== bOrder) return aOrder - bOrder;
        return (a.name || '').localeCompare(b.name || '');
      }
      // recent — by lastEnrichedAt desc
      const aTime = a.lastEnrichedAt || '';
      const bTime = b.lastEnrichedAt || '';
      return bTime.localeCompare(aTime);
    });

    return result;
  }, [list, search, statusFilter, categoryFilter, sortKey, aiTechMap]);

  // Group by category
  const groups: CategoryGroup[] = useMemo(() => {
    if (sortKey !== 'category' && !categoryFilter) {
      return [{ category: '__all__', label: 'All Technologies', technologies: filtered }];
    }

    const map = new Map<string, TechnologyDoc[]>();
    for (const doc of filtered) {
      const cat = doc.category || 'uncategorized';
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(doc);
    }
    // Sort groups by CATEGORY_ORDER
    return Array.from(map.entries())
      .sort((a, b) => {
        const ai = CATEGORY_ORDER.indexOf(a[0]);
        const bi = CATEGORY_ORDER.indexOf(b[0]);
        const aIdx = ai >= 0 ? ai : CATEGORY_ORDER.length;
        const bIdx = bi >= 0 ? bi : CATEGORY_ORDER.length;
        return aIdx - bIdx;
      })
      .map(([cat, techs]) => ({ category: cat, label: formatCategory(cat), technologies: techs }));
  }, [filtered, sortKey, categoryFilter]);

  // ── Handlers ──

  function toggleCategory(cat: string) {
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  }

  function toggleCard(id: string) {
    setExpandedCards((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // ── Empty State: No technologies at all ──
  if (list.length === 0 && !isPending) {
    return (
      <div className="tech-empty">
        <div className="tech-empty-icon">🔧</div>
        <h3>No technologies detected yet</h3>
        <p>Technologies are discovered during account research. Run a research scan on an account to detect its tech stack.</p>
      </div>
    );
  }

  // ── Maturity bar values ──
  const activeTechs = list.filter((d) => !d.isLegacy).length;
  const maturityPct = list.length > 0 ? Math.round((activeTechs / list.length) * 100) : 0;

  return (
    <div className="tech-view">
      {/* ── Account Selector (for AI insights context) ── */}
      <div className="tech-account-selector">
        <AccountSelector
          selectedAccount={selectedAccount}
          onSelect={setSelectedAccount}
          onClear={() => setSelectedAccount(null)}
        />
        {selectedAccount && insightsLoading && (
          <span className="tech-insights-loading">Loading AI insights…</span>
        )}
      </div>

      {/* ── Summary Bar ── */}
      <div className="tech-summary-bar">
        <div className="tech-summary-header">
          <div className="tech-summary-title">
            <span className="tech-summary-icon">🔧</span>
            <span className="tech-summary-label">
              Tech Stack{selectedAccount ? ` — ${insights?.companyName || selectedAccount.companyName}` : ''}
            </span>
          </div>
          <div className="tech-summary-actions">
            {selectedAccount && (
              <button
                type="button"
                className="tech-action-btn tech-action-btn--secondary"
                onClick={() => analyze()}
                disabled={analyzing}
              >
                {analyzing ? 'Analyzing…' : '🔬 Analyze Stack'}
              </button>
            )}
          </div>
        </div>

        <div className="tech-summary-stats">
          <div className="tech-stat">
            <span className="tech-stat-value">{list.length}</span>
            <span className="tech-stat-label">Technologies</span>
          </div>
          <div className="tech-stat">
            <span className="tech-stat-value">{categoryChips.length}</span>
            <span className="tech-stat-label">Categories</span>
          </div>
          <div className="tech-stat">
            <span className="tech-stat-value">{statusCounts.legacy || 0}</span>
            <span className="tech-stat-label">Legacy</span>
          </div>
          <div className="tech-stat">
            <span className="tech-stat-value">{statusCounts['migration-target'] || 0}</span>
            <span className="tech-stat-label">Migration Targets</span>
          </div>
          {/* Stack Maturity Bar */}
          <div className="tech-stat tech-stat--maturity">
            <div className="tech-maturity-bar-container">
              <div className={`tech-maturity-bar-fill ${progressColor(maturityPct)}`} style={{ width: `${maturityPct}%` }} />
            </div>
            <span className="tech-stat-label">Maturity {maturityPct}%</span>
          </div>
        </div>

        {/* Signal Badges */}
        {signalBadges.length > 0 && (
          <div className="tech-signal-badges">
            {signalBadges.map((badge) => (
              <span key={badge.key} className={`tech-signal tech-signal--${badge.variant}`}>
                {badge.emoji} {badge.label}
              </span>
            ))}
          </div>
        )}

        {/* AI Stack Summary (when available) */}
        {insights?.summary && (
          <div className="tech-stack-summary">
            <div className="tech-stack-summary-header">✨ AI Stack Summary</div>
            <p className="tech-stack-summary-text">{insights.summary.overallAssessment}</p>
            {insights.summary.topRisks.length > 0 && (
              <div className="tech-stack-summary-list">
                <strong>Risks:</strong> {insights.summary.topRisks.join(' · ')}
              </div>
            )}
            {insights.summary.topOpportunities.length > 0 && (
              <div className="tech-stack-summary-list">
                <strong>Opportunities:</strong> {insights.summary.topOpportunities.join(' · ')}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Filter Bar ── */}
      <div className="tech-filter-bar">
        <div className="tech-filter-row">
          {/* Search */}
          <input
            type="text"
            className="tech-search"
            placeholder="Search technologies…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          {/* Status radio */}
          <div className="tech-status-filters">
            {(['all', 'active', 'legacy', 'migration-target', 'unknown'] as const).map((s) => (
              <button
                key={s}
                type="button"
                className={`tech-status-btn ${statusFilter === s ? 'tech-status-btn--active' : ''}`}
                onClick={() => setStatusFilter(s)}
              >
                {s === 'all' ? 'All' : s === 'migration-target' ? 'Migration' : s.charAt(0).toUpperCase() + s.slice(1)}
                <span className="tech-status-count">{statusCounts[s] || 0}</span>
              </button>
            ))}
          </div>

          {/* Sort */}
          <select
            className="tech-sort"
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
          >
            <option value="category">Sort: Category</option>
            <option value="name">Sort: Name</option>
            <option value="recent">Sort: Recent</option>
          </select>
        </div>

        {/* Category chips */}
        <div className="tech-category-chips">
          <button
            type="button"
            className={`tech-chip ${categoryFilter === null ? 'tech-chip--active' : ''}`}
            onClick={() => setCategoryFilter(null)}
          >
            All
          </button>
          {categoryChips.map(({ category, label, count }) => (
            <button
              key={category}
              type="button"
              className={`tech-chip ${categoryFilter === category ? 'tech-chip--active' : ''}`}
              onClick={() => setCategoryFilter(categoryFilter === category ? null : category)}
            >
              {label} <span className="tech-chip-count">{count}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Results ── */}
      <div className="tech-results">
        {filtered.length === 0 ? (
          <div className="tech-no-results">
            No technologies match{search ? ` "${search}"` : ''}{statusFilter !== 'all' ? ` in ${statusFilter} status` : ''}.
            <button type="button" className="tech-clear-filters" onClick={() => { setSearch(''); setStatusFilter('all'); setCategoryFilter(null); }}>
              Clear filters
            </button>
          </div>
        ) : (
          <>
            <div className="tech-results-meta">
              {filtered.length} {filtered.length === 1 ? 'technology' : 'technologies'}
              {(search || statusFilter !== 'all' || categoryFilter) && ' matching filters'}
            </div>

            {groups.map((group) => {
              const isCollapsed = collapsedCategories.has(group.category);
              const showGroupHeader = group.category !== '__all__';

              return (
                <div key={group.category} className="tech-group">
                  {showGroupHeader && (
                    <button
                      type="button"
                      className="tech-group-header"
                      onClick={() => toggleCategory(group.category)}
                    >
                      <span className={`tech-group-chevron ${isCollapsed ? '' : 'tech-group-chevron--open'}`}>▶</span>
                      <span className="tech-group-label">{group.label}</span>
                      <span className="tech-group-count">{group.technologies.length}</span>
                    </button>
                  )}

                  {!isCollapsed && (
                    <div className="tech-group-items">
                      {group.technologies.map((doc) => {
                        const aiTech = getAiTech(doc);
                        const status = getTechStatus(doc, aiTech);
                        const cfg = STATUS_CONFIG[status];
                        const confidence = computeConfidence(doc, aiTech);
                        const isExpanded = expandedCards.has(doc.documentId);
                        const hasAiStatus = aiTech?.status != null;
                        const borderClass = doc.isLegacy
                          ? 'tech-card--legacy-border'
                          : doc.isMigrationTarget
                            ? 'tech-card--migration-border'
                            : '';

                        return (
                          <div key={doc.documentId} className={`tech-card-v2 ${borderClass}`}>
                            <button
                              type="button"
                              className="tech-card-main"
                              onClick={() => toggleCard(doc.documentId)}
                            >
                              <div className="tech-card-left">
                                <div className="tech-card-name">
                                  {doc.name ?? doc.slug ?? doc.documentId}
                                </div>
                                <span className={`tech-status-badge ${cfg.className}`}>
                                  {hasAiStatus && <span className="tech-ai-indicator">✨</span>}
                                  {cfg.label}
                                </span>
                              </div>
                              <div className="tech-card-right">
                                {/* Confidence bar */}
                                {confidence > 0 && (
                                  <div className="tech-confidence-container">
                                    <div className="tech-confidence-bar">
                                      <div
                                        className={`tech-confidence-fill ${progressColor(confidence)}`}
                                        style={{ width: `${confidence}%` }}
                                      />
                                    </div>
                                    <span className="tech-confidence-label">{confidence}%</span>
                                  </div>
                                )}
                                <span className={`tech-card-chevron ${isExpanded ? 'tech-card-chevron--open' : ''}`}>▶</span>
                              </div>
                            </button>

                            <div className="tech-card-details">
                              {doc.vendor && (
                                <span className="tech-card-vendor">{doc.vendor}</span>
                              )}
                              {doc.category && !showGroupHeader && (
                                <span className="tech-card-category">{formatCategory(doc.category)}</span>
                              )}
                              {doc.lastEnrichedAt && (
                                <span className="tech-card-enriched">
                                  Last seen {formatTimestamp(doc.lastEnrichedAt)}
                                </span>
                              )}
                            </div>

                            {doc.accountCount != null && doc.accountCount > 0 && (
                              <div className="tech-card-accounts">
                                {doc.accountCount} {doc.accountCount === 1 ? 'account' : 'accounts'}
                              </div>
                            )}

                            {/* ── Expanded Card Content ── */}
                            {isExpanded && (
                              <div className="tech-card-expanded">
                                {/* AI Insights Panel (per-card) */}
                                {aiTech?.insights && (
                                  <div className="tech-card__ai-panel">
                                    <div className="tech-card__ai-header">✨ AI Analysis</div>
                                    {aiTech.insights.sellingAngle && (
                                      <div className="tech-card__ai-body">
                                        <strong>💡 Selling Angle:</strong> {aiTech.insights.sellingAngle}
                                      </div>
                                    )}
                                    {aiTech.insights.competitorUsage && (
                                      <div className="tech-card__ai-body">
                                        <strong>📊 Competitor Intel:</strong> {aiTech.insights.competitorUsage}
                                      </div>
                                    )}
                                    {aiTech.insights.painPoints.length > 0 && (
                                      <ul className="tech-card__ai-angles">
                                        {aiTech.insights.painPoints.map((pp, i) => (
                                          <li key={i}>{pp}</li>
                                        ))}
                                      </ul>
                                    )}
                                    {aiTech.insights.targetPersonas.length > 0 && (
                                      <div className="tech-card__ai-personas">
                                        <strong>Target:</strong>{' '}
                                        {aiTech.insights.targetPersonas.map((p, i) => (
                                          <span key={i} className="tech-persona-chip">{p}</span>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                )}

                                {/* Card metadata */}
                                <div className="tech-card-meta">
                                  {doc.detectionSignals?.[0] && <span>Detection: {doc.detectionSignals[0]}</span>}
                                  {doc.lastEnrichedAt && <span>Last seen: {formatTimestamp(doc.lastEnrichedAt)}</span>}
                                  {doc.website && <a href={doc.website} target="_blank" rel="noopener noreferrer" className="tech-card-link">↗ Website</a>}
                                </div>

                                {/* Action buttons */}
                                <div className="tech-card-actions">
                                  <button type="button" className="tech-card-action" onClick={() => showToast('Pain points analysis coming soon')}>Pain Points</button>
                                  <button type="button" className="tech-card-action" onClick={() => showToast('Similar accounts search coming soon')}>Similar Accounts</button>
                                  <button type="button" className="tech-card-action tech-card-action--stub" disabled title="Coming in Phase 2">Outreach Angle</button>
                                  <button type="button" className="tech-card-action tech-card-action--stub" disabled title="Coming in Phase 2">AI Summary</button>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </>
        )}
      </div>

      {/* ── Load More ── */}
      {hasMore && (
        <button
          type="button"
          className="tech-load-more"
          disabled={isPending}
          onClick={() => loadMore()}
        >
          {isPending ? 'Loading…' : 'Load more technologies'}
        </button>
      )}
    </div>
  );
}

// ─── Toast Helper ────────────────────────────────────────────────────────

function showToast(message: string) {
  const el = document.createElement('div');
  el.textContent = message;
  Object.assign(el.style, {
    position: 'fixed',
    bottom: '60px',
    left: '50%',
    transform: 'translateX(-50%)',
    background: '#303038',
    color: '#ffffff',
    padding: '10px 20px',
    borderRadius: '8px',
    fontSize: '13px',
    zIndex: '200',
    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
    transition: 'opacity 200ms',
  });
  document.body.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 200);
  }, 2500);
}

// ─── Outer Wrapper ──────────────────────────────────────────────────────

export function TechnologiesListView() {
  return (
    <section className="detail-panel">
      <div className="detail-header">
        <div>
          <p className="eyebrow">Tech Stack Intelligence</p>
          <h2>Technologies</h2>
          <p className="detail-meta">
            Technology stack data across your portfolio — grouped by category with status indicators and AI insights.
          </p>
        </div>
      </div>
      <Suspense fallback={<div className="loading-state">Loading technologies…</div>}>
        <TechnologiesInner />
      </Suspense>
    </section>
  );
}
