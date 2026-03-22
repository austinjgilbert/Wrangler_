/**
 * Cloudflare Worker: Website Scanner API
 * Provides tech stack detection and basic website analysis
 */

import {
  BLOCKED_HOSTS,
  BLOCKED_TLDS,
  ALLOWED_HEADERS,
  MAX_HTML_SIZE,
  HTML_SNIPPET_SIZE,
  MAX_SCRIPTS,
  MAX_LINKS,
  SITEMAP_SNIPPET_SIZE,
  BATCH_MAX_URLS_LIGHT,
  BATCH_MAX_URLS_FULL,
  BATCH_CONCURRENCY_LIGHT,
  BATCH_CONCURRENCY_FULL,
  BATCH_FETCH_TIMEOUT_MS_LIGHT,
  BATCH_FETCH_TIMEOUT_MS_FULL,
  BATCH_MAX_HTML_SIZE,
} from './config/constants.js';

/**
 * Get browser-like headers to bypass Cloudflare bot protection
 */
function getBrowserHeaders(referer = null) {
  // Use a modern Chrome user agent (most common, least likely to be blocked)
  const userAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
  
  const headers = {
    'User-Agent': userAgent,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'identity',
    'DNT': '1',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': referer ? 'same-origin' : 'none',
    'Sec-Fetch-User': '?1',
    'Cache-Control': 'max-age=0',
  };
  
  if (referer) {
    headers['Referer'] = referer;
  }
  
  return headers;
}

/**
 * Get LinkedIn-optimized headers (more human-like for LinkedIn bot protection)
 * Enhanced to bypass 999 status code (bot protection)
 */
function getLinkedInHeaders(referer = null) {
  // Use a realistic, recent Chrome user agent (updated to latest)
  const userAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
  
  // Generate a realistic viewport width
  const viewportWidth = Math.floor(Math.random() * 200) + 1920; // 1920-2120
  
  const headers = {
    'User-Agent': userAgent,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'identity',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': referer ? 'same-origin' : 'none',
    'Sec-Fetch-User': '?1',
    'Cache-Control': 'max-age=0',
    'sec-ch-ua': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"macOS"',
    'sec-ch-ua-platform-version': '"14.0.0"',
    'sec-ch-ua-arch': '"x86"',
    'sec-ch-ua-bitness': '"64"',
    'sec-ch-ua-model': '""',
    'sec-ch-ua-full-version': '"131.0.6778.85"',
    'sec-ch-ua-full-version-list': '"Google Chrome";v="131.0.6778.85", "Chromium";v="131.0.6778.85", "Not_A Brand";v="24.0.0.0"',
    'Viewport-Width': viewportWidth.toString(),
    'Width': viewportWidth.toString(),
    'DNT': '1',
    'Pragma': 'no-cache',
  };
  
  // Set referer - LinkedIn is very sensitive to this
  if (referer) {
    headers['Referer'] = referer;
  } else {
    // Simulate coming from Google search (most common way people find LinkedIn profiles)
    headers['Referer'] = 'https://www.google.com/search?q=linkedin';
  }
  
  // Add Origin header (LinkedIn checks this)
  headers['Origin'] = 'https://www.linkedin.com';
  
  return headers;
}

function clampArray(arr, max) {
  if (!Array.isArray(arr)) return [];
  return arr.length > max ? arr.slice(0, max) : arr;
}

async function fetchWithTimeout(resource, options, timeoutMs) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(resource, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (true) {
      const i = nextIndex++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  }

  const workers = [];
  const workerCount = Math.max(1, Math.min(limit, items.length));
  for (let i = 0; i < workerCount; i++) workers.push(worker());
  await Promise.all(workers);
  return results;
}

/**
 * Lightweight scan used by /scan-batch to avoid Worker resource limits.
 * - Single fetch per URL (no robots/sitemap/job crawling)
 * - Smaller HTML read limit
 * - Capped script/link extraction
 */
async function scanUrlLight(targetUrl, opts) {
  const { timeoutMs, includeHtmlSnippet } = opts;

  // Import required services
  const { detectTechnologyStack } = await import('./services/tech-detector.js');
  const { calculateAIReadinessScore } = await import('./services/ai-readiness.js');
  const { analyzePerformance } = await import('./services/performance-analyzer.js');
  const { analyzeBusinessScale, detectBusinessUnits } = await import('./services/business-analyzer.js');

  const validation = validateUrl(targetUrl);
  if (!validation.valid) {
    return { url: targetUrl, success: false, error: validation.error };
  }

  const inputUrl = validation.url;
  const fetchedAt = new Date().toISOString();

  try {
    const browserHeaders = getBrowserHeaders();
    const response = await fetchWithTimeout(
      inputUrl,
      { method: 'GET', redirect: 'follow', headers: browserHeaders },
      timeoutMs
    );

    const finalUrl = response.url;
    const status = response.status;
    const headers = extractAllowedHeaders(response.headers);
    const contentType = response.headers.get('content-type') || '';

    let html = '';
    let generator = null;
    let scriptSrcs = [];
    let linkHrefs = [];

    if (contentType.includes('text/html') && response.ok) {
      html = await readHtmlWithLimit(response, BATCH_MAX_HTML_SIZE);
      generator = extractGenerator(html);
      scriptSrcs = clampArray(extractScriptSrcs(html), 60);
      linkHrefs = clampArray(extractLinkHrefs(html), 60);
    }

    // Minimal objects for batch mode
    const techStack = html
      ? detectTechnologyStack(html, headers, scriptSrcs, linkHrefs, generator)
      : { cms: [], frameworks: [], legacySystems: [], opportunityScore: 0, headlessIndicators: [] };

    const businessUnits = html
      ? detectBusinessUnits(html, extractNavigationLinks(html, finalUrl), finalUrl)
      : { detectedAreas: [], subdomains: [], separateProperties: [], siloIndicators: [], totalAreas: 0 };

    const digitalGoals = { initiatives: [], technologyFocus: [], growthIndicators: [], strategicProjects: [], digitalTransformationSignals: [] };
    const jobAnalysis = { careersPageFound: false, careersPageUrl: null, recentHires: [], digitalContentRoles: [], infrastructureRoles: [], roleBaselines: { cLevel: [], vp: [], director: [], manager: [] }, totalJobsFound: 0 };

    // No extra fetches in light scan
    const sitemapChecks = [];
    const businessScale = analyzeBusinessScale(html || '', headers, scriptSrcs, linkHrefs, sitemapChecks, businessUnits);
    const performance = analyzePerformance(response, headers, html || '', scriptSrcs, linkHrefs, finalUrl);
    const aiReadiness = calculateAIReadinessScore(techStack, digitalGoals, businessUnits, jobAnalysis);
    const digitalMaturity = calculateDigitalMaturityScore({
      aiReadiness,
      performance,
      technologyStack: techStack,
      businessScale,
    });

    const data = {
      input: inputUrl,
      finalUrl,
      status,
      headers,
      generator,
      scriptSrcs,
      linkHrefs,
      technologyStack: techStack,
      businessUnits,
      digitalGoals,
      jobAnalysis,
      aiReadiness,
      businessScale,
      performance,
      digitalMaturity,
      fetchedAt,
    };

    if (includeHtmlSnippet) {
      data.htmlSnippet = (html || '').substring(0, HTML_SNIPPET_SIZE);
    }

    return { url: targetUrl, success: true, data };
  } catch (err) {
    const message =
      err && err.name === 'AbortError'
        ? `Fetch timeout after ${timeoutMs}ms`
        : (err?.message || 'Failed to fetch URL');
    return { url: targetUrl, success: false, error: message };
  }
}

function clampNumber(n, min, max) {
  if (typeof n !== 'number' || Number.isNaN(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function getStackSignature(technologyStack) {
  const legacy = Array.isArray(technologyStack?.legacySystems) ? technologyStack.legacySystems : [];
  const cms = Array.isArray(technologyStack?.cms) ? technologyStack.cms : [];
  const frameworks = Array.isArray(technologyStack?.frameworks) ? technologyStack.frameworks : [];

  if (legacy.length > 0) return { type: 'legacy', name: legacy[0] };
  if (cms.length > 0) return { type: 'headless_or_modern_cms', name: cms[0] };
  if (frameworks.length > 0) return { type: 'frontend_framework', name: frameworks[0] };
  return { type: 'unknown', name: 'unknown' };
}

function calculateDigitalMaturityScore({ aiReadiness, performance, technologyStack, businessScale }) {
  const ai = clampNumber(aiReadiness?.score ?? 0, 0, 100);
  const perf = clampNumber(performance?.performanceScore ?? 0, 0, 100);
  const scale = clampNumber(businessScale?.scaleScore ?? 0, 0, 100);

  // Modernity score (0-100) from tech indicators
  let modern = 50;
  const legacyCount = Array.isArray(technologyStack?.legacySystems) ? technologyStack.legacySystems.length : 0;
  const cmsCount = Array.isArray(technologyStack?.cms) ? technologyStack.cms.length : 0;
  const fwCount = Array.isArray(technologyStack?.frameworks) ? technologyStack.frameworks.length : 0;

  if (fwCount > 0) modern += 15;
  if (cmsCount > 0) modern += 15;
  if (legacyCount > 0) modern -= 25;

  // Extra penalty if explicit duplication or silos show up
  const duplicationCount = Array.isArray(technologyStack?.systemDuplication) ? technologyStack.systemDuplication.length : 0;
  if (duplicationCount > 0) modern -= 10;

  modern = clampNumber(modern, 0, 100);

  // Weighted digital maturity score (0-100)
  const score = clampNumber(
    Math.round(0.35 * perf + 0.35 * ai + 0.20 * modern + 0.10 * scale),
    0,
    100
  );

  let level = 'Average';
  if (score >= 75) level = 'Leading';
  else if (score >= 60) level = 'Above Average';
  else if (score >= 40) level = 'Below Average';
  else level = 'Lagging';

  const drivers = [];
  drivers.push({ factor: 'Performance', value: perf, note: perf >= 70 ? 'Good speed/UX signals' : 'Speed/UX gaps likely' });
  drivers.push({ factor: 'AI Readiness', value: ai, note: ai >= 60 ? 'Good platform readiness signals' : 'AI readiness gaps' });
  drivers.push({ factor: 'Tech Modernity', value: modern, note: legacyCount > 0 ? 'Legacy signals reduce agility' : 'Modern stack signals' });
  drivers.push({ factor: 'Scale Signals', value: scale, note: 'Scale influences digital expectations' });

  const signature = getStackSignature(technologyStack);

  return {
    score,
    level,
    components: { performance: perf, aiReadiness: ai, modernity: modern, scale: scale },
    stackSignature: signature,
    explanation:
      `Digital maturity is a weighted score of performance (${perf}), AI readiness (${ai}), technology modernity (${modern}), and scale signals (${scale}). ` +
      `This is a directional benchmark for comparing similar peers, not a financial estimate.`,
    drivers,
  };
}

function buildPeerCohortKey(resultData) {
  const scale = resultData?.businessScale?.businessScale || 'Unknown';
  const signature = getStackSignature(resultData?.technologyStack);
  // Group by scale + stack type (more stable than vendor names)
  return `${scale}|${signature.type}`;
}

function computePeerComparisons(successfulScans) {
  // successfulScans: [{ url, data, digitalMaturityScore? }, ...]
  const items = successfulScans.map((s) => {
    const dm = s.data?.digitalMaturity;
    const score = typeof dm?.score === 'number' ? dm.score : 0;
    const cohortKey = buildPeerCohortKey(s.data);
    return { url: s.url, score, cohortKey };
  });

  const cohorts = new Map();
  for (const item of items) {
    if (!cohorts.has(item.cohortKey)) cohorts.set(item.cohortKey, []);
    cohorts.get(item.cohortKey).push(item);
  }

  const cohortSummaries = [];
  const perUrl = new Map();

  for (const [cohortKey, list] of cohorts.entries()) {
    const sorted = list.slice().sort((a, b) => b.score - a.score);
    const avg = sorted.reduce((acc, x) => acc + x.score, 0) / Math.max(1, sorted.length);

    cohortSummaries.push({
      cohortKey,
      count: sorted.length,
      averageDigitalMaturityScore: Math.round(avg),
      topUrls: sorted.slice(0, 3).map((x) => x.url),
    });

    for (let i = 0; i < sorted.length; i++) {
      const item = sorted[i];
      const percentile = sorted.length <= 1 ? 1 : (sorted.length - i - 1) / (sorted.length - 1); // 0..1, higher=better
      const deltaFromAvg = item.score - avg;

      let relative = 'At parity';
      if (percentile >= 0.67 || deltaFromAvg >= 7) relative = 'Ahead';
      else if (percentile <= 0.33 || deltaFromAvg <= -7) relative = 'Behind';

      // Near peers: closest scores within cohort
      const others = sorted.filter((x) => x.url !== item.url);
      others.sort((a, b) => Math.abs(a.score - item.score) - Math.abs(b.score - item.score));
      const nearPeers = others.slice(0, 3).map((x) => ({ url: x.url, digitalMaturityScore: x.score }));

      perUrl.set(item.url, {
        cohortKey,
        cohortSize: sorted.length,
        cohortAverageDigitalMaturityScore: Math.round(avg),
        percentile: Math.round(percentile * 100),
        deltaFromCohortAverage: Math.round(deltaFromAvg),
        relativeRating: relative,
        nearPeers,
      });
    }
  }

  cohortSummaries.sort((a, b) => b.count - a.count);
  return { cohortSummaries, perUrl };
}

/**
 * Check if URL is blocked for SSRF protection
 */
function isBlockedUrl(url) {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.toLowerCase();

    // Check blocked hosts
    if (BLOCKED_HOSTS.includes(hostname)) {
      return true;
    }

    // Check blocked TLDs
    for (const tld of BLOCKED_TLDS) {
      if (hostname.endsWith(tld)) {
        return true;
      }
    }

    // Block private IP ranges (RFC 1918 + link-local)
    if (isPrivateIP(hostname)) {
      return true;
    }

    return false;
  } catch (e) {
    return true; // Invalid URL is blocked
  }
}

/**
 * Check if hostname is a private/reserved IP address
 * Covers RFC 1918 (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16),
 * link-local (169.254.0.0/16), and loopback (127.0.0.0/8)
 */
function isPrivateIP(hostname) {
  // Must look like an IPv4 address
  const parts = hostname.split('.');
  if (parts.length !== 4) return false;
  
  const octets = parts.map(Number);
  if (octets.some(n => isNaN(n) || n < 0 || n > 255)) return false;
  
  const [a, b] = octets;
  
  // 10.0.0.0/8
  if (a === 10) return true;
  // 172.16.0.0/12 (172.16.x.x - 172.31.x.x)
  if (a === 172 && b >= 16 && b <= 31) return true;
  // 192.168.0.0/16
  if (a === 192 && b === 168) return true;
  // 127.0.0.0/8 (loopback)
  if (a === 127) return true;
  // 169.254.0.0/16 (link-local)
  if (a === 169 && b === 254) return true;
  // 0.0.0.0/8
  if (a === 0) return true;
  
  return false;
}

/**
 * Validate and normalize URL
 */
function validateUrl(urlString) {
  if (!urlString || typeof urlString !== 'string') {
    return { valid: false, error: 'URL parameter is required' };
  }

  try {
    // Add protocol if missing
    let normalized = urlString.trim();
    if (!normalized.startsWith('http://') && !normalized.startsWith('https://')) {
      normalized = 'https://' + normalized;
    }

    const url = new URL(normalized);

    // Only allow http/https
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return { valid: false, error: 'Only http and https protocols are allowed' };
    }

    // Require a hostname with a dot to avoid invalid hostnames
    if (!url.hostname || !url.hostname.includes('.')) {
      return { valid: false, error: 'Invalid URL format' };
    }

    // Check SSRF protection
    if (isBlockedUrl(normalized)) {
      return { valid: false, error: 'URL is blocked for security reasons' };
    }

    return { valid: true, url: normalized };
  } catch (e) {
    return { valid: false, error: 'Invalid URL format' };
  }
}

/**
 * Extract allowed headers from response
 */
function extractAllowedHeaders(headers) {
  const result = {};
  for (const key of ALLOWED_HEADERS) {
    const value = headers.get(key);
    if (value) {
      result[key] = value;
    }
  }
  return result;
}

/**
 * Extract generator meta tag from HTML
 */
function extractGenerator(html) {
  const generatorRegex = /<meta\s+name=["']generator["']\s+content=["']([^"']+)["']/i;
  const match = html.match(generatorRegex);
  return match ? match[1] : null;
}

/**
 * Extract script srcs from HTML
 */
function extractScriptSrcs(html) {
  const scriptRegex = /<script[^>]+src=["']([^"']+)["']/gi;
  const srcs = new Set();
  let match;
  let count = 0;

  while ((match = scriptRegex.exec(html)) !== null && count < MAX_SCRIPTS) {
    srcs.add(match[1]);
    count++;
  }

  return Array.from(srcs).slice(0, MAX_SCRIPTS);
}

/**
 * Extract link hrefs from HTML
 */
function extractLinkHrefs(html) {
  const linkRegex = /<link[^>]+href=["']([^"']+)["']/gi;
  const hrefs = new Set();
  let match;
  let count = 0;

  while ((match = linkRegex.exec(html)) !== null && count < MAX_LINKS) {
    hrefs.add(match[1]);
    count++;
  }

  return Array.from(hrefs).slice(0, MAX_LINKS);
}

/**
 * Extract navigation and footer links from HTML
 */
function extractNavigationLinks(html, baseUrl) {
  const links = new Set();
  
  // Extract from <a> tags in nav, footer, and header
  const navRegex = /<(nav|footer|header)[^>]*>[\s\S]*?<\/\1>/gi;
  let navMatch;
  
  while ((navMatch = navRegex.exec(html)) !== null) {
    const navContent = navMatch[0];
    const linkRegex = /<a[^>]+href=["']([^"']+)["']/gi;
    let linkMatch;
    
    while ((linkMatch = linkRegex.exec(navContent)) !== null) {
      const href = linkMatch[1];
      if (href && !href.startsWith('#') && !href.startsWith('javascript:')) {
        try {
          // Resolve relative URLs
          const url = new URL(href, baseUrl);
          links.add(url.href);
        } catch (e) {
          // Invalid URL, skip
        }
      }
    }
  }
  
  // Also extract all <a> tags for broader coverage
  const allLinksRegex = /<a[^>]+href=["']([^"']+)["']/gi;
  let allMatch;
  let count = 0;
  
  while ((allMatch = allLinksRegex.exec(html)) !== null && count < 200) {
    const href = allMatch[1];
    if (href && !href.startsWith('#') && !href.startsWith('javascript:')) {
      try {
        const url = new URL(href, baseUrl);
        links.add(url.href);
        count++;
      } catch (e) {
        // Invalid URL, skip
      }
    }
  }
  
  return Array.from(links).slice(0, 200);
}


/**
 * Detect CMS and technology stack (delegates to services/tech-detector.js)
 */
async function detectTechnologyStack(html, headers, scriptSrcs, linkHrefs, generator) {
  const { detectTechnologyStack: detectTech } = await import('./services/tech-detector.js');
  return detectTech(html, headers, scriptSrcs, linkHrefs, generator);
}

/**
 * Extract robots.txt URL and check for sitemap references
 */
function extractRobotsInfo(html, baseUrl) {
  try {
    const base = new URL(baseUrl);
    const robotsUrl = `${base.origin}/robots.txt`;
    return { robotsUrl, robotsPresent: null }; // Will be checked separately
  } catch (e) {
    return { robotsUrl: null, robotsPresent: null };
  }
}

/**
 * Fetch robots.txt and extract sitemap URLs
 */
async function fetchRobotsInfo(robotsUrl) {
  try {
      const response = await fetchWithTimeout(
        robotsUrl,
        {
          method: 'GET',
          redirect: 'follow',
          headers: getBrowserHeaders(),
        },
        5000 // 5 second timeout
      );

    if (!response.ok) {
      return { robotsPresent: false, sitemapUrls: [] };
    }

    const text = await response.text();
    const sitemapLines = text
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.toLowerCase().startsWith('sitemap:'))
      .map(line => line.substring(8).trim())
      .filter(url => url.length > 0);

    return { robotsPresent: true, sitemapUrls: sitemapLines };
  } catch (e) {
    return { robotsPresent: false, sitemapUrls: [] };
  }
}

/**
 * Check sitemap candidates
 */
async function checkSitemaps(baseUrl, sitemapUrlsFromRobots) {
  const sitemapCandidates = [];

  // Add sitemaps from robots.txt
  for (const url of sitemapUrlsFromRobots.slice(0, 3)) {
    sitemapCandidates.push(url);
  }

  // Add default candidates if we have room
  if (sitemapCandidates.length < 3) {
    try {
      const base = new URL(baseUrl);
      const defaults = [
        `${base.origin}/sitemap.xml`,
        `${base.origin}/sitemap_index.xml`,
        `${base.origin}/sitemap-index.xml`,
      ];

      for (const url of defaults) {
        if (sitemapCandidates.length >= 3) break;
        if (!sitemapCandidates.includes(url)) {
          sitemapCandidates.push(url);
        }
      }
    } catch (e) {
      // Invalid base URL, skip defaults
    }
  }

  // Fetch up to 3 sitemaps
  const results = [];
  for (const url of sitemapCandidates.slice(0, 3)) {
    try {
      const response = await fetch(url, {
        method: 'GET',
        redirect: 'follow',
        headers: getBrowserHeaders(baseUrl),
      });

      const contentType = response.headers.get('content-type') || '';
      let snippet = '';

      if (response.ok) {
        const text = await response.text();
        snippet = text.substring(0, SITEMAP_SNIPPET_SIZE);
      }

      results.push({
        url,
        ok: response.ok,
        status: response.status,
        contentType,
        snippet,
      });
    } catch (e) {
      results.push({
        url,
        ok: false,
        status: 0,
        contentType: '',
        snippet: '',
      });
    }
  }

  return results;
}

/**
 * Read HTML with size limit
 */
async function readHtmlWithLimit(response, maxSize) {
  const reader = response.body.getReader();
  const chunks = [];
  let totalSize = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      if (totalSize + value.length > maxSize) {
        // Add partial chunk to reach exactly maxSize
        const remaining = maxSize - totalSize;
        chunks.push(value.slice(0, remaining));
        totalSize = maxSize;
        break;
      }

      chunks.push(value);
      totalSize += value.length;
    }
  } finally {
    reader.releaseLock();
  }

  // Combine chunks
  const combined = new Uint8Array(totalSize);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.length;
  }

  // Decode as text
  const decoder = new TextDecoder('utf-8', { fatal: false });
  return decoder.decode(combined);
}

// ── CORS: Origin allowlist (mirrors src/utils/response.js) ───────────
// Request-scoped origin set by fetch handler before routing.
// Safe in CF Workers (single request per isolate).
let _reqOrigin = '';
let _reqEnv = null;

const _ALLOWED_ORIGINS = new Set([
  'https://website-scanner.austin-gilbert.workers.dev',
  'https://www.sanity.io',
  'chrome-extension://golckjfiiopfdidkohfmfdpeengneaip',
]);

function _isAllowedOrigin(origin, env) {
  if (!origin) return false;
  if (_ALLOWED_ORIGINS.has(origin)) return true;

  // Sanity SDK apps run in iframes — the origin may be any https://*.sanity.io or https://*.sanity.studio subdomain
  try {
    const url = new URL(origin);
    if (url.protocol === 'https:' && (url.hostname === 'sanity.io' || url.hostname.endsWith('.sanity.io') || url.hostname === 'sanity.studio' || url.hostname.endsWith('.sanity.studio'))) return true;
  } catch {}

  if (env?.ENVIRONMENT !== 'production' && origin.startsWith('http://localhost:')) return true;
  return false;
}

function _getCorsHeaders(existingHeaders) {
  const headers = new Headers(existingHeaders || {});
  if (_isAllowedOrigin(_reqOrigin, _reqEnv)) {
    headers.set('Access-Control-Allow-Origin', _reqOrigin);
  }
  headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  headers.set('Access-Control-Allow-Headers',
    'Content-Type, Authorization, X-Admin-Token, X-API-Key, X-Client-ID');
  headers.set('Access-Control-Max-Age', '86400');
  headers.set('Vary', 'Origin');
  return headers;
}

/**
 * Handle CORS preflight
 */
function handleCorsPreflight() {
  return new Response(null, {
    status: 204,
    headers: _getCorsHeaders(),
  });
}

/**
 * Add CORS headers to response
 */
function addCorsHeaders(response) {
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: _getCorsHeaders(response.headers),
  });
}

function shouldParsePromptForRequest(request, url) {
  if (!request || !url) return false;
  if (!['POST', 'PUT', 'PATCH'].includes(request.method)) return false;
  const contentType = request.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) return false;
  const path = url.pathname || '';
  return (
    path.startsWith('/molt') ||
    path.startsWith('/wrangler') ||
    path.startsWith('/operator/console/copilot') ||
    path.startsWith('/person/') ||
    path.startsWith('/account-plan/') ||
    path.startsWith('/research/')
  );
}

function shouldRunAutonomousEnrichmentForRequest(request, url, env) {
  if (env?.ENABLE_AUTONOMOUS_ENRICHMENT !== '1') return false;
  return shouldParsePromptForRequest(request, url);
}

/**
 * Validate HTTP method, returning a 405 response if it doesn't match.
 * Returns null if the method is valid.
 */
function requireMethod(request, method, requestId) {
  if (request.method === method) return null;
  return createErrorResponse(
    'METHOD_NOT_ALLOWED',
    `${method} method required`,
    { method: request.method },
    405,
    requestId
  );
}

/**
 * Generate a unique request ID
 */
