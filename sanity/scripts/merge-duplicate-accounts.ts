/**
 * Merge duplicate account records under one canonical parent per domain.
 *
 * - Groups accounts by normalized rootDomain (or domain).
 * - Picks one canonical account per group (most complete, then most recent).
 * - Rewrites all references from duplicate account IDs/keys to the canonical account.
 * - Merges duplicate account data into the canonical document.
 * - Deletes duplicate account and accountPack documents.
 *
 * Usage:
 *   npx sanity exec sanity/scripts/merge-duplicate-accounts.ts
 *   npx sanity exec sanity/scripts/merge-duplicate-accounts.ts -- --dry-run
 *   npx sanity exec sanity/scripts/merge-duplicate-accounts.ts -- --limit 10
 */

import { getCliClient } from 'sanity/cli'

function normalizeDomain(url: string | undefined): string | null {
  if (!url) return null
  try {
    const u = url.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0]
    return u || null
  } catch {
    return null
  }
}

type AccountDoc = {
  _id: string
  _type: string
  accountKey?: string
  name?: string
  companyName?: string
  domain?: string
  rootDomain?: string
  canonicalUrl?: string
  industry?: string
  technologyStack?: Record<string, any>
  opportunityScore?: number
  leadership?: Array<{ _ref: string }>
  [key: string]: any
}

async function main() {
  const client = getCliClient()
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const limitIdx = args.indexOf('--limit')
  const limit = limitIdx >= 0 && args[limitIdx + 1] ? parseInt(args[limitIdx + 1], 10) : undefined

  const accounts = (await client.fetch(
    `*[_type == "account"] | order(_updatedAt desc) {
      _id,
      _type,
      accountKey,
      name,
      companyName,
      domain,
      rootDomain,
      canonicalUrl,
      industry,
      technologyStack,
      opportunityScore,
      leadership,
      _updatedAt,
      profileCompleteness,
      benchmarks,
      painPoints,
      signals,
      classification
    }`
  )) as AccountDoc[]

  // Group by normalized domain
  const byDomain = new Map<string, AccountDoc[]>()
  for (const a of accounts) {
    const domain = normalizeDomain(a.rootDomain || a.domain || a.canonicalUrl || '') || a.accountKey || a._id
    if (!byDomain.has(domain)) byDomain.set(domain, [])
    byDomain.get(domain)!.push(a)
  }

  const groupsToMerge = [...byDomain.entries()].filter(([, list]) => list.length > 1)
  if (groupsToMerge.length === 0) {
    console.log('No duplicate account groups found.')
    return
  }

  console.log(`Found ${groupsToMerge.length} domain groups with duplicates.`)
  if (dryRun) console.log('DRY RUN – no mutations will be applied.')

  let processed = 0
  for (const [domain, group] of groupsToMerge) {
    if (limit !== undefined && processed >= limit) break

    // Pick canonical: most complete (profileCompleteness score, then most fields), then most recent
    const canonical = group.slice().sort((a, b) => {
      const scoreA = (a.profileCompleteness?.score ?? 0) + (a.leadership?.length ?? 0) * 2 + (a.technologyStack ? 1 : 0)
      const scoreB = (b.profileCompleteness?.score ?? 0) + (b.leadership?.length ?? 0) * 2 + (b.technologyStack ? 1 : 0)
      if (scoreB !== scoreA) return scoreB - scoreA
      return new Date(b._updatedAt || 0).getTime() - new Date(a._updatedAt || 0).getTime()
    })[0]

    const duplicates = group.filter((a) => a._id !== canonical._id)
    const canonicalId = canonical._id
    const canonicalKey = canonical.accountKey || canonicalId.replace(/^account[.-]/, '')

    for (const dup of duplicates) {
      const dupId = dup._id
      const dupKey = dup.accountKey || dupId.replace(/^account[.-]/, '')

      // Find documents that reference the duplicate account
      const refsQuery = `*[(references($dupId) || accountKey == $dupKey || relatedAccountKey == $dupKey) && _id != $dupId] { _id, _type, account, accountKey, relatedAccountKey, companyRef }`
      const refDocs = (await client.fetch(refsQuery, {
        dupId,
        dupKey,
      })) as Array<{ _id: string; _type: string; account?: { _ref: string }; accountKey?: string; relatedAccountKey?: string; companyRef?: { _ref: string } }>

      if (!dryRun) {
        for (const doc of refDocs) {
          if (doc._id === dupId) continue // skip the duplicate account itself
          const patch: Record<string, any> = {}
          if (doc.account?._ref === dupId || doc.account?._ref === `account-${dupKey}` || doc.account?._ref === `account.${dupKey}`) {
            patch['account'] = { _type: 'reference', _ref: canonicalId }
          }
          if (doc.accountKey === dupKey) patch['accountKey'] = canonicalKey
          if (doc.relatedAccountKey === dupKey) patch['relatedAccountKey'] = canonicalKey
          if (doc.companyRef?._ref === dupId || doc.companyRef?._ref === `account-${dupKey}`) {
            patch['companyRef'] = { _type: 'reference', _ref: canonicalId }
          }
          if (Object.keys(patch).length > 0) {
            await client.patch(doc._id).set(patch).commit()
          }
        }

        // Merge duplicate account data into canonical (best fields)
        const fullCanonical = (await client.fetch(`*[_id == $id][0]`, { id: canonicalId })) as AccountDoc
        const merged: Record<string, any> = { ...fullCanonical }
        if (dup.companyName && (!merged.companyName || dup.companyName.length > (merged.companyName || '').length)) merged.companyName = dup.companyName
        if (dup.name && (!merged.name || dup.name.length > (merged.name || '').length)) merged.name = dup.name
        if (dup.canonicalUrl && (!merged.canonicalUrl || dup.canonicalUrl.length > (merged.canonicalUrl || '').length)) merged.canonicalUrl = dup.canonicalUrl
        if (dup.industry && !merged.industry) merged.industry = dup.industry
        if (dup.opportunityScore != null && (merged.opportunityScore == null || dup.opportunityScore > merged.opportunityScore)) merged.opportunityScore = dup.opportunityScore
        if (dup.technologyStack && typeof dup.technologyStack === 'object') {
          merged.technologyStack = { ...(merged.technologyStack || {}), ...dup.technologyStack }
        }
        if (dup.leadership?.length) {
          const existingRefs = new Set((merged.leadership || []).map((l: { _ref: string }) => l._ref))
          for (const ref of dup.leadership) {
            if (ref._ref && !existingRefs.has(ref._ref)) {
              existingRefs.add(ref._ref)
              ;(merged.leadership = merged.leadership || []).push(ref)
            }
          }
        }
        await client.createOrReplace({ ...merged, _id: canonicalId })

        // Delete duplicate account and its pack
        try {
          await client.delete(dupId)
        } catch (e) {
          console.warn(`Could not delete account ${dupId}:`, (e as Error).message)
        }
        const packId = `accountPack-${dupKey}`
        try {
          await client.delete(packId)
        } catch {
          // pack may not exist
        }
      }

      console.log(`${dryRun ? '[dry-run] ' : ''}Merged ${dupId} (${dupKey}) into ${canonicalId} (${canonicalKey}) for domain ${domain}. Updated ${refDocs.filter((d) => d._id !== dupId).length} refs.`)
      processed++
    }
  }

  console.log(`Done. ${dryRun ? 'Dry run.' : `Processed ${processed} duplicate(s).`}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
