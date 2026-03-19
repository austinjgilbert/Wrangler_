/**
 * Normalize account display names in Sanity.
 *
 * This script now imports from the shared normalizer to prevent drift
 * between the worker and the Sanity studio.
 *
 * Usage:
 *   npx sanity exec scripts/normalize-account-names.ts --audit
 *   npx sanity exec scripts/normalize-account-names.ts --dry-run
 *   npx sanity exec scripts/normalize-account-names.ts
 */

import { getCliClient } from 'sanity/cli'
import {
  normalizeAccountDisplayName,
  normalizeWhitespace,
} from '../../shared/accountNameNormalizer.js'

type AccountDoc = {
  _id: string
  name?: string
  companyName?: string
  domain?: string
  rootDomain?: string
  accountKey?: string
}

const API_VERSION = '2026-03-11'

function getAuditIssues(account: AccountDoc, nextName: string) {
  const currentName = normalizeWhitespace(account.name)
  const currentCompanyName = normalizeWhitespace(account.companyName)
  const currentDisplay = currentCompanyName || currentName
  const issues: string[] = []

  if (!currentDisplay) {
    issues.push('missing-display-name')
  }

  if (/^account[.-]/i.test(currentDisplay)) {
    issues.push('id-like-display')
  }

  if (/[\n\t]/.test(String(account.companyName || account.name || ''))) {
    issues.push('embedded-whitespace')
  }

  if (currentDisplay !== nextName) {
    issues.push('normalizer-diff')
  }

  return issues
}

async function main() {
  const audit = process.argv.includes('--audit')
  const dryRun = process.argv.includes('--dry-run')
  const client = getCliClient({ apiVersion: API_VERSION })

  const accounts = await client.fetch<AccountDoc[]>(
    `*[_type == "account"]{_id, name, companyName, domain, rootDomain, accountKey} | order(_id asc)`
  )

  const patches = accounts
    .map((account) => {
      const nextName = normalizeAccountDisplayName(account)
      const currentName = account.name
      const currentCompanyName = account.companyName

      if (!nextName) return null
      if (currentName === nextName && currentCompanyName === nextName) {
        return null
      }

      return {
        id: account._id,
        before: `${normalizeWhitespace(currentCompanyName || currentName || account._id)}`,
        after: nextName,
      }
    })
    .filter(Boolean) as Array<{ id: string; before: string; after: string }>

  if (audit) {
    const flagged = accounts
      .map((account) => {
        const nextName = normalizeAccountDisplayName(account) || account._id
        const currentDisplay = normalizeWhitespace(account.companyName || account.name)
        const issues = getAuditIssues(account, nextName)

        if (issues.length === 0) {
          return null
        }

        return {
          id: account._id,
          current: currentDisplay,
          next: nextName,
          domain: normalizeWhitespace(account.domain || account.rootDomain),
          issues,
        }
      })
      .filter(Boolean)

    console.log(
      JSON.stringify(
        {
          total: accounts.length,
          flaggedCount: flagged.length,
          flagged,
        },
        null,
        2
      )
    )
    return
  }

  console.log(`Accounts scanned: ${accounts.length}`)
  console.log(`Accounts to update: ${patches.length}`)
  console.log('Sample changes:')
  console.log(
    patches.slice(0, 25).map((patch) => `${patch.id}: "${patch.before}" -> "${patch.after}"`).join('\n')
  )

  if (dryRun || patches.length === 0) {
    return
  }

  for (let i = 0; i < patches.length; i += 50) {
    const batch = patches.slice(i, i + 50)
    const tx = client.transaction()

    for (const patch of batch) {
      tx.patch(patch.id, {
        set: {
          name: patch.after,
          companyName: patch.after,
          updatedAt: new Date().toISOString(),
        },
      })
    }

    await tx.commit()
    console.log(`Committed batch ${Math.floor(i / 50) + 1} (${batch.length} docs)`)
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