function generateRequestId() {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * Generate URL hash for cache key
 */
function hashUrl(url) {
  // Simple hash function (for production, use crypto.subtle.digest)
  let hash = 0;
  for (let i = 0; i < url.length; i++) {
    const char = url.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(36);
}

/**
 * Calculate content hash (SHA-256 of mainText)
 */
async function calculateContentHash(text) {
  if (!text) return null;
  
  try {
    // Use Web Crypto API (available in Cloudflare Workers)
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex;
  } catch (e) {
    // Fallback to simple hash if crypto.subtle not available
    return hashUrl(text);
  }
}

/**
 * Cache interface with KV (if bound) and in-memory fallback
 */
class CacheInterface {
  constructor(env) {
    this.kv = env?.CACHE_KV || null;
    this.memoryCache = new Map(); // In-memory fallback
    this.ttl = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
  }
  
  async get(key) {
    // Try KV first
    if (this.kv) {
      try {
        const value = await this.kv.get(key, { type: 'json' });
        if (value) {
          let data;
          try {
            data = typeof value === 'string' ? JSON.parse(value) : value;
          } catch (e) {
            // Invalid JSON in cache, delete it
            await this.delete(key);
            return null;
          }
          // Check TTL
          if (data.expiresAt && Date.now() > data.expiresAt) {
            await this.delete(key); // Expired, delete it
            return null;
          }
          return data;
        }
      } catch (e) {
        // KV error, fall back to memory
      }
    }
    
    // Fall back to memory cache
    const cached = this.memoryCache.get(key);
    if (cached) {
      if (Date.now() > cached.expiresAt) {
        this.memoryCache.delete(key); // Expired
        return null;
      }
      return cached;
    }
    
    return null;
  }
  
  async set(key, value, ttl = null) {
    const expiresAt = Date.now() + (ttl || this.ttl);
    const data = { ...value, expiresAt, cachedAt: Date.now() };
    
    // Try KV first
    if (this.kv) {
      try {
        await this.kv.put(key, JSON.stringify(data), {
          expirationTtl: Math.floor((ttl || this.ttl) / 1000), // KV uses seconds
        });
        return true;
      } catch (e) {
        // KV error, fall back to memory
      }
    }
    
    // Fall back to memory cache
    this.memoryCache.set(key, data);
    return true;
  }
  
  async delete(key) {
    if (this.kv) {
      try {
        await this.kv.delete(key);
      } catch (e) {
        // Ignore errors
      }
    }
    this.memoryCache.delete(key);
  }
  
  async getMetadata(key) {
    const cached = await this.get(key);
    if (!cached) return null;
    
    const ageSec = Math.floor((Date.now() - cached.cachedAt) / 1000);
    return {
      hit: true,
      ageSec,
      contentHash: cached.contentHash || null,
      expiresAt: cached.expiresAt,
    };
  }
}

// Global cache instance (will be initialized with env in fetch handler)
let cacheInstance = null;

/**
 * Clean HTML text: remove scripts, styles, nav, footer, and normalize whitespace
 */
function cleanMainText(html) {
  if (!html) return '';
  
  // Remove script and style tags and their content
  let cleaned = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  cleaned = cleaned.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
  
  // Remove nav, footer, header elements (heuristic: common patterns)
  cleaned = cleaned.replace(/<(nav|footer|header)[^>]*>[\s\S]*?<\/\1>/gi, '');
  
  // Remove comments
  cleaned = cleaned.replace(/<!--[\s\S]*?-->/g, '');
  
  // Convert HTML entities to text
  cleaned = cleaned.replace(/&nbsp;/g, ' ');
  cleaned = cleaned.replace(/&amp;/g, '&');
  cleaned = cleaned.replace(/&lt;/g, '<');
  cleaned = cleaned.replace(/&gt;/g, '>');
  cleaned = cleaned.replace(/&quot;/g, '"');
  cleaned = cleaned.replace(/&#39;/g, "'");
  
  // Remove HTML tags
  cleaned = cleaned.replace(/<[^>]+>/g, ' ');
  
  // Normalize whitespace
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  
  return cleaned;
}

/**
 * Extract title from HTML
 */
function extractTitle(html) {
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (titleMatch) return titleMatch[1].trim();
  
  const h1Match = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
  if (h1Match) return h1Match[1].trim();
  
  return null;
}

/**
 * Extract site name from HTML (from meta tags or title)
 */
function extractSiteName(html, url) {
  // Try og:site_name
  const ogSiteMatch = html.match(/<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)["']/i);
  if (ogSiteMatch) return ogSiteMatch[1].trim();
  
  // Try title and extract first part
  const title = extractTitle(html);
  if (title) {
    const parts = title.split(/[|\-–—]/);
    if (parts.length > 0) return parts[0].trim();
  }
  
  // Fallback to domain
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

/**
 * Extract excerpts from cleaned text (at least 3 from different parts)
 */
function extractExcerpts(text, maxChars = 500) {
  if (!text || text.length === 0) return [];
  
  const excerpts = [];
  const textLength = text.length;
  const targetLength = Math.min(maxChars, Math.floor(textLength / 4));
  
  // Extract from beginning
  if (textLength > 0) {
    const start = text.substring(0, targetLength);
    const endIdx = Math.min(targetLength, start.lastIndexOf('.') + 1) || targetLength;
    excerpts.push({
      id: 'excerpt-1',
      text: text.substring(0, endIdx || targetLength).trim(),
      selectorHint: 'beginning',
      charRange: [0, endIdx || targetLength],
    });
  }
  
  // Extract from middle
  if (textLength > targetLength * 2) {
    const midStart = Math.floor(textLength / 2) - Math.floor(targetLength / 2);
    const midText = text.substring(midStart, midStart + targetLength);
    const midEndIdx = midText.lastIndexOf('.') + 1;
    excerpts.push({
      id: 'excerpt-2',
      text: midText.substring(0, midEndIdx || targetLength).trim(),
      selectorHint: 'middle',
      charRange: [midStart, midStart + (midEndIdx || targetLength)],
    });
  }
  
  // Extract from end
  if (textLength > targetLength) {
    const endStart = Math.max(0, textLength - targetLength);
    const endText = text.substring(endStart);
    const endEndIdx = endText.lastIndexOf('.') + 1;
    excerpts.push({
      id: 'excerpt-3',
      text: endText.substring(0, endEndIdx || targetLength).trim(),
      selectorHint: 'end',
      charRange: [endStart, textLength],
    });
  }
  
  return excerpts.filter(e => e.text.length > 20); // Filter out very short excerpts
}

/**
 * Basic entity extraction (heuristic: capitalized phrases + org suffixes)
 */
function extractEntities(text) {
  if (!text) return [];
  
  const entities = [];
  const seen = new Set();
  
  // Pattern for company names (Capitalized Words + Inc/LLC/Corp/etc)
  const companyPattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(Inc|LLC|Corp|Corporation|Ltd|Limited|Co|Company|Group|Systems|Solutions|Technologies|Tech|Software|Services)\b/gi;
  let match;
  
  while ((match = companyPattern.exec(text)) !== null) {
    const name = match[0].trim();
    if (!seen.has(name.toLowerCase()) && name.length > 3) {
      entities.push({
        type: 'company',
        name: name,
      });
      seen.add(name.toLowerCase());
    }
  }
  
  // Pattern for organizations (capitalized phrases, often with "The")
  const orgPattern = /\b(?:The\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\b/g;
  seen.clear();
  
  while ((match = orgPattern.exec(text)) !== null) {
    const name = match[1].trim();
    // Skip common words and short phrases
    if (name.length > 8 && !seen.has(name.toLowerCase()) && 
        !/^(The|This|That|These|Those|When|Where|What|Which|Who|How)$/i.test(name)) {
      entities.push({
        type: 'org',
        name: name,
      });
      seen.add(name.toLowerCase());
    }
  }
  
  // Limit to top 20 entities
  return entities.slice(0, 20);
}

/**
 * Detect signals in text and HTML (pricing, security, careers, docs, blog, etc.)
 */
function detectSignals(html, text, excerpts) {
  const signals = [];
  const htmlLower = html.toLowerCase();
  const textLower = text.toLowerCase();
  
  // Pricing signals
  if (/\b(price|pricing|cost|purchase|buy|subscription|plan|tier|dollar|\$)\b/i.test(textLower) ||
      /<[^>]*(?:price|pricing|cost)[^>]*>/i.test(html)) {
    signals.push({
      type: 'pricing',
      evidenceExcerptId: excerpts.length > 0 ? excerpts[0].id : null,
      confidence: 0.8,
    });
  }
  
  // Security signals
  if (/\b(security|secure|ssl|tls|encryption|privacy|gdpr|compliance|sso|authentication)\b/i.test(textLower) ||
      /<[^>]*(?:security|privacy|ssl)[^>]*>/i.test(html)) {
    signals.push({
      type: 'security',
      evidenceExcerptId: excerpts.length > 0 ? excerpts[0].id : null,
      confidence: 0.75,
    });
  }
  
  // Careers signals
  if (/\b(career|job|hiring|position|open\s+role|we're\s+hiring|join\s+us)\b/i.test(textLower) ||
      /<[^>]*(?:career|job|hiring)[^>]*>/i.test(html) ||
      /\/career|\/jobs|\/hiring/i.test(html)) {
    signals.push({
      type: 'careers',
      evidenceExcerptId: excerpts.length > 0 ? excerpts[0].id : null,
      confidence: 0.85,
    });
  }
  
  // Docs signals
  if (/\b(documentation|docs|guide|tutorial|api\s+reference|getting\s+started)\b/i.test(textLower) ||
      /<[^>]*(?:documentation|docs)[^>]*>/i.test(html) ||
      /\/docs|\/documentation|\/guide/i.test(html)) {
    signals.push({
      type: 'docs',
      evidenceExcerptId: excerpts.length > 0 ? excerpts[0].id : null,
      confidence: 0.8,
    });
  }
  
  // Blog signals
  if (/\b(blog|article|post|news|update|announcement)\b/i.test(textLower) ||
      /<[^>]*(?:blog|article|post)[^>]*>/i.test(html) ||
      /\/blog|\/news|\/articles/i.test(html)) {
    signals.push({
      type: 'blog',
      evidenceExcerptId: excerpts.length > 0 ? excerpts[0].id : null,
      confidence: 0.7,
    });
  }
  
  // Comparison signals
  if (/\b(compare|vs|versus|alternative|competitor|better|best)\b/i.test(textLower)) {
    signals.push({
      type: 'comparison',
      evidenceExcerptId: excerpts.length > 1 ? excerpts[1].id : (excerpts.length > 0 ? excerpts[0].id : null),
      confidence: 0.65,
    });
  }
  
  // Integration signals
  if (/\b(integrate|integration|api|webhook|connector|plugin|addon)\b/i.test(textLower)) {
    signals.push({
      type: 'integration',
      evidenceExcerptId: excerpts.length > 0 ? excerpts[0].id : null,
      confidence: 0.7,
    });
  }
  
  // Login signals
  if (/\b(login|sign\s+in|log\s+in|account|dashboard)\b/i.test(textLower) ||
      /<[^>]*(?:login|signin|sign-in)[^>]*>/i.test(html) ||
      /\/login|\/signin|\/sign-in/i.test(html)) {
    signals.push({
      type: 'login',
      evidenceExcerptId: excerpts.length > 0 ? excerpts[0].id : null,
      confidence: 0.8,
    });
  }
  
  // Newsletter signals
  if (/\b(newsletter|subscribe|email\s+updates|mailing\s+list)\b/i.test(textLower) ||
      /<[^>]*(?:newsletter|subscribe)[^>]*>/i.test(html)) {
    signals.push({
      type: 'newsletter',
      evidenceExcerptId: excerpts.length > 0 ? excerpts[0].id : null,
      confidence: 0.75,
    });
  }
  
  return signals;
}

/**
 * Extract claims from text (simple heuristic: statements with confidence indicators)
 */
function extractClaims(text, excerpts) {
  if (!text) return [];
  
  const claims = [];
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 20);
  
  // Look for claim-like patterns (statements with numbers, comparisons, capabilities)
  const claimPatterns = [
    /\b(we|our|the|this)\s+[a-z]+\s+(?:is|are|can|will|provides?|offers?|supports?|enables?)\s+[^.!?]+/i,
    /\b(?:over|more\s+than|up\s+to)\s+\d+[^.!?]+/i,
    /\b(?:the\s+)?(?:best|fastest|most|leading|top)\s+[^.!?]+/i,
  ];
  
  for (const pattern of claimPatterns) {
    for (const sentence of sentences.slice(0, 10)) { // Limit to first 10 sentences
      const match = sentence.match(pattern);
      if (match) {
        const claimText = match[0].trim();
        // Find which excerpt contains this claim
        let evidenceExcerptId = null;
        for (const excerpt of excerpts) {
          if (excerpt.text.includes(claimText.substring(0, 50))) {
            evidenceExcerptId = excerpt.id;
            break;
          }
        }
        
        claims.push({
          text: claimText,
          evidenceExcerptId: evidenceExcerptId || (excerpts.length > 0 ? excerpts[0].id : null),
          confidence: 0.6, // Default confidence for heuristic extraction
        });
        
        if (claims.length >= 5) break; // Limit to 5 claims
      }
    }
    if (claims.length >= 5) break;
  }
  
  return claims;
}

/**
 * Calculate meta information
 */
function calculateMeta(text) {
  if (!text) {
    return {
      wordCount: 0,
      readingTimeMin: 0,
    };
  }
  
  const words = text.split(/\s+/).filter(w => w.length > 0);
  const wordCount = words.length;
  const readingTimeMin = Math.ceil(wordCount / 200); // Average reading speed: 200 words/min
  
  // Simple language detection (heuristic: common English words)
  const commonEnglishWords = /\b(the|and|or|but|in|on|at|to|for|of|with|by|from|as|is|are|was|were|be|been|have|has|had|do|does|did|will|would|should|could|may|might|can|must)\b/gi;
  const englishMatches = text.match(commonEnglishWords);
  const languageHint = englishMatches && englishMatches.length > wordCount * 0.1 ? 'en' : null;
  
  return {
    wordCount,
    languageHint,
    readingTimeMin,
  };
}

/**
 * Search provider interface
 * NOTE: This is a placeholder. Connect to your actual search provider (e.g., Google Custom Search, Bing, etc.)
 * The function should return: [{ url, title, snippet?, source?, publishedDate? }]
 * 
 * Example integration:
 * async function searchProvider(query, limit = 10) {
 *   const apiKey = env.GOOGLE_SEARCH_API_KEY;
 *   const searchEngineId = env.GOOGLE_SEARCH_ENGINE_ID;
 *   const response = await fetch(
 *     `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${searchEngineId}&q=${encodeURIComponent(query)}&num=${limit}`
 *   );
 *   const data = await response.json();
 *   return data.items?.map(item => ({
 *     url: item.link,
 *     title: item.title,
 *     snippet: item.snippet,
 *     source: 'google',
 *   })) || [];
 * }
 */
/**
 * Web search provider.
 *
 * Uses Brave Search API (free tier: 2000 queries/month).
 * Set BRAVE_SEARCH_API_KEY as a Cloudflare Worker secret.
 *
 * Falls back gracefully to empty results if no key is configured.
 *
 * To get a free key: https://brave.com/search/api/ → "Get started for free"
 */
let _searchEnv = null;
function setSearchEnv(env) { _searchEnv = env; }

async function searchProvider(query, limit = 10) {
  const env = _searchEnv;
  const braveKey = env?.BRAVE_SEARCH_API_KEY;

  if (!braveKey) {
    console.warn('[searchProvider] No BRAVE_SEARCH_API_KEY set — search results will be empty. Get a free key at https://brave.com/search/api/');
    return [];
  }

  try {
    const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${Math.min(limit, 20)}`;
    const resp = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip',
        'X-Subscription-Token': braveKey,
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!resp.ok) {
      console.warn(`[searchProvider] Brave Search returned ${resp.status}`);
      return [];
    }

    const data = await resp.json();
    const webResults = data.web?.results || [];

    return webResults.slice(0, limit).map(item => ({
      url: item.url || '',
      title: item.title || '',
      snippet: item.description || '',
      source: 'brave',
      publishedDate: item.page_age || null,
    }));
  } catch (err) {
    console.warn(`[searchProvider] Search failed: ${err.message}`);
    return [];
  }
}

/**
 * Normalize hostname for deduplication
 */
function normalizeHostname(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

/**
 * Calculate title similarity (simple Jaccard similarity on words)
 */
function titleSimilarity(title1, title2) {
  if (!title1 || !title2) return 0;
  
  const words1 = new Set(title1.toLowerCase().split(/\s+/).filter(w => w.length > 2));
  const words2 = new Set(title2.toLowerCase().split(/\s+/).filter(w => w.length > 2));
  
  const intersection = new Set([...words1].filter(w => words2.has(w)));
  const union = new Set([...words1, ...words2]);
  
  return union.size > 0 ? intersection.size / union.size : 0;
}

/**
 * Classify intent based on URL and content
 */
function classifyIntent(url, title, snippet) {
  const urlLower = url.toLowerCase();
  const titleLower = (title || '').toLowerCase();
  const snippetLower = (snippet || '').toLowerCase();
  const combined = `${urlLower} ${titleLower} ${snippetLower}`;
  
  // Docs
  if (/\/(docs?|documentation|guides?|api|reference|tutorial|getting-started)/.test(urlLower) ||
      /\b(documentation|docs?|guide|api\s+reference|tutorial)\b/.test(combined)) {
    return 'docs';
  }
  
  // Blog
  if (/\/(blog|articles?|posts?|news|updates?)/.test(urlLower) ||
      /\b(blog|article|post|news|update|announcement)\b/.test(combined)) {
    return 'blog';
  }
  
  // Forum
  if (/\/(forum|discussion|community|reddit|stackoverflow|discourse)/.test(urlLower) ||
      /\b(forum|discussion|community|thread|comment)\b/.test(combined)) {
    return 'forum';
  }
  
  // News
  if (/\/(news|press|media|releases?)/.test(urlLower) ||
      /\b(news|press\s+release|breaking|reported)\b/.test(combined)) {
    return 'news';
  }
  
  // Marketing (default for homepage, pricing, features, etc.)
  if (/\/(pricing|features?|about|home|index)/.test(urlLower) ||
      /\b(pricing|features?|product|solution|platform)\b/.test(combined)) {
    return 'marketing';
  }
  
  return 'unknown';
}

/**
 * Calculate authority score based on domain and URL patterns
 */
function calculateAuthorityScore(url, title) {
  let score = 0.5; // Base score
  
  const urlLower = url.toLowerCase();
  const hostname = normalizeHostname(url);
  
  // Official domains (common patterns)
  if (hostname.includes('github.com') || hostname.includes('stackoverflow.com') ||
      hostname.includes('wikipedia.org') || hostname.includes('reddit.com')) {
    score += 0.3;
  }
  
  // Official docs/security/pricing pages get boost
  if (/\/(docs?|documentation|security|pricing|purchase)/.test(urlLower)) {
    score += 0.2;
  }
  
  // Subdomain patterns (docs.company.com, security.company.com)
  if (/^(docs|security|pricing|www)\./.test(hostname)) {
    score += 0.15;
  }
  
  // HTTPS
  if (url.startsWith('https://')) {
    score += 0.05;
  }
  
  return Math.min(1.0, score);
}

/**
 * Calculate recency score (if publishedDate provided)
 */
function calculateRecencyScore(publishedDate, recencyDays = 30) {
  if (!publishedDate) return 0.5; // Neutral if unknown
  
  try {
    const published = new Date(publishedDate);
    const now = new Date();
    const daysAgo = (now - published) / (1000 * 60 * 60 * 24);
    
    if (daysAgo < 0) return 1.0; // Future date = max score
    if (daysAgo <= recencyDays) {
      // Linear decay from 1.0 to 0.5 over recencyDays
      return 1.0 - (daysAgo / recencyDays) * 0.5;
    }
    return 0.3; // Older than recencyDays
  } catch {
    return 0.5;
  }
}

/**
 * Calculate relevance score based on query matching
 */
function calculateRelevanceScore(query, url, title, snippet) {
  const queryLower = query.toLowerCase();
  const queryWords = queryLower.split(/\s+/).filter(w => w.length > 2);
  
  const urlLower = url.toLowerCase();
  const titleLower = (title || '').toLowerCase();
  const snippetLower = (snippet || '').toLowerCase();
  
  let score = 0;
  let matches = 0;
  
  for (const word of queryWords) {
    if (urlLower.includes(word)) matches++;
    if (titleLower.includes(word)) matches++;
    if (snippetLower.includes(word)) matches++;
  }
  
  // Score based on how many query words appear and where
  score = matches / (queryWords.length * 3); // Max 1.0 if all words appear in all places
  
  // Boost for exact phrase match
  if (titleLower.includes(queryLower) || snippetLower.includes(queryLower)) {
    score = Math.min(1.0, score + 0.3);
  }
  
  return Math.min(1.0, score);
}

/**
 * Deduplicate and group results by hostname + similar title
 */
function deduplicateResults(results) {
  const seen = new Map(); // hostname -> { title, groupId, count }
  const groups = new Map(); // groupId -> [indices]
  let nextGroupId = 1;
  
  results.forEach((result, index) => {
    const hostname = normalizeHostname(result.url);
    const title = result.title || '';
    
    // Check if we've seen a similar result from this hostname
    let groupId = null;
    if (seen.has(hostname)) {
      const existing = seen.get(hostname);
      const similarity = titleSimilarity(title, existing.title);
      
      // If titles are very similar (>0.7), use same group
      if (similarity > 0.7) {
        groupId = existing.groupId;
        existing.count++;
      } else {
        // Different title from same hostname = new group
        groupId = nextGroupId++;
        seen.set(hostname, { title, groupId, count: 1 });
      }
    } else {
      // First time seeing this hostname
      groupId = nextGroupId++;
      seen.set(hostname, { title, groupId, count: 1 });
    }
    
    result.dedupedGroupId = groupId;
    
    if (!groups.has(groupId)) {
      groups.set(groupId, []);
    }
    groups.get(groupId).push(index);
  });
  
  return { results, groups };
}

/**
 * Apply diversity penalty: reduce score for results from same domain
 */
function applyDiversityPenalty(results, maxPerDomain = 3) {
  const domainCounts = new Map();
  
  return results.map((result, index) => {
    const hostname = normalizeHostname(result.url);
    const count = (domainCounts.get(hostname) || 0) + 1;
    domainCounts.set(hostname, count);
    
    // Apply penalty if we've seen too many from this domain
    const penalty = count > maxPerDomain ? (count - maxPerDomain) * 0.1 : 0;
    result.scoreBreakdown.diversityPenalty = Math.min(0.5, penalty);
    result.scoreBreakdown.finalScore = 
      result.scoreBreakdown.authority * 0.3 +
      result.scoreBreakdown.recency * 0.2 +
      result.scoreBreakdown.relevance * 0.5 -
      result.scoreBreakdown.diversityPenalty;
    
    return result;
  });
}

/**
 * Extract URLs from sitemap XML (simple parser)
 */
async function parseSitemapXml(sitemapUrl) {
  try {
    const response = await fetchWithTimeout(
      sitemapUrl,
      {
        method: 'GET',
        redirect: 'follow',
        headers: getBrowserHeaders(),
      },
      5000 // 5 second timeout
    );
    
    if (!response.ok) return [];
    
    const text = await response.text();
    const urls = [];
    
    // Simple regex-based parsing (for production, use proper XML parser)
    const urlMatches = text.match(/<loc>([^<]+)<\/loc>/gi);
    if (urlMatches) {
      for (const match of urlMatches) {
        const url = match.replace(/<\/?loc>/gi, '').trim();
        // Validate URL length to prevent memory issues
        if (url && url.startsWith('http') && url.length <= 2048) {
          urls.push(url);
        }
      }
    }
    
    return urls.slice(0, 100); // Limit to 100 URLs per sitemap
  } catch (e) {
    return [];
  }
}

/**
 * Discover likely pages on a website
 */
async function discoverPages(baseUrl, budget = 20) {
  const candidates = [];
  const seen = new Set();
  
  try {
    const base = new URL(baseUrl);
    const origin = base.origin;
    
    // Common paths to check
    const commonPaths = [
      { path: '/pricing', type: 'pricing', reason: 'Common pricing page path' },
      { path: '/security', type: 'security', reason: 'Common security page path' },
      { path: '/docs', type: 'docs', reason: 'Common documentation path' },
      { path: '/documentation', type: 'docs', reason: 'Alternative docs path' },
      { path: '/careers', type: 'careers', reason: 'Common careers page path' },
      { path: '/jobs', type: 'careers', reason: 'Alternative careers path' },
      { path: '/about', type: 'about', reason: 'Common about page path' },
      { path: '/blog', type: 'blog', reason: 'Common blog path' },
      { path: '/news', type: 'news', reason: 'Common news path' },
      { path: '/press', type: 'news', reason: 'Common press path' },
    ];
    
    // Add common paths
    for (const { path, type, reason } of commonPaths) {
      const url = `${origin}${path}`;
      if (!seen.has(url)) {
        candidates.push({ url, type, reason });
        seen.add(url);
      }
    }
    
      // Fetch homepage to extract links
      try {
        const response = await fetchWithTimeout(
          baseUrl,
          {
            method: 'GET',
            redirect: 'follow',
            headers: getBrowserHeaders(),
          },
          8000 // 8 second timeout
        );
      
      if (response.ok) {
        const html = await readHtmlWithLimit(response, MAX_HTML_SIZE);
        const navLinks = extractNavigationLinks(html, baseUrl);
        
        // Extract same-domain links
        for (const link of navLinks) {
          try {
            let linkUrl = link;
            if (!link.startsWith('http')) {
              linkUrl = new URL(link, baseUrl).href;
            }
            
            // Validate and normalize URL
            const linkValidation = validateUrl(linkUrl);
            if (!linkValidation.valid || !linkValidation.url) {
              // Try resolving against base URL again
              try {
                const resolvedUrl = new URL(link, baseUrl).href;
                const resolvedValidation = validateUrl(resolvedUrl);
                if (!resolvedValidation.valid || !resolvedValidation.url) {
                  continue; // Skip invalid URLs
                }
                linkUrl = resolvedValidation.url;
              } catch (e) {
                continue; // Skip invalid URLs
              }
            } else {
              linkUrl = linkValidation.url;
            }
            
            const linkObj = new URL(linkUrl);
            if (linkObj.origin === origin && !seen.has(linkUrl)) {
              // Classify link type
              let type = 'unknown';
              let reason = 'Found in navigation';
              
              const pathLower = linkObj.pathname.toLowerCase();
              if (pathLower.includes('pricing') || pathLower.includes('price')) {
                type = 'pricing';
                reason = 'Pricing-related link in navigation';
              } else if (pathLower.includes('security') || pathLower.includes('secure')) {
                type = 'security';
                reason = 'Security-related link in navigation';
              } else if (pathLower.includes('doc') || pathLower.includes('guide') || pathLower.includes('api')) {
                type = 'docs';
                reason = 'Documentation-related link in navigation';
              } else if (pathLower.includes('career') || pathLower.includes('job') || pathLower.includes('hiring')) {
                type = 'careers';
                reason = 'Careers-related link in navigation';
              } else if (pathLower.includes('blog') || pathLower.includes('article')) {
                type = 'blog';
                reason = 'Blog-related link in navigation';
              } else if (pathLower.includes('about')) {
                type = 'about';
                reason = 'About page link in navigation';
              }
              
              candidates.push({ url: linkUrl, type, reason });
              seen.add(linkUrl);
              
              if (candidates.length >= budget) break;
            }
          } catch (e) {
            // Invalid URL, skip
          }
        }
      }
    } catch (e) {
      // Failed to fetch homepage, continue with common paths only
    }
    
    // Try to fetch sitemap
    try {
      const robotsInfo = extractRobotsInfo('', baseUrl);
      if (robotsInfo.robotsUrl) {
        const robotsData = await fetchRobotsInfo(robotsInfo.robotsUrl);
        const sitemapUrls = robotsData.sitemapUrls;
        
        // Parse first sitemap
        if (sitemapUrls.length > 0) {
          const sitemapPageUrls = await parseSitemapXml(sitemapUrls[0]);
          for (const url of sitemapPageUrls) {
            if (!seen.has(url)) {
              try {
                // Validate and normalize URL from sitemap
                const urlValidation = validateUrl(url);
                if (!urlValidation.valid || !urlValidation.url) {
                  continue; // Skip invalid URLs from sitemap
                }
                
                const validatedUrl = urlValidation.url;
                const urlObj = new URL(validatedUrl);
                if (urlObj.origin === origin) {
                  let type = 'unknown';
                  let reason = 'Found in sitemap';
                  
                  const pathLower = urlObj.pathname.toLowerCase();
                  if (pathLower.includes('pricing')) type = 'pricing';
                  else if (pathLower.includes('security')) type = 'security';
                  else if (pathLower.includes('doc')) type = 'docs';
                  else if (pathLower.includes('career') || pathLower.includes('job')) type = 'careers';
                  else if (pathLower.includes('blog')) type = 'blog';
                  
                  candidates.push({ url: validatedUrl, type, reason });
                  seen.add(validatedUrl);
                  
                  if (candidates.length >= budget) break;
                }
              } catch (e) {
                // Invalid URL, skip
              }
            }
          }
        }
      }
    } catch (e) {
      // Failed to fetch sitemap, continue
    }
    
    // Prioritize: pricing, security, docs first
    const priority = { pricing: 1, security: 2, docs: 3, careers: 4, blog: 5, about: 6, news: 7, unknown: 8 };
    candidates.sort((a, b) => {
      const priorityA = priority[a.type] || 9;
      const priorityB = priority[b.type] || 9;
      return priorityA - priorityB;
    });
    
    return candidates.slice(0, budget);
  } catch (e) {
    return [];
  }
}

/**
 * Simple concurrency pool for bounded crawling
 */
async function crawlWithConcurrency(urls, concurrency, fn, timeoutMs = 10000) {
  const results = [];
  const errors = [];
  let index = 0;
  
  async function worker() {
    while (index < urls.length) {
      const currentIndex = index++;
      const url = urls[currentIndex];
      
      try {
        const result = await Promise.race([
          fn(url),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Timeout')), timeoutMs)
          ),
        ]);
        results.push({ url, success: true, data: result });
      } catch (error) {
        errors.push({ url, success: false, reason: error.message });
      }
    }
  }
  
  const workers = Array(Math.min(concurrency, urls.length))
    .fill(null)
    .map(() => worker());
  
  await Promise.all(workers);
  
  return { results, errors };
}

/**
 * Rank and deduplicate search results
 */
function rankAndDeduplicateResults(rawResults, query, recencyDays) {
  if (!rawResults || rawResults.length === 0) return [];
  
  // Calculate scores for each result
  const scoredResults = rawResults.map(result => {
    const authority = calculateAuthorityScore(result.url, result.title);
    const recency = calculateRecencyScore(result.publishedDate, recencyDays);
    const relevance = calculateRelevanceScore(query, result.url, result.title, result.snippet);
    const intent = classifyIntent(result.url, result.title, result.snippet);
    
    return {
      url: result.url,
      title: result.title || '',
      snippet: result.snippet || null,
      source: result.source || null,
      scoreBreakdown: {
        authority,
        recency,
        relevance,
        diversityPenalty: 0, // Will be calculated after deduplication
        finalScore: authority * 0.3 + recency * 0.2 + relevance * 0.5,
      },
      classifiedIntent: intent,
      dedupedGroupId: null, // Will be set by deduplication
    };
  });
  
  // Deduplicate
  const { results: dedupedResults } = deduplicateResults(scoredResults);
  
  // Apply diversity penalty
  const diversifiedResults = applyDiversityPenalty(dedupedResults, 3);
  
  // Sort by final score (descending)
  diversifiedResults.sort((a, b) => b.scoreBreakdown.finalScore - a.scoreBreakdown.finalScore);
  
  return diversifiedResults;
}

// Response utilities imported from utils/response.js
import { createErrorResponse as createErrorResponseUtil, createSuccessResponse as createSuccessResponseUtil, setRequestContext, sanitizeErrorMessage, safeParseJson } from './utils/response.js';

// Use imported utilities
const createErrorResponse = createErrorResponseUtil;
const createSuccessResponse = createSuccessResponseUtil;

/**
 * Search endpoint - SERP triage + dedupe ranking
 */
async function handleSearch(request, requestId, env) {
  try {
    // Parse request body
    const { data: body, error: parseError } = await safeParseJson(request, requestId);
    if (parseError) return parseError;
    
    const { query, limit = 10, recencyDays = 30, mode = 'fast' } = body;
    
    // Validate query
    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return createErrorResponse(
        'VALIDATION_ERROR',
        'query parameter is required and must be a non-empty string',
        { received: typeof query },
        400,
        requestId
      );
    }
    
    const queryTrimmed = query.trim();
    const limitNum = Math.min(Math.max(1, parseInt(limit) || 10), 50); // Clamp 1-50
    const recencyDaysNum = Math.max(1, parseInt(recencyDays) || 30);
    
    // Call search provider
    let rawResults;
    try {
      rawResults = await searchProvider(queryTrimmed, limitNum * 2); // Get more than needed for deduplication
    } catch (searchError) {
      return createErrorResponse(
        'SEARCH_ERROR',
        'Search provider error',
        { message: searchError.message, query: queryTrimmed },
        500,
        requestId
      );
    }
    
    // If no results, return empty array
    if (!rawResults || rawResults.length === 0) {
      return createSuccessResponse(
        { results: [] },
        requestId
      );
    }
    
    // Rank and deduplicate
    const rankedResults = rankAndDeduplicateResults(rawResults, queryTrimmed, recencyDaysNum);
    
    // Limit to requested number
    const limitedResults = rankedResults.slice(0, limitNum);
    
    // Create a live job so the dashboard sees the search happening
    if (env) {
      try {
        const { upsertDocument } = await import('./sanity-client.js');
        const { initSanityClient } = await import('./sanity-client.js');
        const client = initSanityClient(env);
        if (client) {
          await upsertDocument(client, {
            _type: 'molt.job',
            _id: `search.${requestId}`,
            jobType: 'Web Search',
            status: 'completed', // completed because this is synchronous, but it shows in recent!
            priority: 1,
            attempts: 1,
            targetEntity: queryTrimmed,
            updatedAt: new Date().toISOString()
          });
        }
      } catch (err) {
        console.error('Failed to log search job:', err);
      }
    }
    
    return createSuccessResponse(
      { results: limitedResults },
      requestId
    );
  } catch (error) {
    console.error('[handleSearch] Error:', error.message);
    return createErrorResponse(
      'INTERNAL_ERROR',
      'Internal server error',
      {},
      500,
      requestId
    );
  }
}

/**
 * Discover endpoint - find likely pages on a website
 */
async function handleDiscover(request, requestId) {
  try {
    const { data: body, error: parseError } = await safeParseJson(request, requestId);
    if (parseError) return parseError;
    
    const { url, budget = 20 } = body;
    
    // Validate URL
    if (!url || typeof url !== 'string') {
      return createErrorResponse(
        'VALIDATION_ERROR',
        'url parameter is required and must be a string',
        { received: typeof url },
        400,
        requestId
      );
    }
    
    const validation = validateUrl(url);
    if (!validation.valid) {
      return createErrorResponse(
        'VALIDATION_ERROR',
        'Invalid URL provided',
        { error: validation.error, input: url },
        400,
        requestId
      );
    }
    
    const inputUrl = validation.url;
    const budgetNum = Math.min(Math.max(1, parseInt(budget) || 20), 50); // Clamp 1-50
    
    // Discover pages
    const candidates = await discoverPages(inputUrl, budgetNum);
    
    // Determine canonical root
    let canonicalRoot = inputUrl;
    try {
      const urlObj = new URL(inputUrl);
      canonicalRoot = urlObj.origin;
    } catch (e) {
      // Keep original URL
    }
    
    return createSuccessResponse(
      {
        canonicalRoot,
        candidates,
      },
      requestId
    );
  } catch (error) {
    console.error('[handleDiscover] Error:', error.message);
    return createErrorResponse(
      'INTERNAL_ERROR',
      'Internal server error',
      {},
      500,
      requestId
    );
  }
}

/**
 * Crawl endpoint - fetch prioritized pages with concurrency limits
 */
async function handleCrawl(request, requestId) {
  try {
    const { data: body, error: parseError } = await safeParseJson(request, requestId);
    if (parseError) return parseError;
    
    const { url, depth = 1, budget = 20, includeTypes = [] } = body;
    
    // Validate URL
    if (!url || typeof url !== 'string') {
      return createErrorResponse(
        'VALIDATION_ERROR',
        'url parameter is required and must be a string',
        { received: typeof url },
        400,
        requestId
      );
    }
    
    const validation = validateUrl(url);
    if (!validation.valid) {
      return createErrorResponse(
        'VALIDATION_ERROR',
        'Invalid URL provided',
        { error: validation.error, input: url },
        400,
        requestId
      );
    }
    
    const inputUrl = validation.url;
    const depthNum = depth === 2 ? 2 : 1; // Only support depth 1 or 2
    const budgetNum = Math.min(Math.max(1, parseInt(budget) || 20), 50); // Clamp 1-50
    const includeTypesArray = Array.isArray(includeTypes) ? includeTypes : [];
    
    // Discover candidates
    const candidates = await discoverPages(inputUrl, budgetNum * 2); // Get more than needed
    
    // Filter by includeTypes if provided
    const filteredCandidates = includeTypesArray.length > 0
      ? candidates.filter(c => includeTypesArray.includes(c.type))
      : candidates;
    
    // Prioritize and limit to budget
    const prioritized = filteredCandidates.slice(0, budgetNum);
    
    // Validate and normalize URLs from discovery before crawling
    const validatedUrls = [];
    for (const candidate of prioritized) {
      const urlValidation = validateUrl(candidate.url);
      if (urlValidation.valid && urlValidation.url) {
        validatedUrls.push(urlValidation.url);
      } else {
        // Try to fix relative URLs by resolving against inputUrl
        try {
          const resolvedUrl = new URL(candidate.url, inputUrl).href;
          const resolvedValidation = validateUrl(resolvedUrl);
          if (resolvedValidation.valid && resolvedValidation.url) {
            validatedUrls.push(resolvedValidation.url);
          }
        } catch (e) {
          // Skip invalid URLs
          console.warn(`Skipping invalid URL from discovery: ${candidate.url}`);
        }
      }
    }
    
    if (validatedUrls.length === 0) {
      // Provide helpful fallback suggestion when validation fails
      return createSuccessResponse(
        {
          root: inputUrl,
          fetched: [],
          skipped: prioritized.map(c => ({
            url: c.url,
            reason: 'URL validation failed - invalid URLs from discovery',
          })),
          fallbackMode: 'extractEvidence',
          message: 'Crawl validation found no valid URLs - use extractEvidence endpoint for detailed content extraction',
          recommendation: 'Call POST /extract with url parameter to get detailed content, stack, and signal intelligence',
          example: {
            endpoint: 'POST /extract',
            body: { url: inputUrl, mode: 'deep', maxChars: 50000 },
            description: 'Provides detailed content, tech stack, and signal intelligence - equivalent outcome to crawl'
          }
        },
        requestId
      );
    }
    
    // Crawl with concurrency limit
    const concurrency = 3; // Max 3 concurrent requests
    const timeoutMs = 8000; // 8 second timeout per page
    
    const { results, errors } = await crawlWithConcurrency(
      validatedUrls,
      concurrency,
      async (targetUrl) => {
        // Validate URL one more time before fetching
        const finalValidation = validateUrl(targetUrl);
        if (!finalValidation.valid || !finalValidation.url) {
          throw new Error(`Invalid URL: ${targetUrl}`);
        }
        
        const validatedTargetUrl = finalValidation.url;
        const response = await fetchWithTimeout(
          validatedTargetUrl,
          {
            method: 'GET',
            redirect: 'follow',
            headers: getBrowserHeaders(),
          },
          timeoutMs
        );
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        
        const html = await readHtmlWithLimit(response, MAX_HTML_SIZE);
        const title = extractTitle(html);
        const mainText = cleanMainText(html);
        const excerpts = extractExcerpts(mainText, 500);
        const signals = detectSignals(html, mainText, excerpts);
        
        return {
          url: validatedTargetUrl,
          finalUrl: response.url,
          status: response.status,
          title,
          mainText: mainText.substring(0, 10000), // Limit size
          excerpts: excerpts.slice(0, 3),
          signals: signals.slice(0, 5),
          fetchedAt: new Date().toISOString(),
        };
      },
      timeoutMs
    );
    
    // Map skipped URLs
    const skipped = errors.map(e => ({
      url: e.url,
      reason: e.reason,
    }));
    
    // If no successful fetches, provide helpful fallback suggestion
    if (results.length === 0 && skipped.length > 0) {
      return createSuccessResponse(
        {
          root: inputUrl,
          fetched: [],
          skipped,
          fallbackMode: 'extractEvidence',
          message: 'Crawl completed with no successful results - use extractEvidence endpoint for detailed content extraction',
          recommendation: 'Call POST /extract with url parameter to get detailed content, stack, and signal intelligence',
          example: {
            endpoint: 'POST /extract',
            body: { url: inputUrl, mode: 'deep', maxChars: 50000 },
            description: 'Provides detailed content, tech stack, and signal intelligence - equivalent outcome to crawl',
            benefits: [
              'Detailed content extraction',
              'Tech stack detection',
              'Signal intelligence (pricing, security, careers, etc.)',
              'Entity extraction',
              'Claims extraction'
            ]
          }
        },
        requestId
      );
    }
    
    return createSuccessResponse(
      {
        root: inputUrl,
        fetched: results.map(r => r.data),
        skipped: skipped.length > 0 ? skipped : undefined,
      },
      requestId
    );
  } catch (error) {
    console.error('[handleCrawl] Error:', error.message);
    return createErrorResponse(
      'INTERNAL_ERROR',
      'Internal server error',
      {},
      500,
      requestId
    );
  }
}

/**
 * Extract endpoint - structured extraction output (Evidence Pack)
 */
async function handleExtract(request, requestId, env) {
  try {
    // Parse request body
    const { data: body, error: parseError } = await safeParseJson(request, requestId);
    if (parseError) return parseError;
    
    const { url, mode = 'fast', maxChars } = body;
    
    // Validate URL
    if (!url || typeof url !== 'string') {
      return createErrorResponse(
        'VALIDATION_ERROR',
        'url parameter is required and must be a string',
        { received: typeof url },
        400,
        requestId
      );
    }
    
    const validation = validateUrl(url);
    if (!validation.valid) {
      return createErrorResponse(
        'VALIDATION_ERROR',
        'Invalid URL provided',
        { error: validation.error, input: url },
        400,
        requestId
      );
    }
    
    const inputUrl = validation.url;
    const cacheKey = `extract:${hashUrl(inputUrl)}`;
    
    // Initialize cache if needed
    if (!cacheInstance) {
      cacheInstance = new CacheInterface(env);
    }
    
    // Check cache
    const cached = await cacheInstance.get(cacheKey);
    let cacheMetadata = { hit: false, ageSec: null, contentHash: null };
    
    if (cached && cached.data) {
      // Return cached data
      cacheMetadata = {
        hit: true,
        ageSec: Math.floor((Date.now() - cached.cachedAt) / 1000),
        contentHash: cached.contentHash || null,
      };
      
      return createSuccessResponse(
        {
          ...cached.data,
          cache: cacheMetadata,
        },
        requestId
      );
    }
    
    // Not in cache, fetch and extract
    const fetchedAt = new Date().toISOString();
    const maxTextChars = maxChars || (mode === 'deep' ? 50000 : 10000);
    
    // Fetch the page
    let response;
    let finalUrl = inputUrl;
    let status = 0;
    let contentType = 'text/html';
    let html = '';
    
    try {
      const browserHeaders = getBrowserHeaders();
      response = await fetch(inputUrl, {
        method: 'GET',
        redirect: 'follow',
        headers: browserHeaders,
      });
      
      finalUrl = response.url;
      status = response.status;
      contentType = response.headers.get('content-type') || 'text/html';
      
      // Read HTML if content-type suggests HTML
      if (contentType.includes('text/html') && response.ok) {
        html = await readHtmlWithLimit(response, MAX_HTML_SIZE);
      }
    } catch (fetchError) {
      return createErrorResponse(
        'FETCH_ERROR',
        'Failed to fetch URL',
        { message: fetchError.message, input: inputUrl },
        500,
        requestId
      );
    }
    
    // Extract and clean main text
    const mainText = cleanMainText(html);
    const mainTextLimited = mainText.substring(0, maxTextChars);
    
    // Calculate content hash
    const contentHash = await calculateContentHash(mainTextLimited);
    
    // Extract metadata
    const title = extractTitle(html);
    const siteName = extractSiteName(html, finalUrl);
    
    // Extract excerpts
    const excerpts = extractExcerpts(mainTextLimited, 500);
    
    // Extract entities
    const entities = extractEntities(mainTextLimited);
    
    // Detect signals
    const signals = detectSignals(html, mainTextLimited, excerpts);
    
    // Extract claims
    const claims = extractClaims(mainTextLimited, excerpts);
    
    // Calculate meta
    const meta = calculateMeta(mainTextLimited);
    
    // Build EvidencePack
    const evidencePack = {
      url: inputUrl,
      finalUrl,
      title,
      siteName: siteName || undefined,
      fetchedAt,
      contentType,
      status,
      mainText: mainTextLimited,
      excerpts,
      entities,
      signals,
      claims,
      meta,
    };
    
    // Store in cache
    await cacheInstance.set(cacheKey, {
      data: evidencePack,
      contentHash,
    });
    
    cacheMetadata = {
      hit: false,
      ageSec: 0,
      contentHash,
    };
    
    // Auto-save to Sanity (unless explicitly disabled) – use sanity-client for retries
    let stored = null;
    if (env) {
      try {
        const { initSanityClient, generateAccountKey, storeAccountPack } = await import('./sanity-client.js');
        const client = initSanityClient(env);
        if (client) {
          const accountKey = await generateAccountKey(finalUrl);
          if (accountKey) {
            const packResult = await storeAccountPack(
              client,
              accountKey,
              finalUrl,
              'evidence',
              evidencePack,
              { requestId, autoSaved: true }
            );
            stored = {
              accountKey,
              packId: packResult.id,
            };
          }
        }
      } catch (storeError) {
        // Silently fail - don't break extract response if auto-save fails
      }
    }
    
    const responseData = {
      ...evidencePack,
      cache: cacheMetadata,
    };
    
    if (stored) {
      responseData.stored = stored;
    }
    
    return createSuccessResponse(responseData, requestId);
  } catch (error) {
    console.error('[handleExtract] Error:', error.message);
    return createErrorResponse(
      'INTERNAL_ERROR',
      'Internal server error',
      {},
      500,
      requestId
    );
  }
}

/**
 * Verify claims against multiple sources
 */
async function verifyClaim(claim, excerpts, signals) {
  // Validate claim length to prevent DoS
  if (!claim || typeof claim !== 'string' || claim.length > 1000) {
    return { supporting: [], contradicting: [] };
  }
  
  const claimLower = claim.toLowerCase();
  const claimWords = claimLower.split(/\s+/).filter(w => w.length > 2);
  
  const supporting = [];
  const contradicting = [];
  
  // Check each excerpt
  for (const excerpt of excerpts) {
    const excerptLower = excerpt.text.toLowerCase();
    let matchCount = 0;
    
    // Count matching words
    for (const word of claimWords) {
      if (excerptLower.includes(word)) {
        matchCount++;
      }
    }
    
    // If significant overlap (>= 50% of claim words), consider it
    const matchRatio = matchCount / claimWords.length;
    
    if (matchRatio >= 0.5) {
      // Check for contradiction keywords
      const contradictionPatterns = [
        /\b(no|not|doesn't|don't|cannot|can't|unavailable|not\s+available|not\s+supported|not\s+included)\b/i,
        /\b(without|missing|lacks|absence|excluded)\b/i,
      ];
      
      let isContradiction = false;
      for (const pattern of contradictionPatterns) {
        if (pattern.test(excerptLower)) {
          // Check if contradiction is about the claim topic
          const contextWords = excerptLower.split(/\s+/).slice(-10); // Last 10 words for context
          const context = contextWords.join(' ');
          if (context.includes(claimWords[0]) || context.includes(claimWords[claimWords.length - 1])) {
            isContradiction = true;
            break;
          }
        }
      }
      
      if (isContradiction) {
        contradicting.push({
          excerptId: excerpt.id,
          text: excerpt.text.substring(0, 200), // Limit length
          source: excerpt.source || null,
        });
      } else {
        supporting.push({
          excerptId: excerpt.id,
          text: excerpt.text.substring(0, 200), // Limit length
          source: excerpt.source || null,
        });
      }
    }
  }
  
  // Check signals for additional evidence
  for (const signal of signals) {
    const signalType = signal.type.toLowerCase();
    const claimLower = claim.toLowerCase();
    
    // If claim mentions something related to signal type
    if ((signalType === 'security' && (claimLower.includes('sso') || claimLower.includes('security'))) ||
        (signalType === 'pricing' && claimLower.includes('pricing')) ||
        (signalType === 'integration' && claimLower.includes('api'))) {
      // Signal provides supporting context (but not a direct excerpt)
      // We'll rely on excerpts primarily
    }
  }
  
  return { supporting, contradicting };
}

/**
 * Verify endpoint - multi-source verification mode
 */
async function handleVerify(request, requestId, env) {
  try {
    // Parse request body
    const { data: body, error: parseError } = await safeParseJson(request, requestId);
    if (parseError) return parseError;
    
    const { claims, sources } = body;
    
    // Validate claims
    if (!Array.isArray(claims) || claims.length === 0) {
      return createErrorResponse(
        'VALIDATION_ERROR',
        'claims parameter is required and must be a non-empty array',
        { received: typeof claims },
        400,
        requestId
      );
    }
    
    // Validate sources
    if (!Array.isArray(sources) || sources.length === 0) {
      return createErrorResponse(
        'VALIDATION_ERROR',
        'sources parameter is required and must be a non-empty array',
        { received: typeof sources },
        400,
        requestId
      );
    }
    
    // Validate each source URL
    const validatedSources = [];
    for (const source of sources) {
      if (typeof source !== 'string') {
        return createErrorResponse(
          'VALIDATION_ERROR',
          'All sources must be strings (URLs)',
          { invalidSource: source },
          400,
          requestId
        );
      }
      
      const validation = validateUrl(source);
      if (!validation.valid) {
        return createErrorResponse(
          'VALIDATION_ERROR',
          'Invalid source URL',
          { error: validation.error, source },
          400,
          requestId
        );
      }
      
      validatedSources.push(validation.url);
    }
    
    // Extract data from each source (reuse /extract logic, use cache)
    const sourceData = [];
    
    for (const sourceUrl of validatedSources) {
      try {
        // Reuse extraction logic (will use cache if available)
        const cacheKey = `extract:${hashUrl(sourceUrl)}`;
        
        // Initialize cache if needed
        if (!cacheInstance) {
          cacheInstance = new CacheInterface(env);
        }
        
        // Check cache first
        let evidencePack = null;
        const cached = await cacheInstance.get(cacheKey);
        
        if (cached && cached.data) {
          evidencePack = cached.data;
        } else {
          // Not cached, fetch and extract
          const browserHeaders = getBrowserHeaders();
          const response = await fetch(sourceUrl, {
            method: 'GET',
            redirect: 'follow',
            headers: browserHeaders,
          });
          
          if (!response.ok) {
            sourceData.push({ url: sourceUrl, error: `HTTP ${response.status}`, excerpts: [], signals: [] });
            continue;
          }
          
          const html = await readHtmlWithLimit(response, MAX_HTML_SIZE);
          const mainText = cleanMainText(html);
          const mainTextLimited = mainText.substring(0, 10000);
          const excerpts = extractExcerpts(mainTextLimited, 500);
          const signals = detectSignals(html, mainTextLimited, excerpts);
          
          // Add source URL to excerpts
          const excerptsWithSource = excerpts.map(e => ({ ...e, source: sourceUrl }));
          
          evidencePack = {
            url: sourceUrl,
            finalUrl: response.url,
            mainText: mainTextLimited,
            excerpts: excerptsWithSource,
            signals,
          };
          
          // Store in cache
          const contentHash = await calculateContentHash(mainTextLimited);
          await cacheInstance.set(cacheKey, {
            data: evidencePack,
            contentHash,
          });
        }
        
        sourceData.push({
          url: sourceUrl,
          excerpts: evidencePack.excerpts || [],
          signals: evidencePack.signals || [],
        });
      } catch (error) {
        sourceData.push({ url: sourceUrl, error: error.message, excerpts: [], signals: [] });
      }
    }
    
    // Verify each claim against all sources
    const verified = [];
    
    for (const claim of claims) {
      if (typeof claim !== 'string' || claim.trim().length === 0) {
        verified.push({
          claim,
          status: 'unclear',
          supportingExcerpts: [],
          contradictingExcerpts: [],
          reason: 'Invalid claim format',
        });
        continue;
      }
      
      // Collect all excerpts from all sources
      const allExcerpts = [];
      for (const source of sourceData) {
        if (source.excerpts) {
          allExcerpts.push(...source.excerpts);
        }
      }
      
      // Collect all signals
      const allSignals = [];
      for (const source of sourceData) {
        if (source.signals) {
          allSignals.push(...source.signals);
        }
      }
      
      // Verify claim
      const { supporting, contradicting } = await verifyClaim(claim, allExcerpts, allSignals);
      
      // Determine status
      let status = 'unclear'; // Default: conservative
      
      if (contradicting.length > 0) {
        // Explicit contradiction found
        status = 'contradicted';
      } else if (supporting.length >= 2) {
        // At least 2 sources provide supporting evidence
        status = 'supported';
      } else if (supporting.length === 1) {
        // Only 1 source supports - keep as unclear (conservative)
        status = 'unclear';
      }
      
      verified.push({
        claim: claim.trim(),
        status,
        supportingExcerpts: supporting.slice(0, 5), // Limit to 5
        contradictingExcerpts: contradicting.slice(0, 5), // Limit to 5
      });
    }
    
    return createSuccessResponse(
      { verified },
      requestId
    );
  } catch (error) {
    console.error('[handleVerify] Error:', error.message);
    return createErrorResponse(
      'INTERNAL_ERROR',
      'Internal server error',
      {},
      500,
      requestId
    );
  }
}

/**
 * Generate brief from crawled data
 */
function generateBrief(fetchedData, companyOrSite) {
  const keyFacts = [];
  const urls = [];
  const citations = [];
  
  // Collect URLs
  for (const item of fetchedData) {
    if (item.url && !urls.includes(item.url)) {
      urls.push(item.url);
    }
  }
  
  // Extract key facts from each page
  for (const item of fetchedData) {
    // Extract facts from title
    if (item.title) {
      keyFacts.push({
        fact: item.title,
        sourceUrl: item.url,
        excerptId: null,
      });
    }
    
    // Extract facts from signals
    if (item.signals && item.signals.length > 0) {
      for (const signal of item.signals.slice(0, 3)) {
        const signalText = `${signal.type.charAt(0).toUpperCase() + signal.type.slice(1)} features detected`;
        keyFacts.push({
          fact: signalText,
          sourceUrl: item.url,
          excerptId: signal.evidenceExcerptId || null,
        });
      }
    }
    
    // Extract facts from excerpts (first 2 per page)
    if (item.excerpts && item.excerpts.length > 0) {
      for (const excerpt of item.excerpts.slice(0, 2)) {
        // Extract key sentences from excerpt
        const sentences = excerpt.text.split(/[.!?]+/).filter(s => s.trim().length > 20);
        if (sentences.length > 0) {
          keyFacts.push({
            fact: sentences[0].trim(),
            sourceUrl: item.url,
            excerptId: excerpt.id,
          });
        }
      }
    }
  }
  
  // Generate markdown brief
  let markdown = `# Brief: ${companyOrSite}\n\n`;
  markdown += `*Generated from ${fetchedData.length} source${fetchedData.length !== 1 ? 's' : ''}*\n\n`;
  
  // Add key facts section
  if (keyFacts.length > 0) {
    markdown += `## Key Facts\n\n`;
    for (let i = 0; i < Math.min(keyFacts.length, 10); i++) {
      const fact = keyFacts[i];
      const citation = `[${i + 1}]`;
      citations.push({
        id: i + 1,
        url: fact.sourceUrl,
        excerptId: fact.excerptId,
      });
      markdown += `${citation} ${fact.fact}\n\n`;
    }
  }
  
  // Add sources section
  if (urls.length > 0) {
    markdown += `## Sources\n\n`;
    for (let i = 0; i < urls.length; i++) {
      markdown += `${i + 1}. ${urls[i]}\n`;
    }
    markdown += `\n`;
  }
  
  // Add citations section
  if (citations.length > 0) {
    markdown += `## Citations\n\n`;
    for (const citation of citations) {
      let citationText = `[${citation.id}] ${citation.url}`;
      if (citation.excerptId) {
        citationText += ` (excerpt: ${citation.excerptId})`;
      }
      markdown += `${citationText}\n`;
    }
  }
  
  return {
    briefMarkdown: markdown,
    evidence: {
      keyFacts: keyFacts.slice(0, 10), // Limit to 10 facts
      urls,
    },
  };
}

/**
 * Brief endpoint - generate action-ready brief
 */
async function handleBrief(request, requestId, env) {
  try {
    // Parse request body
    const { data: body, error: parseError } = await safeParseJson(request, requestId);
    if (parseError) return parseError;
    
    const { companyOrSite, seedUrl, query, disableAutoSave = false } = body;
    
    if (!companyOrSite || typeof companyOrSite !== 'string') {
      return createErrorResponse(
        'VALIDATION_ERROR',
        'companyOrSite parameter is required and must be a string',
        { received: typeof companyOrSite },
        400,
        requestId
      );
    }
    
    let fetchedData = [];
    
    // Determine seedUrl: use provided seedUrl, or try to convert companyOrSite to URL
    let effectiveSeedUrl = seedUrl;
    if (!effectiveSeedUrl && companyOrSite) {
      // Try to treat companyOrSite as URL if it looks like one
      if (companyOrSite.startsWith('http://') || companyOrSite.startsWith('https://')) {
        effectiveSeedUrl = companyOrSite;
      } else if (/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(companyOrSite.trim())) {
        effectiveSeedUrl = `https://${companyOrSite.trim().toLowerCase()}`;
      } else {
        const normalized = companyOrSite.toLowerCase().replace(/[^a-z0-9]/g, '');
        effectiveSeedUrl = `https://${normalized}.com`;
      }
    }
    
    // If seedUrl provided (or derived), use /crawl
    if (effectiveSeedUrl) {
      const validation = validateUrl(effectiveSeedUrl);
      if (!validation.valid) {
        // If URL validation fails, try using companyOrSite as search query
        if (companyOrSite && !seedUrl) {
          // Fall through to search path
          effectiveSeedUrl = null;
        } else {
          return createErrorResponse(
            'VALIDATION_ERROR',
            'Invalid seedUrl provided',
            { error: validation.error, input: effectiveSeedUrl },
            400,
            requestId
          );
        }
      }
      
      if (effectiveSeedUrl && validation.valid) {
        // Discover and crawl (small budget for brief)
        // Always include the homepage as first priority
        const candidates = await discoverPages(validation.url, 5);
        const prioritized = [{ url: validation.url }, ...candidates.slice(0, 3)]
          .filter((c, i, arr) => arr.findIndex(x => x.url === c.url) === i)
          .slice(0, 4);
        
        // Crawl with concurrency — 15s timeout for brief (pages can be large)
        const { results: briefCrawlResults, errors: briefCrawlErrors } = await crawlWithConcurrency(
          prioritized.map(c => c.url),
          2,
          async (targetUrl) => {
            const browserHeaders = getBrowserHeaders();
            const response = await fetch(targetUrl, {
              method: 'GET',
              redirect: 'follow',
              headers: browserHeaders,
            });
            
            if (!response.ok) {
              throw new Error(`HTTP ${response.status}`);
            }
            
            const html = await readHtmlWithLimit(response, MAX_HTML_SIZE);
            const mainText = cleanMainText(html);
            const mainTextLimited = mainText.substring(0, 10000);
            const title = extractTitle(html);
            const excerpts = extractExcerpts(mainTextLimited, 500);
            const signals = detectSignals(html, mainTextLimited, excerpts);
            
            return {
              url: targetUrl,
              finalUrl: response.url,
              title,
              excerpts,
              signals,
              mainText: mainTextLimited,
            };
          },
          15000
        );
        
        fetchedData = briefCrawlResults.map(r => r.data).filter(d => d);
        
        if (fetchedData.length === 0 && briefCrawlErrors.length > 0) {
          console.error(`[brief] All crawls failed for ${effectiveSeedUrl}:`, briefCrawlErrors.map(e => e.reason).join(', '));
        }
      }
    } else if (query || (!effectiveSeedUrl && companyOrSite)) {
      // Use companyOrSite as query if no seedUrl
      const searchQuery = query || companyOrSite;
      
      // Search for the company and use first result as seedUrl
      try {
        const searchResults = await searchProvider(searchQuery, 5);
        if (!searchResults || searchResults.length === 0) {
          return createErrorResponse(
            'NOT_FOUND',
            'No search results found for company',
            { query: searchQuery, hint: 'Try providing a seedUrl directly (e.g., https://example.com)' },
            404,
            requestId
          );
        }
        
        // Use first search result as seedUrl
        const firstResult = searchResults[0];
        const urlValidation = validateUrl(firstResult.url);
        if (!urlValidation.valid) {
          return createErrorResponse(
            'VALIDATION_ERROR',
            'Invalid URL from search results',
            { url: firstResult.url, error: urlValidation.error },
            400,
            requestId
          );
        }
        
        // Discover and crawl from search result
        const candidates = await discoverPages(urlValidation.url, 5);
        const prioritized = candidates.slice(0, 3);
        
        const { results } = await crawlWithConcurrency(
          prioritized.map(c => c.url),
          2,
          async (targetUrl) => {
            const browserHeaders = getBrowserHeaders();
            const response = await fetch(targetUrl, {
              method: 'GET',
              redirect: 'follow',
              headers: browserHeaders,
            });
            
            if (!response.ok) {
              throw new Error(`HTTP ${response.status}`);
            }
            
            const html = await readHtmlWithLimit(response, MAX_HTML_SIZE);
            const mainText = cleanMainText(html);
            const mainTextLimited = mainText.substring(0, 10000);
            const title = extractTitle(html);
            const excerpts = extractExcerpts(mainTextLimited, 500);
            const signals = detectSignals(html, mainTextLimited, excerpts);
            
            return {
              url: targetUrl,
              finalUrl: response.url,
              title,
              excerpts,
              signals,
            };
          },
          8000
        );
        
        fetchedData = results.map(r => r.data).filter(d => d);
      } catch (searchError) {
        return createErrorResponse(
          'SEARCH_ERROR',
          'Failed to search for company',
          { 
            message: searchError.message,
            query: searchQuery,
            hint: 'Try providing a seedUrl directly (e.g., https://example.com) instead'
          },
          500,
          requestId
        );
      }
    } else {
      return createErrorResponse(
        'VALIDATION_ERROR',
        'Either seedUrl or query parameter is required',
        { received: { seedUrl: !!seedUrl, query: !!query } },
        400,
        requestId
      );
    }
    
    if (fetchedData.length === 0) {
      return createErrorResponse(
        'FETCH_ERROR',
        'No data fetched from sources',
        { seedUrl: effectiveSeedUrl, companyOrSite },
        500,
        requestId
      );
    }
    
    // Generate brief
    const brief = generateBrief(fetchedData, companyOrSite);
    
    // Auto-save to Sanity (unless explicitly disabled)
    let stored = null;
    if (env && !disableAutoSave) {
      try {
        const { initSanityClient, generateAccountKey, storeAccountPack, upsertDocument, extractDomain } = await import('./sanity-client.js');
        const client = initSanityClient(env);
        if (client && effectiveSeedUrl) {
          const accountKey = await generateAccountKey(effectiveSeedUrl);
          if (accountKey) {
            const packResult = await storeAccountPack(
              client,
              accountKey,
              effectiveSeedUrl,
              'brief',
              brief,
              { requestId, autoSaved: true, companyOrSite }
            );
            // Ensure account document exists so brief is discoverable via domain lookup
            try {
              const accountDoc = {
                _type: 'account',
                _id: `account.${accountKey}`,
                accountKey,
                canonicalUrl: effectiveSeedUrl,
                domain: extractDomain(effectiveSeedUrl),
                companyName: companyOrSite || brief?.evidencePack?.companyName || null,
                lastScannedAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                sourceRefs: { packId: `accountPack-${accountKey}` },
              };
              await upsertDocument(client, accountDoc);
            } catch { /* non-critical */ }
            stored = {
              accountKey,
              packId: packResult.id,
            };
          }
        }
      } catch (storeError) {
        console.error('[brief] auto-save to Sanity failed:', storeError?.message);
      }
    }
    
    const responseData = { ...brief };
    if (stored) {
      responseData.stored = stored;
    }
    
    return createSuccessResponse(responseData, requestId);
  } catch (error) {
    console.error('[handleBrief] Error:', error.message);
    return createErrorResponse(
      'INTERNAL_ERROR',
      'Internal server error',
      {},
      500,
      requestId
    );
  }
}

/**
 * Analyze work patterns from LinkedIn profile
 */
function analyzeWorkPatterns(profile) {
  const patterns = {
    jobChangeFrequency: null,
    averageTenure: null,
    tenureTrend: null, // 'increasing', 'decreasing', 'stable'
    roleProgression: null, // 'upward', 'lateral', 'mixed', 'unknown'
    industryStability: null, // 'stable', 'changing', 'unknown',
    companySizePattern: null, // 'growing', 'shrinking', 'mixed', 'unknown'
    geographicMobility: null, // 'stable', 'mobile', 'unknown'
    skillEvolution: [],
    careerStage: null, // 'early', 'mid', 'senior', 'executive', 'unknown'
    transitionPatterns: [],
    opportunities: [],
    risks: [],
  };
  
  if (!profile.experience || profile.experience.length === 0) {
    return patterns;
  }
  
  const experiences = profile.experience.filter(exp => exp.title && exp.company);
  
  if (experiences.length === 0) {
    return patterns;
  }
  
  // Calculate job change frequency
  const totalRoles = experiences.length;
  const dateRanges = experiences
    .map(exp => {
      if (!exp.duration) return null;
      // Parse duration like "Jan 2020 - Present" or "2020 - 2022"
      const match = exp.duration.match(/(\d{4})\s*-\s*(Present|\d{4})/i);
      if (match) {
        const start = parseInt(match[1]);
        const end = match[2].toLowerCase() === 'present' ? new Date().getFullYear() : parseInt(match[2]);
        return { start, end, years: end - start };
      }
      return null;
    })
    .filter(d => d !== null);
  
  if (dateRanges.length > 0) {
    const totalYears = dateRanges.reduce((sum, d) => sum + d.years, 0);
    patterns.averageTenure = totalYears / dateRanges.length;
    patterns.jobChangeFrequency = totalRoles / Math.max(totalYears, 1);
    
    // Analyze tenure trend
    if (dateRanges.length >= 3) {
      const recent = dateRanges.slice(-3).map(d => d.years);
      const older = dateRanges.slice(0, -3).map(d => d.years);
      const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
      const olderAvg = older.length > 0 ? older.reduce((a, b) => a + b, 0) / older.length : recentAvg;
      
      if (recentAvg > olderAvg * 1.2) {
        patterns.tenureTrend = 'increasing';
      } else if (recentAvg < olderAvg * 0.8) {
        patterns.tenureTrend = 'decreasing';
      } else {
        patterns.tenureTrend = 'stable';
      }
    }
  }
  
  // Analyze role progression
  const roleKeywords = {
    intern: 1,
    junior: 2,
    associate: 2,
    coordinator: 2,
    specialist: 3,
    analyst: 3,
    manager: 4,
    senior: 5,
    lead: 5,
    principal: 6,
    director: 7,
    vp: 8,
    vice: 8,
    cto: 9,
    cfo: 9,
    ceo: 10,
    executive: 8,
  };
  
  const roleLevels = experiences.map(exp => {
    const title = (exp.title || '').toLowerCase();
    let maxLevel = 0;
    for (const [keyword, level] of Object.entries(roleKeywords)) {
      if (title.includes(keyword)) {
        maxLevel = Math.max(maxLevel, level);
      }
    }
    return maxLevel || 3; // Default to mid-level if unclear
  });
  
  if (roleLevels.length >= 2) {
    const progression = roleLevels[roleLevels.length - 1] - roleLevels[0];
    if (progression > 1) {
      patterns.roleProgression = 'upward';
    } else if (progression < -1) {
      patterns.roleProgression = 'downward';
    } else {
      patterns.roleProgression = 'lateral';
    }
  }
  
  // Determine career stage
  const currentLevel = roleLevels[roleLevels.length - 1] || 3;
  if (currentLevel >= 8) {
    patterns.careerStage = 'executive';
  } else if (currentLevel >= 6) {
    patterns.careerStage = 'senior';
  } else if (currentLevel >= 4) {
    patterns.careerStage = 'mid';
  } else {
    patterns.careerStage = 'early';
  }
  
  // Analyze industry stability (based on company names - heuristic)
  const companies = experiences.map(exp => exp.company).filter(c => c);
  const uniqueCompanies = new Set(companies);
  patterns.industryStability = uniqueCompanies.size <= totalRoles * 0.5 ? 'stable' : 'changing';
  
  // Skill evolution (if skills are available)
  if (profile.skills && profile.skills.length > 0) {
    patterns.skillEvolution = profile.skills.slice(0, 20); // Top skills
  }
  
  // Identify opportunities
  if (patterns.roleProgression === 'upward' && patterns.tenureTrend === 'increasing') {
    patterns.opportunities.push('Strong upward trajectory with increasing tenure suggests readiness for next level');
  }
  
  if (patterns.averageTenure && patterns.averageTenure < 2) {
    patterns.opportunities.push('Frequent role changes may indicate high demand or growth opportunities');
  }
  
  if (patterns.roleProgression === 'lateral' && patterns.averageTenure && patterns.averageTenure > 3) {
    patterns.opportunities.push('Stable tenure with lateral movement may indicate readiness for promotion or new challenge');
  }
  
  // Identify risks
  if (patterns.jobChangeFrequency && patterns.jobChangeFrequency > 0.5) {
    patterns.risks.push('High job change frequency may raise questions about commitment');
  }
  
  if (patterns.tenureTrend === 'decreasing') {
    patterns.risks.push('Decreasing tenure trend may indicate restlessness or external factors');
  }
  
  return patterns;
}

/**
 * Map potential 2nd degree relationships from LinkedIn profile
 */
function mapNetworkRelationships(profile) {
  const network = {
    directConnections: profile.connections || null,
    followers: profile.followers || null,
    mutualConnections: [],
    sharedExperiences: [],
    sharedEducation: [],
    potentialConnections: [],
    networkStrength: null, // 'strong', 'moderate', 'weak', 'unknown'
    relationshipIndicators: [],
  };
  
  // Extract shared experiences (companies)
  if (profile.experience && profile.experience.length > 0) {
    const companies = profile.experience.map(exp => exp.company).filter(c => c);
    network.sharedExperiences = [...new Set(companies)];
  }
  
  // Extract shared education
  if (profile.education && profile.education.length > 0) {
    const schools = profile.education.map(edu => edu.school).filter(s => s);
    network.sharedEducation = [...new Set(schools)];
  }
  
  // Calculate network strength
  let strengthScore = 0;
  if (network.directConnections) {
    if (network.directConnections > 500) strengthScore += 3;
    else if (network.directConnections > 200) strengthScore += 2;
    else if (network.directConnections > 50) strengthScore += 1;
  }
  
  if (network.followers) {
    if (network.followers > 1000) strengthScore += 2;
    else if (network.followers > 500) strengthScore += 1;
  }
  
  if (network.sharedExperiences.length > 0) strengthScore += 1;
  if (network.sharedEducation.length > 0) strengthScore += 1;
  
  if (strengthScore >= 5) {
    network.networkStrength = 'strong';
  } else if (strengthScore >= 3) {
    network.networkStrength = 'moderate';
  } else if (strengthScore >= 1) {
    network.networkStrength = 'weak';
  } else {
    network.networkStrength = 'unknown';
  }
  
  // Generate relationship indicators
  if (network.sharedExperiences.length > 0) {
    network.relationshipIndicators.push({
      type: 'shared_company',
      value: `Worked at ${network.sharedExperiences.length} company(ies)`,
      potentialConnections: `Potential connections through ${network.sharedExperiences.join(', ')}`,
    });
  }
  
  if (network.sharedEducation.length > 0) {
    network.relationshipIndicators.push({
      type: 'shared_education',
      value: `Attended ${network.sharedEducation.length} school(s)`,
      potentialConnections: `Potential connections through ${network.sharedEducation.join(', ')}`,
    });
  }
  
  // Generate potential 2nd degree connection suggestions
  if (network.sharedExperiences.length > 0) {
    network.potentialConnections.push({
      type: 'colleague',
      description: `Former colleagues from ${network.sharedExperiences[0]}`,
      connectionPath: '1st degree → shared company → 2nd degree',
    });
  }
  
  if (network.sharedEducation.length > 0) {
    network.potentialConnections.push({
      type: 'alumni',
      description: `Alumni from ${network.sharedEducation[0]}`,
      connectionPath: '1st degree → shared school → 2nd degree',
    });
  }
  
  if (profile.skills && profile.skills.length > 0) {
    network.potentialConnections.push({
      type: 'skill_match',
      description: `Professionals with similar skills: ${profile.skills.slice(0, 3).join(', ')}`,
      connectionPath: '1st degree → shared skills → 2nd degree',
    });
  }
  
  return network;
}

/**
 * Analyze career trajectory and identify trends and opportunities
 */
function analyzeCareerTrajectory(profile, workPatterns) {
  const trajectory = {
    overallTrend: null, // 'accelerating', 'stable', 'declining', 'unknown'
    keyMilestones: [],
    skillGrowth: null, // 'expanding', 'deepening', 'stagnant', 'unknown'
    industryPosition: null, // 'leader', 'established', 'emerging', 'unknown'
    marketValue: null, // 'high', 'medium', 'low', 'unknown'
    nextSteps: [],
    growthOpportunities: [],
    careerInsights: [],
    timeline: [],
  };
  
  if (!profile.experience || profile.experience.length === 0) {
    return trajectory;
  }
  
  const experiences = profile.experience.filter(exp => exp.title && exp.company);
  
  // Build timeline
  experiences.forEach((exp, index) => {
    trajectory.timeline.push({
      role: exp.title,
      company: exp.company,
      duration: exp.duration,
      position: index + 1,
      level: workPatterns.roleProgression === 'upward' ? 'progression' : 'stable',
    });
  });
  
  // Identify key milestones
  if (experiences.length >= 2) {
    const firstRole = experiences[0];
    const currentRole = experiences[experiences.length - 1];
    
    trajectory.keyMilestones.push({
      type: 'first_role',
      description: `Started career as ${firstRole.title} at ${firstRole.company}`,
      significance: 'Career foundation',
    });
    
    trajectory.keyMilestones.push({
      type: 'current_role',
      description: `Currently ${currentRole.title} at ${currentRole.company}`,
      significance: 'Current position',
    });
    
    // Check for significant role changes
    if (workPatterns.roleProgression === 'upward') {
      trajectory.keyMilestones.push({
        type: 'progression',
        description: 'Consistent upward career progression',
        significance: 'Strong growth trajectory',
      });
    }
  }
  
  // Analyze skill growth
  if (profile.skills && profile.skills.length > 0) {
    if (profile.skills.length > 10) {
      trajectory.skillGrowth = 'expanding';
    } else if (profile.skills.length > 5) {
      trajectory.skillGrowth = 'deepening';
    } else {
      trajectory.skillGrowth = 'focused';
    }
  }
  
  // Determine overall trend
  if (workPatterns.roleProgression === 'upward' && workPatterns.tenureTrend === 'increasing') {
    trajectory.overallTrend = 'accelerating';
  } else if (workPatterns.roleProgression === 'upward') {
    trajectory.overallTrend = 'stable';
  } else if (workPatterns.roleProgression === 'lateral') {
    trajectory.overallTrend = 'stable';
  } else {
    trajectory.overallTrend = 'unknown';
  }
  
  // Determine industry position
  if (workPatterns.careerStage === 'executive') {
    trajectory.industryPosition = 'leader';
  } else if (workPatterns.careerStage === 'senior') {
    trajectory.industryPosition = 'established';
  } else if (workPatterns.careerStage === 'mid') {
    trajectory.industryPosition = 'emerging';
  } else {
    trajectory.industryPosition = 'unknown';
  }
  
  // Estimate market value
  if (workPatterns.careerStage === 'executive' || workPatterns.careerStage === 'senior') {
    trajectory.marketValue = 'high';
  } else if (workPatterns.careerStage === 'mid') {
    trajectory.marketValue = 'medium';
  } else {
    trajectory.marketValue = 'low';
  }
  
  // Generate next steps
  if (workPatterns.roleProgression === 'upward' && workPatterns.averageTenure && workPatterns.averageTenure > 2) {
    trajectory.nextSteps.push('Consider exploring opportunities at next level');
  }
  
  if (workPatterns.tenureTrend === 'increasing') {
    trajectory.nextSteps.push('Strong tenure suggests readiness for leadership roles');
  }
  
  if (trajectory.skillGrowth === 'expanding') {
    trajectory.nextSteps.push('Broad skill set positions well for diverse opportunities');
  }
  
  // Growth opportunities
  if (workPatterns.careerStage === 'mid' && workPatterns.roleProgression === 'upward') {
    trajectory.growthOpportunities.push({
      type: 'promotion',
      description: 'Strong progression pattern suggests readiness for senior roles',
      confidence: 'high',
    });
  }
  
  if (workPatterns.industryStability === 'changing' && workPatterns.roleProgression === 'upward') {
    trajectory.growthOpportunities.push({
      type: 'industry_expansion',
      description: 'Experience across industries provides flexibility for new opportunities',
      confidence: 'medium',
    });
  }
  
  if (profile.skills && profile.skills.length > 10) {
    trajectory.growthOpportunities.push({
      type: 'skill_diversification',
      description: 'Broad skill set enables transition to new domains',
      confidence: 'high',
    });
  }
  
  // Career insights
  if (workPatterns.averageTenure && workPatterns.averageTenure < 2) {
    trajectory.careerInsights.push('Frequent role changes may indicate high demand or rapid growth');
  }
  
  if (workPatterns.tenureTrend === 'increasing') {
    trajectory.careerInsights.push('Increasing tenure suggests growing satisfaction and commitment');
  }
  
  if (workPatterns.roleProgression === 'upward') {
    trajectory.careerInsights.push('Consistent upward progression demonstrates strong performance');
  }
  
  return trajectory;
}

/**
 * LinkedIn profile endpoint
 */
async function handleLinkedInProfile(request, requestId, env) {
  const { initSanityClient } = await import('./sanity-client.js');
  try {
    // Parse request body
    const { data: body, error: parseError } = await safeParseJson(request, requestId);
    if (parseError) return parseError;
    
    const { profileUrl, profileHtml, profileText } = body;
    
    // Validate URL
    if (!profileUrl || typeof profileUrl !== 'string') {
      return createErrorResponse(
        'VALIDATION_ERROR',
        'profileUrl parameter is required and must be a string',
        { received: typeof profileUrl },
        400,
        requestId
      );
    }
    
    // Validate it's a LinkedIn URL
    if (!profileUrl.includes('linkedin.com/in/') && !profileUrl.includes('linkedin.com/pub/')) {
      return createErrorResponse(
        'VALIDATION_ERROR',
        'profileUrl must be a LinkedIn profile URL (linkedin.com/in/...)',
        { received: profileUrl },
        400,
        requestId
      );
    }
    
    // Normalize LinkedIn URL
    let normalizedUrl = profileUrl;
    try {
      const urlObj = new URL(profileUrl);
      // Ensure we're using the public profile view
      if (urlObj.pathname.includes('/in/')) {
        // Remove query parameters that might require auth
        normalizedUrl = `${urlObj.origin}${urlObj.pathname.split('?')[0]}`;
      }
    } catch (e) {
      return createErrorResponse(
        'VALIDATION_ERROR',
        'Invalid URL format',
        { error: e.message, input: profileUrl },
        400,
        requestId
      );
    }
    
    // Check cache
    const cacheKey = `linkedin:${hashUrl(normalizedUrl)}`;
    if (!cacheInstance) {
      cacheInstance = new CacheInterface(env);
    }
    
    const cached = await cacheInstance.get(cacheKey);
    if (cached && cached.data) {
      // Return cached data (already includes workPatterns, network, trajectory)
      return createSuccessResponse(
        {
          ...cached.data,
          cache: {
            hit: true,
            ageSec: Math.floor((Date.now() - cached.cachedAt) / 1000),
            contentHash: cached.contentHash || null,
          },
        },
        requestId
      );
    }
    
    const finalizeProfile = async (profile, contentForHash, source) => {
      const workPatterns = analyzeWorkPatterns(profile);
      const network = mapNetworkRelationships(profile);
      const trajectory = analyzeCareerTrajectory(profile, workPatterns);
      const enrichedProfile = {
        ...profile,
        workPatterns,
        network,
        trajectory,
        source,
      };

      const contentHash = await calculateContentHash(contentForHash || '');
      await cacheInstance.set(cacheKey, {
        data: enrichedProfile,
        contentHash,
      }, 6 * 60 * 60 * 1000);

      let stored = null;
      if (env) {
        try {
          const client = initSanityClient(env);
          if (client) {
            const { storePersonWithRelationships } = await import('./services/enhanced-storage-service.js');
            const { groqQuery, upsertDocument } = await import('./sanity-client.js');
            const personData = {
              linkedInUrl: normalizedUrl,
              profileUrl: normalizedUrl,
              name: enrichedProfile.name,
              headline: enrichedProfile.headline,
              location: enrichedProfile.location,
              about: enrichedProfile.about,
              experience: enrichedProfile.experience || [],
              education: enrichedProfile.education || [],
              skills: enrichedProfile.skills || [],
              connections: enrichedProfile.connections || 0,
              followers: enrichedProfile.followers || 0,
              workPatterns: enrichedProfile.workPatterns || {},
              trajectory: enrichedProfile.trajectory || {},
              network: enrichedProfile.network || {},
              currentCompany: enrichedProfile.experience?.[0]?.company || null,
              currentTitle: enrichedProfile.experience?.[0]?.title || null,
            };

            const storeResult = await storePersonWithRelationships(
              personData,
              groqQuery,
              upsertDocument,
              client,
              {
                autoMerge: true,
                linkToAccount: true,
              }
            );

            if (storeResult.success) {
              stored = {
                personKey: storeResult.personKey,
                isDuplicate: storeResult.isDuplicate || false,
                mergedFrom: storeResult.mergedFrom || [],
              };
            }
          }
        } catch (storeError) {
          console.error('LinkedIn storage error:', storeError);
        }
      }

      const responseData = {
        ...enrichedProfile,
        cache: {
          hit: false,
          ageSec: 0,
          contentHash,
        },
      };

      if (stored) {
        responseData.stored = stored;
      }

      return createSuccessResponse(responseData, requestId);
    };

    const tryLinkedInFallback = async (reason) => {
      try {
        const { parseLinkedInText } = await import('./services/linkedin-scraper.js');
        const proxyTemplate = env?.LINKEDIN_PROXY_TEMPLATE || null;
        const proxyUrl = env?.LINKEDIN_PROXY_URL || null;
        const fallbackUrl = proxyTemplate
          ? proxyTemplate.replace('{{url}}', encodeURIComponent(normalizedUrl))
          : proxyUrl
            ? (proxyUrl.includes('{{url}}')
              ? proxyUrl.replace('{{url}}', encodeURIComponent(normalizedUrl))
              : `${proxyUrl}${normalizedUrl}`)
            : `https://r.jina.ai/http://${normalizedUrl}`;

        const fallbackResponse = await fetchWithTimeout(
          fallbackUrl,
          { method: 'GET', redirect: 'follow' },
          15000
        );
        if (!fallbackResponse.ok) {
          return null;
        }
        const text = await fallbackResponse.text();
        const profile = parseLinkedInText(text, normalizedUrl);
        if (!profile.name && !profile.headline && profile.experience.length === 0) {
          return null;
        }
        return await finalizeProfile(profile, text, `fallback:${reason}`);
      } catch (fallbackError) {
        console.warn('LinkedIn fallback fetch failed:', fallbackError?.message || fallbackError);
        return null;
      }
    };

    // If manual HTML or text is provided, skip fetch and parse directly
    let response;
    let html = '';
    let manualProfile = null;
    if (profileHtml || profileText) {
      const { parseLinkedInProfile, parseLinkedInText } = await import('./services/linkedin-scraper.js');
      if (profileHtml) {
        manualProfile = parseLinkedInProfile(profileHtml, normalizedUrl);
      } else if (profileText) {
        manualProfile = parseLinkedInText(profileText, normalizedUrl);
      }
    }

    if (manualProfile) {
      return await finalizeProfile(manualProfile, profileHtml || profileText || '', 'manual');
    }
    
    try {
      // Use Google referer to simulate search click (most common way to access LinkedIn)
      const linkedInHeaders = getLinkedInHeaders('https://www.google.com/search?q=linkedin');
      
      response = await fetchWithTimeout(
        normalizedUrl,
        {
          method: 'GET',
          redirect: 'follow',
          headers: linkedInHeaders,
        },
        15000 // 15 second timeout for LinkedIn
      );
      
      // Check for 999 status (LinkedIn bot protection) - must check before response.ok
      if (response.status === 999) {
        const fallback = await tryLinkedInFallback('999');
        if (fallback) return fallback;
        return createErrorResponse(
          'LINKEDIN_BLOCKED',
          'LinkedIn blocked the request with 999 status (bot protection). Provide profileHtml or profileText to continue without automated access.',
          { 
            status: 999,
            hint: 'Submit profileHtml (DOM export) or profileText (copied profile content) in the request body to bypass bot protection.',
            workaround: 'Provide profileHtml or profileText in the same request.'
          },
          403,
          requestId
        );
      }
      
      if (!response.ok) {
        // Check for LinkedIn-specific blocking
        if (response.status === 403 || response.status === 429) {
          const fallback = await tryLinkedInFallback(String(response.status));
          if (fallback) return fallback;
          return createErrorResponse(
            'LINKEDIN_BLOCKED',
            'LinkedIn blocked the request (may require authentication or rate limited). Provide profileHtml or profileText to continue.',
            { status: response.status, hint: 'Submit profileHtml or profileText in the request body to bypass bot protection.' },
            403,
            requestId
          );
        }
        
        return createErrorResponse(
          'FETCH_ERROR',
          'Failed to fetch LinkedIn profile',
          { status: response.status, url: normalizedUrl },
          500,
          requestId
        );
      }
      
      // Check if we got a challenge page
      html = await readHtmlWithLimit(response, MAX_HTML_SIZE);
      
      // Check for 999 error in HTML content
      if (html.includes('999') || html.includes('Request Denied') || html.includes('unusual traffic')) {
        const fallback = await tryLinkedInFallback('html-999');
        if (fallback) return fallback;
        return createErrorResponse(
          'LINKEDIN_BLOCKED',
          'LinkedIn 999 error detected in response (bot protection). Provide profileHtml or profileText to continue.',
          { 
            hint: 'Submit profileHtml or profileText in the request body to bypass bot protection.',
            workaround: 'Provide profileHtml or profileText in the same request.'
          },
          403,
          requestId
        );
      }
      
      if (html.includes('challenge') || html.includes('security check') || html.includes('verify you\'re human')) {
        const fallback = await tryLinkedInFallback('challenge');
        if (fallback) return fallback;
        return createErrorResponse(
          'LINKEDIN_BLOCKED',
          'LinkedIn challenge page detected (bot protection). Provide profileHtml or profileText to continue.',
          { hint: 'Submit profileHtml or profileText in the request body to bypass bot protection.' },
          403,
          requestId
        );
      }
      
      // Check if we got redirected to login
      if (html.includes('sign-in') || html.includes('login') || response.url.includes('authwall')) {
        return createErrorResponse(
          'LINKEDIN_AUTH_REQUIRED',
          'LinkedIn profile requires authentication',
          { hint: 'This profile may be private or require login to view' },
          401,
          requestId
        );
      }
      
    } catch (fetchError) {
      return createErrorResponse(
        'FETCH_ERROR',
        'Failed to fetch LinkedIn profile',
        { message: fetchError.message, url: normalizedUrl },
        500,
        requestId
      );
    }
    
    // Parse LinkedIn profile using improved DOM scraper
    const { parseLinkedInProfile } = await import('./services/linkedin-scraper.js');
    const profile = parseLinkedInProfile(html, normalizedUrl);

    return await finalizeProfile(profile, html, 'direct');
  } catch (error) {
    console.error('[handleLinkedInProfile] Error:', error.message);
    return createErrorResponse(
      'INTERNAL_ERROR',
      'Internal server error',
      {},
      500,
      requestId
    );
  }
}

/**
 * Cache status endpoint
 */
async function handleCacheStatus(request, requestId, env) {
  try {
    const url = new URL(request.url);
    const targetUrl = url.searchParams.get('url');
    
    if (!targetUrl) {
      return createErrorResponse(
        'VALIDATION_ERROR',
        'url parameter is required',
        { hint: 'Provide ?url=<target-url>' },
        400,
        requestId
      );
    }
    
    const validation = validateUrl(targetUrl);
    if (!validation.valid) {
      return createErrorResponse(
        'VALIDATION_ERROR',
        'Invalid URL provided',
        { error: validation.error, input: targetUrl },
        400,
        requestId
      );
    }
    
    const inputUrl = validation.url;
    const cacheKey = `extract:${hashUrl(inputUrl)}`;
    
    // Initialize cache if needed
    if (!cacheInstance) {
      cacheInstance = new CacheInterface(env);
    }
    
    const metadata = await cacheInstance.getMetadata(cacheKey);
    
    if (!metadata) {
      return createSuccessResponse(
        {
          url: inputUrl,
          cached: false,
          cache: {
            hit: false,
            ageSec: null,
            contentHash: null,
          },
        },
        requestId
      );
    }
    
    return createSuccessResponse(
      {
        url: inputUrl,
        cached: true,
        cache: metadata,
      },
      requestId
    );
  } catch (error) {
    console.error('[handleCacheStatus] Error:', error.message);
    return createErrorResponse(
      'INTERNAL_ERROR',
      'Internal server error',
      {},
      500,
      requestId
    );
  }
}

/**
 * Health check endpoint
 */
async function handleHealth(requestId, env = null) {
  const { initSanityClient, groqQuery } = await import('./sanity-client.js');
  const health = {
    ok: true,
    ts: new Date().toISOString(),
    version: '1.1.0',
    requestId,
  };

  if (env) {
    const sanityConfigured = !!(env.SANITY_PROJECT_ID && (env.SANITY_TOKEN || env.SANITY_API_TOKEN));
    let sanityReachable = false;
    if (sanityConfigured) {
      try {
        const client = initSanityClient(env);
        if (client) {
          const testResult = await groqQuery(client, 'count(*[_type == "interaction"][0...1])', {});
          sanityReachable = typeof testResult === 'number' || (Array.isArray(testResult) && testResult.length >= 0);
        }
      } catch (_) {
        sanityReachable = false;
      }
    }

    const dependencies = {
      sanity: {
        configured: sanityConfigured,
        projectId: env.SANITY_PROJECT_ID ? '***' : null,
        reachable: sanityConfigured ? sanityReachable : null,
      },
      osintQueue: {
        configured: !!env.OSINT_QUEUE,
        available: !!env.OSINT_QUEUE,
      },
      osintJobsDO: {
        configured: !!env.OSINT_JOBS_DO,
        available: !!env.OSINT_JOBS_DO,
      },
    };

    health.dependencies = dependencies;
    health.status = 'operational';

    if (!dependencies.sanity.configured) {
      health.warnings = health.warnings || [];
      health.warnings.push('Sanity CMS not configured - content lake recall and storage unavailable');
    } else if (!dependencies.sanity.reachable) {
      health.warnings = health.warnings || [];
      health.warnings.push('Sanity dataset unreachable - check SANITY_PROJECT_ID, SANITY_TOKEN, and dataset');
    }
  }

  return addCorsHeaders(
    new Response(
      JSON.stringify(health),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    )
  );
}

/**
 * Sanity connection status (GET /sanity/status)
 * Uses sanity-client.js for a single source of truth on connectivity.
 */
async function handleSanityStatus(requestId, env = null) {
  const status = {
    configured: false,
    reachable: null,
    projectId: null,
    dataset: null,
    requestId,
    ts: new Date().toISOString(),
  };
  if (!env) {
    return addCorsHeaders(
      new Response(JSON.stringify(status), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
  }
  const { initSanityClient, groqQuery } = await import('./sanity-client.js');
  status.configured = !!(env.SANITY_PROJECT_ID && (env.SANITY_TOKEN || env.SANITY_API_TOKEN));
  status.projectId = env.SANITY_PROJECT_ID ? '***' : null;
  status.dataset = env.SANITY_DATASET || 'production';
  if (status.configured) {
    try {
      const client = initSanityClient(env);
      if (client) {
        const testResult = await groqQuery(client, 'count(*[_type == "interaction"][0...1])', {});
        status.reachable = typeof testResult === 'number' || (Array.isArray(testResult) && testResult.length >= 0);
      }
    } catch (err) {
      status.reachable = false;
      const msg = (err && err.message) ? String(err.message) : '';
      // Sanitize for response: keep status codes and "fetch" / "error" phrases only
      const sanitized = msg.replace(/Bearer\s+[^\s]+/gi, 'Bearer ***').replace(/https?:\/\/[^\s]+/g, '***');
      if (sanitized.length <= 120) status.errorDetail = sanitized;
      else status.errorDetail = sanitized.slice(0, 117) + '...';
      if (msg.includes('401')) status.errorHint = 'Token invalid or expired (401). Run: wrangler secret put SANITY_TOKEN --env=production';
      else if (msg.includes('403')) status.errorHint = 'Token forbidden (403). Check token has at least Viewer role in Sanity.';
      else if (msg.includes('404')) status.errorHint = 'Project or dataset not found (404). Check SANITY_PROJECT_ID and dataset name.';
      else status.errorHint = 'Set secret for production: wrangler secret put SANITY_TOKEN --env=production (you must use --env=production)';
    }
  }
  return addCorsHeaders(
    new Response(JSON.stringify(status), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  );
}

/**
 * Sanity write verification (POST /sanity/verify-write)
 * Creates and deletes a test document to confirm mutations work. Use to verify your database is writable.
 */
async function handleSanityVerifyWrite(requestId, env = null) {
  if (!env) {
    return addCorsHeaders(
      new Response(
        JSON.stringify({
          ok: false,
          error: 'CONFIG_ERROR',
          message: 'Environment not available',
          requestId,
        }),
        { status: 503, headers: { 'Content-Type': 'application/json' } }
      )
    );
  }
  try {
    const { initSanityClient, upsertDocument, deleteDocument } = await import('./sanity-client.js');
    const client = initSanityClient(env);
    if (!client) {
      return addCorsHeaders(
        new Response(
          JSON.stringify({
            ok: false,
            error: 'SANITY_NOT_CONFIGURED',
            message: 'Sanity not configured. Set SANITY_PROJECT_ID and SANITY_TOKEN.',
            requestId,
          }),
          { status: 503, headers: { 'Content-Type': 'application/json' } }
        )
      );
    }
    const testId = 'connectionTest-' + Date.now();
    await upsertDocument(client, { _type: 'connectionTest', _id: testId, ts: new Date().toISOString() });
    await deleteDocument(client, testId);
    return addCorsHeaders(
      new Response(
        JSON.stringify({
          ok: true,
          wrote: true,
          message: 'Sanity write verified (create + delete test document)',
          requestId,
          ts: new Date().toISOString(),
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );
  } catch (err) {
    return addCorsHeaders(
      new Response(
        JSON.stringify({
          ok: false,
          error: 'SANITY_WRITE_FAILED',
          message: err?.message || 'Sanity write failed',
          requestId,
        }),
        { status: 503, headers: { 'Content-Type': 'application/json' } }
      )
    );
  }
}

const SCHEMA_CACHE_TTL_MS = 60 * 1000;
let cachedSchemaObject = null;
let cachedSchemaObjectAt = 0;

async function getSchemaObject() {
  if (cachedSchemaObject && (Date.now() - cachedSchemaObjectAt) < SCHEMA_CACHE_TTL_MS) {
    return cachedSchemaObject;
  }
  cachedSchemaObject = await buildSchemaObject();
  cachedSchemaObjectAt = Date.now();
  return cachedSchemaObject;
}

async function buildSchemaObject() {
  const schema = {
    endpoints: {
      '/health': {
        method: 'GET',
        description: 'Health check endpoint',
        response: {
          ok: true,
          ts: 'ISO 8601 timestamp',
          version: 'API version string',
          requestId: 'Unique request identifier',
        },
      },
      '/sanity/status': {
        method: 'GET',
        description: 'Sanity CMS connection status (configured, reachable, dataset)',
        response: {
          configured: 'boolean',
          reachable: 'boolean | null',
          projectId: '*** when set',
          dataset: 'string',
          requestId: 'string',
          ts: 'ISO 8601 timestamp',
        },
      },
      '/scan': {
        method: 'GET',
        description: 'Scan a single website URL for tech stack, business intelligence, and digital maturity',
        parameters: {
          url: {
            type: 'string',
            required: true,
            description: 'Target URL to scan',
          },
        },
        response: {
          ok: true,
          data: {
            input: 'Original input URL',
            finalUrl: 'Final URL after redirects',
            status: 'HTTP status code',
            headers: 'Object of allowed response headers',
            generator: 'HTML generator meta tag value',
            htmlSnippet: 'First 20KB of HTML',
            scriptSrcs: 'Array of script src URLs',
            linkHrefs: 'Array of link href URLs',
            robotsUrl: 'URL of robots.txt',
            robotsPresent: 'Boolean indicating robots.txt existence',
            sitemapChecks: 'Array of sitemap check results',
            technologyStack: 'Object with CMS, frameworks, legacy systems, migration opportunities',
            businessUnits: 'Object with detected business areas and subdomains',
            digitalGoals: 'Object with detected digital initiatives and goals',
            jobAnalysis: 'Object with careers page and job posting analysis',
            aiReadiness: 'Object with AI readiness score and recommendations',
            businessScale: 'Object with traffic, revenue, and cost indicators',
            performance: 'Object with performance metrics and recommendations',
            digitalMaturity: 'Object with digital maturity score and level',
            fetchedAt: 'ISO 8601 timestamp',
          },
          requestId: 'Unique request identifier',
        },
      },
      '/scan-batch': {
        method: 'GET',
        description: 'Scan multiple URLs in batch mode with stack ranking and peer comparison',
        parameters: {
          urls: {
            type: 'string',
            required: true,
            description: 'Comma-separated URLs or JSON array',
          },
          mode: {
            type: 'string',
            required: false,
            default: 'light',
            description: 'Scan mode: "light" (max 10 URLs) or "full" (max 3 URLs)',
          },
          includeFullData: {
            type: 'boolean',
            required: false,
            default: false,
            description: 'Include full scan data in results',
          },
          includeHtmlSnippet: {
            type: 'boolean',
            required: false,
            default: false,
            description: 'Include HTML snippets in results',
          },
        },
        response: {
          ok: true,
          data: {
            summary: {
              totalScanned: 'Number of URLs processed',
              successful: 'Number of successful scans',
              failed: 'Number of failed scans',
              mode: 'Scan mode used',
              concurrency: 'Concurrency limit used',
              timeoutMs: 'Timeout in milliseconds',
              topAIReady: 'Top 5 URLs by AI readiness score',
              topOpportunities: 'Top 5 URLs by opportunity score',
              guidance: 'Usage guidance string',
              peerCohorts: 'Array of peer cohort summaries',
            },
            results: 'Array of stack-ranked scan results with peer comparisons',
            failed: 'Array of failed scan attempts',
            scannedAt: 'ISO 8601 timestamp',
          },
          requestId: 'Unique request identifier',
        },
      },
      '/schema': {
        method: 'GET',
        description: 'Self-documentation endpoint listing all available endpoints and their schemas',
        response: {
          ok: true,
          data: 'This schema object',
          requestId: 'Unique request identifier',
        },
      },
      '/search': {
        method: 'POST',
        description: 'Search the web with ranking, deduplication, and intent classification',
        requestBody: {
          query: {
            type: 'string',
            required: true,
            description: 'Search query string',
          },
          limit: {
            type: 'number',
            required: false,
            default: 10,
            description: 'Maximum number of results (1-50)',
          },
          recencyDays: {
            type: 'number',
            required: false,
            default: 30,
            description: 'Number of days for recency scoring',
          },
          mode: {
            type: 'string',
            required: false,
            default: 'fast',
            enum: ['fast', 'deep'],
            description: 'Search mode (currently unused, reserved for future use)',
          },
        },
        response: {
          ok: true,
          data: {
            results: 'Array of RankedResult objects with url, title, snippet, source, scoreBreakdown, classifiedIntent, dedupedGroupId',
          },
          requestId: 'Unique request identifier',
        },
        note: 'Uses Brave Search API (free tier: 2000/month). Set BRAVE_SEARCH_API_KEY secret. Get a key at https://brave.com/search/api/',
      },
      '/discover': {
        method: 'POST',
        description: 'Discover likely pages on a website (pricing, security, docs, careers, etc.)',
        requestBody: {
          url: {
            type: 'string',
            required: true,
            description: 'Base URL to discover pages from',
          },
          budget: {
            type: 'number',
            required: false,
            default: 20,
            description: 'Maximum number of candidates to return (1-50)',
          },
        },
        response: {
          ok: true,
          data: {
            canonicalRoot: 'Canonical root URL (origin)',
            candidates: 'Array of {url, type, reason} objects',
          },
          requestId: 'Unique request identifier',
        },
      },
      '/crawl': {
        method: 'POST',
        description: 'Crawl and fetch prioritized pages with concurrency limits',
        requestBody: {
          url: {
            type: 'string',
            required: true,
            description: 'Base URL to crawl',
          },
          depth: {
            type: 'number',
            required: false,
            default: 1,
            enum: [1, 2],
            description: 'Crawl depth (1 or 2)',
          },
          budget: {
            type: 'number',
            required: false,
            default: 20,
            description: 'Maximum number of pages to fetch (1-50)',
          },
          includeTypes: {
            type: 'array',
            required: false,
            description: 'Filter by page types (pricing, security, docs, careers, blog, about, news)',
          },
        },
        response: {
          ok: true,
          data: {
            root: 'Root URL',
            fetched: 'Array of EvidencePack-like objects',
            skipped: 'Array of {url, reason} for failed/skipped URLs',
          },
          requestId: 'Unique request identifier',
        },
      },
      '/linkedin/profile': {
        method: 'POST',
        description: 'Scan LinkedIn public profile (operates like human interaction)',
        requestBody: {
          profileUrl: {
            type: 'string',
            required: true,
            description: 'LinkedIn profile URL (e.g., https://www.linkedin.com/in/username)',
          },
        },
        response: {
          ok: true,
          data: {
            url: 'Profile URL',
            name: 'Full name',
            headline: 'Professional headline',
            location: 'Location',
            about: 'About section text',
            experience: 'Array of {title, company, duration}',
            education: 'Array of {school, degree}',
            skills: 'Array of skill strings',
            connections: 'Number of connections (if public)',
            languages: 'Array of languages',
            certifications: 'Array of certifications',
            projects: 'Array of projects',
            volunteer: 'Array of volunteer experience',
            organizations: 'Array of organizations',
            recommendations: 'Number of recommendations',
            profileImage: 'Profile image URL',
            backgroundImage: 'Background image URL',
            cache: 'Cache metadata {hit, ageSec, contentHash}',
          },
          requestId: 'Unique request identifier',
        },
        note: 'Scans all elements on public LinkedIn profile. May be blocked if profile requires authentication. Uses human-like headers to avoid bot detection.',
        errors: {
          LINKEDIN_BLOCKED: 'LinkedIn blocked the request (bot protection or rate limiting)',
          LINKEDIN_AUTH_REQUIRED: 'Profile requires authentication to view',
        },
      },
      '/linkedin-profile': {
        method: 'POST',
        description: 'Scan public LinkedIn profile and extract all profile elements',
        requestBody: {
          profileUrl: {
            type: 'string',
            required: true,
            description: 'LinkedIn profile URL (linkedin.com/in/username or linkedin.com/pub/username)',
          },
        },
        response: {
          ok: true,
          data: {
            url: 'Profile URL',
            name: 'Full name',
            headline: 'Professional headline',
            location: 'Location',
            about: 'About section text',
            experience: 'Array of {title, company, duration, location, description}',
            education: 'Array of {school, degree, field, duration}',
            skills: 'Array of skill strings',
            certifications: 'Array of certification objects',
            languages: 'Array of language strings',
            connections: 'Number of connections (if visible)',
            followers: 'Number of followers (if visible)',
            profileImage: 'Profile image URL',
            backgroundImage: 'Background image URL',
            contactInfo: 'Contact information object',
            recommendations: 'Array of recommendations',
            publications: 'Array of publications',
            projects: 'Array of projects',
            volunteer: 'Array of volunteer experiences',
            honors: 'Array of honors/awards',
            organizations: 'Array of organizations',
            courses: 'Array of courses',
            testScores: 'Array of test scores',
            extractedAt: 'ISO 8601 timestamp',
            cache: 'Cache metadata {hit, ageSec, contentHash}',
          },
          requestId: 'Unique request identifier',
        },
        note: 'Uses human-like headers to bypass LinkedIn bot protection. Public profiles only. May be blocked if bot protection is active.',
      },
      '/brief': {
        method: 'POST',
        description: 'Generate action-ready brief with citations from crawled data',
        requestBody: {
          companyOrSite: {
            type: 'string',
            required: true,
            description: 'Company or site name for the brief',
          },
          seedUrl: {
            type: 'string',
            required: false,
            description: 'Seed URL to crawl (if provided, uses /crawl)',
          },
          query: {
            type: 'string',
            required: false,
            description: 'Search query (if provided, uses /search then /crawl on top domain)',
          },
        },
        response: {
          ok: true,
          data: {
            briefMarkdown: 'Markdown-formatted brief with citations',
            evidence: {
              keyFacts: 'Array of {fact, sourceUrl, excerptId}',
              urls: 'Array of source URLs',
            },
          },
          requestId: 'Unique request identifier',
        },
        note: 'Requires either seedUrl or query. Currently only seedUrl is implemented.',
      },
      '/verify': {
        method: 'POST',
        description: 'Verify claims against multiple sources (multi-source verification)',
        requestBody: {
          claims: {
            type: 'array',
            required: true,
            description: 'Array of claim strings to verify',
            items: {
              type: 'string',
            },
          },
          sources: {
            type: 'array',
            required: true,
            description: 'Array of source URLs to check claims against',
            items: {
              type: 'string',
            },
          },
        },
        response: {
          ok: true,
          data: {
            verified: 'Array of {claim, status, supportingExcerpts[], contradictingExcerpts[]}',
          },
          requestId: 'Unique request identifier',
        },
        note: 'Status: "supported" (>=2 sources), "contradicted" (explicit mismatch), "unclear" (default/conservative). Uses /extract internally with cache.',
      },
      '/cache/status': {
        method: 'GET',
        description: 'Check cache status for a URL',
        parameters: {
          url: {
            type: 'string',
            required: true,
            description: 'URL to check cache status for',
          },
        },
        response: {
          ok: true,
          data: {
            url: 'Checked URL',
            cached: 'Boolean indicating if URL is cached',
            cache: {
              hit: 'Boolean (true if cached)',
              ageSec: 'Age of cache entry in seconds (null if not cached)',
              contentHash: 'SHA-256 hash of mainText (null if not cached)',
            },
          },
          requestId: 'Unique request identifier',
        },
        note: 'Cache uses KV if CACHE_KV binding is configured, otherwise uses in-memory cache (dev only).',
      },
      '/extract': {
        method: 'POST',
        description: 'Extract structured evidence pack from a URL (mainText, excerpts, entities, signals, claims)',
        requestBody: {
          url: {
            type: 'string',
            required: true,
            description: 'Target URL to extract',
          },
          mode: {
            type: 'string',
            required: false,
            default: 'fast',
            enum: ['fast', 'deep'],
            description: 'Extraction mode: fast (10K chars) or deep (50K chars)',
          },
          maxChars: {
            type: 'number',
            required: false,
            description: 'Maximum characters to extract (overrides mode default)',
          },
        },
        response: {
          ok: true,
          data: {
            url: 'Original input URL',
            finalUrl: 'Final URL after redirects',
            title: 'Page title',
            siteName: 'Site name (if detected)',
            fetchedAt: 'ISO 8601 timestamp',
            contentType: 'Content-Type header',
            status: 'HTTP status code',
            mainText: 'Cleaned main text content',
            excerpts: 'Array of excerpts with id, text, selectorHint, charRange',
            entities: 'Array of entities with type (company/person/product/org/unknown) and name',
            signals: 'Array of signals with type (pricing/security/careers/docs/blog/comparison/integration/login/newsletter/unknown), evidenceExcerptId, confidence',
            claims: 'Array of claims with text, evidenceExcerptId, confidence',
            meta: 'Object with wordCount, languageHint, readingTimeMin',
            cache: 'Object with {hit, ageSec, contentHash} for cache metadata',
          },
          requestId: 'Unique request identifier',
        },
        note: 'Results are cached for 24 hours. Cache metadata is included in response.',
      },
    },
    errorFormat: {
      ok: false,
      error: {
        code: 'Error code string (e.g., "VALIDATION_ERROR", "FETCH_ERROR", "INTERNAL_ERROR")',
        message: 'Human-readable error message',
        details: 'Optional additional error details',
      },
      requestId: 'Unique request identifier',
    },
    version: '1.0.0',
  };

  return schema;
}

async function handleSchema(requestId) {
  const schema = await getSchemaObject();
  return createSuccessResponse(schema, requestId);
}

/**
 * Scan endpoint
 */
async function handleScan(request, requestId, env) {
  try {
    // Import services
    const { detectTechnologyStack } = await import('./services/tech-detector.js');
    const { calculateAIReadinessScore } = await import('./services/ai-readiness.js');
    const { analyzePerformance } = await import('./services/performance-analyzer.js');
    const { analyzeBusinessScale, detectBusinessUnits, detectFutureDigitalGoals } = await import('./services/business-analyzer.js');
    const { analyzeJobPostings } = await import('./services/job-analyzer.js');
    const { initSanityClient, storeAccountPack, upsertAccountSummary, extractDomain, generateAccountKey } = await import('./sanity-client.js');
    
    const url = new URL(request.url);
    const targetUrl = url.searchParams.get('url');
    // Auto-save to Sanity by default (unless explicitly disabled with store=false)
    const shouldStore = url.searchParams.get('store') !== 'false';

    // Validate URL
    const validation = validateUrl(targetUrl);
    if (!validation.valid) {
      return createErrorResponse(
        'VALIDATION_ERROR',
        'Invalid URL provided',
        { error: validation.error, input: targetUrl },
        400,
        requestId
      );
    }

    const inputUrl = validation.url;
    const fetchedAt = new Date().toISOString();

    // Initialize analysis objects up-front (avoid TDZ / "before initialization" errors)
    let techStack = {
      cms: [],
      frameworks: [],
      legacySystems: [],
      pimSystems: [],
      damSystems: [],
      lmsSystems: [],
      analytics: [],
      ecommerce: [],
      hosting: [],
      cssFrameworks: [],
      authProviders: [],
      searchTech: [],
      monitoring: [],
      payments: [],
      marketing: [],
      chat: [],
      cdnMedia: [],
      headlessIndicators: [],
      migrationOpportunities: [],
      painPoints: [],
      roiInsights: [],
      systemDuplication: [],
      allDetected: [],
      opportunityScore: 0,
    };

    let businessUnits = {
      detectedAreas: [],
      subdomains: [],
      separateProperties: [],
      siloIndicators: [],
      totalAreas: 0,
    };

    let digitalGoals = {
      initiatives: [],
      technologyFocus: [],
      growthIndicators: [],
      strategicProjects: [],
      digitalTransformationSignals: [],
    };

    let jobAnalysis = {
      careersPageFound: false,
      careersPageUrl: null,
      recentHires: [],
      digitalContentRoles: [],
      infrastructureRoles: [],
      roleBaselines: { cLevel: [], vp: [], director: [], manager: [] },
      totalJobsFound: 0,
    };

    let aiReadiness = {
      score: 0,
      level: 'Low',
      factors: {
        modernTechStack: 0,
        apiCapabilities: 0,
        dataInfrastructure: 0,
        digitalTransformation: 0,
        aiInitiatives: 0,
        organizationalReadiness: 0,
      },
      recommendations: [],
      justifications: [],
      mismatches: [],
      education: { whatItMeans: '', keyGaps: '', nextSteps: [] },
      summary: 'Insufficient data to calculate AI readiness score',
    };

    let businessScale = {
      trafficIndicators: [],
      revenueIndicators: [],
      costIndicators: [],
      monetizationMethods: [],
      businessScale: 'Unknown',
      estimatedMonthlyTraffic: null,
      estimatedAnnualRevenue: null,
      estimatedInfrastructureCosts: null,
      scaleScore: 0,
    };

    let performance = {
      responseTime: null,
      pageSize: null,
      speedIndicators: [],
      performanceIssues: [],
      optimizationTools: [],
      benchmarks: {},
      performanceScore: 0,
      level: 'Unknown',
      recommendations: [],
      conversationStarters: [],
    };

    // Fetch the homepage
    let response;
    let finalUrl = inputUrl;
    let status = 0;
    let headers = {};
    let html = '';
    let generator = null;
    let scriptSrcs = [];
    let linkHrefs = [];
    let robotsUrl = null;
    let robotsPresent = false;
    let sitemapChecks = [];

    try {
      // Use browser-like headers to bypass Cloudflare bot protection
      const browserHeaders = getBrowserHeaders();
      
      response = await fetch(inputUrl, {
        method: 'GET',
        redirect: 'follow',
        headers: browserHeaders,
      });

      finalUrl = response.url;
      status = response.status;

      // Extract allowed headers
      headers = extractAllowedHeaders(response.headers);

      // Read HTML if content-type suggests HTML
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('text/html') && response.ok) {
        const contentLength = response.headers.get('content-length');
        const sizeLimitExceeded = contentLength && parseInt(contentLength, 10) > MAX_HTML_SIZE;
        if (sizeLimitExceeded) {
          const { handleDistributedCrawl } = await import('./handlers/smart-crawl.js');
          const distributedRequest = new Request('https://worker/crawl/distributed', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              baseUrl: finalUrl,
              autoDiscover: true,
              maxPages: 5,
              strategy: 'smart',
            }),
          });

          const distributedResponse = await handleDistributedCrawl(
            distributedRequest,
            requestId,
            env,
            readHtmlWithLimit,
            getBrowserHeaders,
            fetchWithTimeout,
            extractTitle,
            cleanMainText,
            extractExcerpts,
            detectSignals,
            discoverPages
          );
          const distributedData = await distributedResponse.json().catch(() => ({}));

          return createSuccessResponse(
            {
              input: inputUrl,
              finalUrl,
              status,
              headers,
              fetchedAt,
              strategy: 'distributed',
              sizeLimitExceeded: true,
              distributedCrawl: distributedData.data || null,
              note: 'Page too large for standard crawl; distributed crawl executed.',
            },
            requestId
          );
        }
        html = await readHtmlWithLimit(response, MAX_HTML_SIZE);

        // Extract data from HTML
        generator = extractGenerator(html);
        scriptSrcs = extractScriptSrcs(html);
        linkHrefs = extractLinkHrefs(html);

        // Get robots.txt info
        const robotsInfo = extractRobotsInfo(html, finalUrl);
        robotsUrl = robotsInfo.robotsUrl;

        // Fetch robots.txt
        if (robotsUrl) {
          const robotsData = await fetchRobotsInfo(robotsUrl);
          robotsPresent = robotsData.robotsPresent;
          const sitemapUrls = robotsData.sitemapUrls;

          // Check sitemaps
          sitemapChecks = await checkSitemaps(finalUrl, sitemapUrls);
        } else {
          // Try default sitemap locations even without robots.txt
          sitemapChecks = await checkSitemaps(finalUrl, []);
        }
      } else {
        // Not HTML, but still extract robots info from base URL
        const robotsInfo = extractRobotsInfo('', finalUrl);
        robotsUrl = robotsInfo.robotsUrl;
        if (robotsUrl) {
          const robotsData = await fetchRobotsInfo(robotsUrl);
          robotsPresent = robotsData.robotsPresent;
          sitemapChecks = await checkSitemaps(finalUrl, robotsData.sitemapUrls);
        }
      }
    } catch (fetchError) {
      // Fetch failed, return error info
      return createErrorResponse(
        'FETCH_ERROR',
        'Failed to fetch URL',
        { message: fetchError.message, input: inputUrl, fetchedAt },
        500,
        requestId
      );
    }

    if (html) {
      techStack = detectTechnologyStack(html, headers, scriptSrcs, linkHrefs, generator);
      
      // Extract navigation links for business unit detection
      const navigationLinks = extractNavigationLinks(html, finalUrl);
      businessUnits = detectBusinessUnits(html, navigationLinks, finalUrl);
      digitalGoals = detectFutureDigitalGoals(html, finalUrl);
      jobAnalysis = await analyzeJobPostings(finalUrl, html);
      
      // Analyze business scale, traffic, costs, and revenue
      businessScale = analyzeBusinessScale(html, headers, scriptSrcs, linkHrefs, sitemapChecks, businessUnits);
      
      // Analyze website performance and speed
      performance = analyzePerformance(response, headers, html, scriptSrcs, linkHrefs, finalUrl);
      
      // Calculate AI Readiness Score
      aiReadiness = calculateAIReadinessScore(techStack, digitalGoals, businessUnits, jobAnalysis);
    } else {
      // Still try to detect from headers and URL patterns
      const allHeaders = JSON.stringify(headers).toLowerCase();
      if (headers['x-powered-by']) {
        const poweredBy = headers['x-powered-by'].toLowerCase();
        if (poweredBy.includes('aem') || poweredBy.includes('adobe')) {
          techStack.legacySystems.push('Adobe Experience Manager (AEM)');
          techStack.opportunityScore += 40;
        }
        if (poweredBy.includes('sitecore')) {
          techStack.legacySystems.push('Sitecore');
          techStack.opportunityScore += 40;
        }
        if (poweredBy.includes('drupal')) {
          techStack.legacySystems.push('Drupal (Legacy)');
          techStack.opportunityScore += 30;
        }
        if (poweredBy.includes('wordpress')) {
          techStack.legacySystems.push('WordPress (Legacy)');
          techStack.opportunityScore += 25;
        }
      }
      
      // Analyze business scale even with limited data
      businessScale = analyzeBusinessScale('', headers, [], [], sitemapChecks, businessUnits);
      
      // Analyze performance even with limited data
      performance = analyzePerformance(response, headers, '', [], [], finalUrl);
      
      // Calculate AI Readiness Score even with limited data
      aiReadiness = calculateAIReadinessScore(techStack, digitalGoals, businessUnits, jobAnalysis);
    }
    
    // Analyze performance if not already done (for non-HTML responses)
    if (performance.level === 'Unknown') {
      performance = analyzePerformance(response, headers, html || '', scriptSrcs, linkHrefs, finalUrl);
    }

    const digitalMaturity = calculateDigitalMaturityScore({
      aiReadiness,
      performance,
      technologyStack: techStack,
      businessScale,
    });

    // Build response
    const result = {
      input: inputUrl,
      finalUrl,
      status,
      headers,
      generator,
      htmlSnippet: html.substring(0, HTML_SNIPPET_SIZE),
      scriptSrcs,
      linkHrefs,
      robotsUrl,
      robotsPresent,
      sitemapChecks,
      technologyStack: techStack,
      businessUnits: businessUnits,
      digitalGoals: digitalGoals,
      jobAnalysis: jobAnalysis,
      aiReadiness: aiReadiness,
      businessScale: businessScale,
      performance: performance,
      digitalMaturity: digitalMaturity,
      fetchedAt,
    };

    // Auto-save to Sanity (enabled by default)
    let stored = null;
    let storeError = null;
    let client = null;
    if (shouldStore && env) {
      try {
        client = initSanityClient(env);
        if (!client) {
          storeError = 'Sanity client not initialized - check SANITY_PROJECT_ID and SANITY_TOKEN secrets';
        } else {
          // Use enhanced storage service with automatic deduplication, merging, and relationship detection
          const { storeAccountWithRelationships } = await import('./services/enhanced-storage-service.js');
          const { groqQuery, upsertDocument, storeAccountPack } = await import('./sanity-client.js');
          
          // Prepare account data with scan results
          const accountData = {
            canonicalUrl: finalUrl,
            url: finalUrl,
            companyName: businessUnits?.companyName,
            technologyStack: techStack,
            opportunityScore: techStack.opportunityScore || 0,
            aiReadiness,
            businessScale,
            businessUnits,
            performance,
            accountPack: {
              scan: result,
              techStack: techStack,
            },
            signals: [],
          };

          // Store with relationships (includes deduplication, merging, relationship detection)
          const storeResult = await storeAccountWithRelationships(
            accountData,
            groqQuery,
            upsertDocument,
            client,
            {
              autoDetectRelationships: true,
              autoMerge: true,
              autoEnrich: true,
            }
          );

          if (storeResult.success) {
            // Also store account pack for full data history
            try {
              const packResult = await storeAccountPack(
                client,
                storeResult.accountKey,
                finalUrl,
                'scan',
                result,
                { requestId, autoSaved: true }
              );
              
              stored = {
                accountKey: storeResult.accountKey,
                packId: packResult.id || packResult.success ? 'stored' : null,
                isDuplicate: storeResult.isDuplicate || false,
                mergedFrom: storeResult.mergedFrom || [],
                relationshipsDetected: storeResult.relationships ? {
                  competitors: storeResult.relationships.competitors?.length || 0,
                  similarIndustry: storeResult.relationships.similarIndustry?.length || 0,
                  similarOpportunity: storeResult.relationships.similarOpportunity?.length || 0,
                  similarTech: storeResult.relationships.similarTech?.length || 0,
                  relatedPeople: storeResult.relationships.relatedPeople?.length || 0,
                } : null,
              };
            } catch (packError) {
              // Pack storage failed but account was stored with relationships
              stored = {
                accountKey: storeResult.accountKey,
                isDuplicate: storeResult.isDuplicate || false,
                relationshipsDetected: storeResult.relationships ? {
                  competitors: storeResult.relationships.competitors?.length || 0,
                  similarIndustry: storeResult.relationships.similarIndustry?.length || 0,
                  similarOpportunity: storeResult.relationships.similarOpportunity?.length || 0,
                  similarTech: storeResult.relationships.similarTech?.length || 0,
                  relatedPeople: storeResult.relationships.relatedPeople?.length || 0,
                } : null,
              };
              console.warn('Account pack storage failed, but account stored:', packError);
            }
          } else {
            storeError = `Failed to store account with relationships: ${storeResult.error}`;
          }
        }
      } catch (storeErrorCaught) {
        storeError = `Auto-save error: ${storeErrorCaught.message}`;
      }
    } else if (!env) {
      storeError = 'Environment not available';
    } else if (!shouldStore) {
      storeError = 'Auto-save disabled (store=false)';
    }
    
    if (stored) {
      result.stored = stored;
      
      // Trigger complete research orchestration (non-blocking)
      // Skip if orchestrate=false (called from within orchestrator to prevent recursion)
      const shouldOrchestrate = url.searchParams.get('orchestrate') !== 'false';
      if (shouldOrchestrate && env && client && stored.accountKey) {
        const { orchestrateAccountResearch } = await import('./services/unified-orchestrator.js');
        
        const { groqQuery: gq, upsertDocument: ud, patchDocument: pd } = await import('./sanity-client.js');
        orchestrateAccountResearch({
          input: finalUrl,
          inputType: 'url',
          context: {
            groqQuery: gq,
            upsertDocument: ud,
            patchDocument: pd,
            client,
            handleScan,
            requestId,
            env,
          },
          options: {},
        }).catch(err => {
          console.error('Orchestration error:', err);
        });
      }
      
      // Trigger gap-fill enrichment in background (non-blocking)
      // This starts the complete research pipeline: discover→crawl→extract→linkedin→brief→verify→competitors→classify
      if (shouldStore && stored?.accountKey && finalUrl) {
        const { triggerGapFill } = await import('./services/gap-fill-orchestrator.js');
        triggerGapFill({
          env,
          accountKey: stored.accountKey,
          canonicalUrl: finalUrl,
          trigger: 'scan',
          scanData: result, // pass scan data so pipeline skips re-scanning
        }).catch(err => {
          console.error('Gap-fill trigger error:', err);
        });
      }
    } else if (storeError) {
      // Include error in response for debugging (non-breaking)
      result.storeError = storeError;
    }

    return createSuccessResponse(result, requestId);
  } catch (error) {
    console.error('[handleScan] Error:', error.message);
    return createErrorResponse(
      'INTERNAL_ERROR',
      'Internal server error',
      {},
      500,
      requestId
    );
  }
}

/**
 * Batch scan endpoint - scan multiple URLs and return stack-ranked results
 */
async function handleBatchScan(request, requestId) {
  try {
    const url = new URL(request.url);
    const urlsParam = url.searchParams.get('urls');
    const modeParam = (url.searchParams.get('mode') || 'light').toLowerCase();
    const mode = modeParam === 'full' ? 'full' : 'light';
    const includeFullData = (url.searchParams.get('includeFullData') || 'false').toLowerCase() === 'true';
    const includeHtmlSnippet = (url.searchParams.get('includeHtmlSnippet') || 'false').toLowerCase() === 'true';
    
    if (!urlsParam) {
      return createErrorResponse(
        'VALIDATION_ERROR',
        'urls parameter is required',
        { hint: 'Provide comma-separated URLs or JSON array' },
        400,
        requestId
      );
    }
    
    // Parse URLs - support both comma-separated and JSON array
    let urls = [];
    try {
      // Try parsing as JSON array first
      // Validate JSON length to prevent DoS
      if (urlsParam.length > 10000) {
        throw new Error('URLs parameter too long');
      }
      urls = JSON.parse(urlsParam);
      if (!Array.isArray(urls)) {
        throw new Error('Not an array');
      }
    } catch (e) {
      // Fall back to comma-separated
      urls = urlsParam.split(',').map(u => u.trim()).filter(u => u.length > 0);
    }
    
    if (urls.length === 0) {
      return createErrorResponse(
        'VALIDATION_ERROR',
        'No valid URLs provided',
        { parsed: urlsParam },
        400,
        requestId
      );
    }
    
    // Batch limits to avoid Cloudflare Worker resource limits
    const maxUrls = mode === 'full' ? BATCH_MAX_URLS_FULL : BATCH_MAX_URLS_LIGHT;
    if (urls.length > maxUrls) {
      return createErrorResponse(
        'VALIDATION_ERROR',
        `Maximum ${maxUrls} URLs per batch in mode=${mode}`,
        { provided: urls.length, max: maxUrls, hint: 'Reduce URLs or use mode=light' },
        400,
        requestId
      );
    }

    const concurrency = mode === 'full' ? BATCH_CONCURRENCY_FULL : BATCH_CONCURRENCY_LIGHT;
    const timeoutMs = mode === 'full' ? BATCH_FETCH_TIMEOUT_MS_FULL : BATCH_FETCH_TIMEOUT_MS_LIGHT;

    // IMPORTANT: Batch mode uses a lightweight scan (single fetch per URL) to avoid Worker limits.
    // Deep dives should be done with /scan on a single URL.
    const results = await mapWithConcurrency(urls, concurrency, async (targetUrl) => {
      return await scanUrlLight(targetUrl, { timeoutMs, includeHtmlSnippet });
    });
    
    // Stack rank by AI Readiness Score (highest first), then by opportunity score
    const successfulScans = results
      .filter(r => r.success)
      .map(r => ({
        ...r,
        aiReadinessScore: r.data.aiReadiness?.score || 0,
        opportunityScore: r.data.technologyStack?.opportunityScore || 0,
      }))
      .sort((a, b) => {
        // Primary sort: AI Readiness Score (descending)
        if (b.aiReadinessScore !== a.aiReadinessScore) {
          return b.aiReadinessScore - a.aiReadinessScore;
        }
        // Secondary sort: Opportunity Score (descending)
        return b.opportunityScore - a.opportunityScore;
      });
    
    const failedScans = results.filter(r => !r.success);

    // Peer comparisons (near peers + ahead/behind) within the provided batch list
    const { cohortSummaries, perUrl } = computePeerComparisons(successfulScans);
    
    // Build summary
    const summary = {
      totalScanned: results.length,
      successful: successfulScans.length,
      failed: failedScans.length,
      mode,
      concurrency,
      timeoutMs,
      topAIReady: successfulScans.slice(0, 5).map(s => ({
        url: s.url,
        aiReadinessScore: s.aiReadinessScore,
        aiReadinessLevel: s.data.aiReadiness?.level || 'Unknown',
        opportunityScore: s.opportunityScore,
      })),
      topOpportunities: successfulScans
        .filter(s => s.opportunityScore >= 30)
        .slice(0, 5)
        .map(s => ({
          url: s.url,
          opportunityScore: s.opportunityScore,
          legacySystems: s.data.technologyStack?.legacySystems || [],
        })),
      guidance:
        mode === 'light'
          ? 'Batch uses lightweight scans to avoid Cloudflare resource limits. Use /scan for deep dives on a single URL.'
          : 'Full mode is heavier and limited; if you hit limits, use mode=light and deep dive via /scan.',
      peerCohorts: cohortSummaries,
    };
    
    const rankedResults = [];
    for (let i = 0; i < successfulScans.length; i++) {
      const s = successfulScans[i];
      const peer = perUrl.get(s.url) || null;
      rankedResults.push({
        url: s.url,
        rank: i + 1,
        aiReadinessScore: s.aiReadinessScore,
        aiReadinessLevel: s.data.aiReadiness?.level || 'Unknown',
        opportunityScore: s.opportunityScore,
        digitalMaturity: s.data.digitalMaturity || null,
        peerComparison: peer,
        businessScale: {
          businessScale: s.data.businessScale?.businessScale || 'Unknown',
          estimatedMonthlyTraffic: s.data.businessScale?.estimatedMonthlyTraffic || null,
          estimatedAnnualRevenue: s.data.businessScale?.estimatedAnnualRevenue || null,
        },
        performance: {
          performanceScore: s.data.performance?.performanceScore ?? null,
          level: s.data.performance?.level || 'Unknown',
          topIssues: clampArray(s.data.performance?.performanceIssues || [], 3),
        },
        technologyStack: {
          cms: s.data.technologyStack?.cms || [],
          legacySystems: s.data.technologyStack?.legacySystems || [],
          frameworks: s.data.technologyStack?.frameworks || [],
        },
        ...(includeFullData ? { fullData: s.data } : {}),
      });
    }

    return createSuccessResponse(
      {
        summary: summary,
        results: rankedResults,
        failed: failedScans,
        scannedAt: new Date().toISOString(),
      },
      requestId
    );
  } catch (error) {
    console.error('[handleBatchScan] Error:', error.message);
    return createErrorResponse(
      'INTERNAL_ERROR',
      'Internal server error',
      {},
      500,
      requestId
    );
  }
}

/**
 * Main request handler
 */
// ============================================================================
// SANITY CMS INTEGRATION
// ============================================================================

/**
 * Check ADMIN_TOKEN for write operations.
 *
 * Returns:
 *   'ok'             — valid admin token provided
 *   'not_configured' — ADMIN_TOKEN env var is missing (cannot authenticate)
 *   'denied'         — token provided but invalid, or no token provided
 *
 * Callers MUST handle 'not_configured' explicitly — do NOT treat it as
 * a soft "try next auth method" signal for destructive endpoints.
 */
function checkAdminToken(request, env) {
  const adminToken = env.ADMIN_TOKEN;
  if (!adminToken) {
    return 'not_configured';
  }
  
  const providedToken = request.headers.get('X-Admin-Token') || request.headers.get('Authorization')?.replace('Bearer ', '');
  if (!providedToken) return 'denied';
  return providedToken === adminToken ? 'ok' : 'denied';
}



/**
 * Create a document in Sanity
 */
async function createSanityDocument(client, docType, data, id = null) {
  if (!client) {
    return { success: false, error: 'Sanity not configured' };
  }
  
  const docId = id || `${docType}-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  
  const document = {
    _type: docType,
    _id: docId,
    ...data,
    _createdAt: new Date().toISOString(),
    _updatedAt: new Date().toISOString(),
  };
  
  try {
    const response = await fetch(client.baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${client.token}`,
      },
      body: JSON.stringify({
        mutations: [
          {
            create: document,
          },
        ],
      }),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      return { success: false, error: errorText, status: response.status };
    }
    
    const result = await response.json();
    return { success: true, id: docId, result };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Update a document in Sanity
 */
async function updateSanityDocument(client, docId, data) {
  if (!client) {
    return { success: false, error: 'Sanity not configured' };
  }
  
  try {
    const response = await fetch(client.baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${client.token}`,
      },
      body: JSON.stringify({
        mutations: [
          {
            patch: {
              id: docId,
              set: {
                ...data,
                _updatedAt: new Date().toISOString(),
              },
            },
          },
        ],
      }),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      return { success: false, error: errorText, status: response.status };
    }
    
    const result = await response.json();
    return { success: true, result };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Query documents from Sanity
 */
async function querySanityDocuments(client, query, params = {}) {
  if (!client) {
    return { success: false, error: 'Sanity not configured' };
  }
  
  try {
    const response = await fetch(`${client.queryUrl}?query=${encodeURIComponent(query)}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${client.token}`,
      },
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      return { success: false, error: errorText, status: response.status };
    }
    
    const result = await response.json();
    return { success: true, documents: result.result || [] };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Get a document by ID
 */
async function getSanityDocument(client, docId) {
  const query = `*[_id == $id][0]`;
  const params = { id: docId };
  
  return await querySanityDocuments(client, query, params);
}

/**
 * Delete a document from Sanity
 */
async function deleteSanityDocument(client, docId) {
  if (!client) {
    return { success: false, error: 'Sanity not configured' };
  }
  
  try {
    const response = await fetch(client.baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${client.token}`,
      },
      body: JSON.stringify({
        mutations: [
          {
            delete: {
              id: docId,
            },
          },
        ],
      }),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      return { success: false, error: errorText, status: response.status };
    }
    
    const result = await response.json();
    return { success: true, result };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Store website scan in Sanity
 */
async function storeWebsiteScan(client, scanData, requestId) {
  const urlHash = hashUrl(scanData.input || scanData.finalUrl);
  const docId = `websiteScan-${urlHash}`;
  
  const document = {
    url: scanData.input || scanData.url,
    finalUrl: scanData.finalUrl,
    scannedAt: scanData.fetchedAt || new Date().toISOString(),
    status: scanData.status,
    technologyStack: scanData.technologyStack,
    businessUnits: scanData.businessUnits,
    digitalGoals: scanData.digitalGoals,
    jobAnalysis: scanData.jobAnalysis,
    aiReadiness: scanData.aiReadiness,
    businessScale: scanData.businessScale,
    performance: scanData.performance,
    digitalMaturity: scanData.digitalMaturity,
    opportunityScore: scanData.technologyStack?.opportunityScore || null,
    aiReadinessScore: scanData.aiReadiness?.score || null,
    performanceScore: scanData.performance?.performanceScore || null,
    digitalMaturityScore: scanData.digitalMaturity?.score || null,
    metadata: {
      requestId,
      scannedBy: 'website-scanner-worker',
      scanVersion: '1.0.0',
    },
  };
  
  return await createSanityDocument(client, 'websiteScan', document, docId);
}

/**
 * Store LinkedIn profile in Sanity
 */
async function storeLinkedInProfileData(client, profileData, requestId) {
  const urlHash = hashUrl(profileData.url);
  const docId = `linkedin-${urlHash}`;
  
  const document = {
    profileUrl: profileData.url,
    name: profileData.name,
    headline: profileData.headline,
    location: profileData.location,
    about: profileData.about,
    experience: profileData.experience || [],
    education: profileData.education || [],
    skills: profileData.skills || [],
    connections: profileData.connections,
    followers: profileData.followers,
    workPatterns: profileData.workPatterns,
    network: profileData.network,
    trajectory: profileData.trajectory,
    scannedAt: profileData.extractedAt || new Date().toISOString(),
    metadata: {
      requestId,
      scannedBy: 'website-scanner-worker',
    },
  };
  
  return await createSanityDocument(client, 'linkedInProfile', document, docId);
}

/**
 * Store evidence pack in Sanity
 */
async function storeEvidencePack(client, evidenceData, requestId) {
  const urlHash = hashUrl(evidenceData.url || evidenceData.finalUrl);
  const docId = `evidence-${urlHash}`;
  
  const document = {
    url: evidenceData.url,
    finalUrl: evidenceData.finalUrl,
    title: evidenceData.title,
    siteName: evidenceData.siteName,
    fetchedAt: evidenceData.fetchedAt,
    mainText: evidenceData.mainText,
    excerpts: evidenceData.excerpts || [],
    entities: evidenceData.entities || [],
    signals: evidenceData.signals || [],
    claims: evidenceData.claims || [],
    meta: evidenceData.meta,
    contentHash: evidenceData.cache?.contentHash || null,
    metadata: {
      requestId,
      mode: evidenceData.mode || 'fast',
    },
  };
  
  return await createSanityDocument(client, 'evidencePack', document, docId);
}

/**
 * Store research brief in Sanity
 */
async function storeResearchBrief(client, briefData, requestId) {
  const companyHash = hashUrl(briefData.companyOrSite || '');
  const docId = `brief-${companyHash}`;
  
  const document = {
    companyOrSite: briefData.companyOrSite,
    briefMarkdown: briefData.briefMarkdown,
    evidence: briefData.evidence || { keyFacts: [], urls: [] },
    generatedAt: new Date().toISOString(),
    metadata: {
      requestId,
      seedUrl: briefData.seedUrl || null,
      query: briefData.query || null,
    },
  };
  
  return await createSanityDocument(client, 'researchBrief', document, docId);
}

/**
 * Create or update company account (aggregated view)
 */
async function upsertCompanyAccount(client, domain, scanData, linkedInData = null) {
  const docId = `company-${domain.replace(/[^a-zA-Z0-9]/g, '-')}`;
  
  // Get existing account if it exists
  const existing = await getSanityDocument(client, docId);
  
  const accountData = {
    domain,
    name: scanData?.businessUnits?.companyName || linkedInData?.name || domain,
    latestScan: `websiteScan-${hashUrl(scanData?.finalUrl || scanData?.url)}`,
    opportunityScore: scanData?.technologyStack?.opportunityScore || null,
    aiReadinessScore: scanData?.aiReadiness?.score || null,
    digitalMaturityScore: scanData?.digitalMaturity?.score || null,
    updatedAt: new Date().toISOString(),
  };
  
  if (existing.success && existing.documents && existing.documents.length > 0) {
    // Update existing
    const existingDoc = existing.documents[0];
    accountData.websiteScans = [...(existingDoc.websiteScans || []), `websiteScan-${hashUrl(scanData?.finalUrl || scanData?.url)}`];
    if (linkedInData) {
      accountData.linkedInProfiles = [...(existingDoc.linkedInProfiles || []), `linkedin-${hashUrl(linkedInData.url)}`];
    }
    accountData.createdAt = existingDoc._createdAt || new Date().toISOString();
    return await updateSanityDocument(client, docId, accountData);
  } else {
    // Create new
    accountData.websiteScans = [`websiteScan-${hashUrl(scanData?.finalUrl || scanData?.url)}`];
    if (linkedInData) {
      accountData.linkedInProfiles = [`linkedin-${hashUrl(linkedInData.url)}`];
    }
    accountData.createdAt = new Date().toISOString();
    return await createSanityDocument(client, 'companyAccount', accountData, docId);
  }
}

// ============================================================================
// SANITY ENDPOINT HANDLERS
// ============================================================================

/**
 * Store data endpoint - POST /store/{type}
 * Body: { account: { canonicalUrl, companyName? }, data: <payload>, meta?: {...} }
 */
async function handleStore(request, requestId, env) {
  const { initSanityClient, assertSanityConfigured, generateAccountKey, extractDomain,
    storeAccountPack, upsertAccountSummary, getDocument, upsertDocument, patchDocument, groqQuery } = await import('./sanity-client.js');
  try {
    // Note: Admin token check removed - auto-save doesn't require it,
    // and manual /store calls should work the same way for consistency.
    // Sanity credentials are already protected via environment secrets.
    
    const url = new URL(request.url);
    const pathParts = url.pathname.split('/');
    const storeType = pathParts[2]; // /store/{type}
    
    if (!storeType) {
      return createErrorResponse(
        'VALIDATION_ERROR',
        'Store type required (e.g., /store/scan, /store/linkedin)',
        { path: url.pathname },
        400,
        requestId
      );
    }
    
    if (!['scan', 'linkedin', 'evidence', 'brief', 'person', 'account', 'interaction', 'session', 'learning'].includes(storeType)) {
      return createErrorResponse(
        'VALIDATION_ERROR',
        `Unknown store type: ${storeType}. Valid types: scan, linkedin, evidence, brief, person, account, interaction, session, learning`,
        { storeType },
        400,
        requestId
      );
    }
    
    const { data: body, error: parseError } = await safeParseJson(request, requestId);
    if (parseError) return parseError;
    
    // Validate account structure - accept canonicalUrl or derive from domain
    if (!body.account) {
      return createErrorResponse(
        'VALIDATION_ERROR',
        'Missing account object in request body',
        { required: ['account'] },
        400,
        requestId
      );
    }
    
    // Support both canonicalUrl and domain (derive canonicalUrl from domain if needed)
    let canonicalUrl = body.account.canonicalUrl;
    if (!canonicalUrl && body.account.domain) {
      // Derive canonicalUrl from domain
      const domain = body.account.domain.replace(/^https?:\/\//, '').replace(/\/$/, '');
      canonicalUrl = `https://${domain}`;
    }
    
    if (!canonicalUrl) {
      return createErrorResponse(
        'VALIDATION_ERROR',
        'Missing account.canonicalUrl or account.domain in request body',
        { required: ['account.canonicalUrl'] },
        400,
        requestId
      );
    }
    
    // Validate data - for brief type, ensure data is an object
    if (!body.data) {
      return createErrorResponse(
        'VALIDATION_ERROR',
        'Missing data in request body',
        { required: ['data'] },
        400,
        requestId
      );
    }
    
    // For brief type, ensure data is properly structured
    if (storeType === 'brief' && typeof body.data !== 'object') {
      return createErrorResponse(
        'VALIDATION_ERROR',
        'Brief data must be an object',
        { received: typeof body.data },
        400,
        requestId
      );
    }
    
    let client;
    try {
      client = assertSanityConfigured(env);
    } catch (error) {
      return createErrorResponse(
        'CONFIG_ERROR',
        sanitizeErrorMessage(error, 'store/config'),
        {},
        500,
        requestId
      );
    }
    
    // Generate account key
    const accountKey = await generateAccountKey(canonicalUrl);
    if (!accountKey) {
      return createErrorResponse(
        'VALIDATION_ERROR',
        'Failed to generate account key from canonicalUrl',
        { canonicalUrl },
        400,
        requestId
      );
    }
    
    // Special handler for brief type - creates separate brief document
    if (storeType === 'brief') {
      if (!body.data || typeof body.data !== 'object') {
        return createErrorResponse(
          'VALIDATION_ERROR',
          'Brief data must be an object',
          { received: typeof body.data },
          400,
          requestId
        );
      }
      
      // Ensure account exists (create if needed) — try both ID formats for compatibility
      let accountId = `account.${accountKey}`;
      let accountExists = await getDocument(client, accountId);
      if (!accountExists) {
        accountExists = await getDocument(client, `account-${accountKey}`);
        if (accountExists) {
          accountId = `account-${accountKey}`;
        } else {
          accountExists = await getDocument(client, `account.${accountKey}`);
          if (accountExists) accountId = `account.${accountKey}`;
        }
      }
      
      if (!accountExists) {
        // Create account summary if it doesn't exist
        try {
          await upsertAccountSummary(
            client,
            accountKey,
            canonicalUrl,
            body.account.companyName,
            null // No scan data for brief-only storage
          );
        } catch (error) {
          // Continue even if account creation fails
        }
      }
      
      // Create brief document
      const briefId = `brief-${accountKey}-${Date.now()}`;
      const briefDoc = {
        _type: 'brief',
        _id: briefId,
        account: {
          _type: 'reference',
          _ref: accountId,
        },
        accountKey,
        canonicalUrl,
        domain: extractDomain(canonicalUrl),
        companyName: body.account.companyName || null,
        data: body.data, // Store the full brief data object
        source: 'website-scanner',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        meta: {
          ...body.meta,
          requestId,
          storedBy: 'website-scanner-worker',
        },
      };
      
      try {
        await upsertDocument(client, briefDoc);
        return createSuccessResponse({
          stored: true,
          id: briefId,
          accountKey,
          accountId,
          type: 'brief',
          canonicalUrl: canonicalUrl,
          updated: false, // Always new for timestamped IDs
        }, requestId);
      } catch (error) {
        return createErrorResponse(
          'SANITY_ERROR',
          'Failed to store brief document',
          {},
          500,
          requestId
        );
      }
    }
    
    // Special handler for account type
    if (storeType === 'account') {
      const { storeAccountWithRelationships, storePersonWithRelationships } = await import('./services/enhanced-storage-service.js');
      
      // Account data should be in body.data
      // Extract persons if provided (1-to-many relationship) before storing account
      const persons = Array.isArray(body.data?.persons) ? body.data.persons : [];
      
      // Prepare account data without persons (persons stored separately)
      const { persons: _, ...accountDataWithoutPersons } = body.data || {};
      const accountData = {
        ...accountDataWithoutPersons,
        canonicalUrl: canonicalUrl || body.data?.canonicalUrl || body.data?.url,
        companyName: body.account?.companyName || body.data?.companyName,
        accountKey: body.account?.accountKey || accountKey,
      };
      
      // Store account using enhanced storage service
      const accountResult = await storeAccountWithRelationships(
        accountData,
        groqQuery,
        upsertDocument,
        client,
        {
          autoDetectRelationships: body.options?.autoDetectRelationships !== false,
          autoMerge: body.options?.autoMerge !== false,
          autoEnrich: body.options?.autoEnrich !== false,
        }
      );
      
      if (!accountResult.success) {
        return createErrorResponse(
          'SANITY_ERROR',
          'Failed to store account document',
          { error: accountResult.error },
          500,
          requestId
        );
      }
      
      // Store persons separately and link to account
      const personRefs = [];
      if (persons.length > 0) {
        for (const personData of persons) {
          try {
            const personResult = await storePersonWithRelationships(
              {
                ...personData,
                relatedAccountKey: accountResult.accountKey,
                rootDomain: accountResult.account?.rootDomain || extractDomain(canonicalUrl),
                canonicalUrl: canonicalUrl,
                companyName: accountData.companyName,
              },
              groqQuery,
              upsertDocument,
              client,
              {
                autoMerge: body.options?.autoMerge !== false,
                linkToAccount: false, // We're already linking manually
              }
            );
            
            if (personResult.success && personResult.personKey) {
              personRefs.push({
                _type: 'reference',
                _ref: `person.${personResult.personKey}`,
                _weak: false,
              });
            }
          } catch (error) {
            // Continue storing other persons even if one fails
            console.error('Error storing person:', error);
          }
        }
        
        // Update account with person references
        if (personRefs.length > 0) {
          try {
            const accountId = `account.${accountResult.accountKey}`;
            await patchDocument(client, accountId, {
              set: {
                persons: personRefs,
                updatedAt: new Date().toISOString(),
              },
            });
          } catch (error) {
            // Non-critical - account is stored, just missing person references
            console.error('Error updating account with person references:', error);
          }
        }
      }
      
      return createSuccessResponse({
        stored: true,
        id: `account.${accountResult.accountKey}`,
        accountKey: accountResult.accountKey,
        accountId: `account.${accountResult.accountKey}`,
        type: 'account',
        canonicalUrl: canonicalUrl,
        updated: accountResult.isDuplicate || false,
        personsStored: personRefs.length,
        personsCount: persons.length,
        relationships: accountResult.relationships,
      }, requestId);
    }
    
    // Special handler for interaction type (Q&A memory)
    if (storeType === 'interaction') {
      const { storeInteraction } = await import('./services/interaction-storage.js');
      
      // Resolve domain from the account object for string-field storage on interaction
      const interactionDomain = body.account?.domain || extractDomain(canonicalUrl) || '';
      
      const interactionData = {
        sessionId: body.data?.sessionId || body.account?.sessionId || null,
        userPrompt: body.data?.userPrompt || body.data?.prompt,
        gptResponse: body.data?.gptResponse || body.data?.response,
        timestamp: body.data?.timestamp || new Date().toISOString(),
        referencedAccounts: body.data?.referencedAccounts || [],
        referencedBriefs: body.data?.referencedBriefs || [],
        referencedPeople: body.data?.referencedPeople || [],
        referencedEvidence: body.data?.referencedEvidence || [],
        contextTags: body.data?.contextTags || [],
        importance: body.data?.importance || 0.5,
        followUpNeeded: body.data?.followUpNeeded || false,
        followUpNotes: body.data?.followUpNotes || null,
        derivedInsight: body.data?.derivedInsight || false,
        linkedInteractions: body.data?.linkedInteractions || [],
        domain: interactionDomain,
        accountKey: accountKey || '',
        requestId,
      };

      if (!interactionData.userPrompt || !interactionData.gptResponse) {
        return createErrorResponse(
          'VALIDATION_ERROR',
          'Missing required fields: userPrompt (or prompt), gptResponse (or response). sessionId is optional and will be auto-created if not provided.',
          { received: Object.keys(body.data || {}) },
          400,
          requestId
        );
      }

      // sessionId is optional - will be auto-created if not provided
      // storeInteraction handles null sessionId by creating a new session

      const result = await storeInteraction(
        groqQuery,
        upsertDocument,
        patchDocument,
        client,
        interactionData,
        {}
      );

      if (!result.success) {
        return createErrorResponse(
          'SANITY_ERROR',
          'Failed to store interaction document',
          { error: result.error },
          500,
          requestId
        );
      }

      return createSuccessResponse({
        stored: true,
        id: result.interaction.interactionId,
        interactionId: result.interactionId,
        sessionId: result.sessionId,
        type: 'interaction',
        followUpNeeded: result.interaction.followUpNeeded,
        derivedInsight: result.interaction.derivedInsight,
      }, requestId);
    }

    // Special handler for session type
    if (storeType === 'session') {
      const { getOrCreateSession } = await import('./services/interaction-storage.js');
      
      const sessionData = {
        sessionId: body.data?.sessionId || null,
        title: body.data?.title || null,
        participants: body.data?.participants || ['user', 'WRANGLER'],
        accountsInContext: body.data?.accountsInContext || [],
        briefsInContext: body.data?.briefsInContext || [],
      };

      const result = await getOrCreateSession(
        groqQuery,
        upsertDocument,
        client,
        sessionData.sessionId,
        sessionData
      );

      if (!result.success) {
        return createErrorResponse(
          'SANITY_ERROR',
          'Failed to get or create session',
          { error: result.error },
          500,
          requestId
        );
      }

      return createSuccessResponse({
        stored: true,
        id: result.session._id,
        sessionId: result.sessionId,
        type: 'session',
        isNew: result.isNew,
        interactionCount: result.session.interactionCount || 0,
      }, requestId);
    }

    // Special handler for learning type
    if (storeType === 'learning') {
      const { deriveLearning } = await import('./services/interaction-storage.js');
      
      const learningData = {
        title: body.data?.title,
        summary: body.data?.summary,
        derivedFrom: body.data?.derivedFrom || [],
        applicableToAccounts: body.data?.applicableToAccounts || [],
        applicableToBriefs: body.data?.applicableToBriefs || [],
        relevanceScore: body.data?.relevanceScore || 0.5,
        contextTags: body.data?.contextTags || [],
        memoryPhrase: body.data?.memoryPhrase || null,
      };

      if (!learningData.title || !learningData.summary) {
        return createErrorResponse(
          'VALIDATION_ERROR',
          'Missing required fields: title, summary',
          { received: Object.keys(body.data || {}) },
          400,
          requestId
        );
      }

      const result = await deriveLearning(
        groqQuery,
        upsertDocument,
        client,
        learningData,
        {}
      );

      if (!result.success) {
        return createErrorResponse(
          'SANITY_ERROR',
          'Failed to derive learning document',
          { error: result.error },
          500,
          requestId
        );
      }

      return createSuccessResponse({
        stored: true,
        id: result.learning.learningId,
        learningId: result.learningId,
        type: 'learning',
        relevanceScore: result.learning.relevanceScore,
      }, requestId);
    }

    // Special handler for person type
    if (storeType === 'person') {
      const { upsertPerson } = await import('./services/person-storage.js');
      
      // Person data should be in body.data
      const personData = body.data || {};
      
      // Extract account info if provided
      const accountKey = body.account?.accountKey 
        ? body.account.accountKey 
        : (canonicalUrl ? await generateAccountKey(canonicalUrl) : null);
      
      const result = await upsertPerson(
        groqQuery,
        upsertDocument,
        client,
        personData,
        {
          rootDomain: body.account?.rootDomain || extractDomain(canonicalUrl),
          profileUrl: personData.profileUrl || personData.linkedInUrl,
          name: personData.name || body.account?.companyName,
          companyName: body.account?.companyName || personData.currentCompany,
          canonicalUrl: canonicalUrl || personData.canonicalUrl,
          title: personData.title || personData.currentTitle,
          function: personData.function,
          seniority: personData.seniority,
          scopeInference: personData.scopeInference,
          execClaimsUsed: personData.execClaimsUsed || [],
          teamMap: personData.teamMap,
          linkedAccountKey: accountKey,
          linkedBriefRef: personData.linkedBriefRef,
          evidenceRefs: personData.evidenceRefs || [],
          verificationRefs: personData.verificationRefs || [],
          runId: body.meta?.runId,
          requestId,
        }
      );
      
      if (!result.success) {
        return createErrorResponse(
          'SANITY_ERROR',
          'Failed to store person document',
          { error: result.error },
          500,
          requestId
        );
      }
      
      return createSuccessResponse({
        stored: true,
        id: result.personId,
        personKey: result.personKey,
        personId: result.personId,
        type: 'person',
        isNew: result.isNew,
      }, requestId);
    }
    
    // For other types (scan, linkedin, evidence), use accountPack storage
    const packResult = await storeAccountPack(
      client,
      accountKey,
      canonicalUrl,
      storeType,
      body.data,
      { ...body.meta, requestId, companyName: body.account.companyName }
    );
    
    if (!packResult.success) {
      return createErrorResponse(
        'SANITY_ERROR',
        'Failed to store account pack',
        { error: packResult.error },
        500,
        requestId
      );
    }
    
    // If type is 'scan', also update account summary
    let accountId = null;
    if (storeType === 'scan') {
      try {
        const accountResult = await upsertAccountSummary(
          client,
          accountKey,
          canonicalUrl,
          body.account.companyName,
          body.data
        );
        accountId = accountResult.id;
      } catch (error) {
        // Silently continue - pack is stored, account summary update is optional
        // Error details are not critical for store operation
      }
    }
    
    // Trigger gap-fill enrichment in background for ANY store type.
    // This ensures that when the GPT stores partial data (e.g., just a brief or just a scan),
    // the system starts filling in the rest of the account profile automatically.
    const { triggerGapFill } = await import('./services/gap-fill-orchestrator.js');
    triggerGapFill({
      env,
      accountKey,
      canonicalUrl,
      trigger: 'store',
      scanData: storeType === 'scan' ? body.data : null,
    }).catch(() => {});

    return createSuccessResponse({
      stored: packResult.success,
      id: packResult.id, // Match OpenAPI spec (required field)
      packId: packResult.id, // Also include for backwards compatibility
      accountKey,
      accountId,
      type: storeType,
      canonicalUrl: canonicalUrl,
      updated: !packResult.isNew,
      backgroundEnrichment: true,
    }, requestId);
  } catch (error) {
    console.error('[handleStore] Error:', error.message);
    return createErrorResponse(
      'INTERNAL_ERROR',
      'Internal server error',
      {},
      500,
      requestId
    );
  }
}

/**
 * Trigger background enrichment when user recalls/queries context for an account.
 * Fills in missing data in Sanity so next time they get richer insights.
 */
/**
 * Returns a promise suitable for ctx.waitUntil.
 * Callers inside routeRequest collect these; the outer fetch handler passes them to ctx.waitUntil.
 */
function triggerContextEnrichmentIfNeeded(accountKey, domain, env) {
  if (!accountKey && !domain) return Promise.resolve();
  return (async () => {
    const { triggerGapFill } = await import('./services/gap-fill-orchestrator.js');
    await triggerGapFill({
      env,
      accountKey: accountKey || null,
      domain: domain || null,
      trigger: 'query',
    });
  })().catch(err => {
    console.error('[triggerContextEnrichment] failed:', err?.message);
  });
}

/**
 * Query endpoint - GET /query or POST /query
 * GET: ?type=companies&minScore=30&limit=20 OR ?type=search&q=term&types=account,accountPack
 * POST: { query: "<GROQ>", params?: {...} }
 */
async function handleQuery(request, requestId, env) {
  const { assertSanityConfigured, groqQuery, queryCompanyAccounts, searchSanityDocuments } = await import('./sanity-client.js');
  try {
    const url = new URL(request.url);
    let client;
    try {
      client = assertSanityConfigured(env);
    } catch (error) {
      return createErrorResponse(
        'CONFIG_ERROR',
        sanitizeErrorMessage(error, 'query/config'),
        {},
        500,
        requestId
      );
    }
    
    if (request.method === 'POST') {
      // Custom GROQ query
      const { data: body, error: parseError } = await safeParseJson(request, requestId);
      if (parseError) return parseError;
      if (!body.query) {
        return createErrorResponse(
          'VALIDATION_ERROR',
          'Query required in request body',
          {},
          400,
          requestId
        );
      }
      
      const params = body.params || {};
      const documents = await groqQuery(client, body.query, params);
      
      return createSuccessResponse({
        documents,
        count: documents.length,
      }, requestId);
    } else {
      // GET with query params
      const queryType = url.searchParams.get('type') || 'companies';
      const searchTerm = url.searchParams.get('q');
      const minScore = url.searchParams.get('minScore');
      const limit = url.searchParams.get('limit');
      
      if (queryType === 'companies') {
        const filters = {};
        if (minScore) filters.minScore = parseInt(minScore);
        if (limit) filters.limit = parseInt(limit);
        
        const result = await queryCompanyAccounts(client, filters);
        if (!result.success) {
          return createErrorResponse(
            'SANITY_ERROR',
            'Failed to query companies',
            { error: result.error },
            500,
            requestId
          );
        }
        
        return createSuccessResponse({
          documents: result.documents,
          count: result.documents.length,
        }, requestId);
      } else if (queryType === 'search') {
        if (!searchTerm) {
          return createErrorResponse(
            'VALIDATION_ERROR',
            'Search term (q) required for type=search',
            {},
            400,
            requestId
          );
        }
        
        const docTypes = url.searchParams.get('types')?.split(',').filter(t => t) || [];
        const result = await searchSanityDocuments(client, searchTerm, docTypes);
        
        if (!result.success) {
          return createErrorResponse(
            'SANITY_ERROR',
            'Failed to search documents',
            { error: result.error },
            500,
            requestId
          );
        }
        
        // Trigger gap-fill for found accounts (background, non-blocking)
        if (result.documents && result.documents.length > 0) {
          const { triggerGapFill } = await import('./services/gap-fill-orchestrator.js');
          const accountDocs = result.documents.filter(doc => doc.accountKey);
          for (const doc of accountDocs.slice(0, 5)) {
            triggerGapFill({ env, accountKey: doc.accountKey, trigger: 'search' }).catch(() => {});
          }
        }
        
        return createSuccessResponse({
          documents: result.documents,
          count: result.documents.length,
          searchTerm,
        }, requestId);
      } else if (queryType === 'context') {
        try {
          const { buildContextSummary, getRecentInteractions, getRelevantLearnings, getUnresolvedFollowUps } = await import('./services/context-retrieval.js');

          const accountKey = url.searchParams.get('accountKey');
          const domain = url.searchParams.get('domain');
          const sessionId = url.searchParams.get('sessionId');
          const contextTags = url.searchParams.get('tags')?.split(',').filter(t => t) || [];
          const contextType = url.searchParams.get('contextType') || 'summary';
          const contextLimit = Math.min(50, Math.max(1, parseInt(url.searchParams.get('contextLimit') || '10', 10)));
          const minRelevanceScore = parseFloat(url.searchParams.get('minRelevanceScore') || '0.7');
          const fullInsights = ['true', '1', 'yes'].includes((url.searchParams.get('fullInsights') || '').toLowerCase());

          const filters = {
            accountKey: accountKey || null,
            domain: domain || null,
            sessionId: sessionId || null,
            contextTags,
            minRelevanceScore,
            fullInsights,
            interactionLimit: contextLimit,
            learningLimit: Math.min(20, contextLimit),
            followUpLimit: Math.min(15, contextLimit),
          };

          if (contextType === 'summary') {
          const summary = await buildContextSummary(groqQuery, client, filters);
          const response = createSuccessResponse({
            summary,
            filters: { ...filters, contextLimit },
            type: 'context',
          }, requestId);
          triggerContextEnrichmentIfNeeded(accountKey, domain, env);
          return response;
        } else if (contextType === 'interactions') {
          const interactions = await getRecentInteractions(groqQuery, client, filters, contextLimit);
          const response = createSuccessResponse({
            interactions,
            count: interactions.length,
            filters: { ...filters, contextLimit },
            type: 'context',
          }, requestId);
          triggerContextEnrichmentIfNeeded(accountKey, domain, env);
          return response;
        } else if (contextType === 'learnings') {
          const learnings = await getRelevantLearnings(groqQuery, client, filters, contextLimit);
          const response = createSuccessResponse({
            learnings,
            count: learnings.length,
            filters: { ...filters, contextLimit },
            type: 'context',
          }, requestId);
          triggerContextEnrichmentIfNeeded(accountKey, domain, env);
          return response;
        } else if (contextType === 'followUps') {
          const followUps = await getUnresolvedFollowUps(groqQuery, client, filters, contextLimit);
          const response = createSuccessResponse({
            followUps,
            count: followUps.length,
            filters: { ...filters, contextLimit },
            type: 'context',
          }, requestId);
          triggerContextEnrichmentIfNeeded(accountKey, domain, env);
          return response;
        } else {
          // Return all context types (full picture for recall/summarize)
          const interactions = await getRecentInteractions(groqQuery, client, filters, contextLimit);
          const learnings = await getRelevantLearnings(groqQuery, client, { ...filters, minRelevanceScore }, contextLimit);
          const followUps = await getUnresolvedFollowUps(groqQuery, client, filters, contextLimit);
          const summary = await buildContextSummary(groqQuery, client, { ...filters, minRelevanceScore });

          const response = createSuccessResponse({
            summary,
            interactions,
            learnings,
            followUps,
            counts: {
              interactions: interactions.length,
              learnings: learnings.length,
              followUps: followUps.length,
            },
            filters: { ...filters, contextLimit },
            type: 'context',
          }, requestId);
          triggerContextEnrichmentIfNeeded(accountKey, domain, env);
          return response;
        }
        } catch (contextError) {
          return createErrorResponse(
            'CONTENT_LAKE_UNAVAILABLE',
            'Content lake (Sanity) unavailable for recall. Check SANITY_PROJECT_ID, SANITY_TOKEN, and dataset.',
            { message: contextError?.message },
            503,
            requestId
          );
        }
      } else if (queryType === 'quick') {
        // Quick query - consolidate /query/quick into /query
        const { handleQuickQuery } = await import('./handlers/quick-query.js');
        return await handleQuickQuery(request, requestId, env, groqQuery, assertSanityConfigured);
      } else {
        return createErrorResponse(
          'VALIDATION_ERROR',
          'Invalid query type. Use type=companies, type=search, type=context, or type=quick',
          { queryType },
          400,
          requestId
        );
      }
    }
  } catch (error) {
    console.error('[handleQuery] Error:', error.message);
    return createErrorResponse(
      'INTERNAL_ERROR',
      'Internal server error',
      {},
      500,
      requestId
    );
  }
}

/**
 * Update endpoint - PUT /update/{docId}
 * Body: { set?: object, unset?: string[], inc?: object, append?: { path: string, items: any[] } }
 */
async function handleUpdate(request, requestId, env) {
  const { assertSanityConfigured, patchDocument } = await import('./sanity-client.js');
  try {
    // Admin token check removed - Sanity credentials are already protected
    const url = new URL(request.url);
    const pathParts = url.pathname.split('/');
    const docId = pathParts[2]; // /update/{docId}
    
    if (!docId) {
      return createErrorResponse(
        'VALIDATION_ERROR',
        'Document ID required',
        { path: url.pathname },
        400,
        requestId
      );
    }
    
    const { data: body, error: parseError } = await safeParseJson(request, requestId);
    if (parseError) return parseError;
    const { set = {}, unset = [], inc = {}, append = null } = body;
    
    let client;
    try {
      client = assertSanityConfigured(env);
    } catch (error) {
      return createErrorResponse(
        'CONFIG_ERROR',
        sanitizeErrorMessage(error, 'update/config'),
        {},
        500,
        requestId
      );
    }
    
    try {
      await patchDocument(client, docId, { set, unset, inc, append });
      return createSuccessResponse({
        updated: true,
        id: docId,
      }, requestId);
    } catch (error) {
      return createErrorResponse(
        'SANITY_ERROR',
        'Failed to update document',
        {},
        500,
        requestId
      );
    }
  } catch (error) {
    console.error('[update] Error:', error.message);
    return createErrorResponse(
      'INTERNAL_ERROR',
      'Internal server error',
      {},
      500,
      requestId
    );
  }
}

/**
 * Delete endpoint - DELETE /delete/{docId}?cascade=true
 */
async function handleDelete(request, requestId, env) {
  const { assertSanityConfigured, getDocument, deleteDocument, cascadeDeleteByAccountKey } = await import('./sanity-client.js');
  try {
    // Admin token check removed - Sanity credentials are already protected
    const url = new URL(request.url);
    const pathParts = url.pathname.split('/');
    const docId = pathParts[2]; // /delete/{docId}
    const cascade = url.searchParams.get('cascade') === 'true';
    
    if (!docId) {
      return createErrorResponse(
        'VALIDATION_ERROR',
        'Document ID required',
        { path: url.pathname },
        400,
        requestId
      );
    }
    
    let client;
    try {
      client = assertSanityConfigured(env);
    } catch (error) {
      return createErrorResponse(
        'CONFIG_ERROR',
        sanitizeErrorMessage(error, 'delete/config'),
        {},
        500,
        requestId
      );
    }
    
    try {
      if (cascade) {
        // Get document to find accountKey
        const doc = await getDocument(client, docId);
        if (doc && doc.accountKey) {
          const result = await cascadeDeleteByAccountKey(client, doc.accountKey);
          return createSuccessResponse({
            deleted: true,
            id: docId,
            cascade: true,
            deletedCount: result.deletedCount,
          }, requestId);
        }
      }
      
      // Single document delete
      await deleteDocument(client, docId);
      return createSuccessResponse({
        deleted: true,
        id: docId,
      }, requestId);
    } catch (error) {
      return createErrorResponse(
        'SANITY_ERROR',
        'Failed to delete document',
        {},
        500,
        requestId
      );
    }
  } catch (error) {
    console.error('[delete] Error:', error.message);
    return createErrorResponse(
      'INTERNAL_ERROR',
      'Internal server error',
      {},
      500,
      requestId
    );
  }
}

// Export Durable Object class
export { OsintJobState } from './durable/osintJobState.js';

const workerHandler = {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const requestId = generateRequestId();
    const startTime = Date.now();
    const requestLoggingEnabled = env?.ENABLE_REQUEST_LOGGING === '1';
    const autonomousEnrichmentEnabled = shouldRunAutonomousEnrichmentForRequest(request, url, env);
    const promptParsingEnabled = shouldParsePromptForRequest(request, url);
    const needsRequestClone = requestLoggingEnabled || autonomousEnrichmentEnabled || promptParsingEnabled;

    // Make env available to module-level helpers (e.g. searchProvider)
    setSearchEnv(env);

    // Set request context for CORS origin allowlist (both inline + response.js)
    _reqOrigin = request?.headers?.get('Origin') || '';
    _reqEnv = env;
    setRequestContext(request, env);

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return handleCorsPreflight();
    }

    // Early 404 for common bot/asset requests so we skip heavy setup
    const pathname = url.pathname;
    if (pathname === '/robots.txt' || pathname === '/favicon.ico') {
      return createErrorResponse('NOT_FOUND', 'Endpoint not found', { path: pathname }, 404, requestId);
    }

    let requestForLogging = request;
    let requestForEnrichment = request;
    if (needsRequestClone) {
      try {
        requestForLogging = request.clone();
        requestForEnrichment = request.clone();
      } catch (error) {
        requestForLogging = request;
        requestForEnrichment = request;
      }
    }

    let autonomousContext = null;
    if (autonomousEnrichmentEnabled) {
      let analyzePerformanceFn;
      let verifyClaimsInternalFn;
      let analyzeBusinessScale;
      let detectBusinessUnits;
      let calculateAIReadinessScore;
      try {
        const perfMod = await import('./services/performance-analyzer.js');
        analyzePerformanceFn = perfMod.analyzePerformance;
      } catch {
        analyzePerformanceFn = () => null;
      }
      try {
        const verifyMod = await import('./services/person-intelligence-service.js');
        verifyClaimsInternalFn = verifyMod.verifyClaimsInternal;
      } catch {
        verifyClaimsInternalFn = async () => ({ verified: [], status: 'unavailable' });
      }
      try {
        const bizMod = await import('./services/business-analyzer.js');
        analyzeBusinessScale = typeof bizMod?.analyzeBusinessScale === 'function' ? bizMod.analyzeBusinessScale : () => ({});
        detectBusinessUnits = typeof bizMod?.detectBusinessUnits === 'function' ? bizMod.detectBusinessUnits : () => ({});
      } catch {
        analyzeBusinessScale = () => ({});
        detectBusinessUnits = () => ({});
      }
      if (typeof analyzeBusinessScale !== 'function') analyzeBusinessScale = () => ({});
      if (typeof detectBusinessUnits !== 'function') detectBusinessUnits = () => ({});
      try {
        const aiMod = await import('./services/ai-readiness.js');
        calculateAIReadinessScore = aiMod.calculateAIReadinessScore;
      } catch {
        calculateAIReadinessScore = () => ({ score: 0 });
      }

      autonomousContext = {
        handlers: {
          handleScan,
          handleDiscover,
          handleCrawl,
          handleExtract,
          handleLinkedInProfile,
          handleBrief,
          handleVerify,
          searchProvider,
        },
        internalFunctions: {
          searchProvider,
          getBrowserHeaders,
          fetchWithTimeout,
          readHtmlWithLimit,
          extractTitle,
          cleanMainText,
          detectSignals,
          extractExcerpts,
          extractEntities,
          extractClaims,
          extractScriptSrcs,
          extractLinkHrefs,
          extractNavigationLinks,
          detectTechnologyStack,
          analyzeBusinessScale,
          detectBusinessUnits,
          analyzePerformance: analyzePerformanceFn,
          calculateAIReadinessScore,
          discoverPages,
          crawlWithConcurrency,
          verifyClaimsInternal: verifyClaimsInternalFn,
        },
      };
    }

    // Request size limit (10MB for POST/PUT requests)
    const MAX_REQUEST_SIZE = 10 * 1024 * 1024; // 10MB
    const contentLength = request.headers.get('content-length');
    if (contentLength && parseInt(contentLength) > MAX_REQUEST_SIZE) {
      const response = createErrorResponse(
        'PAYLOAD_TOO_LARGE',
        'Request body too large',
        {
          maxSize: `${MAX_REQUEST_SIZE / 1024 / 1024}MB`,
          receivedSize: `${(parseInt(contentLength) / 1024 / 1024).toFixed(2)}MB`,
        },
        413,
        requestId
      );
      let responseBodyText413 = '';
      if (requestLoggingEnabled || autonomousEnrichmentEnabled) {
        try {
          responseBodyText413 = await response.clone().text().catch(() => '');
        } catch (_) {}
      }
      const logPromise = (async () => {
        try {
          let extraData = null;
          if (requestLoggingEnabled) {
            const { logUserAction } = await import('./services/action-logger.js');
            extraData = await logUserAction(requestForLogging, url, requestId, env, response, startTime, responseBodyText413);
            await logUsageForRequest(request, url, requestId, env, response, startTime, extraData, responseBodyText413);
          }
          const { logUsageEntry } = await import('./services/usage-tracker.js');
          await logUsageEntry({
            request: requestForLogging,
            url,
            promptText: extraData?.prompt || '',
            responseText: responseBodyText413,
            userId: requestForLogging.headers.get('X-Sanity-User-Id') || null,
          });
          if (autonomousEnrichmentEnabled && autonomousContext) {
            const { runAutonomousEnrichment } = await import('./services/autonomous-enrichment.js');
            await runAutonomousEnrichment({
              request: requestForEnrichment,
              url,
              env,
              requestId,
              handlers: autonomousContext.handlers,
              internalFunctions: autonomousContext.internalFunctions,
            });
          }
        } catch (logError) {
          console.error('Request logging failed:', logError);
        }
      })();

      if (ctx && typeof ctx.waitUntil === 'function') {
        ctx.waitUntil(logPromise);
      } else {
        logPromise.catch(() => {});
      }
      return response;
    }

    // Route requests
    let response;
    try {
      const { logUsageEntry, getUsageSummary, shouldRespondWithUsage } = await import('./services/usage-tracker.js');
      const { extractUserFromRequest } = await import('./services/usage-logger.js');
      const { buildPromptFromRequest } = await import('./services/usage-utils.js');
      const promptText = promptParsingEnabled
        ? await buildPromptFromRequest(requestForLogging, url)
        : '';

      if (shouldRespondWithUsage(promptText)) {
        const userInfo = extractUserFromRequest(requestForLogging);
        const summary = getUsageSummary(
          requestForLogging.headers.get('X-Session-Id') || url.searchParams.get('sessionId')
        );
        const lastInteraction = summary.lastInteraction?.timestamp
          ? new Date(summary.lastInteraction.timestamp).toUTCString()
          : 'N/A';

        const usageMessage = [
          `You’ve asked ${summary.sessionCount} questions this session.`,
          `Total across all users: ${summary.totalCount}.`,
          summary.uniqueUsers ? `Total unique users: ${summary.uniqueUsers}.` : null,
          `Last interaction: ${lastInteraction}.`,
        ].filter(Boolean).join('\n');

        response = createSuccessResponse({
          message: usageMessage,
          sessionCount: summary.sessionCount,
          totalCount: summary.totalCount,
          uniqueUsers: summary.uniqueUsers,
          lastInteraction: summary.lastInteraction,
        }, requestId);

        const responseText = JSON.stringify({ message: usageMessage });
        await logUsageEntry({
          request: requestForLogging,
          url,
          promptText,
          responseText,
          userId: userInfo.userId,
        });
        return response;
      }

      const { RateLimiter, rateLimitMiddleware } = await import('./utils/rate-limit.js');
      const rateLimiter = new RateLimiter(env);
      const limitCheck = await rateLimitMiddleware(request, url.pathname, rateLimiter, requestId);
      if (limitCheck) return limitCheck;
      response = await routeRequest(request, url, requestId, env, rateLimiter, null, ctx);
    } catch (error) {
      console.error('[workerHandler.fetch] Error:', error.message);
      response = createErrorResponse(
        'INTERNAL_ERROR',
        'Internal server error',
        {},
        500,
        requestId
      );
    }

    let responseBodyText = '';
    if (requestLoggingEnabled || autonomousEnrichmentEnabled) {
      try {
        responseBodyText = await response.clone().text().catch(() => '');
      } catch (_) {}
    }

    const logPromise = (async () => {
      try {
        let extraData = null;
        if (requestLoggingEnabled) {
          const { logUserAction } = await import('./services/action-logger.js');
          extraData = await logUserAction(requestForLogging, url, requestId, env, response, startTime, responseBodyText);
          await logUsageForRequest(request, url, requestId, env, response, startTime, extraData, responseBodyText);
        }
        const { logUsageEntry } = await import('./services/usage-tracker.js');
        await logUsageEntry({
          request: requestForLogging,
          url,
          promptText: extraData?.prompt || '',
          responseText: responseBodyText,
          userId: requestForLogging.headers.get('X-Sanity-User-Id') || null,
        });
        if (autonomousEnrichmentEnabled && autonomousContext) {
          const { runAutonomousEnrichment } = await import('./services/autonomous-enrichment.js');
          await runAutonomousEnrichment({
            request: requestForEnrichment,
            url,
            env,
            requestId,
            handlers: autonomousContext.handlers,
            internalFunctions: autonomousContext.internalFunctions,
            responseText: responseBodyText || '',
          });
        }
      } catch (logError) {
        console.error('Request logging failed:', logError);
      }
    })();

    if (ctx && typeof ctx.waitUntil === 'function') {
      ctx.waitUntil(logPromise);
    } else {
      logPromise.catch(() => {});
    }

    // ── Global CORS: ensure every response has CORS headers ──────────
    // Individual handlers may already add them, but this catches any that don't.
    response = addCorsHeaders(response);

    return response;
  },

  /**
   * Queue consumer for OSINT jobs
   */
  async queue(batch, env, ctx) {
    const { groqQuery, upsertDocument, patchDocument, assertSanityConfigured } = await import('./sanity-client.js');
    const { runOsintPipeline } = await import('./osint/pipeline.js');
    
    for (const message of batch.messages) {
      try {
        const { accountKey, canonicalUrl, rootDomain, companyName, mode, year, recencyDays, requestId } = message.body;
        
        const client = assertSanityConfigured(env);
        
        // Get or create Durable Object stub
        let jobStateDO = null;
        if (env.OSINT_JOBS_DO) {
          const id = env.OSINT_JOBS_DO.idFromName(`${accountKey}.${year}.${mode}`);
          const stub = env.OSINT_JOBS_DO.get(id);
          
          // Initialize state in DO
          await stub.fetch('http://internal/state', {
            method: 'POST',
            body: JSON.stringify({
              accountKey,
              canonicalUrl,
              rootDomain,
              companyName,
              year,
              mode,
              status: 'queued',
              stage: 0,
              progress: 0,
            }),
          });
          
          jobStateDO = {
            updateState: async (updates) => {
              await stub.fetch('http://internal/state', {
                method: 'POST',
                body: JSON.stringify(updates),
              });
            },
          };
        }
        
        // Build pipeline context with handler functions
        const context = {
          accountKey,
          canonicalUrl,
          rootDomain,
          companyName: companyName || null,
          year,
          mode,
          recencyDays: recencyDays || parseInt(env.OSINT_DEFAULT_RECENCY_DAYS) || 365,
          requestId: requestId || `queue-${Date.now()}`,
          env,
          client,
          groqQuery,
          upsertDocument,
          patchDocument,
          jobStateDO,
          handleDiscover: async (req, reqId) => {
            return await handleDiscover(req, reqId);
          },
          handleSearch: async (req, reqId) => {
            return await handleSearch(req, reqId, env);
          },
          handleExtract: async (req, reqId, env) => {
            return await handleExtract(req, reqId, env);
          },
          handleVerify: async (req, reqId, env) => {
            return await handleVerify(req, reqId, env);
          },
        };
        
        // Run pipeline
        await runOsintPipeline(context);
        
        // Acknowledge message
        message.ack();
        
      } catch (error) {
        console.error('OSINT queue processing error:', error);
        message.retry();
      }
    }
  },
  async scheduled(event, env, ctx) {
    const requestId = generateRequestId();
    const cron = event?.cron || 'manual';
    const now = new Date().toISOString();
    const { assertBaseEnv } = await import('./lib/env.ts');
    try {
      assertBaseEnv(env);
    } catch (error) {
      console.error('[scheduled] env missing', error?.message || error);
      return;
    }

    const { createCircuitBreaker } = await import('./utils/circuit-breaker.js');
    const breaker = createCircuitBreaker(3);

    // runRoute executes a cron sub-task through the circuit breaker.
    // If 3 consecutive tasks fail, remaining tasks are skipped.
    const runRoute = async (path, body = {}) => {
      return breaker.execute(async () => {
        const req = new Request(`http://internal${path}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            // Internal caller marker — bypasses external auth middleware.
            // Uses WORKER_API_KEY as token: external callers can't forge it
            // (they'd need the key, which passes normal auth anyway).
            'X-Internal-Caller': env.WORKER_API_KEY || env.MOLT_API_KEY || '__cron__',
          },
          body: JSON.stringify(body),
        });
        if (path === '/molt/jobs/run') {
          const { handleMoltJobsRun } = await import('./routes/molt.ts');
          return await handleMoltJobsRun(req, requestId, env);
        }
        if (path === '/dq/scan') {
          const { handleDqScan } = await import('./routes/dq.ts');
          return await handleDqScan(req, requestId, env);
        }
        if (path === '/enrich/run') {
          const { handleEnrichRun } = await import('./routes/dq.ts');
          return await handleEnrichRun(req, requestId, env);
        }
        if (path === '/enrich/process') {
          const { groqQuery, groqQueryCached, upsertDocument, patchDocument, assertSanityConfigured } = await import('./sanity-client.js');
          assertSanityConfigured(env);
          const { handleProcessEnrichmentJobs } = await import('./handlers/enrichment.js');
          // Sub-route calls from enrichment pipeline need internal auth bypass
          const route = (r, id, e) => {
            const internalReq = new Request(r.url, {
              method: r.method,
              headers: new Headers([
                ...r.headers.entries(),
                ['X-Internal-Caller', env.WORKER_API_KEY || env.MOLT_API_KEY || '__cron__'],
              ]),
              body: r.body,
            });
            return routeRequest(internalReq, new URL(internalReq.url), id, e, null, null, ctx);
          };
          const handlers = {
            handleScan: route,
            handleDiscover: route,
            handleCrawl: route,
            handleExtract: route,
            handleLinkedInProfile: route,
            handleBrief: route,
            handleVerify: route,
          };
          return await handleProcessEnrichmentJobs(req, requestId, env, groqQuery, upsertDocument, patchDocument, assertSanityConfigured, handlers);
        }
        if (path === '/network/dailyRun') {
          const { handleDailyRun } = await import('./routes/network.ts');
          return await handleDailyRun(req, requestId, env);
        }
        if (path === '/analytics/operator-brief') {
          const { handleOperatorBriefing } = await import('./handlers/operator-briefing.js');
          return await handleOperatorBriefing(req, requestId, env, groqQueryCached, upsertDocument, assertSanityConfigured);
        }
        if (path === '/analytics/nightly-intelligence') {
          const { handleNightlyIntelligence } = await import('./routes/analyticsNightly.ts');
          return await handleNightlyIntelligence(req, requestId, env);
        }
        if (path === '/system/self-heal') {
          const { handleSystemSelfHeal } = await import('./handlers/system-self-heal.js');
          return await handleSystemSelfHeal(req, requestId, env);
        }
        if (path === '/opportunities/daily') {
          const { handleOpportunitiesDaily } = await import('./routes/opportunities.ts');
          return await handleOpportunitiesDaily(req, requestId, env);
        }
        throw new Error(`Unknown cron route: ${path}`);
      }, path);
    };

    // Assumption: free-tier scheduling uses coarse UTC cron windows.
    // NOTE: ctx.waitUntil runs tasks concurrently — the circuit breaker
    // tracks failures across the cron run but can't prevent already-started
    // tasks. For sequential crons (6h window), the breaker is most effective
    // on the inline tasks (stale-account sweep, auto-learning).
    if (cron === '*/15 * * * *') {
      ctx.waitUntil(runRoute('/molt/jobs/run', {}));
      ctx.waitUntil(runRoute('/enrich/process', {}));
    } else if (cron === '0 */6 * * *') {
      ctx.waitUntil(runRoute('/dq/scan', {}));
      ctx.waitUntil(runRoute('/enrich/run', {}));
      ctx.waitUntil(runRoute('/moltbook/crawl', {}));
      // Sweep for incomplete account profiles and trigger gap-fill
      ctx.waitUntil(breaker.execute(async () => {
        const { initSanityClient, groqQuery } = await import('./sanity-client.js');
        const client = initSanityClient(env);
        if (!client) return;
        // Find accounts with low completeness or missing profileCompleteness
        const staleAccounts = await groqQuery(client,
          `*[_type == "account" && (!defined(profileCompleteness) || profileCompleteness.score < 70)] | order(opportunityScore desc)[0...20]{accountKey, canonicalUrl, domain}`,
          {});
        if (Array.isArray(staleAccounts) && staleAccounts.length) {
          const { triggerGapFill } = await import('./services/gap-fill-orchestrator.js');
          for (const acct of staleAccounts.slice(0, 10)) {
            await triggerGapFill({
              env,
              accountKey: acct.accountKey,
              canonicalUrl: acct.canonicalUrl,
              domain: acct.domain,
              trigger: 'cron_sweep',
            }).catch(() => {});
          }
        }
      }, 'stale-account-sweep'));
      // Refresh stale but complete accounts — tiered by opportunity score
      // (3d for ≥80, 7d for ≥50, 14d for ≥30, 30d otherwise)
      ctx.waitUntil(breaker.execute(async () => {
        const { initSanityClient, groqQuery } = await import('./sanity-client.js');
        const client = initSanityClient(env);
        if (!client) return;
        const { isAccountStale } = await import('./services/account-completeness.js');
        // Fetch complete accounts (score ≥ 70) ordered by value — high-value refresh first
        const candidates = await groqQuery(client,
          `*[_type == "account" && defined(profileCompleteness) && profileCompleteness.score >= 70 && defined(lastScannedAt)] | order(opportunityScore desc)[0...30]{accountKey, canonicalUrl, domain, opportunityScore, lastScannedAt}`,
          {});
        if (!Array.isArray(candidates) || !candidates.length) return;
        const stale = candidates.filter(a => isAccountStale(a).isStale);
        if (!stale.length) return;
        console.log(`[scheduled] refresh: ${stale.length} stale accounts (of ${candidates.length} candidates)`);
        const { triggerGapFill } = await import('./services/gap-fill-orchestrator.js');
        // Limit to 5 per cron run to stay within execution budget
        for (const acct of stale.slice(0, 5)) {
          await triggerGapFill({
            env,
            accountKey: acct.accountKey,
            canonicalUrl: acct.canonicalUrl,
            domain: acct.domain,
            trigger: 'cron_refresh',
          }).catch(() => {});
        }
      }, 'stale-account-refresh'));
      // Auto-derive learnings from recent interactions
      ctx.waitUntil(breaker.execute(async () => {
        const { deriveAutomaticLearnings } = await import('./services/auto-learning.js');
        const result = await deriveAutomaticLearnings(env);
        if (result.derived > 0) {
          console.log(`[scheduled] auto-learning: derived ${result.derived} learnings from ${result.interactionsReviewed} interactions`);
        }
      }, 'auto-learning'));
      ctx.waitUntil(runRoute('/system/self-heal', {}));
      // Attribute health monitoring — detect attribute sprawl before it becomes a crisis
      ctx.waitUntil(breaker.execute(async () => {
        const { checkAttributeHealth } = await import('./services/attribute-monitor.js');
        const health = await checkAttributeHealth(env);
        if (health && !health.error && (health.level === 'critical' || health.level === 'wall')) {
          console.error(`[scheduled] ATTRIBUTE ALERT: ${health.used}/${health.limit} (${health.level})`);
        }
      }, 'attribute-health'));
    } else if (cron === '15 13 * * *') {
      // Consolidated daily intelligence pipeline (was 3 separate crons: 13:15, 13:30, 13:45)
      // Merged to stay within free-tier 3-cron limit. All tasks run concurrently via ctx.waitUntil.
      ctx.waitUntil(runRoute('/network/dailyRun', {}));
      ctx.waitUntil(runRoute('/analytics/operator-brief', {}));
      ctx.waitUntil(runRoute('/opportunities/daily', { date: now.slice(0, 10) }));
      ctx.waitUntil(runRoute('/analytics/nightly-intelligence', { date: now }));
    } else {
      ctx.waitUntil(runRoute('/molt/jobs/run', {}));
    }
  }

};

export default workerHandler;

export {
  handleScan,
  handleDiscover,
  handleCrawl,
  handleExtract,
  handleLinkedInProfile,
  handleBrief,
  handleVerify,
  searchProvider,
  getBrowserHeaders,
  readHtmlWithLimit,
  extractTitle,
  cleanMainText,
  detectSignals,
  extractExcerpts,
  extractEntities,
  extractClaims,
  extractScriptSrcs,
  extractLinkHrefs,
  extractNavigationLinks,
  detectTechnologyStack,
  discoverPages,
  crawlWithConcurrency,
  calculateContentHash,
};

/**
 * Log usage for a request (async, non-blocking)
 */
async function logUsageForRequest(request, url, requestId, env, response, startTime, extraData = null, responseBodyText = null) {
  if (env?.ENABLE_REQUEST_LOGGING !== '1') {
    return;
  }
  try {
    const { extractUserFromRequest, extractRequestMetadata, logUsage } = await import('./services/usage-logger.js');
    const sanityClient = await import('./sanity-client.js');
    
    const projectId = env.SANITY_PROJECT_ID;
    const dataset = env.SANITY_DATASET || 'production';
    const token = env.SANITY_TOKEN || env.SANITY_API_TOKEN;
    const apiVersion = env.SANITY_API_VERSION || '2023-10-01';
    
    if (!projectId || !token) {
      return;
    }
    
    const baseUrl = `https://${projectId}.api.sanity.io/v${apiVersion}`;
    const client = {
      projectId,
      dataset,
      token,
      baseUrl,
      mutateUrl: `${baseUrl}/data/mutate/${dataset}`,
      queryUrl: `${baseUrl}/data/query/${dataset}`,
      apiVersion,
    };
    
    const userInfo = extractUserFromRequest(request);
    const requestMetadata = extractRequestMetadata(request, url);
    
    const statusCode = response.status || 500;
    const success = statusCode >= 200 && statusCode < 300;
    const responseTimeMs = Date.now() - startTime;
    
    const responseBodySize = responseBodyText != null
      ? new TextEncoder().encode(responseBodyText).length
      : 0;
    
    // Get upsertDocument function
    const { upsertDocument } = sanityClient;
    
    // Log usage asynchronously
    await logUsage(client, upsertDocument, {
      ...userInfo,
      endpoint: url.pathname,
      method: request.method,
      requestId: requestId,
      statusCode: statusCode,
      success: success,
      responseTimeMs: responseTimeMs,
      responseBodySize: responseBodySize,
      prompt: extraData?.prompt || undefined,
      accountKey: extraData?.accountKey || undefined,
      accountDomain: extraData?.accountDomain || undefined,
      personId: extraData?.personId || undefined,
      techSummary: extraData?.techSummary || undefined,
      enrichmentSummary: extraData?.enrichmentSummary || undefined,
      ...requestMetadata,
    });
  } catch (error) {
    // Silently fail - don't break the API if logging fails
    console.error('Usage logging failed:', error);
  }
}

/**
 * Route request to appropriate handler
 */
// Paths that can be used for auth-only testing (e.g. from ChatGPT) without requiring Sanity.
const MOLT_WRANGLER_PATHS = ['/molt/run', '/molt/approve', '/molt/log', '/molt/jobs/run', '/molt/feedback', '/molt/auth-status', '/wrangler/ingest', '/extension/capture', '/extension/page-intel', '/extension/ask', '/extension/learn', '/extension/linkedin-capture', '/extension/feedback', '/system/self-heal'];

const KNOWN_PATH_PREFIXES = [
  '/health', '/schema', '/openapi.yaml', '/sanity/status', '/sanity/verify-write', '/molt', '/wrangler', '/extension', '/search', '/discover', '/crawl', '/extract',
  '/track', '/linkedin-profile', '/linkedin/', '/brief', '/verify', '/cache/', '/store/', '/query', '/update/', '/delete/',
  '/research', '/slack/', '/tools/', '/network/', '/moltbook/', '/opportunities/', '/drafting/', '/dq/', '/enrich/', '/calls/', '/gmail/',
  '/competitors/', '/scan', '/scan-batch', '/osint/', '/analytics/', '/technologies/', '/webhooks', '/orchestrate', '/person/',
  '/sdr/', '/accountability/', '/user-patterns/', '/account-page', '/accounts/', '/account/', '/account-plan/', '/system/',
  '/operator/console',
  '/memory',
];

function isKnownPath(pathname) {
  if (!pathname || pathname === '') return false;
  return KNOWN_PATH_PREFIXES.some(p => pathname === p || (p.endsWith('/') && pathname.startsWith(p)) || (!p.endsWith('/') && pathname.startsWith(p + '/')));
}

async function routeRequest(request, url, requestId, env, rateLimiter = null, metrics = null, ctx = null) {
  try {
    if (!isKnownPath(url.pathname)) {
      return createErrorResponse('NOT_FOUND', 'Endpoint not found', { path: url.pathname }, 404, requestId);
    }
    const skipBaseEnv = ['/health', '/schema', '/openapi.yaml', '/sanity/status', '/sanity/verify-write'].includes(url.pathname) || url.pathname.startsWith('/track/') || MOLT_WRANGLER_PATHS.includes(url.pathname);
    if (!skipBaseEnv) {
      const { assertBaseEnv } = await import('./lib/env.ts');
      try {
        assertBaseEnv(env);
      } catch (error) {
        console.error('[routeRequest/env] Error:', error.message);
        return createErrorResponse(
          'CONFIGURATION_ERROR',
          'Missing required environment variables',
          { missing: error.details?.missing || [] },
          503,
          requestId
        );
      }
    }

    // ── SECURITY: Global auth middleware ──────────────────────────────
    // Require API key for all endpoints except explicitly public/self-authed ones.
    //
    // TODO(P2-1): Remove per-route checkMoltApiKey calls — now handled here.
    //
    const AUTH_EXEMPT_PATHS = new Set([
      '/health',
      '/schema',
      '/openapi.yaml',
      '/molt/auth-status',
      '/sanity/status',       // D-015: was in skipBaseEnv but missing here — returns 401 without this
      '/sanity/verify-write', // D-015: was in skipBaseEnv but missing here — returns 401 without this
      '/webhooks/sanity',     // Auth: HMAC signature verification, fail-closed (P0-3)
      '/webhooks/telegram',   // Auth: X-Telegram-Bot-Api-Secret-Token validation (Finding 7)
    ]);
    const AUTH_EXEMPT_PREFIXES = [
      '/track/',              // Tracking pixels — public by design
      '/operator/console',    // Auth: uses separate checkAdminToken (X-Admin-Token header)
    ];

    const isAuthExempt = AUTH_EXEMPT_PATHS.has(url.pathname)
      || AUTH_EXEMPT_PREFIXES.some(p => url.pathname.startsWith(p));

    // Internal cron/queue calls set X-Internal-Caller with the API key.
    // Can only be forged if caller already has the key (which passes normal auth anyway).
    const internalCaller = request.headers.get('X-Internal-Caller');
    const configuredKey = env.WORKER_API_KEY || env.MOLT_API_KEY || env.CHATGPT_API_KEY;
    const isInternalCall = internalCaller
      && (internalCaller === configuredKey || internalCaller === '__cron__');

    if (!isAuthExempt && !isInternalCall) {
      const { checkMoltApiKey } = await import('./utils/molt-auth.js');
      const auth = checkMoltApiKey(request, env, requestId);
      if (!auth.allowed) {
        return auth.errorResponse;
      }
    }
    // ── END auth middleware ───────────────────────────────────────────

    // Import Sanity functions
    // groqQueryCached uses apicdn.sanity.io (~60s stale) — for read-only handlers only.
    const { groqQuery, groqQueryCached, upsertDocument, patchDocument, assertSanityConfigured } = await import('./sanity-client.js');
    
    if (url.pathname === '/health') {
    return await handleHealth(requestId, env);
  } else if (url.pathname === '/sanity/status') {
    { const _m = requireMethod(request, 'GET', requestId); if (_m) return _m; }
    return await handleSanityStatus(requestId, env);
  } else if (url.pathname === '/sanity/verify-write') {
    { const _m = requireMethod(request, 'POST', requestId); if (_m) return _m; }
    return await handleSanityVerifyWrite(requestId, env);
  } else if (url.pathname === '/schema') {
    return await handleSchema(requestId);
  } else if (url.pathname === '/openapi.yaml') {
    { const _m = requireMethod(request, 'GET', requestId); if (_m) return _m; }
    try {
      const { default: openapiYaml } = await import('./data/openapi-spec.js');
      const origin = url.origin || 'https://website-scanner.austin-gilbert.workers.dev';
      const yamlWithOrigin = openapiYaml.replace(
        /(\nservers:\s*\n\s*-\s*url:\s*)https?:\/\/[^\s\n]+/,
        `$1${origin}`
      );
      return addCorsHeaders(
        new Response(yamlWithOrigin, {
          status: 200,
          headers: {
            'Content-Type': 'application/x-yaml',
            'Cache-Control': 'public, max-age=300',
          },
        })
      );
    } catch (err) {
      return createErrorResponse(
        'INTERNAL_ERROR',
        'Failed to load OpenAPI spec',
        { message: err?.message },
        500,
        requestId
      );
    }
  } else if (url.pathname === '/track/pixel') {
    { const _m = requireMethod(request, 'GET', requestId); if (_m) return _m; }
    const { handleTrackPixel } = await import('./routes/track.ts');
    return await handleTrackPixel(request, env);
  } else if (url.pathname === '/track/opens') {
    { const _m = requireMethod(request, 'GET', requestId); if (_m) return _m; }
    const { handleTrackOpens } = await import('./routes/track.ts');
    return await handleTrackOpens(request, env);
  } else if (url.pathname === '/molt/auth-status') {
    const { getMoltApiKey } = await import('./utils/molt-auth.js');
    const key = getMoltApiKey(env);
    return createSuccessResponse({ authRequired: !!key }, requestId);
  } else if (url.pathname === '/account-plan/context' && request.method === 'GET') {
    const { handleContextPage } = await import('./routes/account-plan-context.ts');
    return await handleContextPage(request, requestId, env);
  } else if (url.pathname === '/account-plan/context/generate') {
    { const _m = requireMethod(request, 'POST', requestId); if (_m) return _m; }
    const { handleContextGenerate } = await import('./routes/account-plan-context.ts');
    return await handleContextGenerate(request, requestId, env);
  } else if (url.pathname === '/account-plan/context/save') {
    { const _m = requireMethod(request, 'POST', requestId); if (_m) return _m; }
    const { handleContextSave } = await import('./routes/account-plan-context.ts');
    return await handleContextSave(request, requestId, env);
  } else if (url.pathname === '/account-plan/context/recent') {
    { const _m = requireMethod(request, 'GET', requestId); if (_m) return _m; }
    const { handleContextRecent } = await import('./routes/account-plan-context.ts');
    return await handleContextRecent(request, requestId, env);
  } else if (url.pathname === '/account-plan/context/ingest') {
    { const _m = requireMethod(request, 'POST', requestId); if (_m) return _m; }
    const { handleContextIngest } = await import('./routes/account-plan-context.ts');
    return await handleContextIngest(request, requestId, env);
  } else if (url.pathname.startsWith('/account-plan/context/draft/')) {
    { const _m = requireMethod(request, 'GET', requestId); if (_m) return _m; }
    const draftId = decodeURIComponent(url.pathname.replace('/account-plan/context/draft/', ''));
    const { handleContextDraftGet } = await import('./routes/account-plan-context.ts');
    return await handleContextDraftGet(request, requestId, env, draftId);
  } else if (url.pathname === '/gmail/review') {
    { const _m = requireMethod(request, 'GET', requestId); if (_m) return _m; }
    const { handleGmailReviewPage } = await import('./routes/gmail-review.ts');
    return await handleGmailReviewPage(request, requestId, env);
  } else if (url.pathname === '/gmail/draft/save') {
    { const _m = requireMethod(request, 'POST', requestId); if (_m) return _m; }
    const { handleGmailDraftSave } = await import('./routes/gmail-review.ts');
    return await handleGmailDraftSave(request, requestId, env);
  } else if (url.pathname === '/gmail/draft/send') {
    { const _m = requireMethod(request, 'POST', requestId); if (_m) return _m; }
    const { handleGmailDraftSend } = await import('./routes/gmail-review.ts');
    return await handleGmailDraftSend(request, requestId, env);
  } else if (url.pathname.startsWith('/gmail/draft/')) {
    { const _m = requireMethod(request, 'GET', requestId); if (_m) return _m; }
    const draftId = decodeURIComponent(url.pathname.replace('/gmail/draft/', ''));
    const { handleGmailDraftGet } = await import('./routes/gmail-review.ts');
    return await handleGmailDraftGet(request, requestId, env, draftId);
  } else if (url.pathname === '/account/profile') {
    { const _m = requireMethod(request, 'GET', requestId); if (_m) return _m; }
    const { handleAccountProfile } = await import('./handlers/account-profile.js');
    return await handleAccountProfile(request, requestId, env, groqQueryCached, assertSanityConfigured);
  } else if (url.pathname === '/account/ensure-enriched') {
    { const _m = requireMethod(request, 'POST', requestId); if (_m) return _m; }
    const { handleEnsureEnriched } = await import('./handlers/ensure-enriched.js');
    return await handleEnsureEnriched(request, requestId, env, groqQuery, assertSanityConfigured);
  } else if (url.pathname === '/accounts/stack-rank') {
    { const _m = requireMethod(request, 'POST', requestId); if (_m) return _m; }
    const { handleAccountsStackRank } = await import('./routes/account-rank.ts');
    return await handleAccountsStackRank(request, requestId, env);
  } else if (url.pathname === '/account-page' || url.pathname.startsWith('/accounts/')) {
    { const _m = requireMethod(request, 'GET', requestId); if (_m) return _m; }
    const { handleAccountPage } = await import('./routes/account-page.ts');
    return await handleAccountPage(request, requestId, env);
      } else if (url.pathname === '/search') {
        { const _m = requireMethod(request, 'POST', requestId); if (_m) return _m; }
        return await handleSearch(request, requestId, env);
      } else if (url.pathname === '/discover') {
        { const _m = requireMethod(request, 'POST', requestId); if (_m) return _m; }
        return await handleDiscover(request, requestId);
      } else if (url.pathname === '/crawl/distributed') {
        { const _m = requireMethod(request, 'POST', requestId); if (_m) return _m; }
        const { handleDistributedCrawl } = await import('./handlers/smart-crawl.js');
        // Import text utilities
        const { extractTitle, cleanMainText, extractExcerpts, detectSignals } = await import('./utils/text.js');
        return await handleDistributedCrawl(
          request,
          requestId,
          env,
          readHtmlWithLimit,
          getBrowserHeaders,
          fetchWithTimeout,
          extractTitle,
          cleanMainText,
          extractExcerpts,
          detectSignals,
          discoverPages
        );
      } else if (url.pathname === '/crawl/smart') {
        { const _m = requireMethod(request, 'POST', requestId); if (_m) return _m; }
        const { handleSmartCrawl } = await import('./handlers/smart-crawl.js');
        // Import text utilities
        const { extractTitle, cleanMainText, extractExcerpts, detectSignals } = await import('./utils/text.js');
        const client = assertSanityConfigured ? assertSanityConfigured(env) : null;
        return await handleSmartCrawl(
          request,
          requestId,
          env,
          groqQuery,
          assertSanityConfigured,
          {
            readHtmlWithLimit,
            getBrowserHeaders,
            fetchWithTimeout,
            extractTitle,
            cleanMainText,
            extractExcerpts,
            detectSignals,
            discoverPages,
          }
        );
      } else if (url.pathname === '/crawl') {
        { const _m = requireMethod(request, 'POST', requestId); if (_m) return _m; }
        return await handleCrawl(request, requestId);
      } else if (url.pathname === '/extract') {
        { const _m = requireMethod(request, 'POST', requestId); if (_m) return _m; }
        return await handleExtract(request, requestId, env);
      } else if (url.pathname === '/linkedin-profile' || url.pathname === '/linkedin/profile') {
        { const _m = requireMethod(request, 'POST', requestId); if (_m) return _m; }
        return await handleLinkedInProfile(request, requestId, env);
      } else if (url.pathname === '/linkedin/search' || url.pathname === '/linkedin/search') {
        { const _m = requireMethod(request, 'POST', requestId); if (_m) return _m; }
        const { handleLinkedInSearch } = await import('./handlers/linkedin-search.js');
        return await handleLinkedInSearch(request, requestId, fetchWithTimeout, readHtmlWithLimit);
      } else if (url.pathname === '/brief') {
        { const _m = requireMethod(request, 'POST', requestId); if (_m) return _m; }
        return await handleBrief(request, requestId, env);
      } else if (url.pathname === '/verify') {
        { const _m = requireMethod(request, 'POST', requestId); if (_m) return _m; }
        return await handleVerify(request, requestId, env);
      } else if (url.pathname === '/cache/status') {
        { const _m = requireMethod(request, 'GET', requestId); if (_m) return _m; }
        return await handleCacheStatus(request, requestId, env);
      } else if (url.pathname.startsWith('/store/')) {
        { const _m = requireMethod(request, 'POST', requestId); if (_m) return _m; }
        return await handleStore(request, requestId, env);
      } else if (url.pathname === '/query' || url.pathname.startsWith('/query/')) {
        return await handleQuery(request, requestId, env);
      } else if (url.pathname.startsWith('/update/')) {
        if (request.method === 'PUT') {
          return await handleUpdate(request, requestId, env);
        }
        if (request.method === 'DELETE') {
          return await handleDelete(request, requestId, env);
        }
        return createErrorResponse(
          'METHOD_NOT_ALLOWED',
          'PUT or DELETE method required for /update/*',
          { method: request.method },
          405,
          requestId
        );
      } else if (url.pathname.startsWith('/delete/')) {
        { const _m = requireMethod(request, 'DELETE', requestId); if (_m) return _m; }
        return await handleDelete(request, requestId, env);
      } else if (url.pathname === '/memory') {
        if (request.method === 'GET') {
          const { handleMemoryRecall } = await import('./handlers/memory.js');
          return await handleMemoryRecall(request, requestId, env, groqQueryCached, assertSanityConfigured);
        } else if (request.method === 'POST') {
          const { handleMemorySync } = await import('./handlers/memory.js');
          return await handleMemorySync(request, requestId, env, groqQuery, upsertDocument, patchDocument, assertSanityConfigured);
        } else {
          return createErrorResponse('METHOD_NOT_ALLOWED', 'GET or POST required', {}, 405, requestId);
        }
      } else if (url.pathname === '/research/complete') {
        { const _m = requireMethod(request, 'POST', requestId); if (_m) return _m; }
        const { handleOneClickResearch } = await import('./handlers/one-click-research.js');
        return await handleOneClickResearch(
          request,
          requestId,
          env,
          groqQuery,
          upsertDocument,
          patchDocument,
          assertSanityConfigured,
          { handleScan, handleDiscover, handleCrawl, handleExtract, handleLinkedInProfile, handleBrief, handleVerify }
        );
      } else if (url.pathname === '/research/quick') {
        { const _m = requireMethod(request, 'GET', requestId); if (_m) return _m; }
        const { handleQuickResearch } = await import('./handlers/one-click-research.js');
        return await handleQuickResearch(request, requestId, env, groqQuery, assertSanityConfigured);
      } else if (url.pathname === '/molt/run') {
        { const _m = requireMethod(request, 'POST', requestId); if (_m) return _m; }
        const { handleMoltRun } = await import('./handlers/moltbot.js');
        return await handleMoltRun(request, requestId, env);
      } else if (url.pathname === '/molt/approve') {
        { const _m = requireMethod(request, 'POST', requestId); if (_m) return _m; }
        const { handleMoltApprove } = await import('./handlers/moltbot.js');
        return await handleMoltApprove(request, requestId, env);
      } else if (url.pathname === '/wrangler/ingest') {
        { const _m = requireMethod(request, 'POST', requestId); if (_m) return _m; }
        const { handleWranglerIngest } = await import('./routes/wrangler.ts');
        return await handleWranglerIngest(request, requestId, env);
      } else if (url.pathname === '/extension/check') {
        { const _m = requireMethod(request, 'GET', requestId); if (_m) return _m; }
        return createSuccessResponse({ ok: true, message: 'Extension connected' }, requestId);
      } else if (url.pathname === '/extension/capture') {
        { const _m = requireMethod(request, 'POST', requestId); if (_m) return _m; }
        const { handleExtensionCapture } = await import('./routes/extension.ts');
        return await handleExtensionCapture(request, requestId, env);
      } else if (url.pathname === '/extension/page-intel') {
        { const _m = requireMethod(request, 'POST', requestId); if (_m) return _m; }
        const { handleExtensionPageIntel } = await import('./routes/extension.ts');
        return await handleExtensionPageIntel(request, requestId, env);
      } else if (url.pathname === '/extension/ask') {
        { const _m = requireMethod(request, 'POST', requestId); if (_m) return _m; }
        const { handleExtensionAsk } = await import('./routes/extension.ts');
        return await handleExtensionAsk(request, requestId, env);
      } else if (url.pathname === '/extension/learn') {
        { const _m = requireMethod(request, 'POST', requestId); if (_m) return _m; }
        const { handleExtensionLearn } = await import('./routes/extension.ts');
        return await handleExtensionLearn(request, requestId, env);
      } else if (url.pathname === '/extension/linkedin-capture') {
        { const _m = requireMethod(request, 'POST', requestId); if (_m) return _m; }
        const { handleLinkedInCapture } = await import('./routes/linkedin-capture.ts');
        return await handleLinkedInCapture(request, requestId, env);
      } else if (url.pathname === '/extension/feedback') {
        { const _m = requireMethod(request, 'POST', requestId); if (_m) return _m; }
        const { handleExtensionFeedback } = await import('./routes/extension.ts');
        return await handleExtensionFeedback(request, requestId, env);
      } else if (url.pathname === '/system/self-heal') {
        { const _m = requireMethod(request, 'POST', requestId); if (_m) return _m; }
        const { handleSystemSelfHeal } = await import('./handlers/system-self-heal.js');
        return await handleSystemSelfHeal(request, requestId, env);
      } else if (url.pathname === '/webhooks/sanity') {
        { const _m = requireMethod(request, 'POST', requestId); if (_m) return _m; }
        const { handleSanityWebhook } = await import('./routes/sanity-webhook.ts');
        return await handleSanityWebhook(request, requestId, env);
      } else if (url.pathname === '/webhooks/telegram') {
        { const _m = requireMethod(request, 'POST', requestId); if (_m) return _m; }
        const { handleTelegramWebhook } = await import('./routes/telegram.ts');
        return await handleTelegramWebhook(request, requestId, env);
      } else if (url.pathname === '/slack/events') {
        { const _m = requireMethod(request, 'POST', requestId); if (_m) return _m; }
        const { handleSlackEvents } = await import('./routes/slack.ts');
        return await handleSlackEvents(request, requestId, env);
      } else if (url.pathname === '/slack/command') {
        { const _m = requireMethod(request, 'POST', requestId); if (_m) return _m; }
        const { handleSlackCommand } = await import('./routes/slack.ts');
        return await handleSlackCommand(request, requestId, env);
      } else if (url.pathname.startsWith('/tools/')) {
        { const _m = requireMethod(request, 'POST', requestId); if (_m) return _m; }
        if (url.pathname === '/tools/gmail') {
          const { handleGmailTool } = await import('./routes/tools/gmail.ts');
          return await handleGmailTool(request, requestId, env);
        }
        if (url.pathname === '/tools/calendar') {
          const { handleCalendarTool } = await import('./routes/tools/calendar.ts');
          return await handleCalendarTool(request, requestId);
        }
        if (url.pathname === '/tools/slack') {
          const { handleSlackTool } = await import('./routes/tools/slack.ts');
          return await handleSlackTool(request, requestId);
        }
        if (url.pathname === '/tools/webSearch') {
          const { handleWebSearchTool } = await import('./routes/tools/webSearch.ts');
          return await handleWebSearchTool(request, requestId);
        }
        if (url.pathname === '/tools/summarize') {
          const { handleSummarizeTool } = await import('./routes/tools/summarize.ts');
          return await handleSummarizeTool(request, requestId);
        }
        if (url.pathname === '/tools/memorySearch') {
          const { handleMemorySearchTool } = await import('./routes/tools/memorySearch.ts');
          return await handleMemorySearchTool(request, requestId);
        }
        if (url.pathname === '/tools/whisperTranscribe') {
          const { handleWhisperTranscribeTool } = await import('./routes/tools/whisperTranscribe.ts');
          return await handleWhisperTranscribeTool(request, requestId);
        }
        if (url.pathname === '/tools/github') {
          const { handleGithubTool } = await import('./routes/tools/github.ts');
          return await handleGithubTool(request, requestId);
        }
        if (url.pathname === '/tools/wrangler') {
          const { handleWranglerTool } = await import('./routes/tools/wrangler.ts');
          return await handleWranglerTool(request, requestId, env);
        }
        return createErrorResponse(
          'NOT_FOUND',
          'Tool route not found',
          { path: url.pathname },
          404,
          requestId
        );
      } else if (url.pathname === '/network/importConnections') {
        { const _m = requireMethod(request, 'POST', requestId); if (_m) return _m; }
        const { handleImportConnections } = await import('./routes/network.ts');
        return await handleImportConnections(request, requestId, env);
      } else if (url.pathname === '/network/dailyRun') {
        { const _m = requireMethod(request, 'POST', requestId); if (_m) return _m; }
        const { handleDailyRun } = await import('./routes/network.ts');
        return await handleDailyRun(request, requestId, env);
      } else if (url.pathname === '/moltbook/api/activity') {
        const { handleMoltbookApiActivityGet, handleMoltbookApiActivityPost } = await import('./routes/moltbook.ts');
        if (request.method === 'GET') return await handleMoltbookApiActivityGet(request, requestId, env);
        if (request.method === 'POST') {
          { const _m = requireMethod(request, 'POST', requestId); if (_m) return _m; }
          return await handleMoltbookApiActivityPost(request, requestId, env);
        }
        return new Response('Method Not Allowed', { status: 405 });
      } else if (url.pathname === '/moltbook/fetch') {
        { const _m = requireMethod(request, 'POST', requestId); if (_m) return _m; }
        const { handleMoltbookFetch } = await import('./routes/moltbook.ts');
        return await handleMoltbookFetch(request, requestId, env);
      } else if (url.pathname === '/moltbook/crawl') {
        const { handleMoltbookCrawl } = await import('./routes/moltbook.ts');
        return await handleMoltbookCrawl(request, requestId, env);
      } else if (url.pathname === '/moltbook/sanitize') {
        { const _m = requireMethod(request, 'POST', requestId); if (_m) return _m; }
        const { handleMoltbookSanitize } = await import('./routes/moltbook.ts');
        return await handleMoltbookSanitize(request, requestId, env);
      } else if (url.pathname === '/opportunities/daily') {
        { const _m = requireMethod(request, 'POST', requestId); if (_m) return _m; }
        const { handleOpportunitiesDaily } = await import('./routes/opportunities.ts');
        return await handleOpportunitiesDaily(request, requestId, env);
      } else if (url.pathname === '/dq/scan') {
        { const _m = requireMethod(request, 'POST', requestId); if (_m) return _m; }
        const { handleDqScan } = await import('./routes/dq.ts');
        return await handleDqScan(request, requestId, env);
      } else if (url.pathname === '/dq/enrich/queue') {
        { const _m = requireMethod(request, 'POST', requestId); if (_m) return _m; }
        const { handleEnrichQueue } = await import('./routes/dq.ts');
        return await handleEnrichQueue(request, requestId, env);
      } else if (url.pathname === '/dq/enrich/run') {
        { const _m = requireMethod(request, 'POST', requestId); if (_m) return _m; }
        const { handleEnrichRun } = await import('./routes/dq.ts');
        return await handleEnrichRun(request, requestId, env);
      } else if (url.pathname === '/dq/enrich/apply') {
        { const _m = requireMethod(request, 'POST', requestId); if (_m) return _m; }
        const { handleEnrichApply } = await import('./routes/dq.ts');
        return await handleEnrichApply(request, requestId, env);
      } else if (url.pathname === '/enrich/run') {
        { const _m = requireMethod(request, 'POST', requestId); if (_m) return _m; }
        const { handleEnrichRun } = await import('./routes/dq.ts');
        return await handleEnrichRun(request, requestId, env);
      } else if (url.pathname === '/enrich/apply') {
        { const _m = requireMethod(request, 'POST', requestId); if (_m) return _m; }
        const { handleEnrichApply } = await import('./routes/dq.ts');
        return await handleEnrichApply(request, requestId, env);
      } else if (url.pathname === '/molt/log') {
        { const _m = requireMethod(request, 'POST', requestId); if (_m) return _m; }
        const { handleMoltLog } = await import('./routes/molt.ts');
        return await handleMoltLog(request, requestId, env);
      } else if (url.pathname === '/molt/jobs/run') {
        { const _m = requireMethod(request, 'POST', requestId); if (_m) return _m; }
        const { handleMoltJobsRun } = await import('./routes/molt.ts');
        return await handleMoltJobsRun(request, requestId, env);
      } else if (url.pathname === '/molt/feedback') {
        { const _m = requireMethod(request, 'POST', requestId); if (_m) return _m; }
        const { handleMoltFeedback } = await import('./routes/molt.ts');
        return await handleMoltFeedback(request, requestId, env);
      } else if (url.pathname === '/calls/ingest') {
        { const _m = requireMethod(request, 'POST', requestId); if (_m) return _m; }
        const { handleCallsIngest } = await import('./routes/calls.ts');
        return await handleCallsIngest(request, requestId, env);
      } else if (url.pathname === '/calls/react') {
        { const _m = requireMethod(request, 'POST', requestId); if (_m) return _m; }
        const { handleCallsReact } = await import('./routes/calls.ts');
        return await handleCallsReact(request, requestId, env);
      } else if (url.pathname === '/research') {
        { const _m = requireMethod(request, 'POST', requestId); if (_m) return _m; }
        const { handleResearch } = await import('./handlers/orchestrator.js');
        return await handleResearch(
          request,
          requestId,
          env,
          groqQuery,
          upsertDocument,
          patchDocument,
          assertSanityConfigured,
          { handleScan, handleDiscover, handleCrawl, handleExtract, handleLinkedInProfile, handleBrief, handleVerify }
        );
      } else if (url.pathname === '/research/intelligence') {
        { const _m = requireMethod(request, 'GET', requestId); if (_m) return _m; }
        const { handleGetIntelligence } = await import('./handlers/orchestrator.js');
        return await handleGetIntelligence(
          request,
          requestId,
          env,
          groqQuery,
          assertSanityConfigured
        );
      } else if (url.pathname.startsWith('/enrich/')) {
        if (url.pathname === '/enrich/queue') {
          { const _m = requireMethod(request, 'POST', requestId); if (_m) return _m; }
          const { handleQueueEnrichment } = await import('./handlers/enrichment.js');
          return await handleQueueEnrichment(request, requestId, env, groqQuery, upsertDocument, assertSanityConfigured, ctx);
        } else if (url.pathname === '/enrich/advance') {
          { const _m = requireMethod(request, 'POST', requestId); if (_m) return _m; }
          const { handleAdvanceEnrichment } = await import('./handlers/enrichment.js');
          return await handleAdvanceEnrichment(
            request,
            requestId,
            env,
            groqQuery,
            upsertDocument,
            patchDocument,
            assertSanityConfigured,
            { handleScan, handleDiscover, handleCrawl, handleExtract, handleLinkedInProfile, handleBrief, handleVerify },
            ctx
          );
        } else if (url.pathname === '/enrich/status') {
          { const _m = requireMethod(request, 'GET', requestId); if (_m) return _m; }
          const { handleGetEnrichmentStatus } = await import('./handlers/enrichment.js');
          return await handleGetEnrichmentStatus(
            request,
            requestId,
            env,
            groqQuery,
            assertSanityConfigured,
          );
        } else if (url.pathname === '/enrich/research') {
          { const _m = requireMethod(request, 'GET', requestId); if (_m) return _m; }
          const { handleGetResearchSet } = await import('./handlers/enrichment.js');
          return await handleGetResearchSet(request, requestId, env, groqQuery, assertSanityConfigured);
        } else if (url.pathname === '/enrich/execute') {
          { const _m = requireMethod(request, 'POST', requestId); if (_m) return _m; }
          const { handleExecuteEnrichmentStage } = await import('./handlers/enrichment.js');
          return await handleExecuteEnrichmentStage(request, requestId, env, groqQuery, upsertDocument, patchDocument, assertSanityConfigured, { handleScan, handleDiscover, handleCrawl, handleExtract, handleLinkedInProfile, handleBrief, handleVerify });
        } else if (url.pathname === '/enrich/process') {
          { const _m = requireMethod(request, 'POST', requestId); if (_m) return _m; }
          const { handleProcessEnrichmentJobs } = await import('./handlers/enrichment.js');
          return await handleProcessEnrichmentJobs(request, requestId, env, groqQuery, upsertDocument, patchDocument, assertSanityConfigured, { handleScan, handleDiscover, handleCrawl, handleExtract, handleLinkedInProfile, handleBrief, handleVerify });
        } else if (url.pathname === '/enrich/jobs') {
          { const _m = requireMethod(request, 'GET', requestId); if (_m) return _m; }
          const { handleListEnrichmentJobs } = await import('./handlers/enrichment.js');
          return await handleListEnrichmentJobs(request, requestId, env, groqQuery, assertSanityConfigured);
        }
      } else if (url.pathname.startsWith('/competitors/')) {
        if (url.pathname === '/competitors/research') {
          if (request.method === 'POST') {
            const { handleResearchCompetitors } = await import('./handlers/competitors.js');
            return await handleResearchCompetitors(request, requestId, env, groqQuery, upsertDocument, patchDocument, assertSanityConfigured, null);
          } else if (request.method === 'GET') {
            const { handleGetCompetitorResearch } = await import('./handlers/competitors.js');
            return await handleGetCompetitorResearch(request, requestId, env, groqQuery, assertSanityConfigured);
          } else {
            return createErrorResponse('METHOD_NOT_ALLOWED', 'GET or POST required', {}, 405, requestId);
          }
        } else if (url.pathname === '/competitors/opportunities') {
          { const _m = requireMethod(request, 'GET', requestId); if (_m) return _m; }
          const { handleGetProspectingOpportunities } = await import('./handlers/competitors.js');
          return await handleGetProspectingOpportunities(request, requestId, env, groqQuery, assertSanityConfigured);
        }
      } else if (url.pathname.startsWith('/technologies/')) {
        // ── Technologies intelligence endpoints ──────────────────────────
        if (url.pathname === '/technologies/insights') {
          { const _m = requireMethod(request, 'GET', requestId); if (_m) return _m; }
          const { handleTechInsights } = await import('./technologies.js');
          return await handleTechInsights(request, requestId, env, groqQuery, assertSanityConfigured);
        } else if (url.pathname === '/technologies/analyze') {
          { const _m = requireMethod(request, 'POST', requestId); if (_m) return _m; }
          const { handleTechAnalyze } = await import('./technologies.js');
          return await handleTechAnalyze(request, requestId, env, groqQuery, upsertDocument, assertSanityConfigured, ctx);
        } else if (url.pathname === '/technologies/search') {
          { const _m = requireMethod(request, 'GET', requestId); if (_m) return _m; }
          const { handleTechSearch } = await import('./technologies.js');
          return await handleTechSearch(request, requestId);
        } else {
          return createErrorResponse('NOT_FOUND', 'Technologies endpoint not found', { hint: 'Available: /technologies/insights, /technologies/analyze, /technologies/search' }, 404, requestId);
        }
      } else if (url.pathname === '/scan') {
        return await handleScan(request, requestId, env);
      } else if (url.pathname === '/scan-batch') {
        return await handleBatchScan(request, requestId);
      } else if (url.pathname.startsWith('/osint/')) {
        if (url.pathname === '/osint/queue') {
          { const _m = requireMethod(request, 'POST', requestId); if (_m) return _m; }
          const { handleQueueOsint } = await import('./handlers/osint.js');
          return await handleQueueOsint(request, requestId, env, groqQuery, upsertDocument, patchDocument, assertSanityConfigured, { handleScan, handleDiscover, handleCrawl, handleExtract, handleLinkedInProfile, handleBrief, handleVerify });
        } else if (url.pathname === '/osint/status') {
          { const _m = requireMethod(request, 'GET', requestId); if (_m) return _m; }
          const { handleGetOsintStatus } = await import('./handlers/osint.js');
          return await handleGetOsintStatus(request, requestId, env, groqQuery, assertSanityConfigured);
        } else if (url.pathname === '/osint/report') {
          { const _m = requireMethod(request, 'GET', requestId); if (_m) return _m; }
          const { handleGetOsintReport } = await import('./handlers/osint.js');
          return await handleGetOsintReport(request, requestId, env, groqQuery, assertSanityConfigured);
        } else if (url.pathname === '/osint/run') {
          { const _m = requireMethod(request, 'POST', requestId); if (_m) return _m; }
          const { handleRunOsint } = await import('./handlers/osint.js');
          return await handleRunOsint(request, requestId, env, groqQuery, upsertDocument, patchDocument, assertSanityConfigured, { handleScan, handleDiscover, handleCrawl, handleExtract, handleLinkedInProfile, handleBrief, handleVerify });
        } else {
          return createErrorResponse('NOT_FOUND', 'OSINT endpoint not found', { path: url.pathname }, 404, requestId);
        }
      } else if (url.pathname.startsWith('/operator/dedup')) {
        // ── Deduplication endpoints (destructive — admin token REQUIRED) ─
        const adminAuth = checkAdminToken(request, env);
        if (adminAuth === 'not_configured') {
          return createErrorResponse('CONFIG_ERROR', 'ADMIN_TOKEN not configured. Dedup endpoints require admin auth.', { hint: 'wrangler secret put ADMIN_TOKEN' }, 503, requestId);
        }
        if (adminAuth !== 'ok') {
          return createErrorResponse('UNAUTHORIZED', 'Admin token required for dedup operations. Send via X-Admin-Token header.', {}, 401, requestId);
        }
        { const _m = requireMethod(request, 'POST', requestId); if (_m) return _m; }
        const { initSanityClient: initSC, groqQuery: gq, mutate: mt } = await import('./sanity-client.js');
        const dedupClient = initSC(env);
        if (!dedupClient) {
          return createErrorResponse('CONFIG_ERROR', 'Sanity not configured', {}, 500, requestId);
        }
        const sanity = { groqQuery: gq, client: dedupClient, mutate: mt };
        const { handleDedupScan, handleDedupExecute, handleDedupMerge } = await import('./routes/dedup.ts');
        if (url.pathname === '/operator/dedup/scan') {
          return await handleDedupScan(request, requestId, env, sanity);
        } else if (url.pathname === '/operator/dedup/execute') {
          return await handleDedupExecute(request, requestId, env, sanity);
        } else if (url.pathname === '/operator/dedup/merge') {
          return await handleDedupMerge(request, requestId, env, sanity);
        } else {
          return createErrorResponse('NOT_FOUND', 'Dedup endpoint not found. Use /operator/dedup/scan, /execute, or /merge', { path: url.pathname }, 404, requestId);
        }
      } else if (url.pathname.startsWith('/operator/console')) {
        const { checkMoltApiKey } = await import('./utils/molt-auth.js');
        const auth = checkAdminToken(request, env) === 'ok' || checkMoltApiKey(request, env, requestId).allowed;
        if (!auth) {
          return checkMoltApiKey(request, env, requestId).errorResponse || createErrorResponse('UNAUTHORIZED', 'Admin token required', {}, 401, requestId);
        }
        const {
          handleOperatorConsoleAccount,
          handleOperatorConsoleCommand,
          handleOperatorConsoleDiagnostics,
          handleOperatorConsoleSimulate,
          handleOperatorConsoleSnapshot,
        } = await import('./routes/operatorConsole.ts');
        const {
          handleOperatorCopilotAction,
          handleOperatorCopilotExplain,
          handleOperatorCopilotQuery,
          handleOperatorCopilotState,
        } = await import('./routes/operatorCopilot.ts');
        const {
          handleOperatorAgents,
          handleOperatorFunctions,
        } = await import('./routes/operatorRegistry.ts');

        if (url.pathname === '/operator/console/snapshot') {
          { const _m = requireMethod(request, 'GET', requestId); if (_m) return _m; }
          return await handleOperatorConsoleSnapshot(request, requestId, env);
        } else if (url.pathname === '/operator/console/functions') {
          { const _m = requireMethod(request, 'GET', requestId); if (_m) return _m; }
          return await handleOperatorFunctions(request, requestId);
        } else if (url.pathname === '/operator/console/agents') {
          { const _m = requireMethod(request, 'GET', requestId); if (_m) return _m; }
          return await handleOperatorAgents(request, requestId);
        } else if (url.pathname === '/operator/console/copilot') {
          { const _m = requireMethod(request, 'GET', requestId); if (_m) return _m; }
          return await handleOperatorCopilotState(request, requestId, env);
        } else if (url.pathname === '/operator/console/copilot/query') {
          { const _m = requireMethod(request, 'POST', requestId); if (_m) return _m; }
          return await handleOperatorCopilotQuery(request, requestId, env);
        } else if (url.pathname === '/operator/console/copilot/explain') {
          { const _m = requireMethod(request, 'POST', requestId); if (_m) return _m; }
          return await handleOperatorCopilotExplain(request, requestId, env);
        } else if (url.pathname === '/operator/console/copilot/action') {
          { const _m = requireMethod(request, 'POST', requestId); if (_m) return _m; }
          return await handleOperatorCopilotAction(request, requestId, env);
        } else if (url.pathname.startsWith('/operator/console/account/')) {
          { const _m = requireMethod(request, 'GET', requestId); if (_m) return _m; }
          const accountId = decodeURIComponent(url.pathname.split('/').pop() || '');
          return await handleOperatorConsoleAccount(request, requestId, env, accountId);
        } else if (url.pathname === '/operator/console/command') {
          { const _m = requireMethod(request, 'POST', requestId); if (_m) return _m; }
          return await handleOperatorConsoleCommand(request, requestId, env);
        } else if (url.pathname === '/operator/console/simulate') {
          { const _m = requireMethod(request, 'POST', requestId); if (_m) return _m; }
          return await handleOperatorConsoleSimulate(request, requestId, env);
        } else if (url.pathname === '/operator/console/diagnostics') {
          { const _m = requireMethod(request, 'POST', requestId); if (_m) return _m; }
          return await handleOperatorConsoleDiagnostics(request, requestId, env);
        } else if (url.pathname.startsWith('/operator/console/draft/')) {
          { const _m = requireMethod(request, 'GET', requestId); if (_m) return _m; }
          const draftId = decodeURIComponent(url.pathname.replace(/^\/operator\/console\/draft\//, '') || '');
          const { handleOperatorConsoleDraft } = await import('./routes/operatorConsole.ts');
          return await handleOperatorConsoleDraft(request, requestId, env, draftId);
        } else if (url.pathname.startsWith('/operator/console/brief/')) {
          { const _m = requireMethod(request, 'GET', requestId); if (_m) return _m; }
          const briefId = decodeURIComponent(url.pathname.replace(/^\/operator\/console\/brief\//, '') || '');
          const { handleOperatorConsoleBrief } = await import('./routes/operatorConsole.ts');
          return await handleOperatorConsoleBrief(request, requestId, env, briefId);
        } else if (url.pathname.startsWith('/operator/console/job/')) {
          { const _m = requireMethod(request, 'GET', requestId); if (_m) return _m; }
          const jobId = decodeURIComponent(url.pathname.replace(/^\/operator\/console\/job\//, '') || '');
          const { handleOperatorConsoleJob } = await import('./routes/operatorConsole.ts');
          return await handleOperatorConsoleJob(request, requestId, env, jobId);
        } else {
          return createErrorResponse('NOT_FOUND', 'Operator console endpoint not found', { path: url.pathname }, 404, requestId);
        }
      } else if (url.pathname.startsWith('/analytics/')) {
        if (url.pathname === '/analytics/compare') {
          { const _m = requireMethod(request, 'POST', requestId); if (_m) return _m; }
          const { handleCompareAccounts } = await import('./handlers/analytics.js');
          return await handleCompareAccounts(request, requestId, env, groqQueryCached, assertSanityConfigured);
        } else if (url.pathname === '/analytics/trends') {
          { const _m = requireMethod(request, 'GET', requestId); if (_m) return _m; }
          const { handleAccountTrends } = await import('./handlers/analytics.js');
          return await handleAccountTrends(request, requestId, env, groqQueryCached, assertSanityConfigured);
        } else if (url.pathname === '/analytics/dashboard') {
          { const _m = requireMethod(request, 'GET', requestId); if (_m) return _m; }
          const { handleAnalyticsDashboard } = await import('./handlers/analytics.js');
          return await handleAnalyticsDashboard(request, requestId, env, groqQueryCached, assertSanityConfigured);
        } else if (url.pathname === '/analytics/export') {
          { const _m = requireMethod(request, 'GET', requestId); if (_m) return _m; }
          const { handleExportAccount } = await import('./handlers/analytics.js');
          return await handleExportAccount(request, requestId, env, groqQueryCached, assertSanityConfigured);
        } else if (url.pathname === '/analytics/intelligence') {
          { const _m = requireMethod(request, 'GET', requestId); if (_m) return _m; }
          const { handleIntelligenceDashboard } = await import('./handlers/intelligence-dashboard.js');
          return await handleIntelligenceDashboard(request, requestId, env, groqQueryCached, assertSanityConfigured);
        } else if (url.pathname === '/analytics/explain') {
          { const _m = requireMethod(request, 'POST', requestId); if (_m) return _m; }
          const { checkMoltApiKey } = await import('./utils/molt-auth.js');
          const auth = checkAdminToken(request, env) === 'ok' || checkMoltApiKey(request, env, requestId).allowed;
          if (!auth) {
            return checkMoltApiKey(request, env, requestId).errorResponse || createErrorResponse('UNAUTHORIZED', 'Admin token required', {}, 401, requestId);
          }
          const { handleAnalyticsExplain } = await import('./routes/analyticsExplain.ts');
          return await handleAnalyticsExplain(request, requestId, env);
        } else if (url.pathname === '/analytics/operator-brief') {
          if (request.method !== 'GET' && request.method !== 'POST') {
            return createErrorResponse('METHOD_NOT_ALLOWED', 'GET or POST required', {}, 405, requestId);
          }
          const { checkMoltApiKey } = await import('./utils/molt-auth.js');
          const auth = checkAdminToken(request, env) === 'ok' || checkMoltApiKey(request, env, requestId).allowed;
          if (!auth) {
            return checkMoltApiKey(request, env, requestId).errorResponse || createErrorResponse('UNAUTHORIZED', 'Admin token required', {}, 401, requestId);
          }
          const { handleOperatorBriefing } = await import('./handlers/operator-briefing.js');
          return await handleOperatorBriefing(request, requestId, env, groqQueryCached, upsertDocument, assertSanityConfigured);
        } else if (url.pathname === '/analytics/superuser') {
          { const _m = requireMethod(request, 'GET', requestId); if (_m) return _m; }
          const { checkMoltApiKey } = await import('./utils/molt-auth.js');
          const auth = checkAdminToken(request, env) === 'ok' || checkMoltApiKey(request, env, requestId).allowed;
          if (!auth) {
            return checkMoltApiKey(request, env, requestId).errorResponse || createErrorResponse('UNAUTHORIZED', 'Admin token required', {}, 401, requestId);
          }
          const { handleSuperuserState } = await import('./routes/superuser.ts');
          return await handleSuperuserState(request, requestId, env);
        } else if (url.pathname === '/analytics/superuser/command') {
          { const _m = requireMethod(request, 'POST', requestId); if (_m) return _m; }
          const { checkMoltApiKey } = await import('./utils/molt-auth.js');
          const auth = checkAdminToken(request, env) === 'ok' || checkMoltApiKey(request, env, requestId).allowed;
          if (!auth) {
            return checkMoltApiKey(request, env, requestId).errorResponse || createErrorResponse('UNAUTHORIZED', 'Admin token required', {}, 401, requestId);
          }
          const { handleSuperuserCommand } = await import('./routes/superuser.ts');
          return await handleSuperuserCommand(request, requestId, env);
        } else if (url.pathname === '/analytics/nightly-intelligence') {
          { const _m = requireMethod(request, 'POST', requestId); if (_m) return _m; }
          const { checkMoltApiKey } = await import('./utils/molt-auth.js');
          const auth = checkAdminToken(request, env) === 'ok' || checkMoltApiKey(request, env, requestId).allowed;
          if (!auth) {
            return checkMoltApiKey(request, env, requestId).errorResponse || createErrorResponse('UNAUTHORIZED', 'Admin token required', {}, 401, requestId);
          }
          const { handleNightlyIntelligence } = await import('./routes/analyticsNightly.ts');
          return await handleNightlyIntelligence(request, requestId, env);
        } else {
          return createErrorResponse('NOT_FOUND', 'Analytics endpoint not found', { path: url.pathname }, 404, requestId);
        }
      } else if (url.pathname === '/opportunities/score') {
        // Opportunity scoring — expose opportunityEngine via public API
        // Uses groqQueryCached (historical/analytical data, CDN-safe)
        { const _m = requireMethod(request, 'GET', requestId); if (_m) return _m; }
        const { handleOpportunityScore } = await import('./handlers/opportunity-scoring.js');
        return await handleOpportunityScore(request, requestId, env, groqQueryCached, assertSanityConfigured);
      } else if (url.pathname.startsWith('/drafting/')) {
        // Drafting endpoints — expose draftingEngine via public API
        // Uses fresh groqQuery (data may have just been created)
        if (url.pathname === '/drafting/generate') {
          { const _m = requireMethod(request, 'POST', requestId); if (_m) return _m; }
          const { handleGenerateDraft } = await import('./handlers/drafting.js');
          return await handleGenerateDraft(request, requestId, env, groqQuery, assertSanityConfigured);
        } else if (url.pathname === '/drafting/regenerate') {
          { const _m = requireMethod(request, 'POST', requestId); if (_m) return _m; }
          const { handleRegenerateDraft } = await import('./handlers/drafting.js');
          return await handleRegenerateDraft(request, requestId, env, groqQuery, assertSanityConfigured);
        } else {
          return createErrorResponse('NOT_FOUND', 'Drafting endpoint not found', { path: url.pathname }, 404, requestId);
        }
      } else if (url.pathname === '/webhooks' || url.pathname.startsWith('/webhooks/')) {
        if (url.pathname === '/webhooks/register') {
          { const _m = requireMethod(request, 'POST', requestId); if (_m) return _m; }
          const { handleRegisterWebhook } = await import('./handlers/webhooks.js');
          return await handleRegisterWebhook(request, requestId, env, groqQuery, upsertDocument, assertSanityConfigured);
        } else if (url.pathname === '/webhooks' || url.pathname === '/webhooks/list') {
          { const _m = requireMethod(request, 'GET', requestId); if (_m) return _m; }
          const { handleListWebhooks } = await import('./handlers/webhooks.js');
          return await handleListWebhooks(request, requestId, env, groqQuery, assertSanityConfigured);
        } else if (url.pathname.startsWith('/webhooks/delete/')) {
          { const _m = requireMethod(request, 'DELETE', requestId); if (_m) return _m; }
          const { handleDeleteWebhook } = await import('./handlers/webhooks.js');
          const webhookId = url.pathname.split('/').pop();
          return await handleDeleteWebhook(request, requestId, env, groqQuery, assertSanityConfigured, webhookId);
        } else {
          return createErrorResponse('NOT_FOUND', 'Webhook endpoint not found', { path: url.pathname }, 404, requestId);
        }
      } else if (url.pathname === '/orchestrate') {
        { const _m = requireMethod(request, 'POST', requestId); if (_m) return _m; }
        const { handleUnifiedOrchestrate } = await import('./handlers/unified-orchestrator.js');
        const { analyzeBusinessScale: _abs, detectBusinessUnits: _dbu } = await import('./services/business-analyzer.js');
        const { analyzePerformance: _ap } = await import('./services/performance-analyzer.js');
        const { calculateAIReadinessScore: _cai } = await import('./services/ai-readiness.js');
        return await handleUnifiedOrchestrate(
          request,
          requestId,
          env,
          groqQuery,
          upsertDocument,
          patchDocument,
          assertSanityConfigured,
          {
            handleScan,
            handleDiscover,
            handleCrawl,
            handleExtract,
            handleLinkedInProfile,
            handleBrief,
            handleVerify,
            handleLinkedInSearch: async (req, reqId, fetchFn, readFn) => {
              const { handleLinkedInSearch } = await import('./handlers/linkedin-search.js');
              return await handleLinkedInSearch(req, reqId, fetchFn, readFn);
            },
          },
          {
            searchProvider,
            getBrowserHeaders,
            readHtmlWithLimit,
            extractTitle,
            cleanMainText,
            detectSignals,
            extractExcerpts,
            extractEntities,
            extractClaims,
            extractScriptSrcs,
            extractLinkHrefs,
            extractNavigationLinks,
            detectTechnologyStack,
            analyzeBusinessScale: _abs,
            detectBusinessUnits: _dbu,
            analyzePerformance: _ap,
            calculateAIReadinessScore: _cai,
            discoverPages,
            crawlWithConcurrency,
            calculateContentHash,
          }
        );
      } else if (url.pathname === '/orchestrate/status') {
        { const _m = requireMethod(request, 'GET', requestId); if (_m) return _m; }
        const { handleGetOrchestrationStatus } = await import('./handlers/unified-orchestrator.js');
        return await handleGetOrchestrationStatus(
          request,
          requestId,
          groqQuery,
          assertSanityConfigured,
          env
        );
      } else if (url.pathname === '/person/brief') {
        { const _m = requireMethod(request, 'POST', requestId); if (_m) return _m; }
        const { handlePersonBrief } = await import('./handlers/person-intelligence.js');
        // Import scoring functions
        const { detectTechnologyStack } = await import('./services/tech-detector.js');
        const { calculateAIReadinessScore } = await import('./services/ai-readiness.js');
        const { analyzePerformance } = await import('./services/performance-analyzer.js');
        const { analyzeBusinessScale, detectBusinessUnits } = await import('./services/business-analyzer.js');
        // Build internal functions context
        const internalFunctions = {
          searchProvider,
          getBrowserHeaders,
          fetchWithTimeout,
          readHtmlWithLimit,
          extractTitle,
          cleanMainText,
          detectSignals,
          extractExcerpts,
          extractEntities,
          extractClaims,
          extractScriptSrcs,
          extractLinkHrefs,
          extractNavigationLinks,
          detectTechnologyStack,
          analyzeBusinessScale,
          detectBusinessUnits,
          analyzePerformance,
          calculateAIReadinessScore,
          discoverPages,
          crawlWithConcurrency,
          calculateContentHash,
          verifyClaimsInternal: async (params) => {
            // Create mock request for handleVerify
            // handleVerify expects sources as array of URL strings
            const sourceUrls = (params.sources || []).map(s => typeof s === 'string' ? s : s.url).filter(Boolean);
            
            if (sourceUrls.length === 0) {
              return { verified: [], verificationId: null };
            }
            
            const verifyRequest = new Request('http://localhost/verify', {
              method: 'POST',
              body: JSON.stringify({
                claims: params.claims || [],
                sources: sourceUrls,
              }),
              headers: { 'Content-Type': 'application/json' },
            });
            const verifyResponse = await handleVerify(verifyRequest, requestId, env);
            const verifyResult = await verifyResponse.json();
            if (verifyResult.ok && verifyResult.data) {
              // Generate verification ID for storage
              const verificationId = `verify-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
              return {
                verified: verifyResult.data.verified || [],
                verificationId,
              };
            }
            return { verified: [], verificationId: null };
          },
        };
        return await handlePersonBrief(request, requestId, env, groqQuery, upsertDocument, patchDocument, assertSanityConfigured, internalFunctions);
      } else if (url.pathname === '/person/pin-contact') {
        { const _m = requireMethod(request, 'PATCH', requestId); if (_m) return _m; }
        const { handlePinContact } = await import('./handlers/person-pin.js');
        return await handlePinContact(request, requestId, env, groqQuery, patchDocument, assertSanityConfigured, createSuccessResponse, createErrorResponse, safeParseJson);
      } else if (url.pathname === '/sdr/good-morning' || url.pathname === '/accountability/good-morning') {
        { const _m = requireMethod(request, 'POST', requestId); if (_m) return _m; }
        const { handleGoodMorningRouting } = await import('./handlers/sdr-good-morning.js');
        return await handleGoodMorningRouting(request, requestId, env, groqQueryCached, assertSanityConfigured);
      } else if (url.pathname.startsWith('/user-patterns/')) {
        if (url.pathname === '/user-patterns/query') {
          { const _m = requireMethod(request, 'GET', requestId); if (_m) return _m; }
          const { handleQueryUserPatterns } = await import('./handlers/user-patterns.js');
          return await handleQueryUserPatterns(request, requestId, env, groqQuery, assertSanityConfigured);
        } else if (url.pathname === '/user-patterns/store') {
          { const _m = requireMethod(request, 'POST', requestId); if (_m) return _m; }
          const { handleStoreUserPattern } = await import('./handlers/user-patterns.js');
          return await handleStoreUserPattern(request, requestId, env, groqQuery, upsertDocument, assertSanityConfigured);
        } else {
          return createErrorResponse('NOT_FOUND', 'User pattern endpoint not found', { path: url.pathname }, 404, requestId);
        }
      } else {
        return createErrorResponse(
          'NOT_FOUND',
          'Endpoint not found',
          { path: url.pathname },
          404,
          requestId
        );
      }
    } catch (error) {
      console.error('[FATAL] Unhandled error:', error.message, error.stack);
      return createErrorResponse(
        'INTERNAL_ERROR',
        'Internal server error',
        { hint: 'An unexpected error occurred. Check server logs for details.' },
        500,
        requestId
      );
    }
  }
