/**
 * Type declarations for content-os-enrichment.js
 */

export interface ContentOSResult {
  technologies: { linked: number; created: number };
  painPoints: Array<{ category: string; description: string; severity: string }>;
  leadership: { linked: number };
  competitors: { linked: number };
  benchmarks: Record<string, any>;
}

export function enrichContentOS(
  groqQuery: Function,
  upsertDocument: Function,
  patchDocument: Function,
  client: any,
  account: any,
  accountPack: any,
): Promise<ContentOSResult>;

export function linkTechnologies(
  groqQuery: Function,
  upsertDocument: Function,
  patchDocument: Function,
  client: any,
  account: any,
  accountPack: any,
): Promise<{ linked: number; created: number }>;

export function extractPainPoints(
  account: any,
  accountPack: any,
): Array<{ category: string; description: string; severity: string }>;

export function extractBenchmarks(
  account: any,
  accountPack: any,
): Record<string, any>;

export function linkLeadership(
  groqQuery: Function,
  upsertDocument: Function,
  patchDocument: Function,
  client: any,
  account: any,
  accountPack: any,
): Promise<{ linked: number }>;

export function linkCompetitors(
  groqQuery: Function,
  patchDocument: Function,
  client: any,
  account: any,
  accountPack: any,
): Promise<{ linked: number }>;
