/**
 * profile-store.ts — Local JSON-based profile storage.
 *
 * Profiles are stored as individual JSON files on the user's machine.
 * This reference shows the storage layout and merge logic that Claude
 * should follow when building profiles from page scans.
 *
 * Storage location: ~/.chrome-inspector/profiles/
 *
 * NOTE: Claude doesn't execute this code directly. It uses osascript
 * or bash to read/write JSON files following these patterns.
 */

import {readFileSync, writeFileSync, mkdirSync, existsSync} from 'node:fs'
import {join} from 'node:path'
import {homedir} from 'node:os'
import type {StoredProfile, CompanyProfile, PersonProfile, DataSource} from './account-schema'

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const BASE_DIR = join(homedir(), '.chrome-inspector', 'profiles')
const COMPANIES_DIR = join(BASE_DIR, 'companies')
const PEOPLE_DIR = join(BASE_DIR, 'people')
const INDEX_PATH = join(BASE_DIR, 'index.json')

function ensureDirs(): void {
  for (const dir of [BASE_DIR, COMPANIES_DIR, PEOPLE_DIR]) {
    if (!existsSync(dir)) mkdirSync(dir, {recursive: true})
  }
}

// ---------------------------------------------------------------------------
// Index — maps names/domains to profile file paths
// ---------------------------------------------------------------------------

interface ProfileIndex {
  companies: Record<string, string> // domain → filename
  people: Record<string, string> // linkedin slug or "name--company" → filename
  aliases: Record<string, string> // alternate names → primary key
}

function loadIndex(): ProfileIndex {
  if (!existsSync(INDEX_PATH)) {
    return {companies: {}, people: {}, aliases: {}}
  }
  return JSON.parse(readFileSync(INDEX_PATH, 'utf-8'))
}

function saveIndex(index: ProfileIndex): void {
  ensureDirs()
  writeFileSync(INDEX_PATH, JSON.stringify(index, null, 2))
}

// ---------------------------------------------------------------------------
// Profile CRUD
// ---------------------------------------------------------------------------

export function loadProfile(entityType: 'company' | 'person', key: string): StoredProfile | null {
  const index = loadIndex()
  const map = entityType === 'company' ? index.companies : index.people

  // Check direct key
  let filename = map[key]

  // Check aliases
  if (!filename && index.aliases[key]) {
    filename = map[index.aliases[key]]
  }

  if (!filename) return null

  const dir = entityType === 'company' ? COMPANIES_DIR : PEOPLE_DIR
  const path = join(dir, filename)

  if (!existsSync(path)) return null
  return JSON.parse(readFileSync(path, 'utf-8'))
}

export function saveProfile(profile: StoredProfile): void {
  ensureDirs()
  const index = loadIndex()

  const dir = profile.entity_type === 'company' ? COMPANIES_DIR : PEOPLE_DIR
  const map = profile.entity_type === 'company' ? index.companies : index.people

  // Generate filename from primary key
  const filename = profile.primary_key.replace(/[^a-z0-9.-]/g, '-') + '.json'
  map[profile.primary_key] = filename

  // Add display name as alias
  if (profile.display_name) {
    index.aliases[profile.display_name.toLowerCase()] = profile.primary_key
  }

  writeFileSync(join(dir, filename), JSON.stringify(profile, null, 2))
  saveIndex(index)
}

// ---------------------------------------------------------------------------
// Merge Logic
// ---------------------------------------------------------------------------

/**
 * Merge new extracted data into an existing profile.
 *
 * Rules:
 * 1. New non-null values fill empty fields
 * 2. For conflicts, more specific beats less specific
 * 3. Arrays are merged (deduplicated)
 * 4. Source tracking is always appended
 * 5. Gaps and completeness are recalculated after merge
 */
export function mergeProfiles(
  existing: StoredProfile,
  newData: Partial<CompanyProfile | PersonProfile>,
  source: DataSource,
): StoredProfile {
  const merged = {...existing}
  const profile = {...(merged.profile as Record<string, unknown>)}

  for (const [key, value] of Object.entries(newData)) {
    if (value === null || value === undefined) continue

    const existingValue = profile[key]

    if (existingValue === null || existingValue === undefined) {
      // Fill empty field
      profile[key] = value
    } else if (Array.isArray(existingValue) && Array.isArray(value)) {
      // Merge arrays, deduplicate
      const mergedArray = [...new Set([...existingValue, ...value])]
      profile[key] = mergedArray
    } else if (typeof existingValue === 'object' && typeof value === 'object') {
      // Deep merge objects
      profile[key] = {...(existingValue as Record<string, unknown>), ...(value as Record<string, unknown>)}
    }
    // For scalar conflicts: keep existing (first-in wins, unless source priority differs)
  }

  merged.profile = profile as CompanyProfile | PersonProfile
  merged.sources = [...merged.sources, source]
  merged.last_updated = new Date().toISOString()

  return merged
}

// ---------------------------------------------------------------------------
// Shell Commands for Claude
// ---------------------------------------------------------------------------

/**
 * Claude should use osascript to execute these shell commands on the Mac:
 *
 * READ a profile:
 *   cat ~/.chrome-inspector/profiles/companies/acme-com.json 2>/dev/null || echo '{}'
 *
 * WRITE a profile (via heredoc):
 *   cat > ~/.chrome-inspector/profiles/companies/acme-com.json << 'PROFILE_EOF'
 *   { ... json content ... }
 *   PROFILE_EOF
 *
 * CREATE directories:
 *   mkdir -p ~/.chrome-inspector/profiles/{companies,people}
 *
 * LIST all profiles:
 *   ls ~/.chrome-inspector/profiles/companies/
 *   ls ~/.chrome-inspector/profiles/people/
 *
 * SEARCH profiles by content:
 *   grep -l '"name":"Acme"' ~/.chrome-inspector/profiles/companies/*.json
 *
 * READ the index:
 *   cat ~/.chrome-inspector/profiles/index.json 2>/dev/null || echo '{}'
 */
