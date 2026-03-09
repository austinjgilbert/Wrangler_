import type {
  Account,
  DashboardMetrics,
  OSINTReport,
  EnrichmentJob,
  ActivityItem,
  Initiative,
  Risk,
  HiringSignal,
} from './types'

// Mock Accounts
export const mockAccounts: Account[] = [
  {
    _id: 'acc_001',
    accountKey: 'acme-corp',
    companyName: 'Acme Corporation',
    canonicalUrl: 'https://acme.com',
    domain: 'acme.com',
    industry: 'Technology',
    employeeCount: '1,000-5,000',
    techStack: ['React', 'Node.js', 'AWS', 'PostgreSQL', 'Kubernetes'],
    aiReadinessScore: 78,
    lastScanDate: '2026-03-07T14:30:00Z',
    lastOsintDate: '2026-03-05T09:15:00Z',
    enrichmentStatus: 'complete',
    tags: ['enterprise', 'high-priority', 'tech-forward'],
  },
  {
    _id: 'acc_002',
    accountKey: 'globex-industries',
    companyName: 'Globex Industries',
    canonicalUrl: 'https://globex.io',
    domain: 'globex.io',
    industry: 'Manufacturing',
    employeeCount: '5,000-10,000',
    techStack: ['SAP', 'Azure', 'SQL Server', '.NET'],
    aiReadinessScore: 45,
    lastScanDate: '2026-03-06T11:20:00Z',
    enrichmentStatus: 'in_progress',
    tags: ['enterprise', 'legacy-modernization'],
  },
  {
    _id: 'acc_003',
    accountKey: 'initech-solutions',
    companyName: 'Initech Solutions',
    canonicalUrl: 'https://initech.com',
    domain: 'initech.com',
    industry: 'Financial Services',
    employeeCount: '500-1,000',
    techStack: ['Java', 'Oracle', 'AWS', 'React'],
    aiReadinessScore: 62,
    lastScanDate: '2026-03-08T08:45:00Z',
    enrichmentStatus: 'complete',
    tags: ['mid-market', 'fintech'],
  },
  {
    _id: 'acc_004',
    accountKey: 'umbrella-corp',
    companyName: 'Umbrella Corporation',
    canonicalUrl: 'https://umbrella.bio',
    domain: 'umbrella.bio',
    industry: 'Healthcare & Biotech',
    employeeCount: '10,000+',
    techStack: ['Python', 'TensorFlow', 'GCP', 'MongoDB'],
    aiReadinessScore: 89,
    lastScanDate: '2026-03-07T16:00:00Z',
    lastOsintDate: '2026-03-07T16:30:00Z',
    enrichmentStatus: 'complete',
    tags: ['enterprise', 'ai-native', 'high-priority'],
  },
  {
    _id: 'acc_005',
    accountKey: 'stark-industries',
    companyName: 'Stark Industries',
    canonicalUrl: 'https://stark.tech',
    domain: 'stark.tech',
    industry: 'Aerospace & Defense',
    employeeCount: '10,000+',
    techStack: ['Rust', 'Kubernetes', 'AWS', 'GraphQL', 'React'],
    aiReadinessScore: 95,
    lastScanDate: '2026-03-08T10:00:00Z',
    lastOsintDate: '2026-03-08T10:30:00Z',
    enrichmentStatus: 'complete',
    tags: ['enterprise', 'ai-native', 'innovation-leader'],
  },
]

// Mock Dashboard Metrics
export const mockDashboardMetrics: DashboardMetrics = {
  totalAccounts: 247,
  accountsScannedThisWeek: 34,
  osintReportsGenerated: 18,
  enrichmentJobsRunning: 3,
  avgAiReadinessScore: 67,
  topTechStacks: [
    { name: 'React', count: 89 },
    { name: 'AWS', count: 76 },
    { name: 'Node.js', count: 64 },
    { name: 'Python', count: 58 },
    { name: 'Kubernetes', count: 42 },
  ],
  recentActivity: [],
}

// Mock Activity Feed
export const mockActivityFeed: ActivityItem[] = [
  {
    id: 'act_001',
    type: 'scan',
    title: 'Website Scan Complete',
    description: 'Scanned stark.tech - detected 12 technologies',
    accountKey: 'stark-industries',
    timestamp: '2026-03-08T10:00:00Z',
    status: 'success',
  },
  {
    id: 'act_002',
    type: 'osint',
    title: 'OSINT Report Generated',
    description: 'Year-ahead intelligence report for Umbrella Corporation',
    accountKey: 'umbrella-corp',
    timestamp: '2026-03-07T16:30:00Z',
    status: 'success',
  },
  {
    id: 'act_003',
    type: 'enrichment',
    title: 'Enrichment In Progress',
    description: 'Stage 3/7 - Competitor analysis for Globex Industries',
    accountKey: 'globex-industries',
    timestamp: '2026-03-08T09:45:00Z',
    status: 'pending',
  },
  {
    id: 'act_004',
    type: 'research',
    title: 'Research Brief Created',
    description: 'Generated person brief for John Chen, CTO at Initech',
    accountKey: 'initech-solutions',
    timestamp: '2026-03-08T08:50:00Z',
    status: 'success',
  },
  {
    id: 'act_005',
    type: 'learning',
    title: 'New Learning Stored',
    description: 'Acme Corp prefers modern cloud-native solutions',
    accountKey: 'acme-corp',
    timestamp: '2026-03-07T15:20:00Z',
    status: 'success',
  },
  {
    id: 'act_006',
    type: 'scan',
    title: 'Batch Scan Complete',
    description: 'Scanned 5 competitor websites for Acme Corp',
    accountKey: 'acme-corp',
    timestamp: '2026-03-07T14:30:00Z',
    status: 'success',
  },
]

