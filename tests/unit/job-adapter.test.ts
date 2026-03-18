import { describe, expect, it } from 'vitest'
import {
  transformJob,
  transformJobs,
  getStageLabels,
  type BackendJob,
} from '../../apps/sanity-data-sdk/src/lib/adapters/job'

// ─── normalizeJobStatus (tested via transformJob) ────────────────────────

describe('job adapter — status normalization', () => {
  const base: BackendJob = { _id: 'job-1', accountKey: 'abc123' }

  it('maps live API status "done" → UI "complete"', () => {
    expect(transformJob({ ...base, status: 'done' }, 'Acme').status).toBe('complete')
  })

  it('maps live API status "in_progress" → UI "running"', () => {
    expect(transformJob({ ...base, status: 'in_progress' }, 'Acme').status).toBe('running')
  })

  it('maps live API status "pending" → UI "queued"', () => {
    expect(transformJob({ ...base, status: 'pending' }, 'Acme').status).toBe('queued')
  })

  it('maps live API status "failed" → UI "failed"', () => {
    expect(transformJob({ ...base, status: 'failed' }, 'Acme').status).toBe('failed')
  })

  it('maps legacy "complete" → UI "complete"', () => {
    expect(transformJob({ ...base, status: 'complete' }, 'Acme').status).toBe('complete')
  })

  it('maps legacy "completed" → UI "complete"', () => {
    expect(transformJob({ ...base, status: 'completed' }, 'Acme').status).toBe('complete')
  })

  it('maps legacy "running" → UI "running"', () => {
    expect(transformJob({ ...base, status: 'running' }, 'Acme').status).toBe('running')
  })

  it('maps legacy "queued" → UI "queued"', () => {
    expect(transformJob({ ...base, status: 'queued' }, 'Acme').status).toBe('queued')
  })

  it('maps legacy "not_started" → UI "queued"', () => {
    expect(transformJob({ ...base, status: 'not_started' }, 'Acme').status).toBe('queued')
  })

  it('defaults undefined status to "queued"', () => {
    expect(transformJob({ ...base, status: undefined }, 'Acme').status).toBe('queued')
  })

  it('defaults unknown status to "queued"', () => {
    expect(transformJob({ ...base, status: 'banana' }, 'Acme').status).toBe('queued')
  })
})

// ─── deriveProgress (tested via transformJob) ────────────────────────────

describe('job adapter — progress derivation', () => {
  const base: BackendJob = { _id: 'job-1', accountKey: 'abc123' }

  it('uses rawProgress when provided', () => {
    expect(transformJob({ ...base, status: 'in_progress', progress: 73 }, 'Acme').progress).toBe(73)
  })

  it('uses rawProgress=0 without falling through to status-based', () => {
    // This is the != null check — 0 is a valid progress value
    expect(transformJob({ ...base, status: 'in_progress', progress: 0 }, 'Acme').progress).toBe(0)
  })

  it('derives 50 for running jobs without rawProgress', () => {
    expect(transformJob({ ...base, status: 'in_progress' }, 'Acme').progress).toBe(50)
  })

  it('derives 0 for queued jobs without rawProgress', () => {
    expect(transformJob({ ...base, status: 'pending' }, 'Acme').progress).toBe(0)
  })

  it('derives 100 for complete jobs without rawProgress', () => {
    expect(transformJob({ ...base, status: 'done' }, 'Acme').progress).toBe(100)
  })

  it('derives 100 for failed jobs without rawProgress', () => {
    expect(transformJob({ ...base, status: 'failed' }, 'Acme').progress).toBe(100)
  })
})

// ─── deriveModuleKey (tested via transformJob) ───────────────────────────

describe('job adapter — module key derivation', () => {
  const base: BackendJob = { _id: 'job-1', accountKey: 'abc123' }

  it('maps mode "deep" → "research"', () => {
    expect(transformJob({ ...base, mode: 'deep' }, 'Acme').moduleKey).toBe('research')
  })

  it('maps mode "standard" → "research"', () => {
    expect(transformJob({ ...base, mode: 'standard' }, 'Acme').moduleKey).toBe('research')
  })

  it('maps mode "restart" → "research"', () => {
    expect(transformJob({ ...base, mode: 'restart' }, 'Acme').moduleKey).toBe('research')
  })

  it('maps mode "competitors" → "competitors"', () => {
    expect(transformJob({ ...base, mode: 'competitors' }, 'Acme').moduleKey).toBe('competitors')
  })

  it('maps mode "linkedin" → "people" (canonical key)', () => {
    expect(transformJob({ ...base, mode: 'linkedin' }, 'Acme').moduleKey).toBe('people')
  })

  it('maps mode "gap-fill" → "approach" (canonical key)', () => {
    expect(transformJob({ ...base, mode: 'gap-fill' }, 'Acme').moduleKey).toBe('approach')
  })

  it('falls back to jobType when mode is absent', () => {
    expect(transformJob({ ...base, jobType: 'competitors' }, 'Acme').moduleKey).toBe('competitors')
  })

  it('defaults unknown mode to "research"', () => {
    expect(transformJob({ ...base, mode: 'unknown' }, 'Acme').moduleKey).toBe('research')
  })

  it('defaults missing mode+jobType to "research"', () => {
    expect(transformJob(base, 'Acme').moduleKey).toBe('research')
  })
})

// ─── entityId fallback + prefix stripping ───────────────────────────────

