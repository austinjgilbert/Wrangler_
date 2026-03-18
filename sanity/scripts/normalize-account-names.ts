import { getCliClient } from 'sanity/cli'

type AccountDoc = {
  _id: string
  name?: string
  companyName?: string
  domain?: string
  rootDomain?: string
  accountKey?: string
}

const API_VERSION = '2026-03-11'

const OVERRIDES: Record<string, string> = {
  '99designs': '99designs',
  'a10networks': 'A10 Networks',
  'acvauctions': 'ACV Auctions',
  'agf': 'AGF',
  'autopoint': 'AutoPoint',
  'arbys': "Arby's",
  'bdainc': 'BDA Inc',
  'benjerry': "Ben & Jerry's",
  'benjerrys': "Ben & Jerry's",
  'blackrock': 'BlackRock',
  'bleacherreport': 'Bleacher Report',
  'blindstogo': 'Blinds To Go',
  'bluenile': 'Blue Nile',
  'bradyid': 'BradyID',
  'brinkshome': 'Brinks Home',
  'burtsbees': "Burt's Bees",
  'calamp': 'CalAmp',
  'californiaclosets': 'California Closets',
  'camh': 'CAMH',
  'castlighthealth': 'Castlight Health',
  'cfindustries': 'CF Industries',
  'cirquedusoleil': 'Cirque du Soleil',
  'controlcase': 'ControlCase',
  'crshireright': 'CRS HireRight',
  'datarobot': 'DataRobot',
  'dovercorporation': 'Dover Corporation',
  'ebscoind': 'EBSCO Information Services',
  'ecisolutions': 'ECI Solutions',
  'envoyco': 'Envoy Co',
  'expressscripts': 'Express Scripts',
  'extraspace': 'Extra Space',
  'dxc': 'DXC',
  'fairpoint': 'FairPoint',
  'fbngp': 'FBNGP',
  'fishnetsecurity': 'FishNet Security',
  'flightnetwork': 'Flight Network',
  'fnf': 'FNF',
  'footjoy': 'FootJoy',
  'freshdirect': 'FreshDirect',
  'fs': 'FS',
  'fsresidential': 'FS Residential',
  'fullcontact': 'FullContact',
  'gapinc': 'Gap Inc',
  'gatewaytravelplaza': 'Gateway Travel Plaza',
  'gcaglobal': 'GCA Global',
  'genielift': 'Genie Lift',
  'groceryoutlet': 'Grocery Outlet',
  'groupm': 'GroupM',
  'guidancesoftware': 'Guidance Software',
  'hardrockhotelatlanticcity': 'Hard Rock Hotel Atlantic City',
  'hardrockhotelsacramento': 'Hard Rock Hotel Sacramento',
  'harveynorman': 'Harvey Norman',
  'hashicorp': 'HashiCorp',
  'healthmarkets': 'HealthMarkets',
  'heb': 'H-E-B',
  'henryschein': 'Henry Schein',
  'hightoweradvisors': 'Hightower Advisors',
  'levistrauss': 'Levi Strauss',
  'medxm': 'MedXM',
  'medxm1': 'MedXM',
  'operatorconsoleaustingilbert': 'Operator Console',
  'rapid7': 'Rapid7',
  'riversidemedgroup': 'Riverside Med Group',
  'ssmhealth': 'SSM Health',
  'staplesadvantage': 'Staples Advantage',
  'tailoredbrands': 'Tailored Brands',
  'acpny': 'ACPNY',
  'unitedhealthgroup': 'UnitedHealth Group',
}

const SPLIT_SUFFIXES = [
  'advisors',
  'american',
  'atlantic',
  'auctions',
  'closets',
  'corporation',
  'direct',
  'global',
  'group',
  'health',
  'hotel',
  'industries',
  'lift',
  'markets',
  'network',
  'networks',
  'outlet',
  'plaza',
  'point',
  'report',
  'residential',
  'rock',
  'sacramento',
  'scripts',
  'security',
  'services',
  'solutions',
  'software',
  'space',
  'teeter',
  'travel',
]

function normalizeWhitespace(value?: string) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
}

function stripAccountPrefix(value: string) {
  return value.replace(/^account[.-]/i, '')
}

