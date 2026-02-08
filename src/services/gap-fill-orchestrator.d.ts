/**
 * Type declarations for gap-fill-orchestrator.js
 */

import type { GapFillRequest, EnrichmentStage } from '../../shared/types';

export interface GapFillOptions {
  env: any;
  accountKey: string;
  canonicalUrl?: string;
  domain?: string;
  trigger?: string;
  scanData?: any;
}

export interface GapFillResult {
  triggered: boolean;
  reason?: string;
  accountKey?: string;
  stagesRun?: EnrichmentStage[];
  completeness?: number;
}

export function triggerGapFill(opts: GapFillOptions): Promise<GapFillResult>;
