/**
 * Relationship Service
 * Detects and manages relationships between accounts, people, and tech opportunities
 */

/**
 * Detect relationships for an account
 * @param {Object} account - Account data
 * @param {Function} groqQuery - GROQ query function
 * @param {Object} client - Sanity client
 * @param {Object} options - Options for relationship detection
 * @returns {Promise<Object>} - Detected relationships
 */
export async function detectAccountRelationships(account, groqQuery, client, options = {}) {
  const {
    findCompetitors = true,
    findSimilarIndustry = true,
    findSimilarOpportunity = true,
    findSimilarTech = true,
    limit = 10,
  } = options;

  const relationships = {
    competitors: [],
    similarIndustry: [],
    similarOpportunity: [],
    similarTech: [],
    relatedPeople: [],
    techOpportunities: [],
  };

  try {
    // Get account data
    const accountKey = account.accountKey;
    const techStack = account.technologyStack || account.accountPack?.techStack || {};
    const opportunityScore = account.opportunityScore || 0;
    const industry = account.businessUnits?.industry || account.businessUnits?.companyName || null;
    const legacySystems = techStack.legacySystems || [];
    const modernFrameworks = techStack.modernFrameworks || [];
    const cmsSystems = techStack.cmsSystems || [];

    // Find competitors (same industry, similar scale)
    if (findCompetitors && industry) {
      relationships.competitors = await findCompetitorAccounts(
        groqQuery,
        client,
        account,
        { industry, limit }
      );
    }

    // Find similar industry companies
    if (findSimilarIndustry && industry) {
      relationships.similarIndustry = await findSimilarIndustryAccounts(
        groqQuery,
        client,
        account,
        { industry, limit }
      );
    }

    // Find similar opportunity score companies
    if (findSimilarOpportunity) {
      relationships.similarOpportunity = await findSimilarOpportunityAccounts(
        groqQuery,
        client,
        account,
        { opportunityScore, limit }
      );
    }

    // Find similar tech journey companies
    if (findSimilarTech && (legacySystems.length > 0 || modernFrameworks.length > 0)) {
      relationships.similarTech = await findSimilarTechAccounts(
        groqQuery,
        client,
        account,
        { legacySystems, modernFrameworks, cmsSystems, limit }
      );
    }

    // Find related people (LinkedIn profiles linked to this account)
    relationships.relatedPeople = await findRelatedPeople(
      groqQuery,
      client,
        account,
      { limit: limit * 2 }
    );

    // Extract tech opportunities from account data
    if (techStack.migrationOpportunities) {
      relationships.techOpportunities = extractTechOpportunities(techStack, account);
    }

  } catch (error) {
    console.error('Error detecting relationships:', error);
  }

  return relationships;
}

/**
 * Find competitor accounts
 */
async function findCompetitorAccounts(groqQuery, client, account, options) {
  try {
    const { industry, limit } = options;
    const accountKey = account.accountKey;
    
    // Query for accounts in same industry with similar characteristics
    const query = `*[_type == "account" && accountKey != $accountKey && defined(businessUnits.industry) && businessUnits.industry match $industry] | order(opportunityScore desc)[0...$limit] {
      _id,
      accountKey,
      companyName,
      canonicalUrl,
      opportunityScore,
      technologyStack,
      businessScale,
      _updatedAt,
    }`;
    
    const competitors = await groqQuery(client, query, {
      accountKey,
      industry: `*${industry}*`,
      limit: limit + 5, // Get extra to filter
    }) || [];

    // Score competitors by similarity
    return competitors
      .map(comp => ({
        accountKey: comp.accountKey,
        companyName: comp.companyName,
        canonicalUrl: comp.canonicalUrl,
        similarityScore: calculateCompetitorSimilarity(account, comp),
        relationshipType: 'competitor',
      }))
      .filter(c => c.similarityScore > 0.3)
      .sort((a, b) => b.similarityScore - a.similarityScore)
      .slice(0, limit);
    
  } catch (error) {
    console.error('Error finding competitors:', error);
    return [];
  }
}

