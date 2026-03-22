import { describe, it, expect, vi } from 'vitest';
import { createCircuitBreaker } from '../../src/utils/circuit-breaker.js';

describe('createCircuitBreaker', () => {
  it('executes functions normally when under threshold', async () => {
    const breaker = createCircuitBreaker(3);
    const result = await breaker.execute(async () => 'ok', 'test');
    expect(result).toBe('ok');
    expect(breaker.isOpen()).toBe(false);
    expect(breaker.failures()).toBe(0);
  });

  it('returns null and increments failures on error', async () => {
    const breaker = createCircuitBreaker(3);
    const result = await breaker.execute(async () => {
      throw new Error('fail');
    }, 'test');
    expect(result).toBeNull();
    expect(breaker.failures()).toBe(1);
    expect(breaker.isOpen()).toBe(false);
  });

  it('trips after threshold consecutive failures', async () => {
    const breaker = createCircuitBreaker(3);
    const fail = async () => { throw new Error('fail'); };

    await breaker.execute(fail, 'task-1');
    expect(breaker.failures()).toBe(1);
    expect(breaker.isOpen()).toBe(false);

    await breaker.execute(fail, 'task-2');
    expect(breaker.failures()).toBe(2);
    expect(breaker.isOpen()).toBe(false);

    await breaker.execute(fail, 'task-3');
    expect(breaker.failures()).toBe(3);
    expect(breaker.isOpen()).toBe(true);
  });

  it('skips execution when breaker is open', async () => {
    const breaker = createCircuitBreaker(2);
    const fail = async () => { throw new Error('fail'); };
    const spy = vi.fn(async () => 'should not run');

    await breaker.execute(fail, 'fail-1');
    await breaker.execute(fail, 'fail-2');
    expect(breaker.isOpen()).toBe(true);

    const result = await breaker.execute(spy, 'skipped');
    expect(result).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });

  it('resets consecutive failures on success', async () => {
    const breaker = createCircuitBreaker(3);
    const fail = async () => { throw new Error('fail'); };

    await breaker.execute(fail, 'fail-1');
    await breaker.execute(fail, 'fail-2');
    expect(breaker.failures()).toBe(2);

    // Success resets the counter
    await breaker.execute(async () => 'ok', 'success');
    expect(breaker.failures()).toBe(0);
    expect(breaker.isOpen()).toBe(false);

    // Need 3 more consecutive failures to trip
    await breaker.execute(fail, 'fail-3');
    expect(breaker.failures()).toBe(1);
    expect(breaker.isOpen()).toBe(false);
  });

  it('uses default threshold of 3', async () => {
    const breaker = createCircuitBreaker();
    const fail = async () => { throw new Error('fail'); };

    await breaker.execute(fail, 'f1');
    await breaker.execute(fail, 'f2');
    expect(breaker.isOpen()).toBe(false);

    await breaker.execute(fail, 'f3');
    expect(breaker.isOpen()).toBe(true);
  });

  it('handles mixed success/failure without tripping', async () => {
    const breaker = createCircuitBreaker(3);
    const fail = async () => { throw new Error('fail'); };
    const ok = async () => 'ok';

    await breaker.execute(fail, 'f1');  // failures: 1
    await breaker.execute(fail, 'f2');  // failures: 2
    await breaker.execute(ok, 'ok1');   // failures: 0 (reset)
    await breaker.execute(fail, 'f3');  // failures: 1
    await breaker.execute(fail, 'f4');  // failures: 2
    await breaker.execute(ok, 'ok2');   // failures: 0 (reset)

    expect(breaker.isOpen()).toBe(false);
    expect(breaker.failures()).toBe(0);
  });
});
