/**
 * Sanity Document Schemas for Website Scanner Data
 * These define the structure of documents stored in Sanity
 */

// Website Scan Document Schema
export const websiteScanSchema = {
  _type: 'websiteScan',
  _id: 'websiteScan-{url-hash}',
  url: 'string', // Original URL
  finalUrl: 'string', // Final URL after redirects
  scannedAt: 'datetime',
  status: 'number', // HTTP status
  technologyStack: 'object', // Full tech stack object
  businessUnits: 'object',
  digitalGoals: 'object',
  jobAnalysis: 'object',
  aiReadiness: 'object',
  businessScale: 'object',
  performance: 'object',
  digitalMaturity: 'object',
  opportunityScore: 'number',
  aiReadinessScore: 'number',
  performanceScore: 'number',
  digitalMaturityScore: 'number',
  metadata: {
    requestId: 'string',
    scannedBy: 'string', // User/system identifier
    scanVersion: 'string',
  },
};

// LinkedIn Profile Document Schema
export const linkedInProfileSchema = {
  _type: 'linkedInProfile',
  _id: 'linkedin-{profile-url-hash}',
  profileUrl: 'string',
  name: 'string',
  headline: 'string',
  location: 'string',
  about: 'string',
  experience: 'array', // Array of experience objects
  education: 'array',
  skills: 'array',
  connections: 'number',
  followers: 'number',
  workPatterns: 'object',
  network: 'object',
  trajectory: 'object',
  scannedAt: 'datetime',
  metadata: {
    requestId: 'string',
    scannedBy: 'string',
  },
};

// Evidence Pack Document Schema
export const evidencePackSchema = {
  _type: 'evidencePack',
  _id: 'evidence-{url-hash}',
  url: 'string',
  finalUrl: 'string',
  title: 'string',
  siteName: 'string',
  fetchedAt: 'datetime',
  mainText: 'text',
  excerpts: 'array',
  entities: 'array',
  signals: 'array',
  claims: 'array',
  meta: 'object',
  contentHash: 'string',
  metadata: {
    requestId: 'string',
    mode: 'string', // fast/deep
  },
};

// Research Brief Document Schema
export const researchBriefSchema = {
  _type: 'researchBrief',
  _id: 'brief-{company-hash}',
  companyOrSite: 'string',
  briefMarkdown: 'text',
  evidence: {
    keyFacts: 'array',
    urls: 'array',
  },
  generatedAt: 'datetime',
  metadata: {
    requestId: 'string',
    seedUrl: 'string',
    query: 'string',
  },
};

// Search Result Document Schema
export const searchResultSchema = {
  _type: 'searchResult',
  _id: 'search-{query-hash}-{result-index}',
  query: 'string',
  url: 'string',
  title: 'string',
  snippet: 'string',
  source: 'string',
  scoreBreakdown: 'object',
  classifiedIntent: 'string',
  searchedAt: 'datetime',
  metadata: {
    requestId: 'string',
  },
};

// Verification Result Document Schema
export const verificationResultSchema = {
  _type: 'verificationResult',
  _id: 'verify-{claims-hash}',
  claims: 'array',
  sources: 'array',
  verified: 'array', // Array of verification objects
  verifiedAt: 'datetime',
  metadata: {
    requestId: 'string',
  },
};

// Company/Account Document Schema (Aggregated)
export const companyAccountSchema = {
  _type: 'companyAccount',
  _id: 'company-{domain}',
  domain: 'string',
  name: 'string', // Extracted from website or provided
  websiteScans: 'array', // References to websiteScan documents
  linkedInProfiles: 'array', // References to linkedInProfile documents
  researchBriefs: 'array', // References to researchBrief documents
  latestScan: 'reference', // Reference to most recent scan
  opportunityScore: 'number',
  aiReadinessScore: 'number',
  digitalMaturityScore: 'number',
  tags: 'array', // Custom tags for filtering
  notes: 'text', // User notes
  updatedAt: 'datetime',
  createdAt: 'datetime',
};

// Account Document Schema (OSINT-compatible)
export const accountSchema = {
  _type: 'account',
  _id: 'account.{accountKey}',
  accountKey: 'string', // SHA-1 hash of canonical URL
  canonicalUrl: 'string', // Normalized URL
  rootDomain: 'string', // Root domain (e.g., example.com)
  companyName: 'string', // Optional company name
  domain: 'string', // Alias for rootDomain
  technologyStack: 'object', // Tech stack from scans
  aiReadiness: 'object', // AI readiness score and details
  opportunityScore: 'number', // Overall opportunity score
  performance: 'object', // Performance indicators
  businessScale: 'object', // Business scale indicators
  signals: 'array', // Array of detected signals
  lastScannedAt: 'datetime', // Last scan timestamp
  latestOsintReportRef: 'reference', // Reference to latest OSINT report
  latestScanRef: 'reference', // Reference to latest scan
  sourceRefs: {
    packId: 'string', // Reference to accountPack document
  },
  createdAt: 'datetime',
  updatedAt: 'datetime',
};

// Account Pack Document Schema (Full payload storage)
export const accountPackSchema = {
  _type: 'accountPack',
  _id: 'accountPack.{accountKey}.{isoDate}',
  accountKey: 'string',
  canonicalUrl: 'string',
  rootDomain: 'string',
  domain: 'string', // Alias for rootDomain
  scan: 'object', // Full /scan output
  batch: 'object', // Batch scan results
  discovery: 'object', // /discover output
  crawl: 'object', // /crawl output
  evidence: 'object', // /extract outputs
  brief: 'object', // /brief output
  verification: 'object', // /verify output
  linkedin: 'object', // LinkedIn profile data
  notes: 'object', // Additional notes
  history: 'array', // History of scans (last 10)
  meta: {
    storedBy: 'string',
    // Additional metadata
  },
  createdAt: 'datetime',
  updatedAt: 'datetime',
};

