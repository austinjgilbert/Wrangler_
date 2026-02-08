/**
 * Learning Storage Service
 * Stores and retrieves user interaction patterns for learning
 */

/**
 * Store user interaction for learning
 * @param {Function} groqQuery - GROQ query function
 * @param {Function} upsertDocument - Upsert document function
 * @param {object} client - Sanity client
 * @param {object} interaction - Interaction data
 * @returns {Promise<{success: boolean, id: string}>}
 */
export async function storeInteraction(
  groqQuery,
  upsertDocument,
  client,
  interaction
) {
  const interactionId = `interaction-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  
  const interactionDoc = {
    _type: 'userInteraction',
    _id: interactionId,
    accountKey: interaction.accountKey || null,
    accountDomain: interaction.accountDomain || null,
    query: interaction.query || '',
    patterns: interaction.patterns || {},
    intent: interaction.patterns?.intent || 'unknown',
    action: interaction.action || null,
    nextAction: interaction.nextAction || null,
    outcome: interaction.outcome || null,
    feedback: interaction.feedback || null,
    responseTime: interaction.responseTime || null,
    timestamp: interaction.timestamp || new Date().toISOString(),
    userId: interaction.userId || 'anonymous',
    sessionId: interaction.sessionId || null,
    metadata: interaction.metadata || {},
  };
  
  await upsertDocument(client, interactionDoc);
  
  return {
    success: true,
    id: interactionId,
  };
}

/**
 * Get user interaction history
 * @param {Function} groqQuery - GROQ query function
 * @param {object} client - Sanity client
 * @param {object} filters - Filters (accountKey, userId, limit, etc.)
 * @returns {Promise<Array<object>>}
 */
export async function getInteractionHistory(
  groqQuery,
  client,
  filters = {}
) {
  let query = '*[_type == "userInteraction"';
  
  if (filters.accountKey) {
    query += ` && accountKey == $accountKey`;
  }
  
  if (filters.userId) {
    query += ` && userId == $userId`;
  }
  
  if (filters.intent) {
    query += ` && intent == $intent`;
  }
  
  if (filters.startDate) {
    query += ` && timestamp >= $startDate`;
  }
  
  query += ']';
  
  // Order by timestamp descending
  query += ' | order(timestamp desc)';
  
  // Limit
  const limit = filters.limit || 100;
  query += `[0...${limit}]`;
  
  const params = {};
  if (filters.accountKey) params.accountKey = filters.accountKey;
  if (filters.userId) params.userId = filters.userId;
  if (filters.intent) params.intent = filters.intent;
  if (filters.startDate) params.startDate = filters.startDate;
  
  const interactions = await groqQuery(client, query, params);
  return interactions || [];
}

/**
 * Get pattern knowledge base for account
 * @param {Function} groqQuery - GROQ query function
 * @param {object} client - Sanity client
 * @param {string} accountKey - Account key
 * @returns {Promise<object>}
 */
export async function getAccountPatternKnowledge(
  groqQuery,
  client,
  accountKey
) {
  // Get all interactions for this account
  const interactions = await getInteractionHistory(groqQuery, client, {
    accountKey,
    limit: 1000,
  });
  
  // Build knowledge base from interactions
  const knowledgeBase = {
    totalInteractions: interactions.length,
    intents: {},
    actions: {},
    sequences: {},
    outcomes: {
      success: 0,
      failure: 0,
      unknown: 0,
    },
    averageResponseTime: null,
    lastInteraction: interactions[0]?.timestamp || null,
  };
  
  let totalResponseTime = 0;
  let responseTimeCount = 0;
  
  for (const interaction of interactions) {
    // Count intents
    if (interaction.intent) {
      knowledgeBase.intents[interaction.intent] = 
        (knowledgeBase.intents[interaction.intent] || 0) + 1;
    }
    
    // Count actions
    if (interaction.action) {
      knowledgeBase.actions[interaction.action] = 
        (knowledgeBase.actions[interaction.action] || 0) + 1;
    }
    
    // Track sequences
    if (interaction.action && interaction.nextAction) {
      const sequence = `${interaction.action} -> ${interaction.nextAction}`;
      knowledgeBase.sequences[sequence] = 
        (knowledgeBase.sequences[sequence] || 0) + 1;
    }
    
    // Count outcomes
    if (interaction.outcome) {
      knowledgeBase.outcomes[interaction.outcome] = 
        (knowledgeBase.outcomes[interaction.outcome] || 0) + 1;
    }
    
    // Track response time
    if (interaction.responseTime) {
      totalResponseTime += interaction.responseTime;
      responseTimeCount++;
    }
  }
  
  if (responseTimeCount > 0) {
    knowledgeBase.averageResponseTime = totalResponseTime / responseTimeCount;
  }
  
  return knowledgeBase;
}

/**
 * Store learning feedback
 * @param {Function} upsertDocument - Upsert document function
 * @param {object} client - Sanity client
 * @param {object} feedback - Feedback data
 * @returns {Promise<{success: boolean, id: string}>}
 */
export async function storeFeedback(
  upsertDocument,
  client,
  feedback
) {
  const feedbackId = `feedback-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  
  const feedbackDoc = {
    _type: 'learningFeedback',
    _id: feedbackId,
    interactionId: feedback.interactionId || null,
    accountKey: feedback.accountKey || null,
    positive: feedback.positive || false,
    outcome: feedback.outcome || null,
    suggestion: feedback.suggestion || null,
    userComment: feedback.userComment || null,
    timestamp: new Date().toISOString(),
    metadata: feedback.metadata || {},
  };
  
  await upsertDocument(client, feedbackDoc);
  
  return {
    success: true,
    id: feedbackId,
  };
}

