/**
 * SDR Scoring Service
 * Scores and prioritizes accounts based on intent, proximity, freshness, fit, and conversation leverage
 */

/**
 * Calculate priority score for an account
 * Priority Score = Intent (0-3) + Proximity (0-3) + Freshness (0-2) + Fit (0-2) + Conversation-Leverage (0-2)
 * 
 * @param {object} account - Account document from Sanity
 * @param {object} person - Optional person document linked to account
 * @param {object} options - Scoring options
 * @returns {object} Score breakdown and total
 */
export function calculatePriorityScore(account, person = null, options = {}) {
  const scores = {
    intent: calculateIntentScore(account, options),
    proximity: calculateProximityScore(account, person, options),
    freshness: calculateFreshnessScore(account, options),
    fit: calculateFitScore(account, options),
    conversationLeverage: calculateConversationLeverageScore(account, person, options),
  };
  
  const total = scores.intent + scores.proximity + scores.freshness + scores.fit + scores.conversationLeverage;
  
  return {
    total,
    breakdown: scores,
    accountKey: account.accountKey,
    companyName: account.companyName || account.rootDomain,
    canonicalUrl: account.canonicalUrl,
  };
}

/**
 * Intent Score (0-3)
 * 3 = strong recent PQA/pricing/demo/enterprise docs
 * 2 = strong product usage/GitHub/integrations/migration content
 * 1 = ICP fit but cold
 * 0 = no signal
 */
function calculateIntentScore(account, options) {
  let score = 0;
  
  // Check signals array for intent indicators
  const signals = account.signals || [];
  const hasPricingSignal = signals.some(s => 
    typeof s === 'string' && (s.toLowerCase().includes('pricing') || s.toLowerCase().includes('enterprise'))
  );
  const hasMigrationSignal = signals.some(s => 
    typeof s === 'string' && (s.toLowerCase().includes('migration') || s.toLowerCase().includes('modernization'))
  );
  const hasProductSignal = signals.some(s => 
    typeof s === 'string' && (s.toLowerCase().includes('github') || s.toLowerCase().includes('integration'))
  );
  
  // Check opportunity score (high score suggests intent)
  const oppScore = account.opportunityScore || 0;
  
  // Check AI readiness (high score suggests active evaluation)
  const aiReadiness = account.aiReadiness?.score || 0;
  
  // Strong intent: pricing/enterprise signals + high opportunity score
  if (hasPricingSignal && oppScore >= 70) {
    score = 3;
  }
  // Strong product usage: migration/modernization signals + high AI readiness
  else if (hasMigrationSignal && aiReadiness >= 70) {
    score = 2;
  }
  // Product usage: GitHub/integration signals
  else if (hasProductSignal) {
    score = 2;
  }
  // ICP fit: decent opportunity score
  else if (oppScore >= 50) {
    score = 1;
  }
  
  return Math.min(score, 3);
}

/**
 * Proximity Score (0-3)
 * 3 = economic buyer or technical owner
 * 2 = influencer/implementer
 * 1 = peripheral
 * 0 = unknown
 */
function calculateProximityScore(account, person, options) {
  if (!person) return 0;
  
  const title = (person.currentTitle || person.title || '').toLowerCase();
  const seniority = (person.seniority || '').toLowerCase();
  const function_ = (person.function || '').toLowerCase();
  
  // Economic buyer: C-level, VP, Head of
  if (title.includes('ceo') || title.includes('cto') || title.includes('cmo') || 
      title.includes('cfo') || title.includes('chief') || title.includes('vp') ||
      title.includes('vice president') || title.includes('head of') ||
      seniority === 'executive' || seniority === 'c-level') {
    return 3;
  }
  
  // Technical owner: Director, Engineering Manager, Tech Lead
  if (title.includes('director') || title.includes('engineering') || 
      title.includes('technical') || title.includes('lead') ||
      function_ === 'engineering' || function_ === 'technical') {
    return 3;
  }
  
  // Influencer/implementer: Manager, Senior, Architect
  if (title.includes('manager') || title.includes('senior') || 
      title.includes('architect') || title.includes('principal') ||
      seniority === 'manager' || seniority === 'senior') {
    return 2;
  }
  
  // Peripheral: Analyst, Coordinator, etc.
  if (title || function_) {
    return 1;
  }
  
  return 0;
}

/**
 * Freshness Score (0-2)
 * 2 = activity last 7 days
 * 1 = last 30 days
 * 0 = older
 */
