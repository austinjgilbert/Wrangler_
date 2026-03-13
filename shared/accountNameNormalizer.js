/**
 * Account name normalizer — shared logic for consistent display names.
 * Used when creating/updating accounts so name and companyName are clean
 * and common across all displays. Kept in sync with sanity/scripts/normalize-account-names.ts.
 */

const OVERRIDES = {
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
};

const SPLIT_SUFFIXES = [
  'advisors', 'american', 'atlantic', 'auctions', 'closets', 'corporation',
  'direct', 'global', 'group', 'health', 'hotel', 'industries', 'lift',
  'markets', 'network', 'networks', 'outlet', 'plaza', 'point', 'report',
  'residential', 'rock', 'sacramento', 'scripts', 'security', 'services',
  'solutions', 'software', 'space', 'teeter', 'travel',
];

function normalizeWhitespace(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function stripAccountPrefix(value) {
  return String(value || '').replace(/^account[.-]/i, '');
}

function stripDomainTld(value) {
  const withoutProtocol = String(value || '')
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '');
  const parts = withoutProtocol.split('.');
  if (parts.length <= 1) return withoutProtocol;
  return parts.slice(0, -1).join('.').replace(/\.com$/i, '');
}

function extractPrimaryDomainLabel(value) {
  const host = String(value || '')
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .trim()
    .toLowerCase();
  const parts = host.split('.').filter(Boolean);
  if (parts.length === 0) return host;
  if (parts.length === 1) return parts[0];
  if (parts.length >= 3 && ['com', 'co'].includes(parts[parts.length - 2])) {
    return parts[parts.length - 3];
  }
  return parts[parts.length - 2];
}

function titleCase(value) {
  return String(value || '')
    .split(' ')
    .filter(Boolean)
    .map((part) => {
      if (/^[0-9]+$/.test(part)) return part;
      if (/^[A-Z0-9&-]+$/.test(part)) return part;
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    })
    .join(' ');
}

function splitKnownSuffixes(token) {
  let current = String(token || '');
  for (const suffix of SPLIT_SUFFIXES) {
    const pattern = new RegExp(`([a-z0-9])(${suffix})$`, 'i');
    if (pattern.test(current)) {
      current = current.replace(pattern, '$1 $2');
    }
  }
  return current;
}

/**
 * Derive a single common display name from account-like fields.
 * @param {object} account - { companyName?, name?, domain?, rootDomain?, accountKey?, _id? }
 * @returns {string} - Normalized display name for both name and companyName
 */
function deriveCommonName(account) {
  if (!account || typeof account !== 'object') return '';
  const rawCurrent = normalizeWhitespace(account.companyName || account.name);
  const domainSource = normalizeWhitespace(
    account.domain || account.rootDomain || account.accountKey || stripAccountPrefix(account._id || '')
  );
  const lowerDomain = domainSource.toLowerCase();
  const currentWithoutPreview = rawCurrent.replace(/\s+open\s+.+?\s+preview$/i, '').trim();

  if (lowerDomain === 'localhost') return 'Localhost';

  if (lowerDomain.endsWith('.vercel.app')) {
    const subdomain = lowerDomain.replace(/\.vercel\.app$/, '');
    const meaningful = subdomain
      .split('-')
      .filter((part) => part && !/[0-9]/.test(part))
      .slice(0, 3)
      .join(' ');
    const meaningfulKey = meaningful.replace(/[^a-z0-9]+/g, '');
    return OVERRIDES[meaningfulKey] || titleCase(meaningful || 'Vercel');
  }

  if (lowerDomain.endsWith('.lightning.force.com') && currentWithoutPreview) {
    return currentWithoutPreview;
  }

  const currentKey = currentWithoutPreview.toLowerCase().replace(/[^a-z0-9]+/g, '');
  if (currentKey && OVERRIDES[currentKey]) return OVERRIDES[currentKey];

  const primaryDomainLabel = extractPrimaryDomainLabel(domainSource);
  const baseSource = currentWithoutPreview || primaryDomainLabel || stripDomainTld(domainSource);
  const stripped = stripAccountPrefix(stripDomainTld(baseSource))
    .replace(/[^a-zA-Z0-9._ -]+/g, ' ')
    .replace(/[._-]+/g, ' ')
    .replace(/([a-z])([0-9])/g, '$1 $2')
    .replace(/([0-9])([a-z])/g, '$1 $2');

  const pieces = normalizeWhitespace(stripped)
    .split(' ')
    .flatMap((piece) => splitKnownSuffixes(piece).split(' '))
    .filter(Boolean);

  const derivedKey = pieces.join('').toLowerCase().replace(/[^a-z0-9]+/g, '');
  if (derivedKey && OVERRIDES[derivedKey]) return OVERRIDES[derivedKey];

  const titled = titleCase(pieces.join(' '));
  return titled || currentWithoutPreview || titleCase(primaryDomainLabel) || titleCase(domainSource) || (account._id || '');
}

/**
 * Normalize account display name from account-like fields.
 * Use when creating or updating account documents so name/companyName are consistent.
 * @param {object} account - { companyName?, name?, domain?, rootDomain?, accountKey?, _id? }
 * @returns {string} - Single display name to use for both name and companyName
 */
function normalizeAccountDisplayName(account) {
  const name = deriveCommonName(account);
  return name ? normalizeWhitespace(name) : '';
}

export {
  normalizeWhitespace,
  normalizeAccountDisplayName,
  deriveCommonName,
};
