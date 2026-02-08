/**
 * Persona Lens Selection Utilities
 * Selects primary persona and frames insights with one pain, one gain, one metric
 */

const PERSONAS = ['Engineering', 'Marketing', 'Digital', 'Product', 'IT', 'Security'];

/**
 * Select primary persona based on scan result, claims, and inferred function
 * @param {Object} scanResult - Scan result with tech stack
 * @param {Array} execClaims - Executive claims
 * @param {string} inferredFunction - Inferred function/role
 * @returns {string} Primary persona
 */
export function selectPrimaryPersona(scanResult, execClaims = [], inferredFunction = null) {
  const signals = {
    Engineering: 0,
    Marketing: 0,
    Digital: 0,
    Product: 0,
    IT: 0,
    Security: 0,
  };
  
  // Infer from function/role
  if (inferredFunction) {
    const funcLower = inferredFunction.toLowerCase();
    if (funcLower.includes('engineer') || funcLower.includes('cto') || funcLower.includes('dev')) {
      signals.Engineering += 3;
    }
    if (funcLower.includes('marketing') || funcLower.includes('cmo')) {
      signals.Marketing += 3;
    }
    if (funcLower.includes('product') || funcLower.includes('cp')) {
      signals.Product += 3;
    }
    if (funcLower.includes('digital') || funcLower.includes('transform')) {
      signals.Digital += 3;
    }
    if (funcLower.includes('it') || funcLower.includes('cio')) {
      signals.IT += 3;
    }
    if (funcLower.includes('security') || funcLower.includes('ciso')) {
      signals.Security += 3;
    }
  }
  
  // Infer from tech stack
  if (scanResult?.techStack) {
    // Legacy systems = Engineering focus
    if (scanResult.techStack.legacySystems?.length > 0) {
      signals.Engineering += 2;
      signals.IT += 1;
    }
    
    // Frameworks = Engineering focus
    if (scanResult.techStack.frameworks?.length > 0) {
      signals.Engineering += 1;
    }
    
    // CMS = Marketing focus
    if (scanResult.techStack.cms?.length > 0) {
      signals.Marketing += 2;
      signals.Digital += 1;
    }
    
    // Performance issues = Engineering/Product focus
    if (scanResult.performanceScore && scanResult.performanceScore < 60) {
      signals.Engineering += 1;
      signals.Product += 1;
    }
  }
  
  // Infer from executive claims
  execClaims.forEach(claim => {
    const claimLower = (claim.claim || '').toLowerCase();
    const tagLower = (claim.initiativeTag || '').toLowerCase();
    
    if (claimLower.includes('developer') || claimLower.includes('dev') || claimLower.includes('engineering')) {
      signals.Engineering += 1;
    }
    if (claimLower.includes('marketing') || claimLower.includes('content') || claimLower.includes('campaign')) {
      signals.Marketing += 2;
    }
    if (claimLower.includes('product') || claimLower.includes('feature')) {
      signals.Product += 1;
    }
    if (tagLower === 'ai' || claimLower.includes('ai') || claimLower.includes('automation')) {
      signals.Digital += 1;
      signals.Product += 1;
    }
    if (claimLower.includes('security') || claimLower.includes('compliance')) {
      signals.Security += 2;
    }
  });
  
  // Find persona with highest score
  const persona = Object.entries(signals)
    .sort((a, b) => b[1] - a[1])[0][0];
  
  return signals[persona] > 0 ? persona : 'Engineering'; // Default to Engineering
}

/**
 * Frame persona lens with one pain, one gain, one metric
 * @param {string} persona - Primary persona
 * @param {Object} scanResult - Scan result
 * @param {Array} execClaims - Executive claims
 * @returns {Object} Persona lens with pain, gain, metric
 */
