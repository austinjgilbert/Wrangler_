/**
 * Attribute Path Whitelist — Layer 3 Write Guard
 *
 * Every field path that Sanity mutations are allowed to write.
 * REGENERATED from production data inspection (2026-03-20).
 *
 * UPDATE THIS FILE when adding new fields to any schema.
 * Run `node scripts/generate-whitelist.js` to regenerate from production.
 *
 * The write guard in mutate() will reject/warn on unknown paths
 * when attribute health is critical or wall.
 *
 * @see attribute-guardrails-spec on the board
 */

// ── Whitelist per document type ──
// Each Set contains all known field paths (dot-notation) for that type.
// Entries ending in '.*' are prefix wildcards — any sub-path is allowed.
// Sanity internal fields (_id, _type, _rev, _createdAt, _updatedAt) are
// always allowed and excluded from checking.

export const ATTRIBUTE_WHITELIST = {

  account: new Set([
    // Core identity
    'accountKey', 'canonicalUrl', 'domain', 'rootDomain',
    'companyName', 'name', 'industry',
    'createdAt', 'updatedAt', 'lastScannedAt', 'lastEnrichedAt', 'lastValidatedAt',

    // Scores
    'opportunityScore',
    'aiReadiness', 'aiReadiness.score',
    'performance', 'performance.performanceScore',

    // Pain points (array of objects)
    'painPoints',
    'painPoints.category', 'painPoints.confidence',
    'painPoints.description', 'painPoints.severity', 'painPoints.source',

    // Business scale
    'businessScale', 'businessScale.businessScale',
    'businessScale.estimatedAnnualRevenue', 'businessScale.estimatedMonthlyTraffic',
    'businessScale.estimatedInfrastructureCosts', 'businessScale.scaleScore',
    'businessScale.trafficIndicators', 'businessScale.revenueIndicators',
    'businessScale.costIndicators', 'businessScale.monetizationMethods',

    // Business units
    'businessUnits', 'businessUnits.detectedAreas', 'businessUnits.subdomains',
    'businessUnits.separateProperties', 'businessUnits.siloIndicators',
    'businessUnits.totalAreas',

    // Classification
    'classification', 'classification.industry', 'classification.subIndustry',
    'classification.companyType', 'classification.segment',
    'classification.aiReadinessTier', 'classification.opportunityTier',
    'classification.tags', 'classification.classifiedAt',

    // Profile completeness
    'profileCompleteness', 'profileCompleteness.score',
    'profileCompleteness.assessedAt', 'profileCompleteness.gaps',
    'profileCompleteness.nextStages',
    'profileCompleteness.dimensionFlags',
    'profileCompleteness.dimensionFlags.scan',
    'profileCompleteness.dimensionFlags.discovery',
    'profileCompleteness.dimensionFlags.crawl',
    'profileCompleteness.dimensionFlags.extraction',
    'profileCompleteness.dimensionFlags.linkedin',
    'profileCompleteness.dimensionFlags.brief',
    'profileCompleteness.dimensionFlags.verification',
    'profileCompleteness.dimensionFlags.competitors',
    'profileCompleteness.dimensionFlags.technologies',
    'profileCompleteness.dimensionFlags.classification',
    'profileCompleteness.dimensionFlags.benchmarks',
    'profileCompleteness.dimensionFlags.techDepth',
    'profileCompleteness.dimensionFlags.leadership',
    'profileCompleteness.dimensionFlags.painPoints',

    // Benchmarks
    'benchmarks', 'benchmarks.estimatedEmployees', 'benchmarks.estimatedRevenue',
    'benchmarks.estimatedTraffic', 'benchmarks.fundingStage',
    'benchmarks.headquarters', 'benchmarks.publicOrPrivate',
    'benchmarks.stockTicker', 'benchmarks.yearFounded', 'benchmarks.updatedAt',

    // Competitor research summary (on account doc)
    'competitorResearch', 'competitorResearch.count',
    'competitorResearch.researchedAt',

    // Relationships
    'relationships', 'relationships.competitorCount',
    'relationships.relatedPeopleCount', 'relationships.similarIndustryCount',
    'relationships.similarOpportunityCount', 'relationships.similarTechCount',
    'relationships.techOpportunityCount', 'relationships.lastDetectedAt',

    // Technology (references array + legacy nested object)
    'technologies',
    'technologyStack', 'technologyStack.*', // prefix wildcard — deeply nested

    // Signals & refs
    'signals',
    'sourceRefs', 'sourceRefs.packId',
  ]),

  accountPack: new Set([
    // Core identity
    'accountKey', 'canonicalUrl', 'domain',
    'createdAt', 'updatedAt',

    // Index+Blob fields
    'payloadIndex',
    'payloadIndex.hasScan', 'payloadIndex.hasDiscovery',
    'payloadIndex.hasCrawl', 'payloadIndex.hasEvidence',
    'payloadIndex.hasLinkedin', 'payloadIndex.hasBrief',
    'payloadIndex.hasVerification', 'payloadIndex.hasCompetitors',
    'payloadIndex.hasCompetitorResearch', 'payloadIndex.hasTechnologyStack',
    'payloadIndex.hasBusinessUnits', 'payloadIndex.hasBusinessScale',
    'payloadIndex.enrichmentState', 'payloadIndex.enrichmentState.*', // wildcard for sub-fields
    'payloadIndex.enrichmentCompletedAt',
    'payloadData', // JSON string blob — 1 attribute

    // History array (deeply nested — each entry has data.* with full scan results)
    'history', 'history.*', // prefix wildcard — history entries are deeply nested

    // Meta
    'meta', 'meta.*', // meta.storedBy, meta.autoSaved, meta.requestId, etc.
  ]),

  person: new Set([
    // Core identity
    'name', 'firstName', 'lastName', 'personKey',
    'linkedinUrl', 'linkedInUrl', 'linkedInSlug', // both casings exist
    'email', 'phone', 'location',
    'createdAt', 'updatedAt',

    // Current role
    'currentCompany', 'currentTitle', 'headline',
    'roleCategory', 'seniorityLevel', 'isDecisionMaker',

    // LinkedIn capture fields
    'about', 'captureSource', 'capturedAt',
    'connections', 'followers', 'openToWork',
    'profileImageUrl',

    // Arrays from LinkedIn
    'certifications', 'education', 'experience',
    'languages', 'publications', 'skills', 'volunteer',

    // Profile analysis (from enrichment)
    'profileAnalysis', 'profileAnalysis.*',

    // Legacy/enrichment fields
    'source', 'confidence', 'lastVerifiedAt',
    'accountKey', 'domain', 'rootDomain',
    'title', 'company',
  ]),

  technology: new Set([
    'name', 'slug', 'category', 'subcategory', 'vendor',
    'detectedAt', 'source', 'confidence',
    'accountCount', 'firstDetectedAt', 'lastDetectedAt',
    // Production fields
    'isLegacy', 'isMigrationTarget', 'lastEnrichedAt',
  ]),

  userPattern: new Set([
    'userId', 'patternType', 'patternKey', 'count',
    'firstSeen', 'lastSeen',
    'createdAt', 'updatedAt',
    // Production fields from actual docs
    'action', 'approach', 'outcome', 'thinking', 'toolsUsed',
    'context', 'context.*', // context has dynamic sub-fields
    'metadata', 'metadata.*', // metadata has dynamic sub-fields
    'payload', 'payload.*',
  ]),

  usageLog: new Set([
    'userId', 'userEmail', 'endpoint', 'method', 'prompt',
    'accountKey', 'accountDomain', 'personId',
    'techSummary', 'enrichmentSummary',
    'requestId', 'statusCode', 'success', 'timestamp',
    'responseTimeMs', 'responseBodySize',
    'queryParams', 'referer',
    'metadata', 'metadata.*', // metadata.ipAddress, metadata.requestBodySize, metadata.userAgent
  ]),

  actionCandidate: new Set([
    // Core identity
    'id', 'actionType',
    'createdAt', 'updatedAt', 'observedAt',

    // References
    'account', 'person',

    // Scoring & confidence
    'confidence', 'opportunityScore', 'urgency',
    'confidenceBreakdown', 'confidenceBreakdown.*', // deeply nested scoring

    // Pattern matching
    'patternMatch', 'patternVersion',
    'scoringVersion', 'strategyVersion',
    'rankingPolicyVersion',

    // Draft & lifecycle
    'draftPolicyVersion', 'draftStatus',
    'lifecycleStatus', 'uncertaintyState',
    'expirationTime', 'staleAfter',
    'refreshPriority',

    // Evidence & signals
    'evidence', 'evidenceRefs',
    'signals', 'signalRefs',
    'missingData',

    // Recommendations
    'recommendedNextStep', 'whyNow',

    // Validation
    'lastValidatedAt',
    'latestOutcomeEventId',
  ]),

  orchestrationJob: new Set([
    'jobId', 'accountKey', 'canonicalUrl', 'goalKey',
    'status', 'currentStage', 'completedStages', 'failedStages',
    'startedAt', 'updatedAt', 'completedAt', 'priority',
    'domain', 'companyName',
    'error',
    // These have deeply nested sub-fields from stage results
    'options', 'options.*',
    'data', 'data.*',
    'metadata', 'metadata.*',
    'stages', 'stages.*',
    'result', 'result.*',
  ]),

  // ── Types previously misclassified as "pass-through" ──
  // All 4 are written via upsertDocument() and go through mutate()

  interaction: new Set([
    'userId', 'accountKey', 'personKey', 'domain',
    'interactionType', 'channel', 'direction',
    'subject', 'body', 'summary',
    'sentiment', 'confidence',
    'createdAt', 'updatedAt', 'occurredAt',
    'metadata', 'metadata.*',
    'context', 'context.*',
  ]),

  brief: new Set([
    'accountKey', 'personKey', 'personName',
    'canonicalUrl', 'companyName',
    'source', 'createdAt', 'updatedAt',
    // The data object is deeply nested with enrichment results
    'data', 'data.*',
    // Meta
    'meta', 'meta.*',
  ]),

  competitorResearch: new Set([
    'accountKey', 'accountDomain',
    'createdAt', 'updatedAt',
    // Competitors array
    'competitors', 'competitors.*',
    // Insights & opportunities arrays
    'insights', 'opportunities',
    // The comparison object embeds a FULL account doc (143+ paths)
    // Using prefix wildcard to avoid enumerating every sub-path
    'comparison', 'comparison.*',
  ]),

  gmailDraft: new Set([
    'userId', 'accountKey', 'personKey',
    'subject', 'body', 'to', 'cc', 'bcc',
    'threadId', 'messageId', 'draftId',
    'status', 'sentAt', 'createdAt', 'updatedAt',
    'metadata', 'metadata.*',
    'context', 'context.*',
  ]),

  // ── Types that exist in production but should NOT receive new writes ──
  _blocked: new Set([
    'enrichmentJob',   // legacy duplicate of orchestrationJob
    'company',         // duplicate of account
    'networkPerson',   // duplicate of person
    'scanResult',      // legacy — data now in accountPack
    'crawlResult',     // legacy — data now in accountPack
  ]),
};

