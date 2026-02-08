/**
 * Type declarations for account-completeness.js
 */

import type { CompletenessScore, EnrichmentStage } from '../../shared/types';

export interface CompletenessDimension {
  present: boolean;
  weight: number;
  label: string;
}

export interface CompletenessAnalysis {
  score: number;
  dimensions: Record<string, CompletenessDimension>;
  gaps: string[];
  nextStages: string[];
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

export function analyseCompleteness(account: any, accountPack: any, enrichmentJob?: any): CompletenessAnalysis;
export function buildCompletenessSummary(analysis: CompletenessAnalysis): CompletenessSummary;
export function needsBackgroundWork(account: any, accountPack: any): WorkNeeded;
