/**
 * OSINT Scoring and Ranking
 * Implements ranking algorithm for sources and initiatives
 */

/**
 * Calculate recency score (0-100)
 * @param {string|null} publishedAt - ISO date string or null
 * @param {number} recencyDays - Max days to consider
 * @returns {number} Score 0-100
 */
export function calculateRecencyScore(publishedAt, recencyDays = 365) {
  if (!publishedAt) return 30; // Unknown date gets low score
  
  try {
    const published = new Date(publishedAt);
    const now = new Date();
    const daysAgo = Math.floor((now - published) / (1000 * 60 * 60 * 24));
    
    if (daysAgo < 0) return 100; // Future dates
    if (daysAgo <= 90) return 100; // Highest boost for <= 90 days
    if (daysAgo <= 180) return 70; // Medium boost for <= 180 days
    if (daysAgo <= 365) return 40; // Low boost for <= 365 days
    if (daysAgo <= recencyDays) return 20; // Very low for within recency window
    return 10; // Outside recency window
  } catch (e) {
    return 30;
  }
}

/**
 * Check if URL is first-party (matches root domain)
 * @param {string} url
 * @param {string} rootDomain
 * @returns {boolean}
 */
export function isFirstParty(url, rootDomain) {
  try {
    const urlObj = new URL(url);
    const urlDomain = urlObj.hostname.replace(/^www\./, '');
    return urlDomain === rootDomain || urlDomain.endsWith('.' + rootDomain);
  } catch (e) {
    return false;
  }
}

/**
 * Calculate first-party boost
 * @param {boolean} isFirstParty
 * @returns {number} Boost score (0-30)
 */
export function getFirstPartyBoost(isFirstParty) {
  return isFirstParty ? 30 : 0;
}

/**
 * Detect time horizon signals in text
 * @param {string} text
 * @param {Object} dateRange - { start: ISO string, end: ISO string, startYear: number, endYear: number }
 * @returns {'0-3mo'|'3-12mo'|'12mo+'|null}
 */
export function detectTimeHorizon(text, dateRange) {
  const lower = text.toLowerCase();
  const now = new Date();
  const currentYear = now.getFullYear();
  const nextYear = currentYear + 1;
  
  // Immediate signals (0-3mo)
  if (/\b(immediate|now|this month|next month|q[1-4]|quarter|within 30|within 60|within 90)\b/.test(lower)) {
    return '0-3mo';
  }
  
  // Short-term signals (3-12mo) - focus on next 12 months
  if (/\b(coming months|next 6|next 12|within 6|within 12|h1|h2|first half|second half|mid year|end of year|next year)\b/.test(lower)) {
    return '3-12mo';
  }
  
  // Year-specific signals for current or next year (within our 12-month window)
  if (new RegExp(`\\b(${currentYear}|${nextYear})\\b`).test(lower)) {
    return '3-12mo';
  }
  
  // Long-term signals
  if (/\b(roadmap|long term|future|upcoming|planned|strategy|vision)\b/.test(lower)) {
    return '12mo+';
  }
  
  return null;
}

/**
 * Calculate numeric/timeline boost
 * @param {string} text
 * @param {Object} dateRange - { start: ISO string, end: ISO string, startYear: number, endYear: number }
 * @returns {number} Boost score (0-20)
 */
export function getNumericTimelineBoost(text, dateRange) {
  let score = 0;
  const lower = text.toLowerCase();
  const now = new Date();
  const currentYear = now.getFullYear();
  const nextYear = currentYear + 1;
  
  // Contains digits
  if (/\d/.test(text)) score += 5;
  
  // Contains current or next year (within 12-month window)
  if (new RegExp(`\\b(${currentYear}|${nextYear})\\b`).test(lower)) score += 10;
  
  // Contains timeline keywords
  if (/\b(next year|12 months|roadmap|timeline|schedule|launch|release|deploy)\b/.test(lower)) {
    score += 5;
  }
  
  return Math.min(20, score);
}

