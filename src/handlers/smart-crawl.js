/**
 * Smart Crawl Handler
 * Handles large sites with distributed crawling and intelligent size management
 */

import { createSuccessResponse, createErrorResponse } from '../utils/response.js';
import { MAX_HTML_SIZE } from '../config/constants.js';
import { validateUrl } from '../utils/validation.js';

/**
 * Distributed Deep Crawl
 * POST /crawl/distributed
 * 
 * Targets specific pages intelligently, handles large responses gracefully
 */
export async function handleDistributedCrawl(
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
) {
  try {
    const body = await request.json().catch(() => ({}));
    const {
      baseUrl, // Base URL (e.g., https://sanity.io)
      targetPages = [], // Specific pages to crawl (e.g., ['/studio', '/docs'])
      autoDiscover = true, // Auto-discover if targetPages not provided
      maxPages = 5, // Maximum pages to crawl
      strategy = 'smart', // 'smart' (prioritize key pages), 'distributed' (specific targets)
      pageSizeLimit = MAX_HTML_SIZE, // Size limit per page (default 250KB)
    } = body;

    if (!baseUrl) {
      return createErrorResponse(
        'VALIDATION_ERROR',
        'baseUrl parameter is required',
        {},
        400,
        requestId
      );
    }

    // Validate and normalize base URL
    const baseUrlValidation = validateUrl(baseUrl);
    if (!baseUrlValidation.valid || !baseUrlValidation.url) {
      return createErrorResponse(
        'VALIDATION_ERROR',
        'Invalid baseUrl provided',
        { error: baseUrlValidation.error, input: baseUrl },
        400,
        requestId
      );
    }

    const normalizedBaseUrl = baseUrlValidation.url;

    // Determine target pages
    let pagesToCrawl = [];
    
    if (targetPages && targetPages.length > 0) {
      // Use provided target pages - validate each
      const validatedPages = [];
      for (const page of targetPages.slice(0, maxPages)) {
        const path = page.startsWith('/') ? page : `/${page}`;
        const fullUrl = `${normalizedBaseUrl}${path}`;
        const pageValidation = validateUrl(fullUrl);
        if (pageValidation.valid && pageValidation.url) {
          validatedPages.push(pageValidation.url);
        }
      }
      pagesToCrawl = validatedPages;
    } else if (autoDiscover) {
      // Auto-discover key pages
      try {
        const candidates = await discoverPages(normalizedBaseUrl, maxPages * 3);
        
        // Validate and normalize all candidate URLs
        const validatedCandidates = [];
        for (const candidate of candidates) {
          let candidateUrl = candidate.url;
          const urlValidation = validateUrl(candidateUrl);
          
          // If validation fails, try resolving relative URL against base
          if (!urlValidation.valid) {
            try {
              const resolvedUrl = new URL(candidateUrl, normalizedBaseUrl).href;
              const resolvedValidation = validateUrl(resolvedUrl);
              if (resolvedValidation.valid && resolvedValidation.url) {
                candidateUrl = resolvedValidation.url;
              } else {
                continue; // Skip invalid URLs
              }
            } catch (e) {
              continue; // Skip invalid URLs
            }
          } else if (urlValidation.url) {
            candidateUrl = urlValidation.url;
          } else {
            continue; // Skip invalid URLs
          }
          
          validatedCandidates.push({ ...candidate, url: candidateUrl });
        }
        
        // Prioritize key page types for tech stack analysis
        const priorityTypes = ['docs', 'developer', 'studio', 'api', 'pricing', 'about', 'product'];
        
        const prioritized = validatedCandidates
          .filter(c => priorityTypes.some(type => 
            c.type === type || 
            c.url.toLowerCase().includes(type) ||
            (c.reason && c.reason.toLowerCase().includes(type))
          ))
          .slice(0, maxPages);
        
        // If not enough priority pages, fill with others
        if (prioritized.length < maxPages) {
          const remaining = validatedCandidates
            .filter(c => !prioritized.some(p => p.url === c.url))
            .slice(0, maxPages - prioritized.length);
          prioritized.push(...remaining);
        }
        
        pagesToCrawl = prioritized.map(c => c.url).slice(0, maxPages);
      } catch (discoverError) {
        // Fallback to common pages if discovery fails
        const commonPages = ['/docs', '/studio', '/api', '/about', '/pricing'];
        const validatedCommonPages = [];
        for (const path of commonPages.slice(0, maxPages)) {
          const fullUrl = `${normalizedBaseUrl}${path}`;
          const pageValidation = validateUrl(fullUrl);
          if (pageValidation.valid && pageValidation.url) {
            validatedCommonPages.push(pageValidation.url);
          }
        }
        pagesToCrawl = validatedCommonPages;
      }
    } else {
      return createErrorResponse(
        'VALIDATION_ERROR',
        'Either targetPages or autoDiscover=true required',
        {},
        400,
        requestId
      );
    }

    if (pagesToCrawl.length === 0) {
      // Fallback to extractEvidence for baseUrl if no pages to crawl
      // This handles cases where discovery fails but we still want content
      try {
        const extractRequest = new Request('http://localhost/extract', {
          method: 'POST',
          body: JSON.stringify({
            url: normalizedBaseUrl,
            mode: 'fast',
            maxChars: 50000,
          }),
          headers: { 'Content-Type': 'application/json' },
        });
        
        // We'll need handleExtract from context, but for now return helpful message
        return createSuccessResponse({
          baseUrl: normalizedBaseUrl,
          strategy,
          fallbackMode: 'extractEvidence',
          message: 'Crawl validation found no valid pages - use extractEvidence endpoint for detailed content extraction',
          recommendation: 'Call POST /extract with url parameter for each site to get detailed content, stack, and signal intelligence',
          example: {
            endpoint: 'POST /extract',
            body: { url: normalizedBaseUrl, mode: 'deep', maxChars: 50000 },
            description: 'Provides detailed content, tech stack, and signal intelligence - equivalent outcome to crawl'
          }
        }, requestId);
      } catch (e) {
        return createErrorResponse(
          'VALIDATION_ERROR',
          'No valid pages to crawl - all URLs failed validation. Use extractEvidence endpoint for each site instead.',
          { 
            baseUrl: normalizedBaseUrl, 
            targetPages, 
            autoDiscover,
            recommendation: 'Call POST /extract with url parameter for detailed extraction',
            example: { url: normalizedBaseUrl, mode: 'deep', maxChars: 50000 }
          },
          400,
          requestId
        );
      }
    }

    // Crawl pages one at a time (distributed) with size limits
    const results = [];
    const skipped = [];
    const errors = [];
    
    // Reduced size limit per page for large sites
    const effectivePageLimit = Math.min(pageSizeLimit, 200 * 1024); // Max 200KB per page
    
    for (const url of pagesToCrawl) {
      try {
        // Final validation before fetching
        const finalValidation = validateUrl(url);
        if (!finalValidation.valid || !finalValidation.url) {
          skipped.push({
            url,
            reason: `URL validation failed: ${finalValidation.error || 'Invalid URL format'}`,
          });
          continue;
        }

        const validatedUrl = finalValidation.url;
        const response = await fetchWithTimeout(
          validatedUrl,
          {
            method: 'GET',
            redirect: 'follow',
            headers: getBrowserHeaders(),
          },
          10000 // 10 second timeout per page
        );

        if (!response.ok) {
          skipped.push({
            url: validatedUrl,
            reason: `HTTP ${response.status}`,
          });
          continue;
        }

        // Read HTML with size limit
        let html;
        let truncated = false;
        try {
          html = await readHtmlWithLimit(response, effectivePageLimit);
          
          // Check if we hit the limit
          const contentLength = response.headers.get('content-length');
          if (contentLength && parseInt(contentLength) > effectivePageLimit) {
            truncated = true;
          }
        } catch (sizeError) {
          skipped.push({
            url,
            reason: `Response size exceeded limit (${effectivePageLimit / 1024}KB)`,
            suggestion: 'Page contains large JavaScript bundles or dynamic content',
          });
          continue;
        }

        // Extract content (lightweight extraction for large sites)
        const title = extractTitle(html);
        const mainText = cleanMainText(html);
        
        // Limit extracted content to prevent large responses
        const maxMainText = 8000; // 8KB of text per page
        const truncatedMainText = mainText.length > maxMainText 
          ? mainText.substring(0, maxMainText) + '... [truncated]'
          : mainText;
        
        const excerpts = extractExcerpts(truncatedMainText, 300).slice(0, 2);
        const signals = detectSignals(html, truncatedMainText, excerpts).slice(0, 3);

        results.push({
          url: validatedUrl,
          finalUrl: response.url,
          status: response.status,
          title,
          mainText: truncatedMainText,
          excerpts,
          signals,
          truncated,
          sizeBytes: html.length,
          fetchedAt: new Date().toISOString(),
        });

      } catch (error) {
        errors.push({
          url: url || 'unknown',
          error: error.message,
        });
      }
    }

    // If no successful results, provide helpful fallback suggestion
    if (results.length === 0) {
      return createSuccessResponse({
        baseUrl: normalizedBaseUrl,
        strategy,
        totalPages: pagesToCrawl.length,
        successful: 0,
        skipped: skipped.length,
        errorCount: errors.length,
        pages: [],
        skippedPages: skipped,
        errors: errors.length > 0 ? errors : undefined,
        fallbackMode: 'extractEvidence',
        message: 'Crawl completed with no successful results - use extractEvidence for detailed content extraction',
        recommendation: 'Call POST /extract with url parameter for each site to get detailed content, stack, and signal intelligence',
        example: {
          endpoint: 'POST /extract',
          body: { url: normalizedBaseUrl, mode: 'deep', maxChars: 50000 },
          description: 'Provides detailed content, tech stack, and signal intelligence - equivalent outcome to crawl',
          benefits: [
            'Detailed content extraction',
            'Tech stack detection',
            'Signal intelligence (pricing, security, careers, etc.)',
            'Entity extraction',
            'Claims extraction'
          ]
        }
      }, requestId);
    }
    
    // Build response with successful results
    const responseData = {
      baseUrl: normalizedBaseUrl,
      strategy,
      totalPages: pagesToCrawl.length,
      successful: results.length,
      skipped: skipped.length,
      errorCount: errors.length,
      pages: results,
      skippedPages: skipped.length > 0 ? skipped : undefined,
      errors: errors.length > 0 ? errors : undefined,
    };

    return createSuccessResponse(responseData, requestId);

  } catch (error) {
    return createErrorResponse(
      'INTERNAL_ERROR',
      'Failed to perform distributed crawl',
      { error: error.message },
      500,
      requestId
    );
  }
}

