/**
 * Call insight extraction from transcript entries.
 * Heuristic-based for deterministic behavior.
 */

const KEYWORDS = {
  pains: ['problem', 'issue', 'pain', 'struggle', 'frustrat'],
  goals: ['goal', 'want', 'need', 'looking to', 'aim'],
  objections: ['concern', 'but', 'hesitant', 'worry', 'risk'],
  risks: ['risk', 'uncertain', 'not sure', 'unknown'],
  decision: ['decision', 'approve', 'budget', 'procurement'],
  stakeholders: ['cfo', 'cto', 'ceo', 'vp', 'director', 'manager'],
};

function extractList(entries: any[], keywords: string[]) {
  const results: string[] = [];
  for (const e of entries) {
    const lower = e.text.toLowerCase();
    if (keywords.some((k) => lower.includes(k))) {
      results.push(`${e.timestamp} ${e.speaker}: ${e.text}`);
    }
  }
  return results.slice(0, 5);
}

export function buildCallInsight(entries: any[]) {
  const pains = extractList(entries, KEYWORDS.pains);
  const goals = extractList(entries, KEYWORDS.goals);
  const objections = extractList(entries, KEYWORDS.objections);
  const risks = extractList(entries, KEYWORDS.risks);
  const decisionLines = extractList(entries, KEYWORDS.decision);
  const stakeholderLines = extractList(entries, KEYWORDS.stakeholders);

  const summary = entries.slice(0, 3).map((e) => e.text).join(' ');
  const decisionProcess = decisionLines.join(' | ') || 'Not discussed';
  const crmNotes = [
    `Summary: ${summary}`,
    `Pains: ${pains[0] || 'N/A'}`,
    `Goals: ${goals[0] || 'N/A'}`,
    `Decision: ${decisionProcess}`,
  ].join('\n');

  return {
    summary,
    crmNotes,
    pains,
    goals,
    objections,
    stakeholders: stakeholderLines,
    decisionProcess,
    risks,
    unknowns: risks,
  };
}
