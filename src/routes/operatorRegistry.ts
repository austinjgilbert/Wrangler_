import { createSuccessResponse, createErrorResponse } from '../utils/response.js';
import { agentRegistry } from '../lib/agentRegistry.ts';
import { functionRegistry, groupedFunctionRegistry } from '../lib/functionRegistry.ts';

export async function handleOperatorFunctions(_request: Request, requestId: string) {
  try {
    return createSuccessResponse({
      functions: functionRegistry,
      grouped: groupedFunctionRegistry(),
    }, requestId);
  } catch (error: any) {
    return createErrorResponse('OPERATOR_FUNCTIONS_ERROR', error.message, {}, 500, requestId);
  }
}

export async function handleOperatorAgents(_request: Request, requestId: string) {
  try {
    return createSuccessResponse({
      agents: agentRegistry,
    }, requestId);
  } catch (error: any) {
    return createErrorResponse('OPERATOR_AGENTS_ERROR', error.message, {}, 500, requestId);
  }
}