describe('job adapter — accountKey / entityId fallback', () => {
  it('prefers accountKey when both present', () => {
    const job: BackendJob = { _id: 'j1', accountKey: 'ak1', entityId: 'account-ak1' }
    expect(transformJob(job, 'Acme').accountKey).toBe('ak1')
  })

  it('strips "account-" prefix from entityId on bulk endpoint', () => {
    const job: BackendJob = { _id: 'j1', entityId: 'account-a1b2c3d4e5f67890' }
    expect(transformJob(job, 'Acme').accountKey).toBe('a1b2c3d4e5f67890')
  })

  it('passes through entityId without "account-" prefix unchanged', () => {
    const job: BackendJob = { _id: 'j1', entityId: 'eid1' }
    expect(transformJob(job, 'Acme').accountKey).toBe('eid1')
  })

  it('returns empty string when both missing', () => {
    const job: BackendJob = { _id: 'j1' }
    expect(transformJob(job, 'Acme').accountKey).toBe('')
  })

  it('returns empty string when entityId is undefined', () => {
    const job: BackendJob = { _id: 'j1', entityId: undefined }
    expect(transformJob(job, 'Acme').accountKey).toBe('')
  })
})

// ─── startedAt fallback ─────────────────────────────────────────────────

describe('job adapter — startedAt fallback chain', () => {
  it('uses startedAt when present', () => {
    const job: BackendJob = { _id: 'j1', startedAt: '2026-01-01T00:00:00Z', _createdAt: '2025-12-31T00:00:00Z' }
    expect(transformJob(job, 'Acme').startedAt).toBe('2026-01-01T00:00:00Z')
  })

  it('falls back to _createdAt when startedAt missing', () => {
    const job: BackendJob = { _id: 'j1', _createdAt: '2025-12-31T00:00:00Z' }
    expect(transformJob(job, 'Acme').startedAt).toBe('2025-12-31T00:00:00Z')
  })

  it('generates ISO string when both missing', () => {
    const job: BackendJob = { _id: 'j1' }
    const result = transformJob(job, 'Acme')
    // Should be a valid ISO date string
    expect(() => new Date(result.startedAt).toISOString()).not.toThrow()
  })
})

// ─── transformJob full shape ────────────────────────────────────────────

describe('job adapter — transformJob output shape', () => {
  it('produces correct full shape from live-like backend job', () => {
    const backendJob: BackendJob = {
      _id: 'osintJob.abc123.deep',
      accountKey: 'a1b2c3d4e5f67890',
      status: 'in_progress',
      stage: 3,
      mode: 'deep',
      startedAt: '2026-03-18T10:00:00Z',
      estimatedSeconds: 120,
      advanceError: undefined,
    }

    const result = transformJob(backendJob, 'Acme Corp')

    expect(result).toEqual({
      id: 'osintJob.abc123.deep',
      accountKey: 'a1b2c3d4e5f67890',
      accountName: 'Acme Corp',
      label: '🔬 Acme Corp',
      moduleKey: 'research',
      progress: 50,  // running, no rawProgress → 50
      status: 'running',
      stageNumber: 3,
      stageLabel: 'Crawling content...',
      startedAt: '2026-03-18T10:00:00Z',
      estimatedSeconds: 120,
      advanceError: undefined,
    })
  })

  it('throws on missing _id', () => {
    expect(() => transformJob({ _id: '' } as BackendJob, 'Acme')).toThrow('missing _id')
  })
})

// ─── transformJobs batch ────────────────────────────────────────────────

describe('job adapter — transformJobs batch', () => {
  it('transforms multiple jobs with name resolution', () => {
    const jobs: BackendJob[] = [
      { _id: 'j1', accountKey: 'k1', status: 'done', mode: 'deep' },
      { _id: 'j2', accountKey: 'k2', status: 'in_progress', mode: 'competitors' },
    ]
    const resolve = (key: string) => key === 'k1' ? 'Acme' : 'Globex'

    const result = transformJobs(jobs, resolve)

    expect(result).toHaveLength(2)
    expect(result[0].accountName).toBe('Acme')
    expect(result[0].status).toBe('complete')
    expect(result[1].accountName).toBe('Globex')
    expect(result[1].moduleKey).toBe('competitors')
  })

  it('skips jobs that fail transformation (no _id)', () => {
    const jobs: BackendJob[] = [
      { _id: 'j1', accountKey: 'k1', status: 'done' },
      { _id: '', accountKey: 'k2', status: 'done' },  // will throw
      { _id: 'j3', accountKey: 'k3', status: 'done' },
    ]
    const resolve = () => 'Test'

    const result = transformJobs(jobs, resolve)

    expect(result).toHaveLength(2)
    expect(result[0].id).toBe('j1')
    expect(result[1].id).toBe('j3')
  })

  it('uses entityId fallback in batch transform (strips prefix)', () => {
    const jobs: BackendJob[] = [
      { _id: 'j1', entityId: 'account-abc123', status: 'pending' },
    ]
    const resolve = (key: string) => key === 'abc123' ? 'Entity Co' : 'Unknown'

    const result = transformJobs(jobs, resolve)

    expect(result[0].accountKey).toBe('abc123')
    expect(result[0].accountName).toBe('Entity Co')
  })
})

// ─── getStageLabels ─────────────────────────────────────────────────────

describe('job adapter — stage labels', () => {
  it('returns frozen stage label map', () => {
    const labels = getStageLabels()
    expect(labels[0]).toBe('Queued')
    expect(labels[3]).toBe('Crawling content...')
    expect(labels[7]).toBe('Verifying claims...')
  })

  it('transformJob uses "Processing..." for unknown stage numbers', () => {
    const job: BackendJob = { _id: 'j1', stage: 99 }
    expect(transformJob(job, 'Acme').stageLabel).toBe('Processing...')
  })
})