// Sanity internal fields — always allowed, never checked
const SANITY_INTERNAL = new Set([
  '_id', '_type', '_rev', '_createdAt', '_updatedAt',
  '_key', '_ref', '_weak',
]);

/**
 * Extract all field paths from a mutation payload.
 * Walks nested objects to find every unique path.
 *
 * @param {object} obj - The mutation payload
 * @param {string} prefix - Current path prefix
 * @returns {string[]} All field paths (e.g., ['payloadIndex.hasScan', 'domain'])
 */
export function extractFieldPaths(obj, prefix = '') {
  const paths = [];
  if (!obj || typeof obj !== 'object') return paths;

  for (const [key, value] of Object.entries(obj)) {
    // Skip Sanity internal fields
    if (SANITY_INTERNAL.has(key)) continue;

    const fullPath = prefix ? `${prefix}.${key}` : key;
    paths.push(fullPath);

    // Recurse into objects (but not arrays — array items share the parent path)
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      paths.push(...extractFieldPaths(value, fullPath));
    }
  }

  return paths;
}

/**
 * Check if a path matches the whitelist, including wildcard prefixes.
 * A whitelist entry like 'data.*' matches 'data.foo', 'data.foo.bar', etc.
 *
 * @param {Set} whitelist - The whitelist Set for this type
 * @param {string} path - The field path to check
 * @returns {boolean}
 */