// OSINT Job Document Schema
export const osintJobSchema = {
  _type: 'osintJob',
  _id: 'osintJob.{accountKey}.{year}.{mode}',
  accountKey: 'string',
  canonicalUrl: 'string',
  rootDomain: 'string',
  companyName: 'string', // Optional
  year: 'number', // Target year (e.g., 2027)
  mode: 'string', // 'year_ahead' (default)
  status: 'string', // 'queued' | 'running' | 'complete' | 'failed'
  stage: 'number', // Current pipeline stage (0-7)
  progress: 'number', // Progress percentage (0-100)
  requestedAt: 'datetime',
  startedAt: 'datetime', // When status changed to 'running'
  completedAt: 'datetime', // When status changed to 'complete' or 'failed'
  error: 'string', // Error message if failed
  reportRef: 'reference', // Reference to osintReport document
  requestId: 'string', // Request ID for tracing
};

// OSINT Report Document Schema
export const osintReportSchema = {
  _type: 'osintReport',
  _id: 'osintReport.{accountKey}.{year}.{mode}',
  accountKey: 'string',
  canonicalUrl: 'string',
  rootDomain: 'string',
  companyName: 'string', // Optional
  year: 'number', // Target year (e.g., 2027)
  mode: 'string', // 'year_ahead' (default)
  generatedAt: 'datetime',
  executiveSummary: 'array', // Array of summary strings
  initiatives: 'array', // Array of initiative objects:
  //   {
  //     title: 'string',
  //     importanceScore: 'number', // 0-100
  //     confidence: 'string', // 'low' | 'medium' | 'high'
  //     timeHorizon: 'string', // '0-3mo' | '3-12mo' | '12mo+'
  //     whyItMatters: 'string',
  //     evidence: 'array' // Array of evidence objects with url, title, excerpt, publishedAt, sourceType
  //   }
  risks: 'array', // Array of risk strings
  hiringSignals: 'array', // Array of hiring signal strings
  digitalSignals: 'array', // Array of digital signal strings
  recommendedNextSteps: 'array', // Array of recommendation strings
  sources: 'array', // Array of source objects:
  //   {
  //     url: 'string',
  //     title: 'string',
  //     publishedAt: 'datetime',
  //     score: 'number' // Source ranking score
  //   }
};

// Interaction Document Schema (Intelligence Memory System)
export const interactionSchema = {
  _type: 'interaction',
  _id: 'interaction.{interactionId}',
  interactionId: 'string', // Unique identifier
  sessionId: 'reference', // Reference to session
  userPrompt: 'text', // What the user asked
  gptResponse: 'text', // WRANGLER's full reply
  timestamp: 'datetime', // When this interaction occurred
  referencedAccounts: 'array', // Array of references to account documents
  referencedBriefs: 'array', // Array of references to brief documents
  referencedPeople: 'array', // Array of references to person documents
  referencedEvidence: 'array', // Array of references to evidence documents
  contextTags: 'array', // Array of strings like ["FY26", "Commerce Vertical", "AI Readiness"]
  importance: 'number', // Learning weight (0-1 scale)
  followUpNeeded: 'boolean', // Flag for future action
  followUpNotes: 'text', // "We said this last time..." memory
  derivedInsight: 'boolean', // If GPT produced a new conclusion
  linkedInteractions: 'array', // Array of references to other interactions (threads/history)
  requestId: 'string', // Correlation ID for this request
  createdAt: 'datetime',
  updatedAt: 'datetime',
};

// Session Document Schema (Intelligence Memory System)
export const sessionSchema = {
  _type: 'session',
  _id: 'session.{sessionId}',
  sessionId: 'string', // Unique identifier (UUID or Cursor thread ID)
  title: 'string', // Session title or description
  startedAt: 'datetime', // When the session started
  lastUpdatedAt: 'datetime', // When the session was last updated
  participants: 'array', // Array of strings (users or assistants)
  accountsInContext: 'array', // Array of references to account documents
  briefsInContext: 'array', // Array of references to brief documents
  summary: 'text', // Session-level synthesis
  learnings: 'array', // Array of text (key takeaways from this session)
  followUps: 'array', // Array of text (items flagged for future action)
  confidence: 'number', // Confidence score (0-1)
  interactionCount: 'number', // Number of interactions in this session
  createdAt: 'datetime',
  updatedAt: 'datetime',
};

// Learning Document Schema (Intelligence Memory System)
export const learningSchema = {
  _type: 'learning',
  _id: 'learning.{learningId}',
  learningId: 'string', // Unique identifier
  title: 'string', // Learning title or summary
  summary: 'text', // Detailed learning summary
  derivedFrom: 'array', // Array of references to interaction documents
  applicableToAccounts: 'array', // Array of references to account documents
  applicableToBriefs: 'array', // Array of references to brief documents
  relevanceScore: 'number', // How relevant this learning is (0-1 scale, >0.7 for auto-retrieval)
  contextTags: 'array', // Array of strings for filtering and retrieval
  memoryPhrase: 'string', // Key phrase for recall, e.g., "content reuse pain point"
  createdAt: 'datetime', // When this learning was created
  lastReferencedAt: 'datetime', // When this learning was last referenced
  referenceCount: 'number', // How many times this learning has been referenced
};
