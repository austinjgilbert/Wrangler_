/**
 * User Pattern Metadata Service
 * Tracks and learns from user behavior patterns across all users
 * Provides insights into what approaches work for different users
 */

/**
 * Store user pattern metadata
 * Tracks how users think, what approaches they use, what works
 */
export async function storeUserPattern(
  groqQuery,
  upsertDocument,
  client,
  patternData
) {
  const {
    userId,
    userSegment, // e.g., 'sdr', 'ae', 'manager', 'analyst'
    action,
    approach, // How they approached the task
    context, // What they were working on
    outcome, // success, partial, failure
    timeSpent,
    toolsUsed, // Which endpoints/tools they used
    sequence, // Action sequence they followed
    thinking, // Inferred thinking pattern
    metadata = {},
  } = patternData;

  const patternId = `userPattern-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

  const patternDoc = {
    _type: 'userPattern',
    _id: patternId,
    userId: userId || 'anonymous',
    userSegment: userSegment || 'unknown',
    timestamp: new Date().toISOString(),
    action: action,
    approach: approach,
    context: {
      accountKey: context?.accountKey || null,
      accountDomain: context?.accountDomain || null,
      intent: context?.intent || null,
      persona: context?.persona || null,
    },
    outcome: outcome,
    timeSpent: timeSpent || null,
    toolsUsed: toolsUsed || [],
    sequence: sequence || [],
    thinking: thinking || null,
    metadata: {
      ...metadata,
      requestId: metadata.requestId || null,
      sessionId: metadata.sessionId || null,
    },
  };

  await upsertDocument(client, patternDoc);

  return {
    success: true,
    id: patternId,
  };
}

/**
 * Get patterns from other users
 * Returns anonymized patterns showing what approaches work
 */
export async function getOtherUserPatterns(
  groqQuery,
  client,
  filters = {}
) {
  const {
    action = null,
    userSegment = null,
    outcome = 'success', // Filter by successful patterns
    limit = 10,
    minConfidence = 0.7, // Minimum confidence in pattern
  } = filters;

  let query = `*[_type == "userPattern"`;
  
  if (action) {
    query += ` && action == $action`;
  }
  
  if (userSegment) {
    query += ` && userSegment == $userSegment`;
  }
  
  if (outcome) {
    query += ` && outcome == $outcome`;
  }
  
  query += `] | order(timestamp desc)`;
  
  if (limit) {
    query += `[0...${limit}]`;
  }

  const patterns = await groqQuery(client, query, {
    action,
    userSegment,
    outcome,
  });

  // Anonymize and aggregate patterns
  return anonymizeAndAggregatePatterns(patterns, minConfidence);
}

/**
 * Get thinking patterns from other users
 * Shows how other users approach similar problems
 */
export async function getThinkingPatterns(
  groqQuery,
  client,
  context = {}
) {
  const {
    action,
    accountKey,
    intent,
    limit = 5,
  } = context;

  let query = `*[_type == "userPattern"`;
  
  if (action) {
    query += ` && action == $action`;
  }
  
  if (intent) {
    query += ` && context.intent == $intent`;
  }
  
  query += ` && thinking != null] | order(timestamp desc)`;
  
  if (limit) {
    query += `[0...${limit}]`;
  }

  const patterns = await groqQuery(client, query, {
    action,
    intent,
  });

  // Extract and anonymize thinking patterns
  return extractThinkingPatterns(patterns);
}

/**
 * Get successful approaches for similar contexts
 */
export async function getSuccessfulApproaches(
  groqQuery,
  client,
  context = {}
) {
  const {
    action,
    userSegment,
    accountKey,
    limit = 10,
  } = context;

  let query = `*[_type == "userPattern"`;
  
  query += ` && outcome == "success"`;
  
  if (action) {
    query += ` && action == $action`;
  }
  
  if (userSegment) {
    query += ` && userSegment == $userSegment`;
  }
  
  query += `] | order(timestamp desc)`;
  
  if (limit) {
    query += `[0...${limit}]`;
  }

  const patterns = await groqQuery(client, query, {
    action,
    userSegment,
  });

  // Aggregate successful approaches
  return aggregateSuccessfulApproaches(patterns);
}

/**
 * Get tool usage patterns
 * Shows which tools/endpoints other users use for similar tasks
 */
export async function getToolUsagePatterns(
  groqQuery,
  client,
  context = {}
) {
  const {
    action,
    intent,
    limit = 10,
  } = context;

  let query = `*[_type == "userPattern"`;
  
  if (action) {
    query += ` && action == $action`;
  }
  
  if (intent) {
    query += ` && context.intent == $intent`;
  }
  
  query += ` && toolsUsed != null && count(toolsUsed) > 0] | order(timestamp desc)`;
  
  if (limit) {
    query += `[0...${limit}]`;
  }

  const patterns = await groqQuery(client, query, {
    action,
    intent,
  });

  // Aggregate tool usage
  return aggregateToolUsage(patterns);
}

/**
 * Get sequence patterns
 * Shows common action sequences that work
 */
export async function getSequencePatterns(
  groqQuery,
  client,
  context = {}
) {
  const {
    startingAction,
    userSegment,
    outcome = 'success',
    limit = 10,
  } = context;

  let query = `*[_type == "userPattern"`;
  
  if (startingAction) {
    query += ` && sequence[0] == $startingAction`;
  }
  
  if (userSegment) {
    query += ` && userSegment == $userSegment`;
  }
  
  if (outcome) {
    query += ` && outcome == $outcome`;
  }
  
  query += ` && sequence != null && count(sequence) > 1] | order(timestamp desc)`;
  
  if (limit) {
    query += `[0...${limit}]`;
  }

  const patterns = await groqQuery(client, query, {
    startingAction,
    userSegment,
    outcome,
  });

  // Extract common sequences
  return extractCommonSequences(patterns);
}

/**
 * Anonymize and aggregate patterns
 */
function anonymizeAndAggregatePatterns(patterns, minConfidence) {
  const aggregated = {
    totalPatterns: patterns.length,
    approaches: {},
    outcomes: {},
    timeSpent: {
      avg: 0,
      min: Infinity,
      max: 0,
    },
    toolsUsed: {},
    sequences: [],
  };

  let totalTime = 0;
  let timeCount = 0;

  for (const pattern of patterns) {
    // Aggregate approaches
    const approach = pattern.approach || 'unknown';
    aggregated.approaches[approach] = (aggregated.approaches[approach] || 0) + 1;

    // Aggregate outcomes
    const outcome = pattern.outcome || 'unknown';
    aggregated.outcomes[outcome] = (aggregated.outcomes[outcome] || 0) + 1;

    // Aggregate time spent
    if (pattern.timeSpent) {
      totalTime += pattern.timeSpent;
      timeCount++;
      aggregated.timeSpent.min = Math.min(aggregated.timeSpent.min, pattern.timeSpent);
      aggregated.timeSpent.max = Math.max(aggregated.timeSpent.max, pattern.timeSpent);
    }

    // Aggregate tools used
    if (pattern.toolsUsed && Array.isArray(pattern.toolsUsed)) {
      for (const tool of pattern.toolsUsed) {
        aggregated.toolsUsed[tool] = (aggregated.toolsUsed[tool] || 0) + 1;
      }
    }

    // Collect sequences
    if (pattern.sequence && Array.isArray(pattern.sequence) && pattern.sequence.length > 0) {
      aggregated.sequences.push({
        sequence: pattern.sequence,
        outcome: pattern.outcome,
        timeSpent: pattern.timeSpent,
      });
    }
  }

  if (timeCount > 0) {
    aggregated.timeSpent.avg = Math.round(totalTime / timeCount);
  }

  // Calculate confidence scores
  aggregated.confidence = calculateConfidence(aggregated);

  // Filter by minimum confidence
  if (aggregated.confidence < minConfidence) {
    return null;
  }

  return aggregated;
}

/**
 * Extract thinking patterns
 */
function extractThinkingPatterns(patterns) {
  const thinking = {
    patterns: [],
    commonThemes: {},
    approaches: {},
  };

  for (const pattern of patterns) {
    if (pattern.thinking) {
      thinking.patterns.push({
        thinking: pattern.thinking,
        approach: pattern.approach,
        outcome: pattern.outcome,
        context: {
          action: pattern.action,
          intent: pattern.context?.intent,
        },
      });
    }
  }

  // Extract common themes (simplified - would use NLP in production)
  const themes = extractThemes(thinking.patterns);
  thinking.commonThemes = themes;

  return thinking;
}

/**
 * Aggregate successful approaches
 */
function aggregateSuccessfulApproaches(patterns) {
  const approaches = {};

  for (const pattern of patterns) {
    const key = `${pattern.action}:${pattern.approach}`;
    if (!approaches[key]) {
      approaches[key] = {
        action: pattern.action,
        approach: pattern.approach,
        count: 0,
        avgTimeSpent: 0,
        contexts: [],
        toolsUsed: [],
      };
    }

    approaches[key].count++;
    
    if (pattern.timeSpent) {
      approaches[key].avgTimeSpent = 
        (approaches[key].avgTimeSpent * (approaches[key].count - 1) + pattern.timeSpent) / 
        approaches[key].count;
    }

    if (pattern.context) {
      approaches[key].contexts.push(pattern.context);
    }

    if (pattern.toolsUsed) {
      approaches[key].toolsUsed.push(...pattern.toolsUsed);
    }
  }

  // Sort by count (most common first)
  return Object.values(approaches)
    .sort((a, b) => b.count - a.count)
    .map(approach => ({
      ...approach,
      avgTimeSpent: Math.round(approach.avgTimeSpent),
      toolsUsed: [...new Set(approach.toolsUsed)],
    }));
}

/**
 * Aggregate tool usage
 */
function aggregateToolUsage(patterns) {
  const toolUsage = {};

  for (const pattern of patterns) {
    if (pattern.toolsUsed && Array.isArray(pattern.toolsUsed)) {
      for (const tool of pattern.toolsUsed) {
        if (!toolUsage[tool]) {
          toolUsage[tool] = {
            tool,
            count: 0,
            successRate: 0,
            contexts: [],
          };
        }

        toolUsage[tool].count++;
        
        if (pattern.outcome === 'success') {
          toolUsage[tool].successRate = 
            (toolUsage[tool].successRate * (toolUsage[tool].count - 1) + 1) / 
            toolUsage[tool].count;
        } else {
          toolUsage[tool].successRate = 
            (toolUsage[tool].successRate * (toolUsage[tool].count - 1)) / 
            toolUsage[tool].count;
        }

        if (pattern.context) {
          toolUsage[tool].contexts.push(pattern.context);
        }
      }
    }
  }

  return Object.values(toolUsage)
    .sort((a, b) => b.count - a.count)
    .map(usage => ({
      ...usage,
      successRate: Math.round(usage.successRate * 100) / 100,
    }));
}

/**
 * Extract common sequences
 */
function extractCommonSequences(patterns) {
  const sequences = {};

  for (const pattern of patterns) {
    if (pattern.sequence && Array.isArray(pattern.sequence) && pattern.sequence.length > 1) {
      const seqKey = pattern.sequence.join(' -> ');
      
      if (!sequences[seqKey]) {
        sequences[seqKey] = {
          sequence: pattern.sequence,
          count: 0,
          successCount: 0,
          avgTimeSpent: 0,
        };
      }

      sequences[seqKey].count++;
      
      if (pattern.outcome === 'success') {
        sequences[seqKey].successCount++;
      }

      if (pattern.timeSpent) {
        sequences[seqKey].avgTimeSpent = 
          (sequences[seqKey].avgTimeSpent * (sequences[seqKey].count - 1) + pattern.timeSpent) / 
          sequences[seqKey].count;
      }
    }
  }

  return Object.values(sequences)
    .sort((a, b) => b.count - a.count)
    .map(seq => ({
      ...seq,
      successRate: Math.round((seq.successCount / seq.count) * 100) / 100,
      avgTimeSpent: Math.round(seq.avgTimeSpent),
    }));
}

/**
 * Calculate confidence score
 */
function calculateConfidence(aggregated) {
  // Confidence based on sample size and consistency
  const sampleSize = aggregated.totalPatterns;
  const successRate = aggregated.outcomes.success 
    ? aggregated.outcomes.success / sampleSize 
    : 0;

  // More samples = higher confidence
  const sizeConfidence = Math.min(sampleSize / 10, 1);
  
  // Higher success rate = higher confidence
  const successConfidence = successRate;

  return (sizeConfidence * 0.6 + successConfidence * 0.4);
}

/**
 * Extract themes from thinking patterns
 */
function extractThemes(patterns) {
  // Simplified theme extraction
  // In production, would use NLP to extract themes
  const themes = {
    'problem-solving': 0,
    'efficiency': 0,
    'thoroughness': 0,
    'exploration': 0,
  };

  for (const pattern of patterns) {
    const thinking = (pattern.thinking || '').toLowerCase();
    
    if (thinking.includes('problem') || thinking.includes('solve')) {
      themes['problem-solving']++;
    }
    if (thinking.includes('fast') || thinking.includes('quick') || thinking.includes('efficient')) {
      themes['efficiency']++;
    }
    if (thinking.includes('thorough') || thinking.includes('complete') || thinking.includes('all')) {
      themes['thoroughness']++;
    }
    if (thinking.includes('explore') || thinking.includes('discover') || thinking.includes('find')) {
      themes['exploration']++;
    }
  }

  return themes;
}