/**
 * Find similar industry accounts
 */
async function findSimilarIndustryAccounts(groqQuery, client, account, options) {
  try {
    const { industry, limit } = options;
    const accountKey = account.accountKey;
    
    const query = `*[_type == "account" && accountKey != $accountKey && defined(businessUnits.industry) && businessUnits.industry match $industry] | order(_updatedAt desc)[0...$limit] {
      _id,
      accountKey,
      companyName,
      canonicalUrl,
      opportunityScore,
      technologyStack,
      _updatedAt,
    }`;
    
    const similar = await groqQuery(client, query, {
      accountKey,
      industry: `*${industry}*`,
      limit,
    }) || [];

    return similar.map(acc => ({
      accountKey: acc.accountKey,
      companyName: acc.companyName,
      canonicalUrl: acc.canonicalUrl,
      opportunityScore: acc.opportunityScore || 0,
      relationshipType: 'similar_industry',
    }));
    
  } catch (error) {
    console.error('Error finding similar industry:', error);
    return [];
  }
}

/**
 * Find similar opportunity score accounts
 */
async function findSimilarOpportunityAccounts(groqQuery, client, account, options) {
  try {
    const { opportunityScore, limit } = options;
    const accountKey = account.accountKey;
    
    // Find accounts within ±10 points of opportunity score
    const scoreRange = 10;
    const minScore = Math.max(0, opportunityScore - scoreRange);
    const maxScore = Math.min(100, opportunityScore + scoreRange);
    
    const query = `*[_type == "account" && accountKey != $accountKey && opportunityScore >= $minScore && opportunityScore <= $maxScore] | order(abs(opportunityScore - $opportunityScore) asc)[0...$limit] {
      _id,
      accountKey,
      companyName,
      canonicalUrl,
      opportunityScore,
      technologyStack,
      _updatedAt,
    }`;
    
    const similar = await groqQuery(client, query, {
      accountKey,
      opportunityScore,
      minScore,
      maxScore,
      limit,
    }) || [];

    return similar.map(acc => ({
      accountKey: acc.accountKey,
      companyName: acc.companyName,
      canonicalUrl: acc.canonicalUrl,
      opportunityScore: acc.opportunityScore || 0,
      relationshipType: 'similar_opportunity',
    }));
    
  } catch (error) {
    console.error('Error finding similar opportunity:', error);
    return [];
  }
}

/**
 * Find similar tech journey accounts
 */
async function findSimilarTechAccounts(groqQuery, client, account, options) {
  try {
    const { legacySystems, modernFrameworks, cmsSystems, limit } = options;
    const accountKey = account.accountKey;
    
    if (legacySystems.length === 0 && modernFrameworks.length === 0) {
      return [];
    }

    // Build conditions for tech stack matching
    const techConditions = [];
    if (legacySystems.length > 0) {
      legacySystems.forEach((sys, i) => {
        techConditions.push(`defined(technologyStack.legacySystems) && "${sys}" in technologyStack.legacySystems`);
      });
    }
    if (modernFrameworks.length > 0) {
      modernFrameworks.slice(0, 2).forEach((fw, i) => {
        techConditions.push(`defined(technologyStack.modernFrameworks) && "${fw}" in technologyStack.modernFrameworks`);
      });
    }
    if (cmsSystems.length > 0) {
      cmsSystems.forEach((cms, i) => {
        techConditions.push(`defined(technologyStack.cmsSystems) && "${cms}" in technologyStack.cmsSystems`);
      });
    }

    if (techConditions.length === 0) {
      return [];
    }

    // Use first tech condition for query (GROQ doesn't support complex OR easily)
    const techCondition = techConditions[0];
    
    const query = `*[_type == "account" && accountKey != $accountKey && ${techCondition}] | order(_updatedAt desc)[0...$limit] {
      _id,
      accountKey,
      companyName,
      canonicalUrl,
      opportunityScore,
      technologyStack,
      _updatedAt,
    }`;
    
    const similar = await groqQuery(client, query, {
      accountKey,
      limit: limit + 10, // Get extra to score and filter
    }) || [];

    // Score by tech similarity
    return similar
      .map(acc => ({
        accountKey: acc.accountKey,
        companyName: acc.companyName,
        canonicalUrl: acc.canonicalUrl,
        opportunityScore: acc.opportunityScore || 0,
        similarityScore: calculateTechSimilarity(
          { legacySystems, modernFrameworks, cmsSystems },
          acc.technologyStack || {}
        ),
        relationshipType: 'similar_tech',
      }))
      .filter(a => a.similarityScore > 0.3)
      .sort((a, b) => b.similarityScore - a.similarityScore)
      .slice(0, limit);
    
  } catch (error) {
    console.error('Error finding similar tech:', error);
    return [];
  }
}

