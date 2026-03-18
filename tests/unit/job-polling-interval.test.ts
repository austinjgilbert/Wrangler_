import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { calculateInterval } from '../../apps/sanity-data-sdk/src/components/command-center/useJobPolling'

describe('calculateInterval — adaptive polling intervals', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-18T12:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // ── Job-count based intervals (no duration escalation) ──────────────

  it('returns 30s when no active jobs', () => {
    expect(calculateInterval(0, null)).toBe(30_000)
  })

  it('returns 3s for 1 active job', () => {
    expect(calculateInterval(1, null)).toBe(3_000)
  })

  it('returns 3s for 2 active jobs', () => {
    expect(calculateInterval(2, null)).toBe(3_000)
  })

  it('returns 5s for 3 active jobs', () => {
    expect(calculateInterval(3, null)).toBe(5_000)
  })

  it('returns 5s for 5 active jobs', () => {
    expect(calculateInterval(5, null)).toBe(5_000)
  })

  it('returns 8s for 6+ active jobs', () => {
    expect(calculateInterval(6, null)).toBe(8_000)
    expect(calculateInterval(20, null)).toBe(8_000)
  })

  // ── Duration-based escalation (takes priority over count) ───────────

  it('returns 10s when oldest job is >1 min old', () => {
    const twoMinAgo = new Date(Date.now() - 2 * 60_000).toISOString()
    expect(calculateInterval(1, twoMinAgo)).toBe(10_000)
  })

  it('returns 15s when oldest job is >3 min old', () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60_000).toISOString()
    expect(calculateInterval(1, fiveMinAgo)).toBe(15_000)
  })

  it('returns 30s when oldest job is >10 min old (likely stuck)', () => {
    const fifteenMinAgo = new Date(Date.now() - 15 * 60_000).toISOString()
    expect(calculateInterval(1, fifteenMinAgo)).toBe(30_000)
  })

  it('duration escalation overrides job count', () => {
    // 2 active jobs would normally be 3s, but >3 min elapsed → 15s
    const fiveMinAgo = new Date(Date.now() - 5 * 60_000).toISOString()
    expect(calculateInterval(2, fiveMinAgo)).toBe(15_000)
  })

  // ── Edge cases ─────────────────────────────────────────────────────

  it('uses job-count interval when job just started (<1 min)', () => {
    const thirtySecAgo = new Date(Date.now() - 30_000).toISOString()
    expect(calculateInterval(1, thirtySecAgo)).toBe(3_000)
  })

  it('handles exactly 1 min boundary (not >1 min)', () => {
    const exactlyOneMin = new Date(Date.now() - 60_000).toISOString()
    // 60_000 is NOT > 60_000, so falls through to count-based
    expect(calculateInterval(1, exactlyOneMin)).toBe(3_000)
  })

  it('handles exactly 3 min boundary', () => {
    const exactlyThreeMin = new Date(Date.now() - 3 * 60_000).toISOString()
    // 180_000 is NOT > 180_000, so falls to >1 min check → 10s
    expect(calculateInterval(1, exactlyThreeMin)).toBe(10_000)
  })

  it('handles exactly 10 min boundary', () => {
    const exactlyTenMin = new Date(Date.now() - 10 * 60_000).toISOString()
    // 600_000 is NOT > 600_000, so falls to >3 min check → 15s
    expect(calculateInterval(1, exactlyTenMin)).toBe(15_000)
  })

  // ── Performance budget: ≤6 req/min when idle ──────────────────────

  it('respects ≤6 req/min budget when idle (0 jobs → 30s = 2 req/min)', () => {
    const interval = calculateInterval(0, null)
    const reqPerMin = 60_000 / interval
    expect(reqPerMin).toBeLessThanOrEqual(6)
  })

  it('respects ≤6 req/min budget when stuck (>10 min → 30s = 2 req/min)', () => {
    const stuck = new Date(Date.now() - 15 * 60_000).toISOString()
    const interval = calculateInterval(1, stuck)
    const reqPerMin = 60_000 / interval
    expect(reqPerMin).toBeLessThanOrEqual(6)
  })
})
