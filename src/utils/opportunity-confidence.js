/**
 * Opportunity Confidence Scoring Utilities
 * Implements the Opportunity Confidence framework with confidence markers
 * and "What would change this score?" calculation
 */

/**
 * Calculate Opportunity Confidence with confidence markers
 * @param {Object} scanResult - Scan result with opportunityScore and tech stack
 * @param {Array} execClaims - Executive claims for evidence strength
 * @param {Object} options - Additional options
 * @returns {Object} Opportunity Confidence object with markers
 */
export function calculateOpportunityConfidence(scanResult, execClaims = [], options = {}) {
  const opportunityScore = scanResult?.opportunityScore || 0;
  
  // Determine evidence strength
  const evidenceStrength = calculateEvidenceStrength(scanResult, execClaims);
  
  // Determine confidence level and marker
  // High-confidence: score >= 70 AND strong evidence
  // Medium-confidence: score >= 50 OR moderate evidence
  // Low-confidence: otherwise
  const isHighConfidence = opportunityScore >= 70 && evidenceStrength.strength === 'strong';
  const isMediumConfidence = opportunityScore >= 50 || evidenceStrength.strength === 'moderate';
  
  const confidence = isHighConfidence ? 'high' : (isMediumConfidence ? 'medium' : 'low');
  const marker = isHighConfidence ? '🟢' : (isMediumConfidence ? '🟡' : '🟡');
  
  // Calculate "What would change this score?"
  const whatWouldChange = calculateWhatWouldChangeScore(scanResult, execClaims, opportunityScore, evidenceStrength);
  
  // Supporting scores (secondary to Opportunity Confidence)
  const supportingScores = {
    aiReadiness: scanResult?.aiReadinessScore || null,
    performance: scanResult?.performanceScore || null,
    businessScale: scanResult?.businessScaleScore || null,
  };
  
  return {
    score: opportunityScore,
    confidence,
    marker,
    evidenceStrength: evidenceStrength.strength,
    evidenceFactors: evidenceStrength.factors,
    whatWouldChangeScore: whatWouldChange,
    supportingScores,
  };
}

/**
 * Calculate evidence strength based on scan result and claims
 * @param {Object} scanResult - Scan result
 * @param {Array} execClaims - Executive claims
 * @returns {Object} Evidence strength assessment
 */
function calculateEvidenceStrength(scanResult, execClaims) {
  const factors = [];
  let strengthScore = 0;
  
  // Legacy systems detected = strong signal
  if (scanResult?.techStack?.legacySystems?.length > 0) {
    factors.push('legacySystems');
    strengthScore += 3;
  }
  
  // System duplication = strong signal
  if (scanResult?.techStack?.systemDuplication?.length > 0) {
    factors.push('systemDuplication');
    strengthScore += 2;
  }
  
  // Pain points identified = moderate signal
  if (scanResult?.techStack?.painPoints?.length > 0) {
    factors.push('painPoints');
    strengthScore += scanResult.techStack.painPoints.length;
  }
  
  // ROI insights = strong signal
  if (scanResult?.techStack?.roiInsights?.length > 0) {
    const highImpactROI = scanResult.techStack.roiInsights.filter(r => r.impact === 'High').length;
    if (highImpactROI > 0) {
      factors.push('highImpactROI');
      strengthScore += highImpactROI * 2;
    }
  }
  
  // Executive claims = moderate signal
  if (execClaims.length > 0) {
    factors.push('executiveClaims');
    strengthScore += Math.min(execClaims.length, 5);
  }
  
  // Determine strength level
  let strength;
  if (strengthScore >= 7) {
    strength = 'strong';
  } else if (strengthScore >= 4) {
    strength = 'moderate';
  } else {
    strength = 'weak';
  }
  
  return { strength, factors, score: strengthScore };
}

/**
 * Calculate what would change the opportunity score
 * @param {Object} scanResult - Scan result
 * @param {Array} execClaims - Executive claims
 * @param {number} currentScore - Current opportunity score
 * @param {Object} evidenceStrength - Evidence strength assessment
 * @returns {string} Description of what would change the score
 */
function calculateWhatWouldChangeScore(scanResult, execClaims, currentScore, evidenceStrength) {
  const factors = [];
  
  // If score is low but evidence is strong, explain why
  if (currentScore < 50 && evidenceStrength.strength === 'strong') {
    factors.push('Strong signals detected but score is conservative - additional business context (budget, timeline, decision-makers) would increase confidence');
  }
  
  // If score is high but evidence is weak, explain uncertainty
  if (currentScore >= 70 && evidenceStrength.strength === 'weak') {
    factors.push('High score but limited evidence - verified tech stack details and confirmed pain points would strengthen confidence');
  }
  
  // Legacy systems impact
  if (!scanResult?.techStack?.legacySystems?.length && currentScore < 60) {
    factors.push('Detection of legacy systems (AEM, Sitecore, Drupal) would significantly increase score');
  }
  
  // System duplication impact
  if (!scanResult?.techStack?.systemDuplication?.length && currentScore < 70) {
    factors.push('Identifying multiple overlapping systems would boost opportunity score');
  }
  
  // Executive claims impact
  if (execClaims.length === 0 && currentScore < 65) {
    factors.push('Public statements from executives about modernization initiatives would increase confidence');
  }
  
  // Pain points impact
  if (!scanResult?.techStack?.painPoints?.length && currentScore < 55) {
    factors.push('Specific pain points (deployment bottlenecks, content team frustration, cost concerns) would raise score');
  }
  
  // ROI insights impact
  if (!scanResult?.techStack?.roiInsights?.length && currentScore < 60) {
    factors.push('Clear ROI opportunities (cost savings, time-to-market, productivity) would increase opportunity confidence');
  }
  
  // If already headless, explain why score would be lower
  if (scanResult?.techStack?.cms?.some(cms => ['Contentful', 'Strapi', 'Sanity', 'Prismic'].includes(cms))) {
    factors.push('Already using headless CMS - modernization opportunity is lower unless consolidating multiple systems');
  }
  
  // Combine factors
  if (factors.length === 0) {
    return 'Score is well-supported by current evidence. Additional business context (budget, timeline, decision-maker alignment) would refine confidence.';
  }
  
  return factors.slice(0, 3).join('. ') + '.';
}
