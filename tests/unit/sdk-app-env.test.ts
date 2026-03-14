import { describe, expect, it } from 'vitest'
import {
  getWorkerConfigMessageFor,
  sanitizeWorkerApiKey,
  sanitizeWorkerUrl,
} from '../../apps/sanity-data-sdk/src/lib/app-env'

describe('sdk app env helpers', () => {
  it('removes placeholder worker API keys', () => {
    expect(sanitizeWorkerApiKey('your-api-key')).toBe('')
    expect(sanitizeWorkerApiKey('replace-me')).toBe('')
    expect(sanitizeWorkerApiKey('real-secret')).toBe('real-secret')
  })

  it('normalizes worker URLs', () => {
    expect(sanitizeWorkerUrl('https://example.com/')).toBe('https://example.com')
    expect(sanitizeWorkerUrl('')).toBe('')
  })

  it('returns a setup message when worker URL is missing', () => {
    expect(getWorkerConfigMessageFor('', 'queue research')).toContain('Set VITE_WORKER_URL')
  })

  it('warns when an https Sanity shell points at an insecure local worker', () => {
    expect(
      getWorkerConfigMessageFor('http://localhost:8787', 'queue research', {
        currentProtocol: 'https:',
      })
    ).toContain('https Sanity shell')
  })

  it('accepts secure worker URLs in an https shell', () => {
    expect(
      getWorkerConfigMessageFor('https://website-scanner.austin-gilbert.workers.dev', 'queue research', {
        currentProtocol: 'https:',
      })
    ).toBe('')
  })
})
