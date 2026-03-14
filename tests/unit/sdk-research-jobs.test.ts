import { describe, expect, it } from 'vitest'
import {
  getActiveJobAccountKeys,
  getJobCanonicalUrl,
  getJobStatusLabel,
  getStageLabel,
} from '../../apps/sanity-data-sdk/src/lib/research-jobs'

describe('sdk research job helpers', () => {
  it('maps internal stage ids into human labels', () => {
    expect(getStageLabel('discovery')).toBe('Finding useful pages')
    expect(getStageLabel('verification')).toBe('Checking claims')
  })

  it('maps job statuses into user-facing labels', () => {
    expect(getJobStatusLabel('pending')).toBe('Queued')
    expect(getJobStatusLabel('in_progress')).toBe('In progress')
    expect(getJobStatusLabel('failed')).toBe('Failed')
  })

  it('collects only active account keys for auto-refresh', () => {
    expect(
      getActiveJobAccountKeys([
        { accountKey: 'acme.com', status: 'in_progress' },
        { accountKey: 'acme.com', status: 'queued' },
        { accountKey: 'globex.com', status: 'complete' },
        { targetEntity: 'account-initech.com', status: 'pending' },
      ])
    ).toEqual(['acme.com', 'initech.com'])
  })

  it('builds canonical urls from account records and fallbacks', () => {
    const accountMap = new Map([
      [
        'account-acme.com',
        {
          documentId: 'account-acme.com',
          companyName: 'Acme',
          canonicalUrl: 'https://acme.com',
          domain: 'acme.com',
        },
      ],
      [
        'account.globex.com',
        {
          documentId: 'account.globex.com',
          companyName: 'Globex',
          domain: 'globex.com',
        },
      ],
    ])

    expect(
      getJobCanonicalUrl(
        { targetEntity: 'account-acme.com', accountKey: 'acme.com' },
        accountMap
      )
    ).toBe('https://acme.com')

    expect(
      getJobCanonicalUrl(
        { targetEntity: 'account.globex.com', accountKey: 'globex.com' },
        accountMap
      )
    ).toBe('https://globex.com')
  })
})
