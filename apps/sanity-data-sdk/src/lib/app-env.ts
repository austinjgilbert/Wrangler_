type EnvValue = string | undefined

// Build-time env injected by scripts/inject-env.sh (runs before sanity build).
// Falls back to import.meta.env for local dev (sanity dev loads .env natively).
import { BUILD_ENV } from './build-env.generated'

const PLACEHOLDER_VALUES = new Set([
  'your-api-key',
  'your-key',
  'replace-me',
  'changeme',
  'change-me',
  'example',
  'example-key',
  '<api-key>',
])

function readEnv(name: string, fallback = ''): string {
  // 1. Check build-time injected env (works with sanity build)
  const fromBuild = BUILD_ENV[name]
  if (fromBuild) return fromBuild.trim()

  // 2. Check Vite's import.meta.env (works with sanity dev)
  const fromMeta =
    typeof import.meta !== 'undefined'
      ? ((import.meta as ImportMeta & { env?: Record<string, EnvValue> }).env?.[name] ?? '')
      : ''

  const normalized = String(fromMeta || '').trim()
  return normalized || fallback
}

function isPlaceholderValue(value: string): boolean {
  const normalized = value.trim().toLowerCase()
  if (!normalized) return false
  if (PLACEHOLDER_VALUES.has(normalized)) return true
  return normalized.includes('your-') || normalized.includes('replace') || normalized.includes('changeme')
}

export function sanitizeWorkerUrl(value: string): string {
  const normalized = String(value || '').trim().replace(/\/$/, '')
  return isPlaceholderValue(normalized) ? '' : normalized
}

export function sanitizeWorkerApiKey(value: string): string {
  const normalized = String(value || '').trim()
  return isPlaceholderValue(normalized) ? '' : normalized
}

function currentPageProtocol(): string | null {
  return typeof window !== 'undefined' ? window.location.protocol : null
}

export const SANITY_PROJECT_ID = readEnv('VITE_SANITY_PROJECT_ID', 'nlqb7zmk')
export const SANITY_DATASET = readEnv('VITE_SANITY_DATASET', 'production')
export const WORKER_URL = sanitizeWorkerUrl(
  readEnv('VITE_WORKER_URL', 'https://website-scanner.austin-gilbert.workers.dev')
)
/** Set VITE_WORKER_API_KEY in .env if your worker protects /operator/console (e.g. MOLT_API_KEY). Enrich routes work without it. */
export const WORKER_API_KEY = sanitizeWorkerApiKey(
  readEnv('VITE_WORKER_API_KEY', '')
)

export function hasWorkerConfig(options?: { currentProtocol?: string | null }): boolean {
  return !getWorkerConfigMessage('reach the worker', options)
}

export function getWorkerConfigMessageFor(
  workerUrl: string,
  action: string,
  options?: { currentProtocol?: string | null }
): string {
  if (!workerUrl) {
    return `Set VITE_WORKER_URL in apps/sanity-data-sdk/.env to ${action}.`
  }

  const protocol = options?.currentProtocol ?? currentPageProtocol()
  if (protocol === 'https:' && /^http:\/\//i.test(workerUrl)) {
    return `This SDK runs inside an https Sanity shell. Use an https VITE_WORKER_URL to ${action}; http://localhost will be blocked by the browser.`
  }

  return ''
}

export function getWorkerConfigMessage(
  action: string,
  options?: { currentProtocol?: string | null }
): string {
  return getWorkerConfigMessageFor(WORKER_URL, action, options)
}
