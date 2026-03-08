import type { ScenarioFixture } from '../../shared/types.ts';
import { generateTopActionQueue } from './opportunityEngine.ts';
import { buildTopActionsTodayView } from './sdrCommandInterface.ts';

export type ScenarioRegressionResult = {
  fixtureId: string;
  passed: boolean;
  actionType: string | null;
  opportunityScore: number | null;
  confidence: number | null;
  patternMatch: string | null;
  reasons: string[];
};

export function runScenarioFixture(fixture: ScenarioFixture): ScenarioRegressionResult {
  const queue = generateTopActionQueue({
    accounts: fixture.inputBundle.accounts || [],
    people: fixture.inputBundle.people || [],
    signals: fixture.inputBundle.signals || [],
    candidates: fixture.inputBundle.actionCandidates || [],
    now: fixture.now,
    dailyLimit: 50,
    maxPerAccount: 3,
  });

  const top = queue.actions[0]?.candidate || null;
  const reasons: string[] = [];
  if (!top && fixture.expectation.expectedActionType !== 'no_action') {
    reasons.push('No action generated.');
  }
  if (top && fixture.expectation.expectedActionType && fixture.expectation.expectedActionType !== 'no_action' && top.actionType !== fixture.expectation.expectedActionType) {
    reasons.push(`Expected action type ${fixture.expectation.expectedActionType} but received ${top.actionType}.`);
  }
  if (top && fixture.expectation.expectedPriorityRange) {
    const score = Number(top.opportunityScore || 0);
    if (score < fixture.expectation.expectedPriorityRange.min || score > fixture.expectation.expectedPriorityRange.max) {
      reasons.push(`Score ${score} outside expected range ${fixture.expectation.expectedPriorityRange.min}-${fixture.expectation.expectedPriorityRange.max}.`);
    }
  }
  if (top && fixture.expectation.expectedConfidenceRange) {
    const confidence = Number(top.confidence || 0);
    if (confidence < fixture.expectation.expectedConfidenceRange.min || confidence > fixture.expectation.expectedConfidenceRange.max) {
      reasons.push(`Confidence ${confidence} outside expected range ${fixture.expectation.expectedConfidenceRange.min}-${fixture.expectation.expectedConfidenceRange.max}.`);
    }
  }
  if (top) {
    const expectedPattern = fixture.expectation.expectedPattern;
    if (expectedPattern === 'no_pattern' && top.patternMatch) {
      reasons.push(`Expected no pattern but received ${top.patternMatch}.`);
    } else if (expectedPattern && expectedPattern !== 'no_pattern' && top.patternMatch !== expectedPattern) {
      reasons.push(`Expected pattern ${expectedPattern} but received ${top.patternMatch || 'none'}.`);
    }
  }

  return {
    fixtureId: fixture.id,
    passed: reasons.length === 0,
    actionType: top?.actionType || null,
    opportunityScore: top?.opportunityScore ?? null,
    confidence: top?.confidence ?? null,
    patternMatch: top?.patternMatch || null,
    reasons,
  };
}

export function runScenarioRegressionSuite(fixtures: ScenarioFixture[]) {
  const results = fixtures.map(runScenarioFixture);
  return {
    results,
    passed: results.every((result) => result.passed),
    total: results.length,
    failed: results.filter((result) => !result.passed).length,
    preview: fixtures.length
      ? buildTopActionsTodayView({
          queue: generateTopActionQueue({
            accounts: fixtures[0].inputBundle.accounts || [],
            people: fixtures[0].inputBundle.people || [],
            signals: fixtures[0].inputBundle.signals || [],
            candidates: fixtures[0].inputBundle.actionCandidates || [],
            now: fixtures[0].now,
            dailyLimit: 50,
            maxPerAccount: 3,
          }),
          page: 1,
          pageSize: 50,
        })
      : null,
  };
}
