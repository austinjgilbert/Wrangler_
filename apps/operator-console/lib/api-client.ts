// API Client for Wrangler Worker
// Configure NEXT_PUBLIC_API_URL in your environment variables

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8787';

interface ApiOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  body?: unknown;
  headers?: Record<string, string>;
}

class ApiError extends Error {
  constructor(public status: number, message: string, public data?: unknown) {
    super(message);
    this.name = 'ApiError';
  }
}

async function apiRequest<T>(endpoint: string, options: ApiOptions = {}): Promise<T> {
  const { method = 'GET', body, headers = {} } = options;

  const config: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
  };

  if (body) {
    config.body = JSON.stringify(body);
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, config);

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new ApiError(response.status, `API Error: ${response.statusText}`, errorData);
  }

  return response.json();
}

// ============================================
// Website Scanner API
// ============================================

export interface ScanRequest {
  url: string;
  depth?: 'basic' | 'standard' | 'deep';
  includeScreenshot?: boolean;
  includeTechStack?: boolean;
  includePerformance?: boolean;
}

export interface ScanResponse {
  id: string;
  url: string;
  status: 'pending' | 'scanning' | 'completed' | 'failed';
  result?: {
    companyInfo: {
      name: string;
      domain: string;
      description: string;
      industry: string;
      employeeCount: string;
      founded: string;
      headquarters: string;
    };
    techStack: {
      category: string;
      technologies: string[];
    }[];
    performance: {
      loadTime: number;
      pageSize: string;
      requests: number;
      score: number;
    };
    seoData: {
      title: string;
      description: string;
      keywords: string[];
      headings: { h1: number; h2: number; h3: number };
    };
    socialLinks: Record<string, string>;
    contactInfo: {
      emails: string[];
      phones: string[];
      addresses: string[];
    };
    aiSignals: {
      signal: string;
      confidence: number;
      insight: string;
    }[];
  };
  createdAt: string;
  completedAt?: string;
}

export const scannerApi = {
  // Start a new scan
  startScan: (data: ScanRequest) =>
    apiRequest<ScanResponse>('/api/scan', { method: 'POST', body: data }),

  // Get scan status/result
  getScan: (scanId: string) =>
    apiRequest<ScanResponse>(`/api/scan/${scanId}`),

  // Get scan history
  getScanHistory: (limit?: number) =>
    apiRequest<ScanResponse[]>(`/api/scans${limit ? `?limit=${limit}` : ''}`),
};

// ============================================
// OSINT Intelligence API
// ============================================

export interface OsintRequest {
  companyName: string;
  domain?: string;
  linkedinUrl?: string;
  depth?: 'standard' | 'comprehensive';
}

export interface OsintReport {
  id: string;
  companyName: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  report?: {
    summary: string;
    strategicInitiatives: {
      title: string;
      description: string;
      confidence: number;
      sources: string[];
      timeline: string;
    }[];
    risks: {
      category: string;
      description: string;
      severity: 'low' | 'medium' | 'high';
      mitigations: string[];
    }[];
    hiringSignals: {
      department: string;
      roles: string[];
      growth: string;
      insight: string;
    }[];
    digitalSignals: {
      type: string;
      signal: string;
      date: string;
      significance: string;
    }[];
    competitorMentions: {
      competitor: string;
      context: string;
      sentiment: 'positive' | 'neutral' | 'negative';
    }[];
    recommendations: {
      category: string;
      recommendation: string;
      priority: 'low' | 'medium' | 'high';
      rationale: string;
    }[];
  };
  createdAt: string;
  completedAt?: string;
}

export const osintApi = {
  // Start OSINT report generation
  startReport: (data: OsintRequest) =>
    apiRequest<OsintReport>('/api/osint', { method: 'POST', body: data }),

  // Get OSINT report
  getReport: (reportId: string) =>
    apiRequest<OsintReport>(`/api/osint/${reportId}`),

  // Get all reports
  getReports: (limit?: number) =>
    apiRequest<OsintReport[]>(`/api/osint${limit ? `?limit=${limit}` : ''}`),
};

// ============================================
// Account Enrichment API
// ============================================

export interface EnrichmentRequest {
  accountId?: string;
  companyName: string;
  domain: string;
  linkedinUrl?: string;
  enrichmentTypes?: ('basic' | 'contacts' | 'financials' | 'techStack' | 'competitors')[];
}

export interface EnrichedAccount {
  id: string;
  companyName: string;
  domain: string;
  status: 'pending' | 'enriching' | 'completed' | 'failed';
  enrichmentProgress: {
    stage: string;
    progress: number;
    currentStep: string;
  };
  data?: {
    basicInfo: {
      name: string;
      description: string;
      industry: string;
      employeeCount: string;
      revenue: string;
      founded: string;
      headquarters: string;
      website: string;
    };
    contacts: {
      name: string;
      title: string;
      email?: string;
      linkedin?: string;
      department: string;
    }[];
    financials: {
      revenue: string;
      funding: string;
      investors: string[];
      publiclyTraded: boolean;
      ticker?: string;
    };
    techStack: {
      category: string;
      technologies: string[];
    }[];
    competitors: {
      name: string;
      domain: string;
      similarity: number;
    }[];
    signals: {
      type: string;
      signal: string;
      date: string;
      importance: 'low' | 'medium' | 'high';
    }[];
  };
  createdAt: string;
  updatedAt: string;
}

