/**
 * formatters.ts — Shared display formatting for the SDK app.
 *
 * All human-readable label maps live here. Components import these
 * functions instead of hardcoding display strings.
 *
 * Layering:
 *   Adapters (job.ts, pipeline.ts) normalize backend → UI values.
 *   Formatters humanize UI values → display strings.
 */

// ── Job Status ──────────────────────────────────────────────────────

export const JOB_STATUS_LABELS: Record<string, string> = {
  running:  'In Progress',
  queued:   'Queued',
  complete: 'Complete',
  failed:   'Failed',
  // Raw backend values (in case they leak through without adapter normalization)
  in_progress: 'In Progress',
  pending:     'Queued',
  done:        'Complete',
  not_started: 'Queued',
};

export function humanizeJobStatus(status: string | null | undefined): string {
  return JOB_STATUS_LABELS[status ?? ''] ?? status ?? 'Queued';
}

// ── Signal Types ────────────────────────────────────────────────────

const SIGNAL_TYPE_LABELS: Record<string, string> = {
  signup:              'Signup',
  pricing_page_visit:  'Pricing Page Visit',
  intent_spike:        'Intent Spike',
  job_posting:         'Job Posting',
  website_scan:        'Website Scan',
  linkedin_context:    'LinkedIn Activity',
  mql:                 'Marketing Qualified Lead',
  slack_alert:         'Slack Alert',
  routing_signal:      'Routing Signal',
  operator_note:       'Operator Note',
  website_visit:       'Website Visit',
  tech_change:         'Technology Change',
  funding:             'Funding Event',
  hiring:              'Hiring Signal',
  news_mention:        'News Mention',
  contract_renewal:    'Contract Renewal',
  competitor_mention:  'Competitor Mention',
  buying_intent:       'Buying Intent',
};

export function humanizeSignalType(raw: string | null | undefined): string {
  if (!raw) return 'Signal';
  return SIGNAL_TYPE_LABELS[raw] ?? humanizeSnakeCase(raw);
}

// ── Coverage Status ─────────────────────────────────────────────────

const COVERAGE_STATUS_LABELS: Record<string, string> = {
  covered: '✓ Complete',
  missing: '○ Needs Research',
};

export function humanizeCoverageStatus(status: string | null | undefined): string {
  return COVERAGE_STATUS_LABELS[status ?? ''] ?? status ?? '—';
}

// ── Field Names ─────────────────────────────────────────────────────

const FIELD_NAME_LABELS: Record<string, string> = {
  companyName:       'Company Name',
  domain:            'Domain',
  rootDomain:        'Root Domain',
  canonicalUrl:      'Website URL',
  industry:          'Industry',
  classification:    'Classification',
  leadership:        'Leadership',
  crmContacts:       'CRM Contacts',
  technologies:      'Technologies',
  signals:           'Signals',
  interactions:      'Interactions',
  evidence:          'Evidence',
  painPoints:        'Pain Points',
  benchmarks:        'Benchmarks',
  actionCandidates:  'Action Candidates',
  competitors:       'Competitors',
  linkedin:          'LinkedIn',
  brief:             'Research Brief',
  initial_scan:      'Initial Scan',
  discovery:         'Discovery',
  crawl:             'Content Crawl',
  extraction:        'Evidence Extraction',
  verification:      'Claim Verification',
};

export function humanizeFieldName(raw: string | null | undefined): string {
  if (!raw) return '';
  return FIELD_NAME_LABELS[raw] ?? humanizeCamelOrSnake(raw);
}

// ── Relative Time ───────────────────────────────────────────────────

const SHORT_MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

export function formatRelativeTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (isNaN(date.getTime())) return '';

  const now = Date.now();
  const diffMs = now - date.getTime();

  if (diffMs < 0) return 'just now';
  if (diffMs < 60_000) return 'just now';
  if (diffMs < 3_600_000) return `${Math.floor(diffMs / 60_000)}m ago`;
  if (diffMs < 86_400_000) return `${Math.floor(diffMs / 3_600_000)}h ago`;
  if (diffMs < 604_800_000) return `${Math.floor(diffMs / 86_400_000)}d ago`;

  const month = SHORT_MONTHS[date.getMonth()];
  const day = date.getDate();
  const year = date.getFullYear();
  const currentYear = new Date().getFullYear();

  return year === currentYear ? `${month} ${day}` : `${month} ${day}, ${year}`;
}

/** Format a timestamp for display — returns '—' for missing values */
export function formatTimestamp(iso: string | null | undefined): string {
  return formatRelativeTime(iso) || '—';
}

// ── Utility ─────────────────────────────────────────────────────────

function humanizeSnakeCase(value: string): string {
  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function humanizeCamelOrSnake(value: string): string {
  return value
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