function stripDomainTld(value: string) {
  const withoutProtocol = value
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')

  const parts = withoutProtocol.split('.')
  if (parts.length <= 1) return withoutProtocol
  return parts.slice(0, -1).join('.').replace(/\.com$/i, '')
}

function extractPrimaryDomainLabel(value: string) {
  const host = value
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .trim()
    .toLowerCase()

  const parts = host.split('.').filter(Boolean)
  if (parts.length === 0) return host
  if (parts.length === 1) return parts[0]
  if (parts.length >= 3 && ['com', 'co'].includes(parts[parts.length - 2])) {
    return parts[parts.length - 3]
  }
  return parts[parts.length - 2]
}

function titleCase(value: string) {
  return value
    .split(' ')
    .filter(Boolean)
    .map((part) => {
      if (/^[0-9]+$/.test(part)) return part
      if (/^[A-Z0-9&-]+$/.test(part)) return part
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
    })
    .join(' ')
}

function normalizeComparable(value?: string) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
}

function splitKnownSuffixes(token: string) {
  let current = token

  for (const suffix of SPLIT_SUFFIXES) {
    const pattern = new RegExp(`([a-z0-9])(${suffix})$`, 'i')
    if (pattern.test(current)) {
      current = current.replace(pattern, '$1 $2')
    }
  }

  return current
}

function deriveCommonName(account: AccountDoc) {
  const rawCurrent = normalizeWhitespace(account.companyName || account.name)
  const domainSource = normalizeWhitespace(account.domain || account.rootDomain || account.accountKey || stripAccountPrefix(account._id))
  const lowerDomain = domainSource.toLowerCase()
  const currentWithoutPreview = rawCurrent.replace(/\s+open\s+.+?\s+preview$/i, '').trim()

  if (lowerDomain === 'localhost') {
    return 'Localhost'
  }

  if (lowerDomain.endsWith('.vercel.app')) {
    const subdomain = lowerDomain.replace(/\.vercel\.app$/, '')
    const meaningful = subdomain
      .split('-')
      .filter((part) => part && !/[0-9]/.test(part))
      .slice(0, 3)
      .join(' ')
    const meaningfulKey = meaningful.replace(/[^a-z0-9]+/g, '')
    return OVERRIDES[meaningfulKey] || titleCase(meaningful || 'Vercel')
  }

  if (lowerDomain.endsWith('.lightning.force.com') && currentWithoutPreview) {
    return currentWithoutPreview
  }

  const currentKey = currentWithoutPreview.toLowerCase().replace(/[^a-z0-9]+/g, '')
  if (currentKey && OVERRIDES[currentKey]) {
    return OVERRIDES[currentKey]
  }

  const primaryDomainLabel = extractPrimaryDomainLabel(domainSource)
  const baseSource = currentWithoutPreview || primaryDomainLabel || stripDomainTld(domainSource)
  const stripped = stripAccountPrefix(stripDomainTld(baseSource))
    .replace(/[^a-zA-Z0-9._ -]+/g, ' ')
    .replace(/[._-]+/g, ' ')
    .replace(/([a-z])([0-9])/g, '$1 $2')
    .replace(/([0-9])([a-z])/g, '$1 $2')

  const pieces = normalizeWhitespace(stripped)
    .split(' ')
    .flatMap((piece) => splitKnownSuffixes(piece).split(' '))
    .filter(Boolean)

  const derivedKey = pieces.join('').toLowerCase().replace(/[^a-z0-9]+/g, '')
  if (derivedKey && OVERRIDES[derivedKey]) {
    return OVERRIDES[derivedKey]
  }

  const titled = titleCase(pieces.join(' '))
  return titled || currentWithoutPreview || titleCase(primaryDomainLabel) || titleCase(domainSource) || account._id
}

function getAuditIssues(account: AccountDoc, nextName: string) {
  const currentName = normalizeWhitespace(account.name)
  const currentCompanyName = normalizeWhitespace(account.companyName)
  const currentDisplay = currentCompanyName || currentName
  const domain = normalizeWhitespace(account.domain || account.rootDomain)
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
      const nextName = deriveCommonName(account)
      const currentName = account.name
      const currentCompanyName = account.companyName

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
        const nextName = deriveCommonName(account)
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
