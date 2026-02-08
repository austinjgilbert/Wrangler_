/**
 * SDR Good Morning Routing Handler
 * Handles the daily prioritization and planning endpoint
 */

import { createSuccessResponse, createErrorResponse } from '../utils/response.js';
import { generateGoodMorningRouting } from '../services/sdr-good-morning-service.js';
import { writeDailyLog, appendEODReminder } from '../services/sdr-logging-service.js';
import { storeUserPattern } from '../services/user-pattern-metadata.js';

/**
 * Handle good morning routing request
 */
export async function handleGoodMorningRouting(
  request,
  requestId,
  env,
  groqQuery,
  assertSanityConfigured
) {
  const startTime = Date.now();
  try {
    const body = await request.json().catch(() => ({}));
    const {
      daysBack = 30,
      minCallScore = 6,
      maxCalls = 25,
      maxLinkedIn = 15,
      maxEmails = 10,
      assumeRefresh = false,
      log = true, // Whether to write to daily log file
      userId = 'anonymous',
      userSegment = 'sdr',
      trackPattern = true, // Whether to track this as a user pattern
    } = body;

    const client = assertSanityConfigured(env);

    const context = {
      env,
      requestId,
      groqQuery,
      client,
    };

    const options = {
      daysBack,
      minCallScore,
      maxCalls,
      maxLinkedIn,
      maxEmails,
      assumeRefresh,
    };

    // Generate routing plan
    const plan = await generateGoodMorningRouting(context, options);

    // Write to daily log if requested
    if (log) {
      try {
        await writeDailyLog(plan, requestId);
      } catch (logError) {
        console.error('Error writing daily log:', logError);
        // Don't fail the request if logging fails
      }
    }

    // Track user pattern for learning (background, non-blocking)
    if (trackPattern && client) {
      try {
        const { upsertDocument } = await import('../sanity-client.js');
        const timeSpent = Date.now() - startTime;
        
        await storeUserPattern(
          groqQuery,
          upsertDocument,
          client,
          {
            userId,
            userSegment,
            action: 'good-morning-routing',
            approach: `daysBack=${daysBack}, minScore=${minCallScore}, maxCalls=${maxCalls}`,
            context: {
              intent: 'daily-planning',
            },
            outcome: plan.stats.qualifiedAccounts > 0 ? 'success' : 'partial',
            timeSpent,
            toolsUsed: ['/sdr/good-morning'],
            sequence: ['good-morning-routing'],
            thinking: `Prioritized ${plan.stats.totalAccounts} accounts, generated ${plan.stats.callsQueued} calls, ${plan.stats.linkedInQueued} LI actions`,
            metadata: {
              requestId,
              stats: plan.stats,
            },
          }
        );
      } catch (patternError) {
        console.error('Error storing user pattern:', patternError);
        // Don't fail the request if pattern tracking fails
      }
    }

    return createSuccessResponse(plan, requestId);

  } catch (error) {
    console.error('Error in handleGoodMorningRouting:', error);
    return createErrorResponse(
      'INTERNAL_ERROR',
      'Failed to generate good morning routing',
      { error: error.message, stack: error.stack },
      500,
      requestId
    );
  }
}