/**
 * Find related people (LinkedIn profiles)
 */
async function findRelatedPeople(groqQuery, client, account, options) {
  try {
    const { limit } = options;
    const accountKey = account.accountKey;
    const companyName = account.companyName || account.businessUnits?.companyName;
    const domain = account.rootDomain || account.domain;
    
    if (!companyName && !domain) {
      return [];
    }

    // Find people with experience at this company
    let query = `*[_type == "person" && `;
    const conditions = [];
    
    if (companyName) {
      conditions.push(`(experience[].company match "*${companyName}*" || currentCompany match "*${companyName}*")`);
    }
    if (domain) {
      conditions.push(`(experience[].company match "*${domain}*" || currentCompany match "*${domain}*")`);
    }
    
    query += conditions.join(' || ') + `] | order(_updatedAt desc)[0...$limit] {
      _id,
      personKey,
      name,
      linkedInUrl,
      currentCompany,
      currentTitle,
      experience,
      _updatedAt,
    }`;
    
    const people = await groqQuery(client, query, { limit }) || [];

    return people.map(person => ({
      personKey: person.personKey,
      name: person.name,
      linkedInUrl: person.linkedInUrl,
      currentCompany: person.currentCompany,
      currentTitle: person.currentTitle,
      relationshipType: 'employee',
    }));
    
  } catch (error) {
    console.error('Error finding related people:', error);
    return [];
  }
}

/**
 * Extract tech opportunities from account data
 */
function extractTechOpportunities(techStack, account) {
  const opportunities = [];
  
  if (techStack.migrationOpportunities && Array.isArray(techStack.migrationOpportunities)) {
    techStack.migrationOpportunities.forEach(opp => {
      opportunities.push({
        type: opp.type || 'migration',
        priority: opp.priority || 'medium',
        reason: opp.reason || '',
        recommendation: opp.recommendation || '',
        roiImpact: opp.roiImpact || '',
        relationshipType: 'tech_opportunity',
      });
    });
  }

  if (techStack.roiInsights && Array.isArray(techStack.roiInsights)) {
    techStack.roiInsights.forEach(insight => {
      if (insight.impact === 'High') {
        opportunities.push({
          type: 'roi_insight',
          category: insight.category || 'Other',
          insight: insight.insight || '',
          estimatedSavings: insight.estimatedSavings || '',
          relationshipType: 'tech_opportunity',
        });
      }
    });
  }

  return opportunities;
}

/**
 * Calculate competitor similarity score
 */
function calculateCompetitorSimilarity(account1, account2) {
  let score = 0;
  let factors = 0;

  // Industry match
  const industry1 = account1.businessUnits?.industry || '';
  const industry2 = account2.businessUnits?.industry || '';
  if (industry1 && industry2 && industry1.toLowerCase() === industry2.toLowerCase()) {
    score += 0.4;
  }
  factors += 0.4;

  // Opportunity score similarity
  const score1 = account1.opportunityScore || 0;
  const score2 = account2.opportunityScore || 0;
  const scoreDiff = Math.abs(score1 - score2);
  score += (1 - scoreDiff / 100) * 0.3;
  factors += 0.3;

  // Tech stack overlap
  const tech1 = account1.technologyStack || {};
  const tech2 = account2.technologyStack || {};
  const legacy1 = tech1.legacySystems || [];
  const legacy2 = tech2.legacySystems || [];
  const commonLegacy = legacy1.filter(t => legacy2.includes(t)).length;
  if (legacy1.length > 0) {
    score += (commonLegacy / Math.max(legacy1.length, legacy2.length)) * 0.3;
  }
  factors += 0.3;

  return factors > 0 ? score / factors : 0;
}

