/**
 * Performance Analysis Service
 * Analyzes website performance metrics and provides recommendations
 */

/**
 * Analyze website performance
 * @param {Response} response - HTTP response
 * @param {object} headers - HTTP headers
 * @param {string} html - HTML content
 * @param {Array<string>} scriptSrcs - Script source URLs
 * @param {Array<string>} linkHrefs - Link href URLs
 * @param {string} finalUrl - Final URL after redirects
 * @returns {object} - Performance analysis
 */
export function analyzePerformance(response, headers, html, scriptSrcs, linkHrefs, finalUrl) {
  const safeScriptSrcs = Array.isArray(scriptSrcs) ? scriptSrcs : [];
  const safeLinkHrefs = Array.isArray(linkHrefs) ? linkHrefs : [];
  const performance = {
    responseTime: null,
    pageSize: null,
    speedIndicators: [],
    performanceIssues: [],
    optimizationTools: [],
    benchmarks: {},
    performanceScore: 0, // 0-100, higher = better
    recommendations: [],
  };

  // Page size analysis
  if (html) {
    const htmlSize = new TextEncoder().encode(html).length;
    performance.pageSize = htmlSize;
    
    // Check for large page size
    if (htmlSize > 2 * 1024 * 1024) { // > 2MB
      performance.performanceIssues.push('Large page size (>2MB) - impacts load time');
      performance.performanceScore -= 20;
    } else if (htmlSize > 1 * 1024 * 1024) { // > 1MB
      performance.performanceIssues.push('Page size is large (>1MB) - may impact performance');
      performance.performanceScore -= 10;
    } else if (htmlSize < 100 * 1024) { // < 100KB
      performance.speedIndicators.push('Small page size - good for fast loading');
      performance.performanceScore += 10;
    }
  }

  // Script analysis
  const totalScripts = safeScriptSrcs.length;
  if (totalScripts > 50) {
    performance.performanceIssues.push(`Many scripts detected (${totalScripts}) - may slow page load`);
    performance.performanceScore -= 15;
  } else if (totalScripts > 30) {
    performance.performanceIssues.push(`Multiple scripts (${totalScripts}) - consider bundling`);
    performance.performanceScore -= 5;
  } else if (totalScripts < 10) {
    performance.speedIndicators.push('Few scripts - good for performance');
    performance.performanceScore += 5;
  }

  // Check for external scripts (CDN impact)
  const externalScripts = safeScriptSrcs.filter(src => src.startsWith('http://') || src.startsWith('https://')).length;
  if (externalScripts > 20) {
    performance.performanceIssues.push(`Many external scripts (${externalScripts}) - multiple DNS lookups slow loading`);
    performance.performanceScore -= 10;
  }

  // Performance optimization tools detection
  const optimizationPatterns = {
    'Cloudflare': [/cloudflare/i, /cf-ray/i],
    'Vercel': [/vercel/i, /x-vercel-id/i],
    'Netlify': [/netlify/i, /x-nf-request-id/i],
    'Fastly': [/fastly/i, /x-fastly-request-id/i],
    'AWS CloudFront': [/cloudfront/i, /x-amz-cf-id/i],
    'Google PageSpeed': [/pagespeed/i],
    'AMP': [/amp-html/i, /amp\.js/i],
  };

  for (const [tool, patterns] of Object.entries(optimizationPatterns)) {
    for (const pattern of patterns) {
      if (pattern.test(JSON.stringify(headers)) || pattern.test(html.toLowerCase())) {
        performance.optimizationTools.push(tool);
        performance.performanceScore += 5;
        break;
      }
    }
  }

  // CDN detection
  const cdnPatterns = [
    /cdn\./i,
    /\.cloudfront\./i,
    /\.fastly\./i,
    /\.cloudflare\./i,
  ];
  
  const hasCDN = cdnPatterns.some(pattern => 
    pattern.test(JSON.stringify(safeScriptSrcs)) || 
    pattern.test(JSON.stringify(safeLinkHrefs))
  );
  
  if (hasCDN) {
    performance.speedIndicators.push('CDN detected - good for global performance');
    performance.performanceScore += 10;
  } else {
    performance.performanceIssues.push('No CDN detected - may impact global performance');
    performance.performanceScore -= 5;
  }

  // Compression detection
  const contentEncoding = headers['content-encoding'] || headers['Content-Encoding'];
  if (contentEncoding && (contentEncoding.includes('gzip') || contentEncoding.includes('br'))) {
    performance.speedIndicators.push('Compression enabled - reduces transfer size');
    performance.performanceScore += 5;
  } else {
    performance.performanceIssues.push('Compression not detected - increases transfer size');
    performance.performanceScore -= 5;
  }

  // Cache headers
  const cacheControl = headers['cache-control'] || headers['Cache-Control'];
  if (cacheControl && (cacheControl.includes('max-age') || cacheControl.includes('public'))) {
    performance.speedIndicators.push('Cache headers present - improves repeat visits');
    performance.performanceScore += 5;
  }

  // Benchmarks
  performance.benchmarks = {
    pageSize: performance.pageSize 
      ? (performance.pageSize < 500 * 1024 ? 'Excellent' : performance.pageSize < 1 * 1024 * 1024 ? 'Good' : 'Needs Improvement')
      : 'Unknown',
    scriptCount: totalScripts < 10 ? 'Excellent' : totalScripts < 30 ? 'Good' : 'Needs Improvement',
    cdn: hasCDN ? 'Good' : 'Needs Improvement',
    compression: contentEncoding ? 'Good' : 'Needs Improvement',
  };

  // Generate recommendations
  if (performance.pageSize > 1 * 1024 * 1024) {
    performance.recommendations.push('Optimize page size - reduce HTML, images, and assets');
  }
  if (totalScripts > 30) {
    performance.recommendations.push('Bundle scripts to reduce HTTP requests');
  }
  if (externalScripts > 20) {
    performance.recommendations.push('Consolidate external scripts or use a CDN');
  }
  if (!hasCDN) {
    performance.recommendations.push('Implement CDN for global performance');
  }
  if (!contentEncoding) {
    performance.recommendations.push('Enable compression (gzip/brotli)');
  }
  if (!cacheControl) {
    performance.recommendations.push('Add cache headers for static assets');
  }

  // Normalize score to 0-100
  performance.performanceScore = Math.max(0, Math.min(100, performance.performanceScore + 50));

  return performance;
}

