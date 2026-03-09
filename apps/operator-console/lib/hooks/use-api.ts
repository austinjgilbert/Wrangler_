'use client';

import useSWR, { mutate } from 'swr';
import useSWRMutation from 'swr/mutation';
import {
  api,
  type ScanRequest,
  type ScanResponse,
  type OsintRequest,
  type OsintReport,
  type EnrichmentRequest,
  type EnrichedAccount,
  type Account,
  type AccountsFilter,
  type DashboardStats,
} from '@/lib/api-client';

const fetcher = (url: string) => fetch(url).then(res => res.json()).then(res => res.result || res.data || res);

// ============================================
// Snapshot Hook (Real Backend Data)
// ============================================

export function useSnapshot() {
  return useSWR('/api/console/snapshot', fetcher, {
    refreshInterval: 15000,
  });
}

// ============================================
// Dashboard Hooks
// ============================================

export function useDashboardStats() {
  const { data: snapshot, ...rest } = useSnapshot();

  const stats = snapshot ? {
    totalAccounts: snapshot.overview?.intelligenceStatus?.accountsIndexed || 0,
    enrichedAccounts: snapshot.overview?.intelligenceStatus?.peopleIndexed || 0, // Approx
    activeScans: snapshot.jobs?.running || 0,
    osintReports: snapshot.research?.briefs?.length || 0,
    recentActivity: (snapshot.signals?.recent || []).slice(0, 10).map((s: any) => ({
      id: s.id,
      type: 'scan',
      action: s.signalType,
      target: s.accountName,
      timestamp: s.timestamp
    })),
    techStackDistribution: (snapshot.entities?.accounts || [])
      .flatMap((a: any) => a.technologies || [])
      .reduce((acc: any, tech: string) => {
        const existing = acc.find((t: any) => t.category === tech);
        if (existing) existing.count++;
        else acc.push({ category: tech, count: 1 });
        return acc;
      }, [])
      .sort((a: any, b: any) => b.count - a.count)
      .slice(0, 8),
    enrichmentQueue: {
      pending: snapshot.jobs?.queued || 0,
      processing: snapshot.jobs?.running || 0,
      completed: 0,
      failed: 0,
    }
  } : undefined;

  return { data: stats as DashboardStats, ...rest };
}

export function useRecentActivity(limit?: number) {
  const { data: snapshot, ...rest } = useSnapshot();
  const activities = snapshot ? (snapshot.signals?.recent || []).slice(0, limit || 10).map((s: any) => ({
    id: s.id,
    type: 'scan',
    action: s.signalType,
    target: s.accountName,
    timestamp: s.timestamp
  })) : undefined;
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
  return useSWR<OsintReport>(
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
  
  const enrichments = snapshot ? snapshot.jobs?.recent?.map((j: any) => ({
    id: j.id,
    companyName: j.targetEntity || j.id.split('.').pop() || j.id,
    domain: '',
    status: j.status === 'running' || j.status === 'in_progress' ? 'enriching' : j.status,
    enrichmentProgress: {
      stage: j.currentStage || 'Processing',
      progress: j.status === 'completed' ? 100 : j.status === 'running' ? 50 : j.status === 'failed' ? 100 : 0,
      currentStep: j.currentStage || j.jobType || j.status
    },
    createdAt: j.updatedAt,
    updatedAt: j.updatedAt,
  })) : undefined;

  return { data: enrichments, ...rest };
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

  const accounts = snapshot ? {
    accounts: (snapshot.entities?.accounts || []).map((a: any) => ({
      id: a.id,
      name: a.name,
      domain: a.domain || 'unknown.com',
      industry: 'Unknown',
      employeeCount: '-',
      revenue: '-',
      status: a.completion > 80 ? 'qualified' : 'enriched',
      enrichmentStatus: 'completed',
      score: a.opportunityScore || 0,
      signals: [],
      lastActivity: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })),
    total: snapshot.overview?.intelligenceStatus?.accountsIndexed || 0,
  } : undefined;

  return { data: accounts, ...rest };
}

export function useAccount(accountId: string | null) {
  return useSWR<Account>(
    accountId ? ['account', accountId] : null,
    () => api.accounts.getAccount(accountId!)
  );
}

export function useCreateAccount() {
  return useSWRMutation('create-account', async (_, { arg }: { arg: Partial<Account> }) => api.accounts.createAccount(arg));
}

export function useUpdateAccount() {
  return useSWRMutation('update-account', async (_, { arg }: { arg: { accountId: string; data: Partial<Account> } }) => api.accounts.updateAccount(arg.accountId, arg.data));
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
