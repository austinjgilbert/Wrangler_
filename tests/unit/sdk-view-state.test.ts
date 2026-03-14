import { describe, expect, it } from 'vitest'
import { NAV, readViewFromSearch } from '../../apps/sanity-data-sdk/src/lib/view-state'

describe('sdk view state', () => {
  it('uses dashboard as the default view', () => {
    expect(readViewFromSearch('')).toBe('dashboard')
  })

  it('reads a valid view from the query string', () => {
    expect(readViewFromSearch('?view=accounts')).toBe('accounts')
    expect(readViewFromSearch('?view=enrichment')).toBe('enrichment')
  })

  it('rejects invalid views from the query string', () => {
    expect(readViewFromSearch('?view=unknown')).toBe('dashboard')
  })

  it('keeps research as the enrichment tab label', () => {
    expect(NAV.find((item) => item.id === 'enrichment')?.label).toBe('Research')
  })
})
