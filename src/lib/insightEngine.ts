export type CopilotInsight = {
  id: string;
  title: string;
  summary: string;
  severity: 'info' | 'warning' | 'critical';
  category: 'signals' | 'patterns' | 'opportunities' | 'learning' | 'drift';
  value?: string | number | null;
};

export function generateInsights(input: {
  accounts: any[];
  signals: any[];
  patterns: any[];
  actionCandidates: any[];
  operatorFeedback: any[];
  driftMetrics?: Record<string, any[]>;
}) {
  const insights: CopilotInsight[] = [];
  const now = Date.now();
  const recentSignals = input.signals.filter((signal) => {
    const timestamp = signal.timestamp ? new Date(signal.timestamp).getTime() : 0;
    return timestamp > now - (24 * 60 * 60 * 1000);
  });
  const recentSignalsPriorWindow = input.signals.filter((signal) => {
    const timestamp = signal.timestamp ? new Date(signal.timestamp).getTime() : 0;
    return timestamp <= now - (24 * 60 * 60 * 1000) && timestamp > now - (48 * 60 * 60 * 1000);
  });
  const velocityDelta = recentSignalsPriorWindow.length > 0
    ? Math.round(((recentSignals.length - recentSignalsPriorWindow.length) / recentSignalsPriorWindow.length) * 100)
    : 100;

  if (recentSignals.length > 0) {
    insights.push({
      id: 'signal-velocity',
      title: 'Signal velocity changed',
      summary: `Signal volume moved ${velocityDelta >= 0 ? 'up' : 'down'} ${Math.abs(velocityDelta)}% versus the prior 24-hour window.`,
      severity: Math.abs(velocityDelta) >= 25 ? 'warning' : 'info',
      category: 'signals',
      value: `${velocityDelta}%`,
    });
  }

  const pricingClusterAccounts = clusterAccountsBySignal(input.signals, ['pricing_page_visit', 'docs_engagement', 'intent_spike']);
  if (pricingClusterAccounts.length > 0) {
    insights.push({
      id: 'pricing-cluster',
      title: 'A cluster is showing CMS evaluation behavior',
      summary: `${pricingClusterAccounts.length} accounts have recent pricing/docs/intent combinations that likely justify active review.`,
      severity: pricingClusterAccounts.length >= 5 ? 'warning' : 'info',
      category: 'opportunities',
      value: pricingClusterAccounts.length,
    });
  }

  const highOpportunityCount = input.actionCandidates.filter((candidate) => Number(candidate.opportunityScore || 0) >= 70).length;
  insights.push({
    id: 'high-opportunity-distribution',
    title: 'High-opportunity distribution',
    summary: `${highOpportunityCount} action candidates currently sit above the 70-point threshold.`,
    severity: highOpportunityCount >= 20 ? 'info' : 'warning',
    category: 'opportunities',
    value: highOpportunityCount,
  });

  const strengthenedPatterns = input.patterns.filter((pattern) => Number(pattern.conversionAssociation || 0) >= 0.25);
  if (strengthenedPatterns.length > 0) {
    insights.push({
      id: 'pattern-strength',
      title: 'Pattern strength is concentrating',
      summary: `${strengthenedPatterns.length} active patterns show conversion association at or above 25%.`,
      severity: 'info',
      category: 'patterns',
      value: strengthenedPatterns.length,
    });
  }

  const editedDraftFeedback = input.operatorFeedback.filter((event) => String(event.feedbackType || '') === 'edited_draft').length;
  const sentDraftFeedback = input.operatorFeedback.filter((event) => String(event.feedbackType || '') === 'sent_draft').length;
  if (sentDraftFeedback > 0) {
    const editRate = Math.round((editedDraftFeedback / Math.max(1, sentDraftFeedback + editedDraftFeedback)) * 100);
    insights.push({
      id: 'draft-edit-rate',
      title: 'Draft acceptance signal',
      summary: `Observed draft edit share is ${editRate}%, which is a practical proxy for draft quality pressure.`,
      severity: editRate >= 45 ? 'warning' : 'info',
      category: 'learning',
      value: `${editRate}%`,
    });
  }

  const scoreInflation = input.driftMetrics?.scoreInflation?.[0];
  if (scoreInflation) {
    insights.push({
      id: 'score-inflation',
      title: 'Confidence calibration check',
      summary: `Current score inflation metric is ${round(scoreInflation.value || 0)}.`,
      severity: scoreInflation.severity === 'high' ? 'critical' : scoreInflation.severity === 'medium' ? 'warning' : 'info',
      category: 'drift',
      value: round(scoreInflation.value || 0),
    });
  }

  return insights.slice(0, 8);
}

function clusterAccountsBySignal(signals: any[], interestingSignals: string[]) {
  const grouped = new Map<string, Set<string>>();
  for (const signal of signals || []) {
    const accountId = signal.account?._ref;
    const signalType = String(signal.signalType || '');
    if (!accountId || !interestingSignals.includes(signalType)) continue;
    const current = grouped.get(accountId) || new Set<string>();
    current.add(signalType);
    grouped.set(accountId, current);
  }
  return [...grouped.entries()].filter(([, value]) => value.size >= 2);
}

function round(value: number) {
  return Math.round((Number(value) || 0) * 100) / 100;
}