/**
 * Get aggregated learning insights
 * @param {Function} groqQuery - GROQ query function
 * @param {object} client - Sanity client
 * @param {object} filters - Filters
 * @returns {Promise<object>}
 */
export async function getLearningInsights(
  groqQuery,
  client,
  filters = {}
) {
  // Get all interactions
  const interactions = await getInteractionHistory(groqQuery, client, {
    ...filters,
    limit: 10000,
  });
  
  const insights = {
    totalInteractions: interactions.length,
    uniqueAccounts: new Set(),
    uniqueUsers: new Set(),
    intentDistribution: {},
    actionDistribution: {},
    successRate: 0,
    averageResponseTime: 0,
    topPatterns: [],
    improvementTrend: [],
  };
  
  let successCount = 0;
  let totalResponseTime = 0;
  let responseTimeCount = 0;
  
  // Group by date for trend analysis
  const byDate = {};
  
  for (const interaction of interactions) {
    // Track unique accounts and users
    if (interaction.accountKey) {
      insights.uniqueAccounts.add(interaction.accountKey);
    }
    if (interaction.userId) {
      insights.uniqueUsers.add(interaction.userId);
    }
    
    // Track intents
    if (interaction.intent) {
      insights.intentDistribution[interaction.intent] = 
        (insights.intentDistribution[interaction.intent] || 0) + 1;
    }
    
    // Track actions
    if (interaction.action) {
      insights.actionDistribution[interaction.action] = 
        (insights.actionDistribution[interaction.action] || 0) + 1;
    }
    
    // Track outcomes
    if (interaction.outcome === 'success') {
      successCount++;
    }
    
    // Track response time
    if (interaction.responseTime) {
      totalResponseTime += interaction.responseTime;
      responseTimeCount++;
    }
    
    // Group by date
    if (interaction.timestamp) {
      const date = interaction.timestamp.split('T')[0];
      if (!byDate[date]) {
        byDate[date] = { count: 0, success: 0 };
      }
      byDate[date].count++;
      if (interaction.outcome === 'success') {
        byDate[date].success++;
      }
    }
  }
  
  // Calculate success rate
  if (interactions.length > 0) {
    insights.successRate = successCount / interactions.length;
  }
  
  // Calculate average response time
  if (responseTimeCount > 0) {
    insights.averageResponseTime = totalResponseTime / responseTimeCount;
  }
  
  // Convert sets to counts
  insights.uniqueAccounts = insights.uniqueAccounts.size;
  insights.uniqueUsers = insights.uniqueUsers.size;
  
  // Build improvement trend (last 30 days)
  const dates = Object.keys(byDate).sort().slice(-30);
  insights.improvementTrend = dates.map(date => ({
    date,
    interactions: byDate[date].count,
    successRate: byDate[date].count > 0 ? byDate[date].success / byDate[date].count : 0,
  }));
  
  // Get top patterns
  const topIntents = Object.entries(insights.intentDistribution)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([intent, count]) => ({ intent, count }));
  
  insights.topPatterns = topIntents;
  
  return insights;
}