export function framePersonaLens(persona, scanResult, execClaims = []) {
  const lens = {
    primaryPersona: persona,
    pain: '',
    gain: '',
    metric: '',
  };
  
  // Engineering persona
  if (persona === 'Engineering') {
    const legacySystems = scanResult?.techStack?.legacySystems || [];
    const painPoints = scanResult?.techStack?.painPoints || [];
    
    lens.pain = legacySystems.length > 0
      ? `Developer-dependent deployments with ${legacySystems[0]} create bottlenecks and slow time-to-market`
      : 'Deployment bottlenecks and developer dependencies limit content team autonomy';
    
    lens.gain = 'Reduce deployment time by 80% and enable content team self-service publishing';
    lens.metric = 'Time-to-market for content updates';
  }
  
  // Marketing persona
  else if (persona === 'Marketing') {
    const cms = scanResult?.techStack?.cms || [];
    const systemDuplication = scanResult?.techStack?.systemDuplication || [];
    
    lens.pain = systemDuplication.length > 0
      ? `Multiple content systems create inconsistency and duplicate work for marketing teams`
      : (cms.length > 0 
        ? `Limited content flexibility with ${cms[0]} restricts campaign execution and personalization`
        : 'Content creation and campaign execution are slowed by technical constraints');
    
    lens.gain = 'Increase content velocity by 3x and enable real-time campaign personalization';
    lens.metric = 'Campaign launch time';
  }
  
  // Digital/Product persona
  else if (persona === 'Digital' || persona === 'Product') {
    const performanceScore = scanResult?.performanceScore || 0;
    
    lens.pain = performanceScore < 60
      ? 'Slow page load times and poor user experience impact conversion rates'
      : 'Limited ability to experiment with content and features due to technical constraints';
    
    lens.gain = 'Improve site performance by 50% and enable rapid experimentation';
    lens.metric = 'Page load time and conversion rate';
  }
  
  // IT persona
  else if (persona === 'IT') {
    const systemDuplication = scanResult?.techStack?.systemDuplication || [];
    const legacySystems = scanResult?.techStack?.legacySystems || [];
    
    lens.pain = systemDuplication.length > 0
      ? `Multiple overlapping systems increase maintenance costs and create security complexity`
      : (legacySystems.length > 0
        ? `Legacy ${legacySystems[0]} requires specialized skills and high maintenance costs`
        : 'High infrastructure costs and complex system management');
    
    lens.gain = 'Reduce total cost of ownership by 40-60% and simplify infrastructure';
    lens.metric = 'Total cost of ownership (TCO)';
  }
  
  // Security persona
  else if (persona === 'Security') {
    lens.pain = 'Multiple systems and legacy infrastructure increase attack surface and compliance risk';
    lens.gain = 'Consolidate systems, reduce attack surface, and improve compliance posture';
    lens.metric = 'Security incidents and compliance audit results';
  }
  
  // Default (fallback)
  else {
    lens.pain = 'Technical constraints limit business agility and growth';
    lens.gain = 'Modernize infrastructure to enable faster innovation';
    lens.metric = 'Time-to-market for new initiatives';
  }
  
  return lens;
}

/**
 * Get persona-specific job titles
 * @param {string} persona - Primary persona
 * @returns {Array} Array of job titles for this persona
 */
export function getPersonaTitles(persona) {
  const titles = {
    Engineering: ['CTO', 'VP Engineering', 'Engineering Director', 'Head of Engineering', 'Engineering Manager'],
    Marketing: ['CMO', 'VP Marketing', 'Marketing Director', 'Head of Marketing', 'Marketing Manager'],
    Digital: ['CDO', 'VP Digital', 'Digital Director', 'Head of Digital', 'Digital Manager'],
    Product: ['CPO', 'VP Product', 'Product Director', 'Head of Product', 'Product Manager'],
    IT: ['CIO', 'VP IT', 'IT Director', 'Head of IT', 'IT Manager'],
    Security: ['CISO', 'VP Security', 'Security Director', 'Head of Security', 'Security Manager'],
  };
  
  return titles[persona] || ['Executive', 'Director', 'Manager'];
}
