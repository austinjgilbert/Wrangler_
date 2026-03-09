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

// ============================================
// Dashboard Hooks
// ============================================

export function useDashboardStats() {
  return useSWR<DashboardStats>('dashboard-stats', () => api.dashboard.getStats(), {
    refreshInterval: 30000, // Refresh every 30 seconds
  });
}

export function useRecentActivity(limit?: number) {
  return useSWR(['recent-activity', limit], () => api.dashboard.getActivity(limit), {
    refreshInterval: 10000, // Refresh every 10 seconds
  });
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
        // Poll more frequently while scanning
        if (data?.status === 'pending' || data?.status === 'scanning') {
          return 2000;
        }
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
      // Invalidate scan history
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
    () => api.osint.getReport(reportId!),
    {
      refreshInterval: (data) => {
        if (data?.status === 'pending' || data?.status === 'processing') {
          return 3000;
        }
        return 0;
      },
    }
  );
}

export function useOsintReports(limit?: number) {
  return useSWR(['osint-reports', limit], () => api.osint.getReports(limit));
}

export function useStartOsintReport() {
  return useSWRMutation(
    'start-osint',
    async (_, { arg }: { arg: OsintRequest }) => {
      const result = await api.osint.startReport(arg);
      mutate((key) => Array.isArray(key) && key[0] === 'osint-reports');
      return result;
    }
  );
}

// ============================================
// Enrichment Hooks
// ============================================

export function useEnrichment(enrichmentId: string | null) {
  return useSWR<EnrichedAccount>(
    enrichmentId ? ['enrichment', enrichmentId] : null,
    () => api.enrichment.getEnrichment(enrichmentId!),
    {
      refreshInterval: (data) => {
        if (data?.status === 'pending' || data?.status === 'enriching') {
          return 2000;
        }
        return 0;
      },
    }
  );
}

export function useEnrichments(status?: string) {
  return useSWR(['enrichments', status], () => api.enrichment.getEnrichments(status), {
    refreshInterval: 15000,
  });
}

export function useStartEnrichment() {
  return useSWRMutation(
    'start-enrichment',
    async (_, { arg }: { arg: EnrichmentRequest }) => {
      const result = await api.enrichment.startEnrichment(arg);
      mutate((key) => Array.isArray(key) && key[0] === 'enrichments');
      return result;
    }
  );
}

export function useBulkEnrichment() {
  return useSWRMutation(
    'bulk-enrichment',
    async (_, { arg }: { arg: EnrichmentRequest[] }) => {
      const result = await api.enrichment.bulkEnrich(arg);
      mutate((key) => Array.isArray(key) && key[0] === 'enrichments');
      return result;
    }
  );
}

// ============================================
// Accounts Hooks
// ============================================

export function useAccounts(filters?: AccountsFilter) {
  return useSWR(
    ['accounts', filters],
    () => api.accounts.getAccounts(filters),
    {
      refreshInterval: 30000,
    }
  );
}

export function useAccount(accountId: string | null) {
  return useSWR<Account>(
    accountId ? ['account', accountId] : null,
    () => api.accounts.getAccount(accountId!)
  );
}

export function useCreateAccount() {
  return useSWRMutation(
    'create-account',
    async (_, { arg }: { arg: Partial<Account> }) => {
      const result = await api.accounts.createAccount(arg);
      mutate((key) => Array.isArray(key) && key[0] === 'accounts');
      return result;
    }
  );
}

export function useUpdateAccount() {
  return useSWRMutation(
    'update-account',
    async (_, { arg }: { arg: { accountId: string; data: Partial<Account> } }) => {
      const result = await api.accounts.updateAccount(arg.accountId, arg.data);
      mutate((key) => Array.isArray(key) && key[0] === 'accounts');
      mutate(['account', arg.accountId]);
      return result;
    }
  );
}

export function useDeleteAccount() {
  return useSWRMutation(
    'delete-account',
    async (_, { arg }: { arg: string }) => {
      const result = await api.accounts.deleteAccount(arg);
      mutate((key) => Array.isArray(key) && key[0] === 'accounts');
      return result;
    }
  );
}

// ============================================
// LinkedIn Hooks
// ============================================

export function useAnalyzeLinkedIn() {
  return useSWRMutation(
    'analyze-linkedin',
    async (_, { arg }: { arg: string }) => {
      return api.linkedin.analyzeProfile(arg);
    }
  );
}

export function useFindLinkedInProfiles() {
  return useSWRMutation(
    'find-linkedin-profiles',
    async (_, { arg }: { arg: { companyName: string; titles?: string[] } }) => {
      return api.linkedin.findProfiles(arg.companyName, arg.titles);
    }
  );
}
