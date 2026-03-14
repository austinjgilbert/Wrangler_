 'use client';

import useSWR, { mutate, useSWRConfig } from 'swr';
import useSWRMutation from 'swr/mutation';
import {
  api,
  type ScanRequest,
  type ScanResponse,
  type OsintRequest,
  type OsintReport as ApiOsintReport,
  type EnrichmentRequest,
  type EnrichedAccount,
  type Account as ApiAccount,
  type AccountsFilter,
} from '@/lib/api-client';
import type {
  Account as UiAccount,
  ActivityItem,
  DashboardMetrics,
  EnrichmentJob,
} from '@/lib/types';

const ENRICHMENT_STAGES = [
  'Account Validation',
  'Domain Resolution',
  'Page Crawling',
  'Technology Detection',
  'Source Selection',
  'Signal Extraction',
  'Knowledge Graph Update',
];

type Snapshot = {
  serviceHealth?: {
    status?: string;
    code?: string;
    title?: string;
    message?: string;
    action?: string;
    manageUrl?: string;
    providerMessage?: string | null;
  };
  overview?: {
    intelligenceStatus?: {
      accountsIndexed?: number;
      peopleIndexed?: number;
      signalsToday?: number;
      activeOpportunities?: number;
      systemCompletion?: number;
    };
  };
  entities?: {
    accounts?: Array<{
      id: string;
      accountKey?: string;
      name: string;
      domain: string | null;
      canonicalUrl?: string | null;
      completion: number;
      opportunityScore: number;
      missing?: string[];
      nextStages?: string[];
      technologies?: string[];
    }>;
    people?: Array<{
      id: string;
      name: string;
      title?: string | null;
      accountId?: string | null;
      accountName?: string | null;
      seniority?: string | null;
    }>;
  };
  signals?: {
    recent?: Array<{
      id: string;
      signalType: string;
      accountName: string;
      timestamp: string;
      source?: string;
      uncertaintyState?: string;
    }>;
  };
  research?: {
    briefs?: Array<{
      id: string;
      title?: string;
      summary?: string;
      summaryMarkdown?: string;
      generatedAt?: string;
      topActions?: Array<{
        action?: string;
        whyNow?: string;
        confidence?: number;
        score?: number;
      }>;
    }>;
  };
  jobs?: {
    running?: number;
    queued?: number;
    recent?: Array<{
      id: string;
      jobType?: string;
      targetEntity?: string | null;
      status?: string;
      updatedAt?: string;
      currentStage?: string | number | null;
      error?: string | null;
    }>;
  };
  patterns?: {
    active?: Array<{
      id: string;
      type: string;
      summary?: string;
      lifecycleState?: string;
      matchFrequency?: number;
      conversionAssociation?: number;
      recommendedMoves?: string[];
    }>;
  };
  metrics?: {
    drift?: Array<{
      label: string;
      value: number;
      severity?: string;
    }>;
  };
  systemLab?: {
    capabilities?: Array<{
      id: string;
      label: string;
      enabled?: boolean;
    }>;
    learningMode?: {
      operatorFeedbackCaptured?: number;
      patternsStrengthened?: number;
      patternsWeakened?: number;
      signalWeightsUpdated?: number;
    };
    policyManagement?: Record<
      string,
      | {
          versionId?: string;
          activationStatus?: string;
        }
      | null
      | undefined
    >;
  };
};

async function fetcher(url: string) {
  const response = await fetch(url, { cache: 'no-store' });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(json?.error?.message || `Request failed: ${response.status}`);
  }
  return json?.data ?? json?.result ?? json;
}

function normalizeJobStatus(status?: string): EnrichmentJob['status'] {
  switch (status) {
    case 'running':
    case 'in_progress':
    case 'enriching':
      return 'in_progress';
    case 'completed':
    case 'complete':
      return 'complete';
    case 'failed':
      return 'failed';
    default:
      return 'queued';
  }
}

function normalizeAccountJobStatus(status?: string): UiAccount['enrichmentStatus'] {
  const normalized = normalizeJobStatus(status);
  return normalized === 'queued' ? 'pending' : normalized;
}