function pathMatchesWhitelist(whitelist, path) {
  // Direct match
  if (whitelist.has(path)) return true;

  // Check prefix wildcards: if whitelist has 'foo.*', match 'foo.bar', 'foo.bar.baz'
  // Walk up the path looking for a wildcard parent
  const parts = path.split('.');
  for (let i = 1; i < parts.length; i++) {
    const prefix = parts.slice(0, i).join('.') + '.*';
    if (whitelist.has(prefix)) return true;
  }

  return false;
}

/**
 * Check if a mutation's field paths are all in the whitelist.
 *
 * @param {string} docType - The _type of the document
 * @param {string[]} paths - Field paths from extractFieldPaths()
 * @returns {{ allowed: boolean, unknownPaths: string[], reason: string|null }}
 */
export function checkPathsAgainstWhitelist(docType, paths) {
  // If type is in the blocked list, reject everything
  if (ATTRIBUTE_WHITELIST._blocked.has(docType)) {
    return {
      allowed: false,
      unknownPaths: paths,
      reason: `Type "${docType}" is blocked — legacy/duplicate type that should not receive writes`,
    };
  }

  const whitelist = ATTRIBUTE_WHITELIST[docType];

  // If type has no whitelist, warn but allow (unknown type)
  if (!whitelist) {
    return {
      allowed: true,
      unknownPaths: paths,
      reason: `Type "${docType}" has no whitelist — all paths allowed (add a whitelist!)`,
    };
  }

  const unknownPaths = paths.filter(p => !pathMatchesWhitelist(whitelist, p));

  return {
    allowed: unknownPaths.length === 0,
    unknownPaths,
    reason: unknownPaths.length > 0
      ? `${unknownPaths.length} unknown path(s): ${unknownPaths.slice(0, 5).join(', ')}${unknownPaths.length > 5 ? '...' : ''}`
      : null,
  };
}

/**
 * Infer document type from Sanity document ID.
 * Convention: "account.{key}", "accountPack-{key}", "usageLog-{id}"
 *
 * @param {string} id - Sanity document ID
 * @returns {string|null} Inferred _type or null
 */
export function inferTypeFromId(id) {
  if (!id) return null;
  if (id.startsWith('account.') || id.startsWith('account-')) return 'account';
  if (id.startsWith('accountPack-')) return 'accountPack';
  if (id.startsWith('actionCandidate-')) return 'actionCandidate';
  if (id.startsWith('usageLog-')) return 'usageLog';
  if (id.startsWith('orchestrationJob-') || id.startsWith('unified-')) return 'orchestrationJob';
  if (id.startsWith('person-') || id.startsWith('person.')) return 'person';
  if (id.startsWith('tech-') || id.startsWith('technology-')) return 'technology';
  if (id.startsWith('userPattern-')) return 'userPattern';
  if (id.startsWith('interaction-')) return 'interaction';
  if (id.startsWith('brief-')) return 'brief';
  if (id.startsWith('competitorResearch-')) return 'competitorResearch';
  if (id.startsWith('gmailDraft-')) return 'gmailDraft';
  return null;
}
