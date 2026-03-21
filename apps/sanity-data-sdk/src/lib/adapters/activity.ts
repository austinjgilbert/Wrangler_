/**
 * Activity event adapter — parses molt.event docs into typed UI models.
 *
 * All blob parsing happens here. Components never call JSON.parse directly.
 * Malformed eventData → fallback values, never crashes.
 *
 * @see activity-system-ux-spec v1.0
 * @see activity-system-architecture v1.0
 */

// ── Types ───────────────────────────────────────────────────────────

export type ActivityEventType = 'prompt' | 'job' | 'data_write' | 'system' | 'capture';
export type ActivityStatus = 'queued' | 'processing' | 'completed' | 'failed';
export type ActivitySource = 'gpt' | 'extension' | 'worker' | 'cron' | 'app';
export type ActivityCategory = 'enrichment' | 'interaction' | 'capture' | 'research' | 'system';

/** Raw molt.event document from Sanity (via useDocuments) */
export interface MoltEventDoc {
  documentId: string;
  eventType?: string;
  status?: string;
  source?: string;
  accountKey?: string | null;
  timestamp?: string;
  category?: string;
  eventData?: string;
  _createdAt?: string;
}

/** Parsed activity event — ready for UI rendering */
export interface ParsedActivityEvent {
  // Identity
  id: string;

  // Index fields (direct from GROQ)
  eventType: ActivityEventType;
  status: ActivityStatus;
  source: ActivitySource;
  accountKey: string | null;
  timestamp: string;
  category: ActivityCategory;

  // Parsed from eventData blob
  message: string;
  accountName: string | null;
  promptText: string | null;
  stage: string | null;
  progress: number | null;
  error: string | null;
  domain: string | null;
  personName: string | null;
  jobId: string | null;
}

// ── Valid value sets (for defensive parsing) ────────────────────────

const VALID_EVENT_TYPES = new Set<ActivityEventType>([
  'prompt', 'job', 'data_write', 'system', 'capture',
]);
const VALID_STATUSES = new Set<ActivityStatus>([
  'queued', 'processing', 'completed', 'failed',
]);
const VALID_SOURCES = new Set<ActivitySource>([
  'gpt', 'extension', 'worker', 'cron', 'app',
]);
const VALID_CATEGORIES = new Set<ActivityCategory>([
  'enrichment', 'interaction', 'capture', 'research', 'system',
]);

// ── Parser ──────────────────────────────────────────────────────────

/**
 * Parse a raw molt.event document into a typed ParsedActivityEvent.
 * Defensive: malformed blob → fallback values, never throws.
 */
export function parseActivityEvent(raw: MoltEventDoc): ParsedActivityEvent {
  // Parse the JSON blob — always in try/catch
  let data: Record<string, any> = {};
  try {
    if (raw.eventData) {
      data = JSON.parse(raw.eventData);
    }
  } catch {
    // Malformed blob — use empty object, card shows fallback message
    data = {};
  }

  const eventType = VALID_EVENT_TYPES.has(raw.eventType as ActivityEventType)
    ? (raw.eventType as ActivityEventType)
    : 'system';

  return {
    id: raw.documentId,
    eventType,
    status: VALID_STATUSES.has(raw.status as ActivityStatus)
      ? (raw.status as ActivityStatus)
      : 'completed',
    source: VALID_SOURCES.has(raw.source as ActivitySource)
      ? (raw.source as ActivitySource)
      : 'worker',
    accountKey: raw.accountKey || null,
    timestamp: raw.timestamp || raw._createdAt || new Date().toISOString(),
    category: VALID_CATEGORIES.has(raw.category as ActivityCategory)
      ? (raw.category as ActivityCategory)
      : 'system',

    // Blob fields — all defensive with fallbacks
    message: data.message || `${eventType} event`,
    accountName: data.accountName || null,
    promptText: data.promptText || null,
    stage: data.stage || null,
    progress: typeof data.progress === 'number' ? data.progress : null,
    error: data.error ? String(data.error).slice(0, 200) : null,
    domain: data.domain || null,
    personName: data.personName || null,
    jobId: data.jobId || null,
  };
}

// ── Filter helpers ──────────────────────────────────────────────────

export type ActivityFilterTab = 'all' | ActivityEventType;

/** Build useDocuments filter string for the active tab + status */
export function buildActivityFilter(
  tab: ActivityFilterTab,
  statusFilter: 'all' | 'active' | 'completed' | 'failed'
): string {
  const parts: string[] = ['defined(eventType)'];

  if (tab !== 'all') {
    parts.push(`eventType == "${tab}"`);
  }

  if (statusFilter === 'active') {
    parts.push('status in ["queued", "processing"]');
  } else if (statusFilter === 'completed') {
    parts.push('status == "completed"');
  } else if (statusFilter === 'failed') {
    parts.push('status == "failed"');
  }

  return parts.join(' && ');
}