function parseStageIndex(stage: string | number | null | undefined, status?: string) {
  if (typeof stage === 'number' && Number.isFinite(stage)) {
    return Math.max(0, Math.min(ENRICHMENT_STAGES.length, stage));
  }

  if (typeof stage === 'string') {
    const stagedMatch = stage.match(/stage\s+(\d+)\s*\/\s*\d+/i);
    if (stagedMatch) {
      return Math.max(0, Math.min(ENRICHMENT_STAGES.length, Number(stagedMatch[1])));
    }

    const namedIndex = ENRICHMENT_STAGES.findIndex((item) =>
      item.toLowerCase() === stage.toLowerCase().trim(),
    );
    if (namedIndex >= 0) {
      return namedIndex + 1;
    }
  }

  if (status === 'completed' || status === 'complete') return ENRICHMENT_STAGES.length;
  if (status === 'failed') return ENRICHMENT_STAGES.length;
  if (status === 'running' || status === 'in_progress') return 1;
  return 0;
}

function toActivityItems(snapshot?: Snapshot, limit = 10): ActivityItem[] {
  return (snapshot?.signals?.recent || []).slice(0, limit).map((signal) => ({
    id: signal.id,
    type: 'research',
    title: signal.signalType || 'Signal detected',
    description: `${signal.accountName || 'Unknown account'} via ${signal.source || 'system'}`,
    accountKey: signal.accountName || undefined,
    timestamp: signal.timestamp,
    status: signal.uncertaintyState === 'needs_validation' ? 'pending' : 'success',
  }));
}

