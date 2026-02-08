/**
 * Proposed Action Builder
 * Creates a preview string and stores exact payload for later execution.
 */

interface ProposedActionInput {
  toolName: string;
  actionName: string;
  payload: any;
}

interface ProposedAction {
  toolName: string;
  actionName: string;
  payload: any;
  tool: string;
  action: string;
  input: any;
  preview: string;
}

function stringifyPayload(payload: any): string {
  try {
    return JSON.stringify(payload, null, 2);
  } catch (error) {
    return String(payload);
  }
}

export function buildProposedAction({ toolName, actionName, payload }: ProposedActionInput): ProposedAction {
  const preview = `[${toolName}] ${actionName} -> ${stringifyPayload(payload)}`;
  return {
    toolName,
    actionName,
    payload,
    tool: toolName,
    action: actionName,
    input: payload,
    preview,
  };
}
