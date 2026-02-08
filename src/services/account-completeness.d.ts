/**
 * Type declarations for account-completeness.js
 */

import type { CompletenessScore, EnrichmentStage } from '../../shared/types';

export interface CompletenessAnalysis {
  score: number;
  filled: Record<string, boolean>;
  gaps: string[];
  nextStages: EnrichmentStage[];
}

export interface CompletenessSummary {
  score: number;
  gaps: string[];
  nextStages: string[];
  dimensionFlags: Record<string, boolean>;
  assessedAt: string;
}

export interface WorkNeeded {
  needed: boolean;
  stages: EnrichmentStage[];
  gaps: string[];
}

export function analyseCompleteness(account: any, accountPack: any): CompletenessAnalysis;
export function buildCompletenessSummary(analysis: CompletenessAnalysis): CompletenessSummary;
export function needsBackgroundWork(account: any, accountPack: any): WorkNeeded;
