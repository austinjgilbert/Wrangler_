/**
 * HTTP Header Utilities
 * Generates browser-like headers to bypass bot protection
 */

/**
 * Get base headers common to all requests
 * @param {string|null} referer - Optional referer URL
 * @returns {Record<string, string>}
 */
function getBaseHeaders(referer = null) {
  return {
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
    'Accept-Language': 'en-US,en;q=0.9',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': referer ? 'same-origin' : 'none',
    'Sec-Fetch-User': '?1',
    'Cache-Control': 'max-age=0',
    ...(referer && { 'Referer': referer }),
  };
}

/**
 * Get browser-like headers to bypass Cloudflare bot protection
 * @param {string|null} referer - Optional referer URL
 * @returns {Record<string, string>}
 */
export function getBrowserHeaders(referer = null) {
  return {
    ...getBaseHeaders(referer),
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept-Encoding': 'identity',
    'DNT': '1',
  };
}

/**
 * Get realistic User-Agent strings for rotation
 * Rotating UAs helps avoid detection patterns
 */
function getRandomUserAgent() {
  const userAgents = [
    // Chrome on macOS
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
    // Chrome on Windows
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
    // Safari on macOS
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15',
    // Firefox on macOS
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:122.0) Gecko/20100101 Firefox/122.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:121.0) Gecko/20100101 Firefox/121.0',
  ];
  
  return userAgents[Math.floor(Math.random() * userAgents.length)];
}

/**
 * Get LinkedIn-optimized headers (more human-like for LinkedIn bot protection)
 * Enhanced to bypass 999 status code (bot protection) with UA rotation
 * @param {string|null} referer - Optional referer URL
 * @returns {Record<string, string>}
 */
export function getLinkedInHeaders(referer = null) {
  // Generate a realistic viewport width
  const viewportWidth = Math.floor(Math.random() * 200) + 1920; // 1920-2120
  
  // Rotate user agent for better stealth
  const userAgent = getRandomUserAgent();
  
  // Determine platform from UA
  const isMac = userAgent.includes('Macintosh');
  const isWindows = userAgent.includes('Windows');
  const isChrome = userAgent.includes('Chrome');
  const isSafari = userAgent.includes('Safari') && !userAgent.includes('Chrome');
  const isFirefox = userAgent.includes('Firefox');
  
  // Extract Chrome version if applicable
  const chromeMatch = userAgent.match(/Chrome\/(\d+\.\d+\.\d+\.\d+)/);
  const chromeVersion = chromeMatch ? chromeMatch[1] : '131.0.6778.85';
  const chromeMajor = chromeMatch ? chromeMatch[1].split('.')[0] : '131';
  
  // Build headers based on browser type
  const headers = {
    ...getBaseHeaders(referer || 'https://www.google.com/search?q=linkedin'),
    'User-Agent': userAgent,
    'Accept-Encoding': 'identity',
    'Origin': 'https://www.linkedin.com',
    'Viewport-Width': viewportWidth.toString(),
    'Width': viewportWidth.toString(),
    'DNT': '1',
    'Pragma': 'no-cache',
  };
  
  // Add browser-specific headers
  if (isChrome) {
    headers['sec-ch-ua'] = `"Google Chrome";v="${chromeMajor}", "Chromium";v="${chromeMajor}", "Not_A Brand";v="24"`;
    headers['sec-ch-ua-mobile'] = '?0';
    headers['sec-ch-ua-platform'] = isMac ? '"macOS"' : '"Windows"';
    headers['sec-ch-ua-platform-version'] = isMac ? '"14.0.0"' : '"15.0.0"';
    headers['sec-ch-ua-arch'] = '"x86"';
    headers['sec-ch-ua-bitness'] = '"64"';
    headers['sec-ch-ua-model'] = '""';
    headers['sec-ch-ua-full-version'] = `"${chromeVersion}"`;
    headers['sec-ch-ua-full-version-list'] = `"Google Chrome";v="${chromeVersion}", "Chromium";v="${chromeVersion}", "Not_A Brand";v="24.0.0.0"`;
  } else if (isFirefox) {
    headers['Accept'] = 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8';
    headers['Accept-Language'] = 'en-US,en;q=0.5';
    headers['Sec-Fetch-Dest'] = 'document';
    headers['Sec-Fetch-Mode'] = 'navigate';
    headers['Sec-Fetch-Site'] = referer ? 'same-origin' : 'none';
    headers['Sec-Fetch-User'] = '?1';
  } else if (isSafari) {
    headers['Accept'] = 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8';
    headers['Accept-Language'] = 'en-US,en;q=0.9';
  }
  
  return headers;
}

