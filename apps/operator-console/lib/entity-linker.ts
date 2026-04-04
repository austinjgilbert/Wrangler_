/**
 * entity-linker.ts — Detects entity mentions in chat responses and generates
 * navigation links to corresponding app pages.
 *
 * Takes the response text + sources array from the chat backend and returns
 * React nodes with inline <Link> components for recognized entities.
 */

import type { Source } from './use-chat';

/* ─── Types ─────────────────────────────────────────────────────────────── */

export type EntityRef = {
  /** Display name as it appears in the text (e.g. "Acme Corp") */
  name: string;
  /** Entity type from source string (e.g. "account", "signal", "person") */
  type: 'account' | 'signal' | 'person' | 'unknown';
  /** Entity ID from source string (e.g. "acme-corp") */
  id: string;
  /** App route to navigate to */
  href: string;
};

/* ─── Entity Extraction ─────────────────────────────────────────────────── */

/**
 * Parse "account:acme-corp" style source strings into structured refs.
 */
function parseSourceRef(source: string): { type: string; id: string } | null {
  if (!source || typeof source !== 'string') return null;
  const colonIdx = source.indexOf(':');
  if (colonIdx === -1) return { type: 'unknown', id: source };
  const type = source.slice(0, colonIdx).toLowerCase().trim();
  const id = source.slice(colonIdx + 1).trim();
  if (!id) return null;
  return { type, id };
}

/**
 * Build a route for a given entity type + id.
 */
function entityHref(type: string, id: string): string | null {
  switch (type) {
    case 'account':
      return `/accounts/${encodeURIComponent(id)}`;
    case 'signal':
      return `/signals`;
    case 'person':
      // No person detail page yet — return null
      return null;
    default:
      return null;
  }
}

/**
 * Extract entity references from the sources array.
 * Returns a map of display names → EntityRef.
 *
 * Heuristic: the `fact` field often contains the entity name.
 * We also derive a likely display name from the source ID
 * (e.g. "acme-corp" → "Acme Corp").
 */
export function extractEntityRefs(sources: Source[]): EntityRef[] {
  const refs: EntityRef[] = [];
  const seen = new Set<string>();

  for (const s of sources) {
    const parsed = parseSourceRef(s.source);
    if (!parsed) continue;
    const { type, id } = parsed;
    const href = entityHref(type, id);
    if (!href || seen.has(id)) continue;
    seen.add(id);

    // Derive display name from ID: "acme-corp" → "Acme Corp"
    const derivedName = id
      .split(/[-_]/)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');

    refs.push({
      name: derivedName,
      type: type as EntityRef['type'],
      id,
      href,
    });
  }

  return refs;
}

/**
 * Match bold text patterns (**Name**) in the response against known entities.
 * Returns the EntityRef if the bold text matches an entity name (fuzzy).
 */
export function matchBoldEntity(
  boldText: string,
  entities: EntityRef[],
): EntityRef | null {
  const normalized = boldText.toLowerCase().trim();

  for (const e of entities) {
    // Exact match on derived name
    if (e.name.toLowerCase() === normalized) return e;

    // Exact match on ID
    if (e.id.toLowerCase() === normalized) return e;

    // Fuzzy: bold text contains the entity name or vice versa
    if (
      normalized.includes(e.name.toLowerCase()) ||
      e.name.toLowerCase().includes(normalized)
    ) {
      return e;
    }

    // Fuzzy: compare without spaces/hyphens
    const normClean = normalized.replace(/[\s\-_]/g, '');
    const entityClean = e.name.toLowerCase().replace(/[\s\-_]/g, '');
    if (normClean === entityClean) return e;
  }

  return null;
}

/* ─── Navigation Suggestions ────────────────────────────────────────────── */

/**
 * Check if a suggestion chip should navigate instead of sending a message.
 * Returns the href if it's a navigation suggestion, null otherwise.
 */
export function suggestionNavHref(
  suggestion: string,
  entities: EntityRef[],
): string | null {
  const lower = suggestion.toLowerCase().trim();

  // Direct navigation patterns
  if (lower.startsWith('view ') || lower.startsWith('go to ') || lower.startsWith('show all ')) {
    // "View full Acme brief →" → try to match an entity
    for (const e of entities) {
      if (lower.includes(e.name.toLowerCase()) || lower.includes(e.id.toLowerCase())) {
        return e.href;
      }
    }

    // Generic navigation patterns
    if (lower.includes('signal')) return '/signals';
    if (lower.includes('account')) return '/accounts';
    if (lower.includes('pipeline') || lower.includes('action')) return '/pipeline';
    if (lower.includes('pattern')) return '/patterns';
    if (lower.includes('research') || lower.includes('brief')) return '/research';
    if (lower.includes('system') || lower.includes('diagnostic')) return '/system';
    if (lower.includes('overview') || lower.includes('dashboard')) return '/overview';
  }

  return null;
}
