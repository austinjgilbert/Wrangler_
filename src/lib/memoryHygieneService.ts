export function compactRuleSet(values: string[], maxItems: number): string[] {
  const normalized = uniqueStrings(values || []);
  return normalized.slice(Math.max(0, normalized.length - maxItems));
}

export function mergeDuplicateInsights(values: string[]): string[] {
  return uniqueStrings(values || []);
}

export function detectConflictingNotes(values: string[]): Array<{ left: string; right: string }> {
  const notes = uniqueStrings(values || []);
  const conflicts: Array<{ left: string; right: string }> = [];
  for (let i = 0; i < notes.length; i += 1) {
    for (let j = i + 1; j < notes.length; j += 1) {
      if (areConflicting(notes[i], notes[j])) {
        conflicts.push({ left: notes[i], right: notes[j] });
      }
    }
  }
  return conflicts;
}

export function rankMemoryTrust(input: {
  observedAt?: string;
  lastValidatedAt?: string;
  uncertaintyState?: string;
  referenceCount?: number;
}): number {
  const referenceBoost = Math.min(Number(input.referenceCount || 0), 10) * 0.04;
  const freshnessPenalty = ageInDays(input.lastValidatedAt || input.observedAt) > 30 ? 0.2 : 0;
  const uncertaintyPenalty = input.uncertaintyState === 'contradictory'
    ? 0.45
    : input.uncertaintyState === 'weakly_inferred'
      ? 0.2
      : 0;
  return clamp(0.65 + referenceBoost - freshnessPenalty - uncertaintyPenalty, 0, 1);
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values || []) {
    const normalized = String(value || '').trim();
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(normalized);
  }
  return out;
}

function areConflicting(left: string, right: string): boolean {
  const a = left.toLowerCase();
  const b = right.toLowerCase();
  return (a.includes('enterprise') && b.includes('small'))
    || (a.includes('small') && b.includes('enterprise'))
    || (a.includes('legacy') && b.includes('modern'))
    || (a.includes('modern') && b.includes('legacy'));
}

function ageInDays(value?: string): number {
  if (!value) return 999;
  return Math.max(0, (Date.now() - new Date(value).getTime()) / (1000 * 60 * 60 * 24));
}

function clamp(value: number, min: number, max: number): number {
  const numeric = Number.isFinite(value) ? value : min;
  return Math.max(min, Math.min(max, numeric));
}