/**
 * Calculate tech similarity score
 */
function calculateTechSimilarity(tech1, tech2) {
  let score = 0;
  let factors = 0;

  // Legacy systems overlap
  const legacy1 = tech1.legacySystems || [];
  const legacy2 = tech2.legacySystems || [];
  if (legacy1.length > 0 || legacy2.length > 0) {
    const common = legacy1.filter(t => legacy2.includes(t)).length;
    const total = new Set([...legacy1, ...legacy2]).size;
    score += (common / total) * 0.4;
    factors += 0.4;
  }

  // Modern frameworks overlap
  const modern1 = tech1.modernFrameworks || [];
  const modern2 = tech2.modernFrameworks || [];
  if (modern1.length > 0 || modern2.length > 0) {
    const common = modern1.filter(t => modern2.includes(t)).length;
    const total = new Set([...modern1, ...modern2]).size;
    score += (common / total) * 0.3;
    factors += 0.3;
  }

  // CMS systems overlap
  const cms1 = tech1.cmsSystems || [];
  const cms2 = tech2.cmsSystems || [];
  if (cms1.length > 0 || cms2.length > 0) {
    const common = cms1.filter(t => cms2.includes(t)).length;
    const total = new Set([...cms1, ...cms2]).size;
    score += (common / total) * 0.3;
    factors += 0.3;
  }

  return factors > 0 ? score / factors : 0;
}

/**
 * Store relationships for an account
 */
export async function storeAccountRelationships(
  groqQuery,
  upsertDocument,
  client,
  accountKey,
  relationships
) {
  try {
    // Store relationship document
    const relationshipDoc = {
      _type: 'relationship',
      _id: `relationship.account.${accountKey}`,
      sourceType: 'account',
      sourceKey: accountKey,
      relationships: {
        competitors: relationships.competitors || [],
        similarIndustry: relationships.similarIndustry || [],
        similarOpportunity: relationships.similarOpportunity || [],
        similarTech: relationships.similarTech || [],
        relatedPeople: relationships.relatedPeople || [],
        techOpportunities: relationships.techOpportunities || [],
      },
      detectedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await upsertDocument(client, relationshipDoc);
    // Sanity mutate does not return { success }; no throw = success

    // Update account with relationship summary
    await updateAccountWithRelationships(groqQuery, upsertDocument, client, accountKey, relationships);

    return { success: true };
    
  } catch (error) {
    console.error('Error storing relationships:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Update account document with relationship summary
 */
async function updateAccountWithRelationships(groqQuery, upsertDocument, client, accountKey, relationships) {
  try {
    // Get current account
    const query = `*[_type == "account" && accountKey == $accountKey][0]._id`;
    const accountIdResult = await groqQuery(client, query, { accountKey });
    const accountId = (typeof accountIdResult === 'string')
      ? accountIdResult
      : (Array.isArray(accountIdResult) && accountIdResult[0]) || `account.${accountKey}`;

    // Update with relationship counts and keys
    const update = {
      relationships: {
        competitorCount: relationships.competitors?.length || 0,
        similarIndustryCount: relationships.similarIndustry?.length || 0,
        similarOpportunityCount: relationships.similarOpportunity?.length || 0,
        similarTechCount: relationships.similarTech?.length || 0,
        relatedPeopleCount: relationships.relatedPeople?.length || 0,
        techOpportunityCount: relationships.techOpportunities?.length || 0,
        lastDetectedAt: new Date().toISOString(),
      },
      updatedAt: new Date().toISOString(),
    };

    await upsertDocument(client, {
      _type: 'account',
      _id: accountId,
      ...update,
    });

  } catch (error) {
    console.error('Error updating account with relationships:', error);
  }
}

