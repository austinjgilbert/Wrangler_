import { createErrorResponse, createSuccessResponse, safeParseJson, sanitizeErrorMessage } from '../utils/response.js';
import {
  addPattern,
  adjustSignalWeights,
  getSuperuserInterfaceState,
  injectStrategyUpdates,
  inspectWeakData,
  previewStrategyUpdates,
  queueAntiDriftMaintenance,
  rerankActions,
  triggerReanalysis,
} from '../lib/superuserInterface.ts';

export async function handleSuperuserState(request: Request, requestId: string, env: any) {
  try {
    const state = await getSuperuserInterfaceState(env);
    return createSuccessResponse(state, requestId);
  } catch (error: any) {
    return createErrorResponse('SUPERUSER_STATE_ERROR', sanitizeErrorMessage(error, 'superuser/state'), {}, 500, requestId);
  }
}

export async function handleSuperuserCommand(request: Request, requestId: string, env: any) {
  try {
    const { data: body, error: parseError } = await safeParseJson(request, requestId);
    if (parseError) return parseError;
    const command = String(body.command || '').trim();

    if (!command) {
      return createErrorResponse('VALIDATION_ERROR', 'command is required', {}, 400, requestId);
    }

    let result: any;
    if (command === 'adjust_signal_weights') {
      result = await adjustSignalWeights(env, {
        weights: body.weights || {},
        note: body.note,
      });
    } else if (command === 'add_pattern') {
      result = await addPattern(env, {
        patternKey: body.patternKey,
        summary: body.summary,
        conditions: body.conditions || {},
        recommendedMoves: Array.isArray(body.recommendedMoves) ? body.recommendedMoves : [],
      });
    } else if (command === 'trigger_reanalysis') {
      result = await triggerReanalysis(env, {
        accountRefs: Array.isArray(body.accountRefs) ? body.accountRefs : [],
        personRefs: Array.isArray(body.personRefs) ? body.personRefs : [],
        maxAccounts: typeof body.maxAccounts === 'number' ? body.maxAccounts : undefined,
      });
    } else if (command === 'inspect_weak_data') {
      result = await inspectWeakData(env, {
        limit: typeof body.limit === 'number' ? body.limit : undefined,
      });
    } else if (command === 'inject_strategy_updates') {
      result = await injectStrategyUpdates(env, {
        title: body.title,
        operatingRules: Array.isArray(body.operatingRules) ? body.operatingRules : [],
        toneRules: Array.isArray(body.toneRules) ? body.toneRules : [],
        values: Array.isArray(body.values) ? body.values : [],
        accountRefs: Array.isArray(body.accountRefs) ? body.accountRefs : [],
        note: body.note,
      });
    } else if (command === 'preview_strategy_updates') {
      result = await previewStrategyUpdates(env, {
        accountRefs: Array.isArray(body.accountRefs) ? body.accountRefs : [],
      });
    } else if (command === 'queue_anti_drift_maintenance') {
      result = await queueAntiDriftMaintenance(env, {
        includeHeavyJobs: typeof body.includeHeavyJobs === 'boolean' ? body.includeHeavyJobs : true,
        now: typeof body.now === 'string' ? body.now : undefined,
      });
    } else if (command === 'rerank_actions') {
      result = await rerankActions(env, {
        dailyLimit: typeof body.dailyLimit === 'number' ? body.dailyLimit : undefined,
        maxPerAccount: typeof body.maxPerAccount === 'number' ? body.maxPerAccount : undefined,
        page: typeof body.page === 'number' ? body.page : undefined,
        pageSize: typeof body.pageSize === 'number' ? body.pageSize : undefined,
      });
    } else {
      return createErrorResponse('VALIDATION_ERROR', `Unsupported command: ${command}`, {}, 400, requestId);
    }

    return createSuccessResponse({ command, result }, requestId);
  } catch (error: any) {
    return createErrorResponse('SUPERUSER_COMMAND_ERROR', sanitizeErrorMessage(error, 'superuser/command'), {}, 500, requestId);
  }
}
