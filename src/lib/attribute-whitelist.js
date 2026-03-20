/**
 * Attribute Path Whitelist — Layer 3 Write Guard
 *
 * Every field path that Sanity mutations are allowed to write.
 * Generated from production data analysis (2026-03-20).
 *
 * UPDATE THIS FILE when adding new fields to any schema.
 * The write guard in mutate() will reject/warn on unknown paths
 * when attribute health is critical or wall.
 *
 * @see attribute-guardrails-spec on the board
 */

// ── Whitelist per document type ──
// Each Set contains all known field paths (dot-notation) for that type.
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

    // Competitor research
    'competitorResearch', 'competitorResearch.count',
    'competitorResearch.researchedAt',

    // Relationships
    'relationships', 'relationships.competitorCount',
    'relationships.relatedPeopleCount', 'relationships.similarIndustryCount',
    'relationships.similarOpportunityCount', 'relationships.similarTechCount',
    'relationships.techOpportunityCount', 'relationships.lastDetectedAt',

    // Technology (references array + legacy nested object)
    'technologies', 'technologyStack',
    // technologyStack sub-fields (legacy — budget for consolidation)
    'technologyStack.cms', 'technologyStack.frameworks',
    'technologyStack.legacySystems', 'technologyStack.pimSystems',
    'technologyStack.damSystems', 'technologyStack.lmsSystems',
    'technologyStack.analytics', 'technologyStack.ecommerce',
    'technologyStack.hosting', 'technologyStack.marketing',
    'technologyStack.payments', 'technologyStack.chat',
    'technologyStack.monitoring', 'technologyStack.authProviders',
    'technologyStack.searchTech', 'technologyStack.cssFrameworks',
    'technologyStack.cdnMedia', 'technologyStack.cicd',
    'technologyStack.cmsSystems', 'technologyStack.modernFrameworks',
    'technologyStack.headlessIndicators', 'technologyStack.systemDuplication',
    'technologyStack.migrationOpportunities', 'technologyStack.painPoints',
    'technologyStack.roiInsights', 'technologyStack.opportunityScore',
    'technologyStack.allDetected',

    // Signals & refs
    'signals',
    'sourceRefs', 'sourceRefs.packId',
  ]),

  accountPack: new Set([
    // Core identity
    'accountKey', 'canonicalUrl', 'domain',
    'createdAt', 'updatedAt',

    // Index+Blob fields (the ONLY payload fields allowed post-migration)
    'payloadIndex',
    'payloadIndex.hasScan', 'payloadIndex.hasDiscovery',
    'payloadIndex.hasCrawl', 'payloadIndex.hasEvidence',
    'payloadIndex.hasLinkedin', 'payloadIndex.hasBrief',
    'payloadIndex.hasVerification', 'payloadIndex.hasCompetitors',
    'payloadIndex.hasCompetitorResearch', 'payloadIndex.hasTechnologyStack',
    'payloadIndex.hasBusinessUnits', 'payloadIndex.hasBusinessScale',
    'payloadIndex.enrichmentState',
    'payloadIndex.enrichmentState.jobId',
    'payloadIndex.enrichmentState.status',
    'payloadIndex.enrichmentState.currentStage',
    'payloadIndex.enrichmentState.completedStages',
    'payloadIndex.enrichmentState.failedStages',
    'payloadIndex.enrichmentState.startedAt',
    'payloadIndex.enrichmentState.updatedAt',
    'payloadIndex.enrichmentCompletedAt',
    'payloadData', // JSON string blob — 1 attribute

    // History & meta
    'history',
    'meta', 'meta.storedBy',

    // BLOCKED: 'payload' and 'payload.*' — the old freeform object
    // These are NOT in the whitelist. Any write to payload.* will be flagged.
  ]),

  person: new Set([
    'name', 'firstName', 'lastName', 'title', 'company',
    'linkedinUrl', 'linkedInUrl', // both casings exist (known dupe)
    'email', 'phone', 'location',
    'source', 'confidence', 'lastVerifiedAt',
    'accountKey', 'domain',
    'createdAt', 'updatedAt',
  ]),

  technology: new Set([
    'name', 'slug', 'category', 'subcategory', 'vendor',
    'detectedAt', 'source', 'confidence',
    'accountCount', 'firstDetectedAt', 'lastDetectedAt',
  ]),

  userPattern: new Set([
    'userId', 'patternType', 'patternKey', 'count',
    'firstSeen', 'lastSeen', 'metadata',
    'payload', 'payload.value',
  ]),

  usageLog: new Set([
    'userId', 'userEmail', 'endpoint', 'method', 'prompt',
    'accountKey', 'accountDomain', 'personId',
    'techSummary', 'enrichmentSummary',
    'requestId', 'statusCode', 'success', 'timestamp',
    'responseTimeMs', 'responseBodySize',
    'queryParams', 'requestBodySize', 'userAgent', 'ipAddress', 'referer',
    'metadata',
  ]),

  actionCandidate: new Set([
    'accountKey', 'actionType', 'title', 'description',
    'priority', 'status', 'confidence', 'reasoning',
    'suggestedAt', 'expiresAt', 'completedAt',
    'context', 'metadata',
    'payload', 'payload.value',
    'domain', 'source', 'createdAt', 'updatedAt',
    'category', 'subCategory', 'targetPersonId',
    'outcome', 'outcome.result', 'outcome.completedAt',
    'outcome.notes', 'outcome.revenue',
  ]),

  orchestrationJob: new Set([
    'jobId', 'accountKey', 'canonicalUrl', 'goalKey',
    'status', 'currentStage', 'completedStages', 'failedStages',
    'startedAt', 'updatedAt', 'completedAt', 'priority',
    'options', 'metadata', 'error',
    'stages', 'result', 'domain',
  ]),

  // ── Types that exist in production but should NOT receive new writes ──
  // (legacy/duplicate types from the audit)
  _blocked: new Set([
    'enrichmentJob',   // legacy duplicate of enrich.job
    'company',         // duplicate of account
    'networkPerson',   // duplicate of person
    'draftAction',     // duplicate of actionCandidate
    'signal',          // never used in writes, 32 fields
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

  const unknownPaths = paths.filter(p => !whitelist.has(p));

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
  if (id.startsWith('account.')) return 'account';
  if (id.startsWith('accountPack-')) return 'accountPack';
  if (id.startsWith('actionCandidate-')) return 'actionCandidate';
  if (id.startsWith('usageLog-')) return 'usageLog';
  if (id.startsWith('orchestrationJob-') || id.startsWith('unified-')) return 'orchestrationJob';
  if (id.startsWith('person-') || id.startsWith('person.')) return 'person';
  if (id.startsWith('tech-') || id.startsWith('technology-')) return 'technology';
  if (id.startsWith('userPattern-')) return 'userPattern';
  return null;
}
