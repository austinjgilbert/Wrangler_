/**
 * Adapter layer barrel export.
 * Components import from here — never from individual adapter files.
 */

// Types
export type {
  Account,
  ActionButton,
  BriefingAccount,
  CallItem,
  EmailItem,
  GlanceContext,
  Job,
  LinkedInItem,
  ModuleActiveJob,
  ModuleGlanceProps,
  PipelineStage,
  PipelineStageName,
  RawGoodMorningResponse,
  Signal,
  TopAccount,
  TransformedBriefing,
  Urgency,
} from './types';
export { URGENCY_THRESHOLDS } from './types';

// Account
export {
  transformAccount,
  transformAccounts,
  transformSnapshotAccount,
  transformSnapshotAccounts,
  sortAccountsForSelector,
  type SanityAccountDoc,
  type SnapshotAccount,
} from './account';

// Pipeline
export {
  buildPipelineStages,
  calculatePipelineProgress,
  getPipelineStageConfigs,
  mapBackendStatus,
  type BackendStageData,
} from './pipeline';

// Job
export {
  transformJob,
  transformJobs,
  getStageLabels,
  type BackendJob,
} from './job';

// Briefing
export { transformBriefingResponse } from './briefing';

// Techstack
export { transformTechStack, getTechCount, type TechCategory } from './techstack';

// Fetch
export { workerGet, workerPost, workerPatch, WorkerApiError } from './fetch-worker';

// Cache
export { getCached, setCache, clearCache, invalidateCache } from './cache';

// Module Glance
export {
  MODULE_CONFIGS,
  deriveAllModuleGlanceProps,
  type ModuleConfig,
} from './module-glance';

// Research / Enrichment
export {
  advanceEnrichment,
  fetchEnrichStatus,
  fetchWorkerHealth,
  getResearchSetUrl,
  hasWorker,
  queueEnrichment,
  type EnrichStatus,
  type QueueEnrichmentParams,
  type QueueEnrichmentResult,
} from './research';
