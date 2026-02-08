/**
 * Learning & Pattern Matching Service
 * 
 * This service learns from user interactions to:
 * 1. Identify patterns in account research
 * 2. Anticipate user needs
 * 3. Suggest next actions
 * 4. Improve speed and accuracy over time
 * 
 * Key Features:
 * - Pattern extraction from user queries
 * - Account research pattern matching
 * - Suggestion generation
 * - Self-improvement through feedback loops
 */

/**
 * Extract patterns from user query
 * @param {string} query - User query text
 * @param {object} context - Context (account, previous actions, etc.)
 * @returns {object} - Extracted patterns
 */
export function extractQueryPatterns(query, context = {}) {
  if (!query || typeof query !== 'string') {
    return { patterns: [], intent: 'unknown', entities: [] };
  }
  
  const lowerQuery = query.toLowerCase();
  const patterns = [];
  const entities = [];
  let intent = 'unknown';
  
  // Intent Detection
  const intentPatterns = {
    'scan': ['scan', 'analyze', 'check', 'examine', 'review', 'look at'],
    'research': ['research', 'investigate', 'find out', 'discover', 'learn about'],
    'compare': ['compare', 'versus', 'vs', 'difference', 'similar'],
    'find': ['find', 'search', 'locate', 'get', 'show me'],
    'analyze': ['analyze', 'break down', 'evaluate', 'assess'],
    'suggest': ['suggest', 'recommend', 'what should', 'what can', 'help me'],
    'anticipate': ['what else', 'what about', 'next', 'also', 'additionally'],
  };
  
  for (const [intentType, keywords] of Object.entries(intentPatterns)) {
    if (keywords.some(keyword => lowerQuery.includes(keyword))) {
      intent = intentType;
      patterns.push({ type: 'intent', value: intentType, confidence: 0.8 });
      break;
    }
  }
  
  // Entity Extraction
  // Company names (capitalized words, common patterns)
  const companyPatterns = [
    /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\b/g, // Capitalized words
    /\b([A-Z]{2,})\b/g, // Acronyms
  ];
  
  for (const pattern of companyPatterns) {
    const matches = query.match(pattern);
    if (matches) {
      entities.push(...matches.map(m => ({ type: 'company', value: m })));
    }
  }
  
  // Technology mentions
  const techKeywords = [
    'cms', 'headless', 'contentful', 'sanity', 'wordpress', 'drupal',
    'react', 'vue', 'angular', 'next.js', 'nuxt', 'svelte',
    'shopify', 'magento', 'woocommerce', 'bigcommerce',
    'adobe', 'sitecore', 'drupal', 'aem',
  ];
  
  for (const tech of techKeywords) {
    if (lowerQuery.includes(tech)) {
      entities.push({ type: 'technology', value: tech });
      patterns.push({ type: 'technology_mention', value: tech, confidence: 0.9 });
    }
  }
  
  // Account context patterns
  if (context.account) {
    patterns.push({ 
      type: 'account_context', 
      value: context.account.domain || context.account.canonicalUrl,
      confidence: 1.0 
    });
  }
  
  // Question patterns
  const questionWords = ['what', 'how', 'why', 'when', 'where', 'who', 'which'];
  if (questionWords.some(word => lowerQuery.startsWith(word))) {
    patterns.push({ type: 'question', value: 'question', confidence: 0.7 });
  }
  
  // Action patterns
  const actionWords = ['scan', 'get', 'find', 'show', 'list', 'compare', 'analyze'];
  for (const action of actionWords) {
    if (lowerQuery.includes(action)) {
      patterns.push({ type: 'action', value: action, confidence: 0.8 });
    }
  }
  
  return {
    patterns,
    intent,
    entities,
    queryLength: query.length,
    wordCount: query.split(/\s+/).length,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Match patterns against historical interactions
 * @param {object} currentPatterns - Current query patterns
 * @param {Array<object>} history - Historical interactions
 * @returns {Array<object>} - Matched patterns with scores
 */
export function matchHistoricalPatterns(currentPatterns, history = []) {
  if (!history || history.length === 0) {
    return [];
  }
  
  const matches = [];
  
  for (const interaction of history) {
    if (!interaction.patterns) continue;
    
    let score = 0;
    const matchedPatterns = [];
    
    // Match intent
    if (interaction.patterns.intent === currentPatterns.intent) {
      score += 0.3;
      matchedPatterns.push('intent');
    }
    
    // Match entities
    const currentEntities = currentPatterns.entities.map(e => e.value.toLowerCase());
    const historicalEntities = (interaction.patterns.entities || []).map(e => e.value.toLowerCase());
    const entityMatches = currentEntities.filter(e => historicalEntities.includes(e));
    if (entityMatches.length > 0) {
      score += 0.2 * entityMatches.length;
      matchedPatterns.push('entities');
    }
    
    // Match account context
    if (interaction.patterns.accountContext && currentPatterns.patterns.some(p => p.type === 'account_context')) {
      score += 0.2;
      matchedPatterns.push('account_context');
    }
    
    // Match technology mentions
    const currentTechs = currentPatterns.patterns
      .filter(p => p.type === 'technology_mention')
      .map(p => p.value.toLowerCase());
    const historicalTechs = (interaction.patterns.patterns || [])
      .filter(p => p.type === 'technology_mention')
      .map(p => p.value.toLowerCase());
    const techMatches = currentTechs.filter(t => historicalTechs.includes(t));
    if (techMatches.length > 0) {
      score += 0.15 * techMatches.length;
      matchedPatterns.push('technology');
    }
    
    // Time decay (more recent = higher score)
    if (interaction.timestamp) {
      const daysAgo = (Date.now() - new Date(interaction.timestamp).getTime()) / (1000 * 60 * 60 * 24);
      const timeDecay = Math.max(0, 1 - (daysAgo / 30)); // Decay over 30 days
      score *= (0.7 + 0.3 * timeDecay);
    }
    
    if (score > 0.1) {
      matches.push({
        interaction,
        score,
        matchedPatterns,
        nextAction: interaction.nextAction,
        outcome: interaction.outcome,
      });
    }
  }
  
  // Sort by score descending
  return matches.sort((a, b) => b.score - a.score);
}

/**
 * Generate suggestions based on patterns and history
 * @param {object} currentPatterns - Current query patterns
 * @param {Array<object>} matchedHistory - Matched historical patterns
 * @param {object} accountContext - Current account context
 * @returns {Array<object>} - Suggestions with confidence scores
 */
export function generateSuggestions(currentPatterns, matchedHistory = [], accountContext = {}) {
  const suggestions = [];
  
  // Suggestion 1: Next likely action based on history
  if (matchedHistory.length > 0) {
    const topMatch = matchedHistory[0];
    if (topMatch.nextAction) {
      suggestions.push({
        type: 'next_action',
        action: topMatch.nextAction,
        confidence: Math.min(0.9, topMatch.score),
        reason: `Based on ${matchedHistory.length} similar interaction${matchedHistory.length > 1 ? 's' : ''}`,
        source: 'pattern_match',
      });
    }
  }
  
  // Suggestion 2: Account-specific recommendations
  if (accountContext.account) {
    const account = accountContext.account;
    
    // If account has tech stack, suggest related research
    if (account.technologyStack) {
      const techs = [
        ...(account.technologyStack.cms || []),
        ...(account.technologyStack.frameworks || []),
        ...(account.technologyStack.legacySystems || []),
      ];
      
      if (techs.length > 0) {
        suggestions.push({
          type: 'research_suggestion',
          action: `Research migration opportunities for ${techs[0]}`,
          confidence: 0.7,
          reason: `Account uses ${techs[0]}`,
          source: 'account_context',
        });
      }
    }
    
    // If account has low AI readiness, suggest improvement
    if (account.aiReadiness && account.aiReadiness.score < 50) {
      suggestions.push({
        type: 'improvement_suggestion',
        action: 'Analyze AI readiness improvement opportunities',
        confidence: 0.75,
        reason: `AI readiness score is ${account.aiReadiness.score}`,
        source: 'account_context',
      });
    }
  }
  
  // Suggestion 3: Intent-based suggestions
  if (currentPatterns.intent === 'scan') {
    suggestions.push({
      type: 'follow_up',
      action: 'Generate research brief',
      confidence: 0.6,
      reason: 'Common follow-up after scanning',
      source: 'intent_pattern',
    });
  }
  
  if (currentPatterns.intent === 'research') {
    suggestions.push({
      type: 'follow_up',
      action: 'Find similar accounts',
      confidence: 0.65,
      reason: 'Users often compare after research',
      source: 'intent_pattern',
    });
  }
  
  // Suggestion 4: Pattern-based (if user asked about technology)
  const techMentions = currentPatterns.patterns.filter(p => p.type === 'technology_mention');
  if (techMentions.length > 0) {
    suggestions.push({
      type: 'deep_dive',
      action: `Analyze ${techMentions[0].value} implementation details`,
      confidence: 0.7,
      reason: `User mentioned ${techMentions[0].value}`,
      source: 'entity_pattern',
    });
  }
  
  // Sort by confidence
  return suggestions.sort((a, b) => b.confidence - a.confidence).slice(0, 5);
}

/**
 * Anticipate user needs based on account and patterns
 * @param {object} account - Account data
 * @param {Array<object>} userHistory - User's interaction history
 * @param {object} currentContext - Current context
 * @returns {object} - Anticipated needs and suggestions
 */
export function anticipateUserNeeds(account, userHistory = [], currentContext = {}) {
  const anticipations = {
    likelyNextActions: [],
    researchPriorities: [],
    insights: [],
    recommendations: [],
  };
  
  if (!account) {
    return anticipations;
  }
  
  // Analyze account state
  const hasTechStack = account.technologyStack && Object.keys(account.technologyStack).length > 0;
  const hasLowScore = account.opportunityScore && account.opportunityScore < 50;
  const hasLegacy = account.technologyStack?.legacySystems?.length > 0;
  const hasMultipleSystems = (account.technologyStack?.cms?.length || 0) + 
                            (account.technologyStack?.pimSystems?.length || 0) +
                            (account.technologyStack?.damSystems?.length || 0) > 1;
  
  // Anticipate based on account state
  if (hasLegacy) {
    anticipations.likelyNextActions.push({
      action: 'Analyze migration opportunities',
      confidence: 0.85,
      reason: 'Legacy systems detected',
    });
  }
  
  if (hasMultipleSystems) {
    anticipations.likelyNextActions.push({
      action: 'Identify system consolidation opportunities',
      confidence: 0.8,
      reason: 'Multiple overlapping systems detected',
    });
  }
  
  if (hasLowScore) {
    anticipations.researchPriorities.push({
      priority: 'High',
      focus: 'Opportunity scoring and ROI analysis',
      reason: 'Low opportunity score indicates high potential',
    });
  }
  
  // Anticipate based on user history
  if (userHistory.length > 0) {
    const recentActions = userHistory.slice(-5).map(h => h.action);
    const actionFrequency = {};
    recentActions.forEach(action => {
      actionFrequency[action] = (actionFrequency[action] || 0) + 1;
    });
    
    const mostCommonAction = Object.entries(actionFrequency)
      .sort((a, b) => b[1] - a[1])[0];
    
    if (mostCommonAction && mostCommonAction[1] >= 2) {
      anticipations.likelyNextActions.push({
        action: mostCommonAction[0],
        confidence: 0.7,
        reason: `You've done this ${mostCommonAction[1]} times recently`,
      });
    }
  }
  
  // Generate insights
  if (account.technologyStack) {
    const insights = [];
    
    if (account.technologyStack.opportunityScore > 70) {
      insights.push({
        type: 'opportunity',
        message: 'High opportunity score - strong candidate for engagement',
        confidence: 0.9,
      });
    }
    
    if (hasLegacy && hasMultipleSystems) {
      insights.push({
        type: 'consolidation',
        message: 'Multiple legacy systems suggest consolidation opportunity',
        confidence: 0.85,
      });
    }
    
    anticipations.insights = insights;
  }
  
  return anticipations;
}

/**
 * Learn from user feedback
 * @param {object} interaction - User interaction
 * @param {object} feedback - User feedback (positive/negative, outcome)
 * @returns {object} - Updated learning data
 */
export function learnFromFeedback(interaction, feedback) {
  const learning = {
    pattern: interaction.patterns,
    action: interaction.action,
    feedback: feedback.positive ? 1 : -1,
    outcome: feedback.outcome || 'unknown',
    timestamp: new Date().toISOString(),
    confidence: feedback.positive ? 1.0 : 0.0,
  };
  
  // Adjust pattern confidence based on feedback
  if (interaction.patterns) {
    learning.pattern.adjustedConfidence = feedback.positive 
      ? Math.min(1.0, (interaction.patterns.confidence || 0.5) + 0.1)
      : Math.max(0.0, (interaction.patterns.confidence || 0.5) - 0.1);
  }
  
  return learning;
}

/**
 * Build pattern knowledge base
 * @param {Array<object>} interactions - All interactions
 * @returns {object} - Pattern knowledge base
 */
export function buildPatternKnowledgeBase(interactions = []) {
  const knowledgeBase = {
    intentPatterns: {},
    entityPatterns: {},
    actionSequences: {},
    accountPatterns: {},
    successPatterns: [],
    failurePatterns: [],
  };
  
  for (const interaction of interactions) {
    if (!interaction.patterns) continue;
    
    // Track intent patterns
    const intent = interaction.patterns.intent;
    if (intent) {
      knowledgeBase.intentPatterns[intent] = (knowledgeBase.intentPatterns[intent] || 0) + 1;
    }
    
    // Track entity patterns
    for (const entity of (interaction.patterns.entities || [])) {
      const key = `${entity.type}:${entity.value}`;
      knowledgeBase.entityPatterns[key] = (knowledgeBase.entityPatterns[key] || 0) + 1;
    }
    
    // Track action sequences
    if (interaction.action && interaction.nextAction) {
      const sequence = `${interaction.action} -> ${interaction.nextAction}`;
      knowledgeBase.actionSequences[sequence] = (knowledgeBase.actionSequences[sequence] || 0) + 1;
    }
    
    // Track account patterns
    if (interaction.accountKey) {
      knowledgeBase.accountPatterns[interaction.accountKey] = 
        (knowledgeBase.accountPatterns[interaction.accountKey] || 0) + 1;
    }
    
    // Track success/failure
    if (interaction.outcome === 'success') {
      knowledgeBase.successPatterns.push(interaction.patterns);
    } else if (interaction.outcome === 'failure') {
      knowledgeBase.failurePatterns.push(interaction.patterns);
    }
  }
  
  return knowledgeBase;
}

/**
 * Get smart suggestions based on knowledge base
 * @param {object} knowledgeBase - Pattern knowledge base
 * @param {object} currentPatterns - Current query patterns
 * @returns {Array<object>} - Smart suggestions
 */
export function getSmartSuggestions(knowledgeBase, currentPatterns) {
  const suggestions = [];
  
  // Suggest based on successful patterns
  const similarSuccessPatterns = knowledgeBase.successPatterns.filter(pattern => {
    return pattern.intent === currentPatterns.intent;
  });
  
  if (similarSuccessPatterns.length > 0) {
    suggestions.push({
      type: 'proven_pattern',
      action: 'Follow successful pattern from history',
      confidence: 0.8,
      reason: `${similarSuccessPatterns.length} similar successful interactions`,
      source: 'knowledge_base',
    });
  }
  
  // Suggest based on action sequences
  const topSequences = Object.entries(knowledgeBase.actionSequences)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);
  
  for (const [sequence, count] of topSequences) {
    const [currentAction, nextAction] = sequence.split(' -> ');
    if (currentPatterns.patterns.some(p => p.value === currentAction)) {
      suggestions.push({
        type: 'sequence',
        action: nextAction,
        confidence: Math.min(0.9, count / 10),
        reason: `Common sequence: ${sequence} (${count} times)`,
        source: 'knowledge_base',
      });
    }
  }
  
  return suggestions;
}

