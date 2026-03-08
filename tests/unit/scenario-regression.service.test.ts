import { describe, expect, test } from 'vitest';
import { runScenarioRegressionSuite } from '../../src/lib/scenarioRegressionService.ts';
import { scenarioFixtures } from './fixtures/scenarios/index.ts';

describe('scenario regression service', () => {
  test('core fixtures pass the regression suite', () => {
    const result = runScenarioRegressionSuite(scenarioFixtures);
    expect(result.total).toBeGreaterThanOrEqual(10);
    expect(result.failed).toBe(0);
    expect(result.passed).toBe(true);
  });
});