function toTopTechStacks(snapshot?: Snapshot): DashboardMetrics['topTechStacks'] {
  const counts = new Map<string, number>();
  for (const account of snapshot?.entities?.accounts || []) {
    for (const technology of account.technologies || []) {
      counts.set(technology, (counts.get(technology) || 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);
}

function toUiAccounts(snapshot?: Snapshot): UiAccount[] {
  const recentSignals = snapshot?.signals?.recent || [];
  const jobs = snapshot?.jobs?.recent || [];

  return (snapshot?.entities?.accounts || []).map((account) => {
    const lastSignal = recentSignals.find((signal) => signal.accountName === account.name);
    const matchingJob = jobs.find(
      (job) =>
        job.targetEntity === account.accountKey ||
        job.id.includes(account.id) ||
        job.id.includes(account.domain || '')
    );
    const jobStatus = normalizeAccountJobStatus(matchingJob?.status);

    return {
      _id: account.id,
      accountKey: account.accountKey ?? account.id,
      companyName: account.name,
      canonicalUrl: account.canonicalUrl || (account.domain ? `https://${account.domain}` : '#'),
      domain: account.domain || '',
      industry: 'Tracked Account',
      employeeCount: undefined,
      techStack: account.technologies || [],
      aiReadinessScore: Math.round(Number(account.opportunityScore || account.completion || 0)),
      lastScanDate: lastSignal?.timestamp,
      lastOsintDate: snapshot?.research?.briefs?.[0]?.generatedAt,
      enrichmentStatus: matchingJob ? jobStatus : 'pending',
      tags: account.nextStages?.slice(0, 2) || [],
    };
  });
}

function toEnrichmentJobs(snapshot?: Snapshot): EnrichmentJob[] {
  return (snapshot?.jobs?.recent || [])
    .filter((job) => /enrich|search|scan|research/i.test(job.jobType || '') || job.currentStage)
    .slice(0, 12)
    .map((job) => {
      const currentStage = parseStageIndex(job.currentStage, job.status);
      return {
        accountKey: job.targetEntity || job.jobType || job.id,
        status: normalizeJobStatus(job.status),
        currentStage,
        totalStages: ENRICHMENT_STAGES.length,
        startedAt: job.updatedAt || new Date().toISOString(),
        completedAt:
          normalizeJobStatus(job.status) === 'complete' ? job.updatedAt || undefined : undefined,
        errors: job.error ? [job.error] : undefined,
      };
    });
}

// ============================================
// Snapshot Hook (Real Backend Data)
// ============================================

export function useSnapshot() {
  return useSWR<Snapshot>('/api/console/snapshot', fetcher, {
    refreshInterval: 15000,
  });
}

// ============================================
// Dashboard Hooks
// ============================================

export function useDashboardStats() {
  const { data: snapshot, ...rest } = useSnapshot();

  const accounts = toUiAccounts(snapshot);
  const stats: DashboardMetrics | undefined = snapshot
    ? {
        totalAccounts: snapshot.overview?.intelligenceStatus?.accountsIndexed || 0,
        accountsScannedThisWeek: snapshot.overview?.intelligenceStatus?.signalsToday || 0,
        osintReportsGenerated: snapshot.research?.briefs?.length || 0,
        enrichmentJobsRunning: snapshot.jobs?.running || 0,
        avgAiReadinessScore: accounts.length
          ? Math.round(
              accounts.reduce((sum, account) => sum + Number(account.aiReadinessScore || 0), 0) /
                accounts.length,
            )
          : 0,
        topTechStacks: toTopTechStacks(snapshot),
        recentActivity: toActivityItems(snapshot),
      }
    : undefined;

  return { data: stats, ...rest };
}

export function useRecentActivity(limit?: number) {
  const { data: snapshot, ...rest } = useSnapshot();
  const activities = snapshot ? toActivityItems(snapshot, limit || 10) : undefined;
  return { data: activities, ...rest };
}

// ============================================
// Scanner Hooks
// ============================================

export function useScan(scanId: string | null) {
  return useSWR<ScanResponse>(
    scanId ? ['scan', scanId] : null,
    () => api.scanner.getScan(scanId!),
    {
      refreshInterval: (data) => {
        if (data?.status === 'pending' || data?.status === 'scanning') return 2000;
        return 0;
      },
    }
  );
}

export function useScanHistory(limit?: number) {
  return useSWR(['scan-history', limit], () => api.scanner.getScanHistory(limit));
}

export function useStartScan() {
  return useSWRMutation(
    'start-scan',
    async (_, { arg }: { arg: ScanRequest }) => {
      const result = await api.scanner.startScan(arg);
      mutate((key) => Array.isArray(key) && key[0] === 'scan-history');
      return result;
    }
  );
}

// ============================================
// OSINT Hooks
// ============================================

export function useOsintReport(reportId: string | null) {
  return useSWR<ApiOsintReport>(
    reportId ? ['osint-report', reportId] : null,
    () => api.osint.getReport(reportId!)
  );
}

export function useOsintReports(limit?: number) {
  return useSWR(['osint-reports', limit], () => api.osint.getReports(limit));
}

export function useStartOsintReport() {
  return useSWRMutation(
    'start-osint',
    async (_, { arg }: { arg: OsintRequest }) => {
      return await api.osint.startReport(arg);
    }
  );
}

// ============================================
// Enrichment Hooks
// ============================================

export function useEnrichment(enrichmentId: string | null) {
  return useSWR<EnrichedAccount>(
    enrichmentId ? ['enrichment', enrichmentId] : null,
    () => api.enrichment.getEnrichment(enrichmentId!)
  );
}

export function useEnrichments(status?: string) {
  const { data: snapshot, ...rest } = useSnapshot();
  const enrichments = snapshot ? toEnrichmentJobs(snapshot) : undefined;
  const filtered = status
    ? enrichments?.filter((job) => job.status === status)
    : enrichments;
  return { data: filtered, ...rest };
}

export function useStartEnrichment() {
  return useSWRMutation(
    'start-enrichment',
    async (_, { arg }: { arg: EnrichmentRequest }) => {
      return await api.enrichment.startEnrichment(arg);
    }
  );
}

export function useBulkEnrichment() {
  return useSWRMutation(
    'bulk-enrichment',
    async (_, { arg }: { arg: EnrichmentRequest[] }) => {
      return await api.enrichment.bulkEnrich(arg);
    }
  );
}

// ============================================
// Accounts Hooks
// ============================================

export function useAccounts(filters?: AccountsFilter) {
  const { data: snapshot, ...rest } = useSnapshot();
  let accounts = toUiAccounts(snapshot);

  if (filters?.search) {
    const query = filters.search.toLowerCase();
    accounts = accounts.filter(
      (account) =>
        account.companyName.toLowerCase().includes(query) ||
        account.domain.toLowerCase().includes(query),
    );
  }

  if (filters?.enrichmentStatus) {
    accounts = accounts.filter((account) => account.enrichmentStatus === filters.enrichmentStatus);
  }

  const limitedAccounts =
    typeof filters?.limit === 'number' ? accounts.slice(0, filters.limit) : accounts;

  return {
    data: snapshot
      ? {
          accounts: limitedAccounts,
          total: accounts.length,
        }
      : undefined,
    ...rest,
  };
}

export function useAccount(accountId: string | null) {
  return useSWR<ApiAccount>(
    accountId ? ['account', accountId] : null,
    () => api.accounts.getAccount(accountId!)
  );
}

// ============================================
// Console Enrichment (proxy via Next.js)
// ============================================

export type EnrichmentStatusState =
  | 'not_run'
  | 'queued'
  | 'in_progress'
  | 'complete'
  | 'failed';

export interface EnrichmentStatusResponse {
  status: EnrichmentStatusState;
  jobId?: string;
  progress?: number;
  currentStage?: string;
  estimatedTimeRemaining?: number;
  hasResearchSet?: boolean;
  advanceError?: string;
  [key: string]: unknown;
}

async function fetchConsoleJson(path: string, init?: RequestInit) {
  const res = await fetch(path, { ...init, cache: 'no-store' });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error?.message || `Request failed: ${res.status}`);
  return json?.data ?? json?.result ?? json;
}

function normalizeEnrichmentStatus(r: EnrichmentStatusResponse): EnrichmentStatusResponse {
  const raw = (r?.status ?? 'not_run') as string;
  const status = raw === 'not_started' ? 'not_run' : (raw as EnrichmentStatusState);
  const progress = r?.progress ?? 0;
  const displayStatus =
    status === 'in_progress' && progress === 0 ? 'queued' : status;
  return { ...r, status: displayStatus as EnrichmentStatusState, progress };
}

export function useEnrichmentStatus(accountKey: string | null) {
  return useSWR<EnrichmentStatusResponse>(
    accountKey ? ['enrichment-status', accountKey] : null,
    () =>
      fetchConsoleJson(
        `/api/console/enrich/status?${new URLSearchParams({ accountKey: accountKey! })}`
      ).then((r) => normalizeEnrichmentStatus(r?.status ?? r)),
    { refreshInterval: (data) => (data?.status === 'in_progress' || data?.status === 'queued' ? 3000 : 0) }
  );
}

export function useResearchSet(accountKey: string | null) {
  return useSWR(
    accountKey ? ['research-set', accountKey] : null,
    () =>
      fetchConsoleJson(
        `/api/console/enrich/research?${new URLSearchParams({ accountKey: accountKey! })}`
      ).then((r) => r?.researchSet ?? r)
  );
}

export function useAccountDetail(accountId: string | null) {
  return useSWR(
    accountId ? ['account-detail', accountId] : null,
    () =>
      fetchConsoleJson(`/api/console/account/${encodeURIComponent(accountId!)}`).then(
        (r) => r?.account ?? r
      )
  );
}

export function useQueueEnrichment() {
  const { mutate } = useSWRConfig();
  return useSWRMutation(
    'queue-enrichment',
    async (
      _,
      {
        arg,
      }: {
        arg: { accountKey: string; canonicalUrl?: string; accountId?: string };
      }
    ) => {
      const res = await fetchConsoleJson('/api/console/enrich/queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(arg),
      });
      mutate('/api/console/snapshot');
      return res;
    }
  );
}

export function useCreateAccount() {
  return useSWRMutation(
    'create-account',
    async (_, { arg }: { arg: Partial<ApiAccount> }) => api.accounts.createAccount(arg),
  );
}

export function useUpdateAccount() {
  return useSWRMutation(
    'update-account',
    async (_, { arg }: { arg: { accountId: string; data: Partial<ApiAccount> } }) =>
      api.accounts.updateAccount(arg.accountId, arg.data),
  );
}

export function useDeleteAccount() {
  return useSWRMutation('delete-account', async (_, { arg }: { arg: string }) => api.accounts.deleteAccount(arg));
}

// ============================================
// LinkedIn Hooks
// ============================================

export function useAnalyzeLinkedIn() {
  return useSWRMutation('analyze-linkedin', async (_, { arg }: { arg: string }) => api.linkedin.analyzeProfile(arg));
}

export function useFindLinkedInProfiles() {
  return useSWRMutation('find-linkedin-profiles', async (_, { arg }: { arg: { companyName: string; titles?: string[] } }) => api.linkedin.findProfiles(arg.companyName, arg.titles));
}
