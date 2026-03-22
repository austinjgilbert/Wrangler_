/**
 * Circuit Breaker — per-invocation failure threshold.
 *
 * Wraps AROUND retry logic (a query that exhausts all retries counts
 * as 1 circuit breaker failure). After `threshold` consecutive failures,
 * subsequent calls are skipped immediately.
 *
 * Scope: per-cron-run. Each Worker invocation creates a fresh breaker.
 * No KV or persistent state needed.
 *
 * Usage:
 *   const breaker = createCircuitBreaker(3);
 *   await breaker.execute(() => runRoute('/enrich/process'));
 *   await breaker.execute(() => runRoute('/analytics/operator-brief'));
 *   // If 3 consecutive calls fail, remaining calls are skipped.
 */

export function createCircuitBreaker(threshold = 3) {
  let consecutiveFailures = 0;

  return {
    /**
     * Execute a function through the circuit breaker.
     * Returns the function result on success, or null if the breaker is open.
     * Throws the original error if the breaker is still closed.
     */
    async execute(fn, label = 'unknown') {
      if (consecutiveFailures >= threshold) {
        console.error(
          `[circuit-breaker] OPEN — skipping "${label}" after ${consecutiveFailures} consecutive failures`
        );
        return null;
      }
      try {
        const result = await fn();
        consecutiveFailures = 0; // Reset on success
        return result;
      } catch (err) {
        consecutiveFailures++;
        console.error(
          `[circuit-breaker] "${label}" failed (${consecutiveFailures}/${threshold}):`,
          err?.message || err
        );
        if (consecutiveFailures >= threshold) {
          console.error(
            `[circuit-breaker] TRIPPED — ${consecutiveFailures} consecutive failures. Remaining tasks will be skipped.`
          );
        }
        return null; // Don't re-throw — cron tasks should degrade gracefully
      }
    },

    /** Whether the breaker has tripped. */
    isOpen() {
      return consecutiveFailures >= threshold;
    },

    /** Current consecutive failure count. */
    failures() {
      return consecutiveFailures;
    },
  };
}