// Mock OSINT Report
export const mockOSINTReport: OSINTReport = {
  _id: 'osint_001',
  accountKey: 'acme-corp',
  companyName: 'Acme Corporation',
  executiveSummary:
    'Acme Corporation is executing an aggressive digital transformation strategy with a strong focus on AI/ML adoption. The company has announced a $50M investment in cloud infrastructure modernization, with completion targeted for Q4 2026. Key initiatives include implementing a new customer data platform and expanding their engineering team by 40%.',
  initiatives: [
    {
      title: 'Cloud Infrastructure Modernization',
      description:
        'Migration from on-premise data centers to multi-cloud architecture (AWS + GCP)',
      importanceScore: 95,
      confidence: 'high',
      timeHorizon: '3-12mo',
      status: 'happening',
      progress: 45,
      expectedCompletion: '2026-12-01',
      evidenceCitations: [
        {
          url: 'https://acme.com/blog/cloud-strategy',
          title: 'Our Cloud-First Future',
          excerpt:
            'We are investing $50M in modernizing our infrastructure to support next-generation AI workloads...',
          date: '2026-01-15',
          isFirstParty: true,
        },
        {
          url: 'https://techcrunch.com/acme-cloud',
          title: 'Acme Announces Major Cloud Investment',
          excerpt:
            'Enterprise software company Acme Corporation today announced a significant investment in cloud infrastructure...',
          date: '2026-01-16',
          isFirstParty: false,
        },
      ],
    },
    {
      title: 'AI-Powered Customer Analytics Platform',
      description:
        'Building proprietary ML models for customer behavior prediction and personalization',
      importanceScore: 88,
      confidence: 'high',
      timeHorizon: '0-3mo',
      status: 'happening',
      progress: 72,
      expectedCompletion: '2026-05-01',
      evidenceCitations: [
        {
          url: 'https://acme.com/careers/ml-engineer',
          title: 'Senior ML Engineer - Customer Intelligence',
          excerpt:
            'Join our team building cutting-edge ML models for customer analytics...',
          date: '2026-02-20',
          isFirstParty: true,
        },
      ],
    },
    {
      title: 'European Market Expansion',
      description:
        'Opening offices in London and Berlin to serve growing European customer base',
      importanceScore: 75,
      confidence: 'medium',
      timeHorizon: '3-12mo',
      status: 'being_decided',
      evidenceCitations: [
        {
          url: 'https://linkedin.com/jobs/acme-europe',
          title: 'Multiple roles in London',
          excerpt: 'Acme is hiring for multiple positions in their new London office...',
          date: '2026-02-28',
          isFirstParty: false,
        },
      ],
    },
  ],
  risks: [
    {
      title: 'Talent Acquisition Challenges',
      severity: 'medium',
      description:
        'Aggressive hiring goals (40% engineering growth) may face challenges in competitive talent market',
      mitigationSuggestion:
        'Consider remote-first hiring strategy and competitive compensation packages',
    },
    {
      title: 'Cloud Migration Complexity',
      severity: 'low',
      description:
        'Multi-cloud strategy adds operational complexity that could impact timelines',
      mitigationSuggestion:
        'Recommend phased migration approach with clear milestone tracking',
    },
  ],
  hiringSignals: [
    {
      role: 'Senior ML Engineer',
      department: 'Engineering',
      seniorityLevel: 'Senior',
      location: 'San Francisco, CA',
      postDate: '2026-02-20',
      insights: ['Focus on customer analytics', 'Python/TensorFlow required'],
    },
    {
      role: 'Cloud Architect',
      department: 'Infrastructure',
      seniorityLevel: 'Principal',
      location: 'Remote',
      postDate: '2026-02-25',
      insights: ['Multi-cloud experience required', 'Kubernetes expertise'],
    },
    {
      role: 'VP of Sales - EMEA',
      department: 'Sales',
      seniorityLevel: 'Executive',
      location: 'London, UK',
      postDate: '2026-02-28',
      insights: ['European expansion signal', 'Enterprise sales background'],
    },
  ],
  digitalSignals: [
    {
      type: 'Technology Adoption',
      description: 'Added Kubernetes orchestration to production stack',
      significance: 'high',
      detectedAt: '2026-02-15',
    },
    {
      type: 'Infrastructure Change',
      description: 'New GCP resources detected alongside existing AWS',
      significance: 'high',
      detectedAt: '2026-02-20',
    },
  ],
  recommendedNextSteps: [
    'Schedule discovery call to discuss cloud migration challenges and timeline',
    'Prepare AI/ML solution demo tailored to customer analytics use case',
    'Research European data residency requirements for GDPR compliance positioning',
    'Connect with VP of Sales - EMEA candidate network for warm introduction',
  ],
  generatedAt: '2026-03-05T09:15:00Z',
  confidence: 'high',
}

// Mock Enrichment Jobs
export const mockEnrichmentJobs: EnrichmentJob[] = [
  {
    accountKey: 'globex-industries',
    status: 'in_progress',
    currentStage: 3,
    totalStages: 7,
    startedAt: '2026-03-08T09:00:00Z',
  },
  {
    accountKey: 'wayne-enterprises',
    status: 'queued',
    currentStage: 0,
    totalStages: 7,
    startedAt: '2026-03-08T09:30:00Z',
  },
  {
    accountKey: 'oscorp',
    status: 'in_progress',
    currentStage: 5,
    totalStages: 7,
    startedAt: '2026-03-08T08:00:00Z',
  },
]

// Pipeline stage names for enrichment
export const enrichmentStages = [
  'Account Context',
  'Website Discovery',
  'Page Crawling',
  'Web Search',
  'Source Selection',
  'Evidence Extraction',
  'Report Synthesis',
]
