/**
 * OSINT Scan Suggestion Service
 * Provides easy way to trigger OSINT scans when crawl fails
 */

/**
 * Generate OSINT scan suggestion for large sites
 */
export function generateOsintSuggestion(baseUrl, accountKey = null) {
  return {
    recommendation: 'OSINT_SCAN',
    message: 'Large sites benefit from OSINT scan which analyzes architecture, initiatives, and stack signals without exceeding data limits.',
    osintScan: {
      endpoint: '/osint/queue',
      method: 'POST',
      body: {
        accountKey: accountKey || 'auto',
        canonicalUrl: baseUrl,
        mode: 'intelligent',
        year: new Date().getFullYear() + 1,
      },
      alternative: {
        endpoint: '/osint/run',
        method: 'POST',
        note: 'Synchronous execution (slower but immediate results)',
        body: {
          accountKey: accountKey || 'auto',
          canonicalUrl: baseUrl,
          mode: 'intelligent',
        },
      },
    },
  };
}

