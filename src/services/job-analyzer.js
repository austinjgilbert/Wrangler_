/**
 * Job Posting Analysis Service
 * Analyzes job postings to understand organizational structure and digital focus
 */

/**
 * Analyze job postings
 * @param {string} baseUrl - Base URL
 * @param {string} html - HTML content
 * @returns {Promise<object>} - Job analysis
 */
export async function analyzeJobPostings(baseUrl, html) {
  const jobAnalysis = {
    careersPageFound: false,
    careersPageUrl: null,
    recentHires: [],
    digitalContentRoles: [],
    infrastructureRoles: [],
    roleBaselines: {
      cLevel: [],
      vp: [],
      director: [],
      manager: [],
    },
    totalJobsFound: 0,
  };

  const htmlLower = html.toLowerCase();
  
  // Find careers/jobs page URLs
  const careersPatterns = [
    /href=["']([^"']*(?:career|job|hiring|join.*us|we.*are.*hiring)[^"']*)["']/gi,
    /href=["']([^"']*\/careers?[^"']*)["']/gi,
    /href=["']([^"']*\/jobs?[^"']*)["']/gi,
    /href=["']([^"']*\/hiring[^"']*)["']/gi,
  ];

  const careersUrls = new Set();
  
  for (const pattern of careersPatterns) {
    let match;
    while ((match = pattern.exec(html)) !== null) {
      try {
        const href = match[1];
        if (href && !href.startsWith('#') && !href.startsWith('javascript:')) {
          const url = new URL(href, baseUrl);
          const baseUrlObj = new URL(baseUrl);
          if (url.hostname === baseUrlObj.hostname || 
              url.hostname.endsWith('.' + baseUrlObj.hostname.replace(/^www\./, ''))) {
            careersUrls.add(url.href);
          }
        }
      } catch (e) {
        // Invalid URL, skip
      }
    }
  }

  // Try common careers page paths
  try {
    const commonPaths = ['/careers', '/jobs', '/careers/', '/jobs/', '/hiring', '/join-us'];
    for (const path of commonPaths) {
      const url = new URL(path, baseUrl);
      careersUrls.add(url.href);
    }
  } catch {
    // Invalid base URL
  }

  if (careersUrls.size > 0) {
    jobAnalysis.careersPageFound = true;
    jobAnalysis.careersPageUrl = Array.from(careersUrls)[0];
  }

  // Extract job postings from HTML (basic pattern matching)
  const jobTitlePatterns = [
    /(?:job|position|role|opening).*?title[^:]*:?\s*([^<\n]{10,100})/gi,
    /<h[23][^>]*>([^<]*(?:engineer|developer|manager|director|vp|chief)[^<]*)<\/h[23]>/gi,
    /(?:hiring|looking for|seeking).*?([A-Z][a-z]+ (?:Engineer|Developer|Manager|Director|VP|Chief)[^<\n]{0,50})/gi,
  ];

  const jobTitles = new Set();
  for (const pattern of jobTitlePatterns) {
    let match;
    while ((match = pattern.exec(html)) !== null) {
      const title = match[1]?.trim();
      if (title && title.length > 5 && title.length < 100) {
        jobTitles.add(title);
      }
    }
  }

  // Analyze job titles
  for (const title of jobTitles) {
    const titleLower = title.toLowerCase();
    
    // Digital content roles
    if (titleLower.match(/(?:content|editorial|marketing|seo|social|digital.*marketing)/i)) {
      jobAnalysis.digitalContentRoles.push({
        title,
        level: detectRoleLevel(title),
      });
    }
    
    // Infrastructure roles
    if (titleLower.match(/(?:engineer|developer|devops|sre|infrastructure|platform|backend)/i)) {
      jobAnalysis.infrastructureRoles.push({
        title,
        level: detectRoleLevel(title),
      });
    }
    
    // C-level
    if (titleLower.match(/^(chief|cto|ceo|cfo|coo|cm)/i)) {
      jobAnalysis.roleBaselines.cLevel.push({
        title,
        responsibilities: extractJobResponsibilities(html, title),
      });
    }
    
    // VP
    if (titleLower.match(/\bvp\b|\bvice.*president/i)) {
      jobAnalysis.roleBaselines.vp.push({
        title,
        responsibilities: extractJobResponsibilities(html, title),
      });
    }
    
    // Director
    if (titleLower.match(/\bdirector\b/i) && !titleLower.match(/vp|vice.*president/i)) {
      jobAnalysis.roleBaselines.director.push({
        title,
        responsibilities: extractJobResponsibilities(html, title),
      });
    }
    
    // Manager
    if (titleLower.match(/\bmanager\b/i) && !titleLower.match(/director|vp|vice.*president/i)) {
      jobAnalysis.roleBaselines.manager.push({
        title,
        responsibilities: extractJobResponsibilities(html, title),
      });
    }
  }

  jobAnalysis.totalJobsFound = jobTitles.size;

  return jobAnalysis;
}

/**
 * Extract job responsibilities
 * @param {string} html - HTML content
 * @param {string} jobTitle - Job title
 * @returns {Array<string>} - Responsibilities
 */
function extractJobResponsibilities(html, jobTitle) {
  const responsibilities = [];
  const titleEscaped = jobTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`${titleEscaped}[\\s\\S]{0,500}(?:responsibilities?|duties?|requirements?)[\\s\\S]{0,1000}`, 'gi');
  const match = html.match(pattern);
  
  if (match) {
    const text = match[0];
    const bulletPattern = /[•\-\*]\s*([^\n•\-\*]{20,200})/g;
    let bulletMatch;
    while ((bulletMatch = bulletPattern.exec(text)) !== null) {
      responsibilities.push(bulletMatch[1].trim());
    }
  }
  
  return responsibilities.slice(0, 5);
}

/**
 * Detect role level
 * @param {string} title - Job title
 * @returns {string} - Role level
 */
function detectRoleLevel(title) {
  const titleLower = title.toLowerCase();
  
  if (titleLower.match(/^(chief|cto|ceo|cfo|coo|cm)/i)) {
    return 'C-Level';
  }
  if (titleLower.match(/\bvp\b|\bvice.*president/i)) {
    return 'VP';
  }
  if (titleLower.match(/\bdirector\b/i)) {
    return 'Director';
  }
  if (titleLower.match(/\bmanager\b/i)) {
    return 'Manager';
  }
  if (titleLower.match(/\bsenior\b/i)) {
    return 'Senior';
  }
  
  return 'Individual Contributor';
}

