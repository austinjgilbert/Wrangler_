/**
 * User Pattern Metadata Handler
 * Handles queries about user patterns and approaches
 */

import { createSuccessResponse, createErrorResponse } from '../utils/response.js';
import {
  getOtherUserPatterns,
  getThinkingPatterns,
  getSuccessfulApproaches,
  getToolUsagePatterns,
  getSequencePatterns,
  storeUserPattern,
} from '../services/user-pattern-metadata.js';

/**
 * Handle query about other users' patterns
 * GET /user-patterns/query
 */
export async function handleQueryUserPatterns(
  request,
  requestId,
  env,
  groqQuery,
  assertSanityConfigured
) {
  try {
    const url = new URL(request.url);
    const action = url.searchParams.get('action');
    const userSegment = url.searchParams.get('userSegment');
    const outcome = url.searchParams.get('outcome') || 'success';
    const limit = parseInt(url.searchParams.get('limit') || '10');
    const queryType = url.searchParams.get('type') || 'patterns'; // patterns, thinking, approaches, tools, sequences

    const client = assertSanityConfigured(env);

    let result;

    switch (queryType) {
      case 'thinking':
        result = await getThinkingPatterns(groqQuery, client, {
          action,
          limit,
        });
        break;
      
      case 'approaches':
        result = await getSuccessfulApproaches(groqQuery, client, {
          action,
          userSegment,
          limit,
        });
        break;
      
      case 'tools':
        result = await getToolUsagePatterns(groqQuery, client, {
          action,
          limit,
        });
        break;
      
      case 'sequences':
        result = await getSequencePatterns(groqQuery, client, {
          startingAction: action,
          userSegment,
          outcome,
          limit,
        });
        break;
      
      default: // 'patterns'
        result = await getOtherUserPatterns(groqQuery, client, {
          action,
          userSegment,
          outcome,
          limit,
        });
        break;
    }

    return createSuccessResponse({
      queryType,
      filters: {
        action,
        userSegment,
        outcome,
        limit,
      },
      patterns: result,
    }, requestId);

  } catch (error) {
    console.error('Error in handleQueryUserPatterns:', error);
    return createErrorResponse(
      'INTERNAL_ERROR',
      'Failed to query user patterns',
      { error: error.message },
      500,
      requestId
    );
  }
}

/**
 * Handle storing user pattern
 * POST /user-patterns/store
 */
export async function handleStoreUserPattern(
  request,
  requestId,
  env,
  groqQuery,
  upsertDocument,
  assertSanityConfigured
) {
  try {
    const body = await request.json();
    
    const {
      userId,
      userSegment,
      action,
      approach,
      context,
      outcome,
      timeSpent,
      toolsUsed,
      sequence,
      thinking,
      metadata = {},
    } = body;

    if (!action) {
      return createErrorResponse(
        'VALIDATION_ERROR',
        'Action is required',
        {},
        400,
        requestId
      );
    }

    const client = assertSanityConfigured(env);

    const patternData = {
      userId: userId || 'anonymous',
      userSegment,
      action,
      approach,
      context,
      outcome: outcome || 'unknown',
      timeSpent,
      toolsUsed: toolsUsed || [],
      sequence: sequence || [],
      thinking,
      metadata: {
        ...metadata,
        requestId,
      },
    };

    const result = await storeUserPattern(
      groqQuery,
      upsertDocument,
      client,
      patternData
    );

    return createSuccessResponse({
      stored: result.success,
      patternId: result.id,
    }, requestId);

  } catch (error) {
    console.error('Error in handleStoreUserPattern:', error);
    return createErrorResponse(
      'INTERNAL_ERROR',
      'Failed to store user pattern',
      { error: error.message },
      500,
      requestId
    );
  }
}

