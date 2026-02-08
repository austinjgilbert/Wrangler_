/**
 * Evidence → Insight → Assumption Structure Utilities
 * Structures brief outputs with clear separation of observed, interpreted, and assumed
 */

/**
 * Create evidence-insight-assumption structure from scan result and claims
 * @param {Object} scanResult - Scan result
 * @param {Array} execClaims - Executive claims
 * @param {number} maxItems - Maximum number of evidence insights (default: 5)
 * @returns {Array} Array of evidence-insight-assumption objects
 */
export function createEvidenceInsights(scanResult, execClaims = [], maxItems = 5) {
  const insights = [];
  
  // Legacy systems insight
  if (scanResult?.techStack?.legacySystems?.length > 0) {
    const legacySystem = scanResult.techStack.legacySystems[0];
    insights.push({
      observed: `Detected ${legacySystem} in technology stack from homepage analysis`,
      interpreted: `${legacySystem} is a legacy CMS with high licensing costs and limited headless capabilities`,
      assumed: 'Migrating to headless CMS would reduce total cost of ownership by 40-60% based on industry benchmarks',
    });
  }
  
  // System duplication insight
  if (scanResult?.techStack?.systemDuplication?.length > 0) {
    const systems = scanResult.techStack.systemDuplication.slice(0, 2).join(' and ');
    insights.push({
      observed: `Found multiple overlapping content systems: ${systems}`,
      interpreted: 'System duplication creates content inconsistency and increases maintenance costs',
      assumed: 'Consolidating to single headless platform would eliminate duplicate licensing and reduce operational overhead',
    });
  }
  
  // Pain points insight
  if (scanResult?.techStack?.painPoints?.length > 0) {
    const painPoint = scanResult.techStack.painPoints[0];
    insights.push({
      observed: `Identified pain point: ${painPoint}`,
      interpreted: 'This indicates active frustration with current technology stack',
      assumed: 'Addressing this pain point would directly improve team productivity and reduce churn risk',
    });
  }
  
  // ROI insights
  if (scanResult?.techStack?.roiInsights?.length > 0) {
    const highImpactROI = scanResult.techStack.roiInsights.filter(r => r.impact === 'High').slice(0, 1);
    if (highImpactROI.length > 0) {
      const roi = highImpactROI[0];
      insights.push({
        observed: `ROI opportunity identified: ${roi.category} with ${roi.impact} impact`,
        interpreted: roi.description || 'This represents a significant business value opportunity',
        assumed: roi.estimatedSavings || `This could deliver ${roi.impact.toLowerCase()} cost savings or efficiency gains`,
      });
    }
  }
  
  // Performance issues insight
  if (scanResult?.performanceScore && scanResult.performanceScore < 60) {
    const issues = scanResult.performance?.performanceIssues || ['Performance issues'];
    insights.push({
      observed: `Performance score: ${scanResult.performanceScore}/100 with issues: ${issues.slice(0, 2).join(', ')}`,
      interpreted: 'Site performance is below optimal, impacting user experience and potentially conversion rates',
      assumed: 'Optimizing content delivery through headless architecture would improve performance scores by 20-30 points',
    });
  }
  
  // AI readiness insight
  if (scanResult?.aiReadinessScore && scanResult.aiReadinessScore < 50) {
    insights.push({
      observed: `AI readiness score: ${scanResult.aiReadinessScore}/100`,
      interpreted: 'Current technology stack has limited AI/automation capabilities',
      assumed: 'Modern headless CMS with AI features would increase readiness score and enable intelligent content automation',
    });
  }
  
  // Executive claims insight
  if (execClaims.length > 0) {
    const topClaim = execClaims[0];
    insights.push({
      observed: `Executive statement: "${topClaim.claim?.substring(0, 100)}${topClaim.claim?.length > 100 ? '...' : ''}"`,
      interpreted: `This indicates active ${topClaim.initiativeTag || 'strategic'} initiative focus`,
      assumed: 'Executive alignment on this initiative increases likelihood of budget and resources being allocated',
    });
  }
  
  // Migration opportunities insight
  if (scanResult?.techStack?.migrationOpportunities?.length > 0) {
    const migration = scanResult.techStack.migrationOpportunities[0];
    insights.push({
      observed: `Migration opportunity identified: ${migration.type} (${migration.priority} priority)`,
      interpreted: migration.reason || 'This represents a strategic modernization opportunity',
      assumed: migration.roiImpact || 'This migration would deliver significant business value',
    });
  }
  
  // Return top insights, bounded
  return insights.slice(0, maxItems);
}

/**
 * Refine executive summary to plain language, business-relevant format
 * @param {Array} insights - Evidence insights
 * @param {Object} opportunityConfidence - Opportunity confidence object
 * @param {string} companyName - Company name
 * @param {number} maxBullets - Maximum bullets (default: 4)
 * @returns {Array} Plain language executive summary bullets
 */
export function createPlainLanguageSummary(insights, opportunityConfidence, companyName, maxBullets = 4) {
  const bullets = [];
  
  // Always include opportunity confidence in first bullet if available
  if (opportunityConfidence && opportunityConfidence.score > 0) {
    const confidenceText = opportunityConfidence.score >= 70
      ? 'Strong opportunity'
      : opportunityConfidence.score >= 50
      ? 'Good opportunity'
      : 'Potential opportunity';
    
    bullets.push(`${companyName} presents a ${confidenceText} (${opportunityConfidence.score}/100) for headless CMS modernization.`);
  }
  
  // Add business-relevant bullets from insights
  insights.forEach((insight, idx) => {
    if (bullets.length >= maxBullets) return;
    
    // Convert insight to plain language business bullet
    if (insight.interpreted && !insight.interpreted.includes('observed') && !insight.interpreted.includes('Detected')) {
      const businessValue = insight.assumed
        ? insight.assumed.split('.').slice(0, 1)[0] // Take first sentence
        : insight.interpreted;
      
      bullets.push(businessValue + '.');
    }
  });
  
  // If we still have room and found legacy systems, add cost impact
  if (bullets.length < maxBullets) {
    const legacyInsight = insights.find(i => i.observed?.includes('Detected') && i.observed?.includes('legacy'));
    if (legacyInsight && legacyInsight.assumed) {
      const costImpact = legacyInsight.assumed.split('by')[1]?.split('.')[0];
      if (costImpact && !bullets.some(b => b.includes(costImpact))) {
        bullets.push(`Modernizing would reduce costs${costImpact ? ` by ${costImpact.trim()}` : ''}.`);
      }
    }
  }
  
  // Ensure at least one bullet
  if (bullets.length === 0) {
    bullets.push(`${companyName} is exploring technology modernization opportunities.`);
  }
  
  return bullets.slice(0, maxBullets);
}