/**
 * Smart Crawl with OSINT Fallback
 * POST /crawl/smart
 * 
 * Attempts distributed crawl, suggests OSINT if size limits exceeded
 */
export async function handleSmartCrawl(
  request,
  requestId,
  env,
  groqQuery,
  assertSanityConfigured,
  handlers
) {
  try {
    const body = await request.json().catch(() => ({}));
    const {
      baseUrl,
      targetPages = [],
      maxPages = 5,
      useOsintFallback = true,
    } = body;

    if (!baseUrl) {
      return createErrorResponse(
        'VALIDATION_ERROR',
        'baseUrl parameter is required',
        {},
        400,
        requestId
      );
    }

    // Try distributed crawl first
    const distributedResult = await handleDistributedCrawl(
      request,
      requestId,
      env,
      handlers.readHtmlWithLimit,
      handlers.getBrowserHeaders,
      handlers.fetchWithTimeout,
      handlers.extractTitle,
      handlers.cleanMainText,
      handlers.extractExcerpts,
      handlers.detectSignals,
      handlers.discoverPages
    );

    const distributedData = await distributedResult.json();

    // Check if crawl was successful
    if (distributedData.ok && distributedData.data.successful > 0) {
      return distributedResult;
    }

    // If crawl failed and OSINT fallback enabled, suggest OSINT
    if (useOsintFallback && distributedData.data && distributedData.data.successful === 0) {
      // Get account key for OSINT suggestion
      const { generateAccountKey } = await import('../sanity-client.js');
      const { generateOsintSuggestion } = await import('../services/osint-scan-suggestion.js');
      const accountKey = await generateAccountKey(baseUrl);
      const osintSuggestion = generateOsintSuggestion(baseUrl, accountKey);

      return createSuccessResponse({
        crawlResult: distributedData.data,
        ...osintSuggestion,
      }, requestId);
    }

    return distributedResult;

  } catch (error) {
    return createErrorResponse(
      'INTERNAL_ERROR',
      'Failed to perform smart crawl',
      { error: error.message },
      500,
      requestId
    );
  }
}

