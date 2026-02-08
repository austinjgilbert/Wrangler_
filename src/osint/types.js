/**
 * OSINT Types and Interfaces
 * Type definitions for the OSINT pipeline
 */

/**
 * @typedef {Object} OsintQueueMessage
 * @property {string} accountKey
 * @property {string} canonicalUrl
 * @property {string} companyName
 * @property {string} mode - 'year_ahead' (default)
 * @property {number} year - Target year (default: current year + 1)
 * @property {number} recencyDays - How many days back to search (default: 365)
 * @property {boolean} force - Force re-run even if exists
 * @property {string} requestId - Request ID for tracing
 */

/**
 * @typedef {Object} OsintJobState
 * @property {string} status - 'queued' | 'running' | 'complete' | 'failed'
 * @property {number} stage - Current stage (0-7)
 * @property {number} progress - Progress percentage (0-100)
 * @property {string} startedAt - ISO timestamp
 * @property {string} updatedAt - ISO timestamp
 * @property {string|null} error - Error message if failed
 * @property {string|null} reportId - Sanity document ID of report
 * @property {string} accountKey
 * @property {string} canonicalUrl
 * @property {number} year
 * @property {string} mode
 */

/**
 * @typedef {Object} OsintInitiative
 * @property {string} title
 * @property {number} importanceScore - 0-100
 * @property {'low'|'medium'|'high'} confidence
 * @property {'0-3mo'|'3-12mo'|'12mo+'} timeHorizon
 * @property {string} whyItMatters
 * @property {Array<{url: string, title?: string, excerpt?: string, publishedAt?: string, sourceType?: string}>} evidence
 * @property {'happening'|'being_decided'|'needing_execution'|'historical'} status - Initiative status
 * @property {number|null} progressPercent - Progress percentage (0-100) if status is 'happening'
 * @property {string|null} historicalReference - Reference to historical initiative if this is a continuation
 * @property {string|null} completionStatus - 'completed' | 'in_progress' | 'delayed' | 'cancelled' | null (for historical initiatives)
 * @property {string|null} firstMentionedAt - ISO timestamp when initiative was first mentioned
 * @property {string|null} expectedCompletionDate - ISO timestamp for expected completion
 */

/**
 * @typedef {Object} IndustryBenchmark
 * @property {number} averageInitiativeCount - Average number of initiatives per company
 * @property {number} averageCompletionRate - Average completion rate (%)
 * @property {number} averageInProgressCount - Average number of in-progress initiatives
 * @property {Array<string>} commonGoals - Most common goals/milestones across industry
 * @property {Array<string>} commonTechnologies - Most common technologies being adopted
 * @property {Object} initiativeStatusDistribution - Distribution of initiative statuses
 * @property {number} sampleSize - Number of companies in benchmark
 */

/**
 * @typedef {Object} CompetitorBenchmark
 * @property {string} domain - Competitor domain
 * @property {string} companyName - Competitor company name
 * @property {number} initiativeCount - Number of initiatives
 * @property {number} completionRate - Completion rate (%)
 * @property {number} inProgressCount - Number of in-progress initiatives
 * @property {Array<string>} topInitiatives - Top 3 initiatives by importance
 * @property {string} relativePosition - 'ahead' | 'at_parity' | 'behind'
 */

/**
 * @typedef {Object} OsintBenchmarking
 * @property {IndustryBenchmark} industryBenchmark - Industry-wide benchmarks
 * @property {CompetitorBenchmark[]} competitorBenchmarks - Individual competitor benchmarks
 * @property {Object} companyPosition - Company's position relative to benchmarks
 * @property {Array<string>} insights - Benchmarking insights
 */

/**
 * @typedef {Object} OsintReport
 * @property {string} accountKey
 * @property {string} canonicalUrl
 * @property {string} rootDomain
 * @property {string|null} companyName
 * @property {number} year
 * @property {string} mode
 * @property {string} generatedAt
 * @property {string[]} executiveSummary
 * @property {OsintInitiative[]} initiatives
 * @property {OsintInitiative[]} historicalInitiatives - Initiatives from 12 months ago
 * @property {Object} timelineAnalysis - Analysis of progress and timeline
 * @property {OsintBenchmarking} benchmarking - Industry and competitor benchmarking
 * @property {string[]} risks
 * @property {string[]} hiringSignals
 * @property {string[]} digitalSignals
 * @property {string[]} recommendedNextSteps
 * @property {Array<{url: string, title?: string, publishedAt?: string, score?: number}>} sources
 */

/**
 * @typedef {Object} OsintSource
 * @property {string} url
 * @property {string} title
 * @property {string|null} excerpt
 * @property {string|null} publishedAt
 * @property {string} sourceType - 'first_party' | 'third_party' | 'search_result'
 * @property {number} recencyScore - 0-100
 * @property {number} relevanceScore - 0-100
 * @property {number} qualityScore - 0-100
 * @property {number} totalScore - Combined score
 */

/**
 * @typedef {Object} OsintPipelineContext
 * @property {string} accountKey
 * @property {string} canonicalUrl
 * @property {string} rootDomain
 * @property {string|null} companyName
 * @property {number} year
 * @property {string} mode
 * @property {number} recencyDays
 * @property {string} requestId
 * @property {any} env - Environment bindings
 * @property {Function} groqQuery - Sanity query function
 * @property {Function} upsertDocument - Sanity upsert function
 * @property {Function} patchDocument - Sanity patch function
 * @property {Function} handleDiscover - Discover handler
 * @property {Function} handleSearch - Search handler
 * @property {Function} handleExtract - Extract handler
 * @property {Function} handleVerify - Verify handler
 * @property {any} jobStateDO - Durable Object stub for job state
 */

export {};