function calculateFreshnessScore(account, options) {
  const now = new Date();
  const lastScannedAt = account.lastScannedAt ? new Date(account.lastScannedAt) : null;
  const updatedAt = account._updatedAt ? new Date(account._updatedAt) : null;
  const createdAt = account._createdAt ? new Date(account._createdAt) : null;
  
  // Use most recent timestamp
  const recentDate = [lastScannedAt, updatedAt, createdAt].filter(Boolean).sort((a, b) => b - a)[0];
  
  if (!recentDate) return 0;
  
  const daysSince = (now - recentDate) / (1000 * 60 * 60 * 24);
  
  if (daysSince <= 7) return 2;
  if (daysSince <= 30) return 1;
  return 0;
}

/**
 * Fit Score (0-2)
 * 2 = strong ICP match (size/use-case/stack)
 * 1 = partial
 * 0 = weak/unknown
 */
function calculateFitScore(account, options) {
  let score = 0;
  
  // Check opportunity score (proxy for ICP fit)
  const oppScore = account.opportunityScore || 0;
  if (oppScore >= 70) score += 1;
  else if (oppScore >= 50) score += 0.5;
  
  // Check business scale (enterprise = better fit for most)
  const businessScale = account.businessScale?.businessScale || '';
  if (businessScale.toLowerCase().includes('enterprise') || 
      businessScale.toLowerCase().includes('large')) {
    score += 0.5;
  }
  
  // Check if we have tech stack signals (indicates active evaluation)
  const signals = account.signals || [];
  if (signals.length > 0) {
    score += 0.5;
  }
  
  return Math.min(Math.round(score), 2);
}

/**
 * Conversation-Leverage Score (0-2)
 * 2 = multiple contacts, warm intro path, active thread, or internal champion
 * 1 = some leverage
 * 0 = none
 */
function calculateConversationLeverageScore(account, person, options) {
  let score = 0;
  
  // Check if we have person data (means we have a contact)
  if (person) {
    score += 0.5;
    
    // Check if person has LinkedIn URL (connection possibility)
    if (person.linkedInUrl || person.profileUrl) {
      score += 0.5;
    }
    
    // Check if we have executive claims (means company is talking about initiatives)
    if (person.execClaimsUsed && person.execClaimsUsed.length > 0) {
      score += 0.5;
    }
    
    // Check if we have team map (means multiple contacts identified)
    if (person.teamMap && person.teamMap.nodes && person.teamMap.nodes.length > 1) {
      score += 0.5;
    }
  }
  
  // Check if account has brief (means we have research/intelligence)
  if (account.latestBriefRef || account.latestOsintReportRef) {
    score += 0.5;
  }
  
  return Math.min(Math.round(score), 2);
}

/**
 * Rank accounts by priority score
 * @param {Array} accounts - Array of scored accounts
 * @returns {Array} Sorted accounts (highest score first)
 */
export function rankAccounts(accounts) {
  return accounts.sort((a, b) => b.total - a.total);
}

/**
 * Filter accounts by minimum score
 * @param {Array} accounts - Array of scored accounts
 * @param {number} minScore - Minimum total score
 * @returns {Array} Filtered accounts
 */
export function filterByMinScore(accounts, minScore = 6) {
  return accounts.filter(acc => acc.total >= minScore);
}

/**
 * Get "why now" reasoning for an account
 * @param {object} scoredAccount - Account with score breakdown
 * @returns {string} Reasoning
 */
export function getWhyNowReasoning(scoredAccount) {
  const reasons = [];
  const { breakdown } = scoredAccount;
  
  if (breakdown.intent >= 3) {
    reasons.push('Strong recent intent signals (pricing/enterprise)');
  } else if (breakdown.intent >= 2) {
    reasons.push('Active product evaluation (migration/modernization)');
  }
  
  if (breakdown.freshness >= 2) {
    reasons.push('Recent activity (last 7 days)');
  } else if (breakdown.freshness >= 1) {
    reasons.push('Recent activity (last 30 days)');
  }
  
  if (breakdown.proximity >= 3) {
    reasons.push('Economic buyer or technical owner identified');
  }
  
  if (breakdown.conversationLeverage >= 2) {
    reasons.push('Multiple contacts or warm intro path available');
  }
  
  return reasons.length > 0 ? reasons.join('; ') : 'Standard prioritization based on ICP fit';
}

