/**
 * Payload Helpers — Index+Blob pattern for accountPack
 * 
 * Replaces freeform `payload` object (~300-500 dynamic Sanity attributes)
 * with `payloadIndex` (28 fixed queryable attributes) + `payloadData` (JSON string blob).
 * 
 * See: index-blob-schema-and-migration-map on the board
 */

/**
 * Build the queryable payloadIndex from a full payload object.
 * Called on every write to accountPack.
 * 
 * @param {object} payload - The full payload object
 * @returns {object} payloadIndex with boolean flags + enrichmentState
 */
export function buildPayloadIndex(payload) {
  if (!payload || typeof payload !== 'object') return {};

  const scan = payload.scan || payload.researchSet?.scan;

  return {
    // Stage presence booleans
    hasScan:            !!payload.scan || !!payload.researchSet?.scan,
    hasDiscovery:       !!payload.discovery || !!payload.researchSet?.discovery,
    hasCrawl:           !!payload.crawl || !!payload.researchSet?.crawl,
    hasEvidence:        !!payload.evidence || !!payload.researchSet?.evidence,
    hasLinkedin:        !!payload.linkedin || !!payload.researchSet?.linkedin,
    hasBrief:           !!payload.brief || !!payload.researchSet?.brief,
    hasVerification:    !!payload.verification || !!payload.researchSet?.verification,
    hasCompetitors:     !!payload.competitors,
    hasCompetitorResearch: !!payload.competitorResearch,

    // Competitor discovery filters
    hasTechnologyStack: !!scan?.technologyStack,
    hasBusinessUnits:   !!scan?.businessUnits,
    hasBusinessScale:   !!scan?.businessScale,

    // Enrichment state (queried by jobId in GROQ)
    enrichmentState:    payload.enrichmentState || null,

    // Metadata
    enrichmentCompletedAt: payload.enrichmentCompletedAt || null,
  };
}

/**
 * Hydrate a full payload object from an accountPack document.
 * Handles backward compatibility: old docs have `payload` as object,
 * new docs have `payloadData` as JSON string.
 * 
 * @param {object} pack - An accountPack document (or partial)
 * @returns {object} The full payload object
 */
export function hydratePayload(pack) {
  // Backward compat: old docs still have `payload` as object
  if (pack?.payload && typeof pack.payload === 'object') {
    return pack.payload;
  }
  // New docs: parse from string blob
  if (pack?.payloadData) {
    try {
      return JSON.parse(pack.payloadData);
    } catch (e) {
      console.error(`Failed to parse payloadData for ${pack?._id || 'unknown'}:`, e);
      return {};
    }
  }
  return {};
}