export const enrichmentApi = {
  // Start enrichment
  startEnrichment: (data: EnrichmentRequest) =>
    apiRequest<EnrichedAccount>('/api/enrich', { method: 'POST', body: data }),

  // Get enrichment status
  getEnrichment: (enrichmentId: string) =>
    apiRequest<EnrichedAccount>(`/api/enrich/${enrichmentId}`),

  // Get all enrichments
  getEnrichments: (status?: string) =>
    apiRequest<EnrichedAccount[]>(`/api/enrichments${status ? `?status=${status}` : ''}`),

  // Bulk enrichment
  bulkEnrich: (accounts: EnrichmentRequest[]) =>
    apiRequest<{ jobId: string; accountIds: string[] }>('/api/enrich/bulk', {
      method: 'POST',
      body: { accounts },
    }),
};

// ============================================
// Accounts API
// ============================================

export interface Account {
  id: string;
  name: string;
  domain: string;
  industry: string;
  employeeCount: string;
  revenue: string;
  status: 'new' | 'enriched' | 'qualified' | 'engaged' | 'customer';
  enrichmentStatus: 'pending' | 'in_progress' | 'completed' | 'failed';
  score: number;
  signals: string[];
  lastActivity: string;
  createdAt: string;
  updatedAt: string;
}

export interface AccountsFilter {
  status?: string;
  industry?: string;
  enrichmentStatus?: string;
  minScore?: number;
  search?: string;
  limit?: number;
  offset?: number;
}

export const accountsApi = {
  // Get all accounts
  getAccounts: (filters?: AccountsFilter) => {
    const params = new URLSearchParams();
    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined) params.append(key, String(value));
      });
    }
    const query = params.toString();
    return apiRequest<{ accounts: Account[]; total: number }>(
      `/api/accounts${query ? `?${query}` : ''}`
    );
  },

  // Get single account
  getAccount: (accountId: string) =>
    apiRequest<Account>(`/api/accounts/${accountId}`),

  // Create account
  createAccount: (data: Partial<Account>) =>
    apiRequest<Account>('/api/accounts', { method: 'POST', body: data }),

  // Update account
  updateAccount: (accountId: string, data: Partial<Account>) =>
    apiRequest<Account>(`/api/accounts/${accountId}`, { method: 'PATCH', body: data }),

  // Delete account
  deleteAccount: (accountId: string) =>
    apiRequest<{ success: boolean }>(`/api/accounts/${accountId}`, { method: 'DELETE' }),

  // Bulk operations
  bulkUpdate: (accountIds: string[], data: Partial<Account>) =>
    apiRequest<{ updated: number }>('/api/accounts/bulk', {
      method: 'PATCH',
      body: { accountIds, data },
    }),
};

// ============================================
// Dashboard Stats API
// ============================================

export interface DashboardStats {
  totalAccounts: number;
  enrichedAccounts: number;
  activeScans: number;
  osintReports: number;
  recentActivity: {
    id: string;
    type: 'scan' | 'enrich' | 'osint' | 'account';
    action: string;
    target: string;
    timestamp: string;
  }[];
  techStackDistribution: {
    category: string;
    count: number;
  }[];
  enrichmentQueue: {
    pending: number;
    processing: number;
    completed: number;
    failed: number;
  };
}

export const dashboardApi = {
  getStats: () => apiRequest<DashboardStats>('/api/dashboard/stats'),
  
  getActivity: (limit?: number) =>
    apiRequest<DashboardStats['recentActivity']>(
      `/api/dashboard/activity${limit ? `?limit=${limit}` : ''}`
    ),
};

// ============================================
// LinkedIn API
// ============================================

export interface LinkedInProfile {
  name: string;
  title: string;
  company: string;
  location: string;
  connections: number;
  about: string;
  experience: {
    title: string;
    company: string;
    duration: string;
    description: string;
  }[];
  education: {
    school: string;
    degree: string;
    field: string;
    years: string;
  }[];
  skills: string[];
}

export const linkedinApi = {
  // Analyze LinkedIn profile
  analyzeProfile: (profileUrl: string) =>
    apiRequest<LinkedInProfile>('/api/linkedin/profile', {
      method: 'POST',
      body: { profileUrl },
    }),

  // Find profiles at company
  findProfiles: (companyName: string, titles?: string[]) =>
    apiRequest<LinkedInProfile[]>('/api/linkedin/search', {
      method: 'POST',
      body: { companyName, titles },
    }),
};

// Export all APIs
export const api = {
  scanner: scannerApi,
  osint: osintApi,
  enrichment: enrichmentApi,
  accounts: accountsApi,
  dashboard: dashboardApi,
  linkedin: linkedinApi,
};

export default api;
