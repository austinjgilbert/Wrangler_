/**
 * Task generation from insights and transcript.
 */

export function buildCallTasks({
  sessionId,
  insight,
}: {
  sessionId: string;
  insight: any;
}) {
  const tasks = [];
  tasks.push({
    _type: 'call.task',
    _id: `call.task.${sessionId}.followup`,
    sessionRef: { _type: 'reference', _ref: sessionId },
    owner: 'austin',
    taskText: 'Send follow-up summary with next steps (draft only).',
    status: 'open',
  });

  if (insight.objections && insight.objections.length > 0) {
    tasks.push({
      _type: 'call.task',
      _id: `call.task.${sessionId}.objections`,
      sessionRef: { _type: 'reference', _ref: sessionId },
      owner: 'austin',
      taskText: 'Prepare objection handling notes based on call.',
      status: 'open',
    });
  }

  if (insight.decisionProcess === 'Not discussed') {
    tasks.push({
      _type: 'call.task',
      _id: `call.task.${sessionId}.decision`,
      sessionRef: { _type: 'reference', _ref: sessionId },
      owner: 'austin',
      taskText: 'Clarify decision process and stakeholders in next call.',
      status: 'open',
    });
  }

  return tasks;
}
