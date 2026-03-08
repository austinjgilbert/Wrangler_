import { describe, expect, test } from 'vitest';
import { generateTopActionQueue } from '../../src/lib/opportunityEngine.ts';
import { scenarioFixtures } from './fixtures/scenarios/index.ts';

describe('opportunity engine scenario fixtures', () => {
  test('strong signal fusion ranks an immediate outbound action at the top', () => {
    const fixture = scenarioFixtures.find((item) => item.id === 'strong-signal-fusion')!;
    const queue = generateTopActionQueue({
      accounts: fixture.inputBundle.accounts,
      people: fixture.inputBundle.people,
      signals: fixture.inputBundle.signals,
      candidates: fixture.inputBundle.actionCandidates,
      now: fixture.now,
      dailyLimit: 50,
      maxPerAccount: 3,
    });

    expect(queue.actions[0].candidate.actionType).toBe('send_email');
    expect(queue.actions[0].candidate.patternMatch).toBe('scan.execution_ready');
    expect(queue.actions[0].score.strongestDrivers.length).toBeGreaterThan(0);
  });

  test('weak signal only remains a research-first action', () => {
    const fixture = scenarioFixtures.find((item) => item.id === 'weak-signal-only')!;
    const queue = generateTopActionQueue({
      accounts: fixture.inputBundle.accounts,
      people: fixture.inputBundle.people,
      signals: fixture.inputBundle.signals,
      candidates: fixture.inputBundle.actionCandidates,
      now: fixture.now,
      dailyLimit: 50,
      maxPerAccount: 3,
    });

    expect(queue.actions[0].candidate.actionType).toBe('run_targeted_research');
    expect(queue.actions[0].candidate.confidence).toBeLessThan(0.5);
  });

  test('legacy CMS displacement preserves migration pattern ranking', () => {
    const fixture = scenarioFixtures.find((item) => item.id === 'legacy-cms-displacement')!;
    const queue = generateTopActionQueue({
      accounts: fixture.inputBundle.accounts,
      people: fixture.inputBundle.people,
      signals: fixture.inputBundle.signals,
      candidates: fixture.inputBundle.actionCandidates,
      now: fixture.now,
      dailyLimit: 50,
      maxPerAccount: 3,
    });

    expect(queue.actions[0].candidate.patternMatch).toBe('scan.migration_signal');
    expect(queue.actions[0].candidate.actionType).toBe('make_call');
  });
});