/**
 * Calculate quality score (penalize low-quality sources)
 * @param {string} url
 * @param {string|null} title
 * @param {string|null} excerpt
 * @returns {number} Quality score (0-100)
 */
export function calculateQualityScore(url, title, excerpt) {
  let score = 70; // Base score
  
  // Penalize spammy hosts
  const spamPatterns = [
    /spam|scam|malware|phishing/i,
    /\.tk$|\.ml$|\.ga$|\.cf$/i, // Suspicious TLDs
  ];
  
  if (spamPatterns.some(pattern => pattern.test(url))) {
    score -= 50;
  }
  
  // Boost if has title and excerpt
  if (title && title.length > 10) score += 10;
  if (excerpt && excerpt.length > 50) score += 10;
  
  // Penalize very short content
  if (excerpt && excerpt.length < 20) score -= 20;
  
  return Math.max(0, Math.min(100, score));
}

/**
 * Count corroboration (how many sources mention same initiative)
 * @param {string} initiativeTitle
 * @param {Array<{url: string, excerpt?: string}>} allSources
 * @returns {number} Count of sources mentioning this
 */
export function countCorroboration(initiativeTitle, allSources) {
  const keywords = initiativeTitle.toLowerCase().split(/\s+/).filter(w => w.length > 3);
  if (keywords.length === 0) return 0;
  
  return allSources.filter(source => {
    const text = ((source.excerpt || '') + ' ' + (source.title || '')).toLowerCase();
    return keywords.some(keyword => text.includes(keyword));
  }).length;
}

/**
 * Calculate total score for a source
 * @param {Object} source
 * @param {string} rootDomain
 * @param {Object} dateRange - { start: ISO string, end: ISO string, startYear: number, endYear: number }
 * @param {number} recencyDays
 * @returns {number} Total score
 */
export function calculateSourceScore(source, rootDomain, dateRange, recencyDays) {
  const recency = calculateRecencyScore(source.publishedAt, recencyDays);
  const firstParty = isFirstParty(source.url, rootDomain);
  const firstPartyBoost = getFirstPartyBoost(firstParty);
  const numericBoost = getNumericTimelineBoost(
    (source.excerpt || '') + ' ' + (source.title || ''),
    dateRange
  );
  const quality = calculateQualityScore(source.url, source.title, source.excerpt);
  
  // Weighted total: recency (40%), first-party (30%), numeric (20%), quality (10%)
  return Math.round(
    recency * 0.4 +
    firstPartyBoost * 0.3 +
    numericBoost * 0.2 +
    quality * 0.1
  );
}

/**
 * Calculate importance score for an initiative
 * @param {Object} initiative
 * @param {Array} allSources
 * @param {string} rootDomain
 * @returns {number} Importance score (0-100)
 */
export function calculateInitiativeScore(initiative, allSources, rootDomain) {
  let score = 50; // Base score
  
  // Evidence count boost
  const evidenceCount = initiative.evidence?.length || 0;
  score += Math.min(20, evidenceCount * 5);
  
  // Corroboration boost
  const corroboration = countCorroboration(initiative.title, allSources);
  score += Math.min(15, corroboration * 3);
  
  // First-party evidence boost
  const firstPartyCount = initiative.evidence?.filter(e => 
    isFirstParty(e.url, rootDomain)
  ).length || 0;
  score += Math.min(15, firstPartyCount * 5);
  
  return Math.min(100, Math.max(0, score));
}

/**
 * Determine confidence level from evidence
 * @param {Array} evidence
 * @param {string} rootDomain
 * @returns {'low'|'medium'|'high'}
 */
export function determineConfidence(evidence, rootDomain) {
  if (!evidence || evidence.length === 0) return 'low';
  
  const firstPartyCount = evidence.filter(e => isFirstParty(e.url, rootDomain)).length;
  const totalCount = evidence.length;
  
  if (firstPartyCount >= 2 || totalCount >= 5) return 'high';
  if (firstPartyCount >= 1 || totalCount >= 3) return 'medium';
  return 'low';
}

