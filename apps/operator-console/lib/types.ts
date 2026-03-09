// Sales Intelligence Types based on Wrangler API

export interface Account {
  _id: string
  accountKey: string
  companyName: string
  canonicalUrl: string
  domain: string
  industry?: string
  employeeCount?: string
  techStack?: string[]
  aiReadinessScore?: number
  lastScanDate?: string
  lastOsintDate?: string
  enrichmentStatus?: 'pending' | 'in_progress' | 'complete' | 'failed'
  tags?: string[]
}

export interface ScanResult {
  url: string
  title?: string
  description?: string
  techStack: TechStackItem[]
  businessUnits?: string[]
  performance?: PerformanceMetrics
  aiSignals?: AISignal[]
  timestamp: string
}

export interface TechStackItem {
  name: string
  category: string
  confidence: number
  version?: string
}

export interface PerformanceMetrics {
  loadTime?: number
  ttfb?: number
  cls?: number
  lcp?: number
}

export interface AISignal {
  type: string
  description: string
  confidence: number
  source?: string
}

export interface OSINTReport {
  _id: string
  accountKey: string
  companyName: string
  executiveSummary: string
  initiatives: Initiative[]
  historicalInitiatives?: Initiative[]
  timelineAnalysis?: TimelineAnalysis
  industryBenchmarking?: IndustryBenchmarking
  risks: Risk[]
  hiringSignals: HiringSignal[]
  digitalSignals: DigitalSignal[]
  recommendedNextSteps: string[]
  generatedAt: string
  confidence: 'low' | 'medium' | 'high'
}

export interface Initiative {
  title: string
  description: string
  importanceScore: number
  confidence: 'low' | 'medium' | 'high'
  timeHorizon: '0-3mo' | '3-12mo' | '12mo+'
  status: 'happening' | 'being_decided' | 'needing_execution' | 'historical'
  progress?: number
  expectedCompletion?: string
  evidenceCitations: EvidenceCitation[]
}

export interface EvidenceCitation {
  url: string
  title?: string
  excerpt: string
  date?: string
  isFirstParty: boolean
}

export interface TimelineAnalysis {
  completionRate: number
  statusChanges: StatusChange[]
  averageTimeToCompletion?: string
}

export interface StatusChange {
  initiative: string
  from: string
  to: string
  date: string
}

export interface IndustryBenchmarking {
  industryAverages: {
    initiativeCount: number
    completionRate: number
  }
  competitorBenchmarks: CompetitorBenchmark[]
  companyPosition: 'below_average' | 'average' | 'above_average' | 'leader'
  commonIndustryGoals: string[]
  insights: string[]
}

export interface CompetitorBenchmark {
  company: string
  initiativeCount: number
  topFocus: string
}

export interface Risk {
  title: string
  severity: 'low' | 'medium' | 'high'
  description: string
  mitigationSuggestion?: string
}

export interface HiringSignal {
  role: string
  department?: string
  seniorityLevel?: string
  location?: string
  postDate?: string
  insights: string[]
}

export interface DigitalSignal {
  type: string
  description: string
  significance: 'low' | 'medium' | 'high'
  detectedAt: string
}

export interface EnrichmentJob {
  accountKey: string
  status: 'queued' | 'in_progress' | 'complete' | 'failed'
  currentStage: number
  totalStages: number
  startedAt: string
  completedAt?: string
  errors?: string[]
}

export interface Interaction {
  _id: string
  userPrompt: string
  gptResponse: string
  sessionId: string
  referencedAccounts: string[]
  contextTags: string[]
  importance: number
  createdAt: string
}

export interface Learning {
  _id: string
  title: string
  summary: string
  derivedFrom: string[]
  applicableToAccounts: string[]
  relevanceScore: number
  contextTags: string[]
  memoryPhrase: string
  createdAt: string
}

export interface DashboardMetrics {
  totalAccounts: number
  accountsScannedThisWeek: number
  osintReportsGenerated: number
  enrichmentJobsRunning: number
  avgAiReadinessScore: number
  topTechStacks: { name: string; count: number }[]
  recentActivity: ActivityItem[]
}

export interface ActivityItem {
  id: string
  type: 'scan' | 'osint' | 'enrichment' | 'research' | 'learning'
  title: string
  description: string
  accountKey?: string
  timestamp: string
  status?: 'success' | 'pending' | 'failed'
}

export interface CompetitorResearch {
  accountKey: string
  competitors: Competitor[]
  opportunities: Opportunity[]
  generatedAt: string
}

export interface Competitor {
  name: string
  domain: string
  similarity: number
  strengths: string[]
  weaknesses: string[]
}

export interface Opportunity {
  title: string
  description: string
  priority: 'low' | 'medium' | 'high'
  basedOn: string
}
