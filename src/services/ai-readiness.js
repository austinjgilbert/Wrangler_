/**
 * AI Readiness Scoring Service
 * Calculates AI readiness score based on tech stack, digital goals, business units, and job analysis
 */

/**
 * Calculate AI Readiness Score
 * @param {object} techStack - Technology stack
 * @param {object} digitalGoals - Digital goals and initiatives
 * @param {object} businessUnits - Business units data
 * @param {object} jobAnalysis - Job posting analysis
 * @returns {object} - AI readiness score and analysis
 */
export function calculateAIReadinessScore(techStack, digitalGoals, businessUnits, jobAnalysis) {
  const safeTechStack = techStack || { frameworks: [], cms: [], legacySystems: [], headlessIndicators: [], pimSystems: [], damSystems: [] };
  const safeDigitalGoals = digitalGoals || { digitalTransformationSignals: [], technologyFocus: [], initiatives: [] };
  const safeBusinessUnits = businessUnits || { detectedAreas: [] };
  const safeJobAnalysis = jobAnalysis || { digitalContentRoles: [], infrastructureRoles: [] };
  let score = 0;
  const maxScore = 100;
  const factors = {
    modernTechStack: 0,
    apiCapabilities: 0,
    dataInfrastructure: 0,
    digitalTransformation: 0,
    aiInitiatives: 0,
    organizationalReadiness: 0,
  };
  
  // Modern Tech Stack (0-20 points)
  if (safeTechStack.frameworks.length > 0) {
    factors.modernTechStack += 10; // Modern frameworks indicate API-ready architecture
  }
  if (safeTechStack.cms.some(cms => ['Contentful', 'Strapi', 'Sanity', 'Prismic', 'Contentstack'].includes(cms))) {
    factors.modernTechStack += 10; // Headless CMS = API-first architecture
  } else if (safeTechStack.legacySystems.length === 0 && safeTechStack.cms.length === 0) {
    factors.modernTechStack += 5; // Custom/unknown but no legacy = potential modern stack
  }
  
  // API Capabilities (0-20 points)
  if (safeTechStack.headlessIndicators.some(ind => ind.includes('API'))) {
    factors.apiCapabilities += 10;
  }
  if (safeBusinessUnits.detectedAreas.includes('Hosted Services')) {
    factors.apiCapabilities += 10; // API/services indicate integration capabilities
  }
  if (safeTechStack.frameworks.some(f => ['Next.js', 'Nuxt.js', 'Gatsby', 'Remix'].includes(f))) {
    factors.apiCapabilities += 5; // Modern frameworks often have API routes
  }
  
  // Data Infrastructure (0-15 points)
  if (safeTechStack.pimSystems.length > 0 || safeTechStack.damSystems.length > 0) {
    factors.dataInfrastructure += 10; // PIM/DAM = structured data management
  }
  if (safeTechStack.cms.some(cms => ['Sanity', 'Contentful'].includes(cms))) {
    factors.dataInfrastructure += 5; // These CMSs have strong data capabilities
  }
  
  // Digital Transformation (0-20 points)
  if (safeDigitalGoals.digitalTransformationSignals.length > 0) {
    factors.digitalTransformation += 10; // Active transformation = readiness for AI
  }
  if (safeDigitalGoals.technologyFocus.some(focus => focus.includes('Cloud Migration'))) {
    factors.digitalTransformation += 5; // Cloud = scalable infrastructure for AI
  }
  if (safeDigitalGoals.technologyFocus.some(focus => focus.includes('API-First'))) {
    factors.digitalTransformation += 5; // API-first = ready for AI integrations
  }
  
  // AI Initiatives (0-15 points)
  if (safeDigitalGoals.initiatives.some(init => init.toLowerCase().includes('ai') || init.toLowerCase().includes('machine learning'))) {
    factors.aiInitiatives += 10; // Explicit AI initiatives
  }
  if (safeJobAnalysis.digitalContentRoles.some(role => role.title.toLowerCase().includes('ai') || role.title.toLowerCase().includes('ml'))) {
    factors.aiInitiatives += 5; // AI/ML roles indicate organizational commitment
  }
  
  // Organizational Readiness (0-10 points)
  if (safeJobAnalysis.digitalContentRoles.length > 0) {
    factors.organizationalReadiness += 5; // Digital content roles = content strategy
  }
  if (safeJobAnalysis.infrastructureRoles.length > 0) {
    factors.organizationalReadiness += 5; // Infrastructure roles = technical capability
  }
  
  // Calculate total score
  score = Math.min(
    factors.modernTechStack +
    factors.apiCapabilities +
    factors.dataInfrastructure +
    factors.digitalTransformation +
    factors.aiInitiatives +
    factors.organizationalReadiness,
    maxScore
  );
  
  // Determine level
  let level = 'Low';
  if (score >= 80) {
    level = 'Very High';
  } else if (score >= 60) {
    level = 'High';
  } else if (score >= 40) {
    level = 'Medium';
  } else if (score >= 20) {
    level = 'Low-Medium';
  }
  
  // Generate recommendations
  const recommendations = [];
  if (factors.modernTechStack < 10) {
    recommendations.push('Adopt modern headless CMS for API-first architecture');
  }
  if (factors.apiCapabilities < 10) {
    recommendations.push('Develop API capabilities for AI integration');
  }
  if (factors.dataInfrastructure < 10) {
    recommendations.push('Implement structured data management (PIM/DAM)');
  }
  if (factors.digitalTransformation < 10) {
    recommendations.push('Accelerate digital transformation initiatives');
  }
  if (factors.aiInitiatives < 10) {
    recommendations.push('Launch AI/ML initiatives and hire AI talent');
  }
  
  // Generate justifications
  const justifications = [];
  if (score >= 60) {
    justifications.push('Strong foundation for AI adoption with modern tech stack and API capabilities');
  } else if (score >= 40) {
    justifications.push('Moderate readiness - some modernization needed for optimal AI integration');
  } else {
    justifications.push('Limited readiness - significant modernization required for AI adoption');
  }
  
  // Identify mismatches
  const mismatches = [];
  if (safeTechStack.legacySystems.length > 0 && score < 40) {
    mismatches.push('Legacy systems limit AI integration capabilities');
  }
  if (factors.apiCapabilities < 5) {
    mismatches.push('Limited API capabilities hinder AI integration');
  }
  if (factors.dataInfrastructure < 5) {
    mismatches.push('Weak data infrastructure limits AI potential');
  }
  
  // Education content
  const education = {
    whatItMeans: score >= 60 
      ? 'Your organization has a strong foundation for AI adoption with modern technology and processes.'
      : score >= 40
      ? 'Your organization has moderate AI readiness but would benefit from modernization.'
      : 'Your organization needs significant modernization to effectively adopt AI technologies.',
    keyGaps: recommendations.slice(0, 3),
    nextSteps: [
      'Assess current technology stack',
      'Develop API-first architecture',
      'Implement structured data management',
      'Launch AI pilot projects',
    ],
  };
  
  const summary = score >= 60
    ? `AI Readiness Score: ${score}/100 (${level}). Strong foundation for AI adoption.`
    : score >= 40
    ? `AI Readiness Score: ${score}/100 (${level}). Moderate readiness with modernization opportunities.`
    : `AI Readiness Score: ${score}/100 (${level}). Limited readiness - modernization required.`;
  
  return {
    score,
    level,
    factors,
    recommendations,
    justifications,
    mismatches,
    education,
    summary,
  };
}

