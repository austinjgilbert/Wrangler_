/**
 * LinkedIn Search Handler
 * POST /linkedin/search - Search for LinkedIn profiles
 */

import { createSuccessResponse, createErrorResponse, safeParseJson } from '../utils/response.js';
import { getLinkedInHeaders } from '../utils/headers.js';
import { parseLinkedInSearchResults } from '../services/linkedin-scraper.js';

/**
 * Handle LinkedIn search request
 * POST /linkedin/search
 */
export async function handleLinkedInSearch(request, requestId, fetchWithTimeoutFn, readHtmlWithLimitFn) {
  try {
    // Parse request body
    const { data: body, error: parseError } = await safeParseJson(request, requestId);
    if (parseError) return parseError;
    
    const { query, limit = 10, filters = {} } = body;
    
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
    
    // Validate limit
    const searchLimit = Math.min(Math.max(1, parseInt(limit) || 10), 50);
    
    // Build LinkedIn search URL
    // LinkedIn search format: https://www.linkedin.com/search/results/people/?keywords=...
    const searchParams = new URLSearchParams();
    searchParams.set('keywords', query.trim());
    
    // Add filters if provided
    if (filters.location) {
      searchParams.set('geoUrn', `["${filters.location}"]`);
    }
    if (filters.company) {
      searchParams.set('currentCompany', `["${filters.company}"]`);
    }
    if (filters.title) {
      searchParams.set('title', `["${filters.title}"]`);
    }
    if (filters.school) {
      searchParams.set('school', `["${filters.school}"]`);
    }
    
    // Limit results
    searchParams.set('page', '1');
    searchParams.set('facetList', '[]');
    
    const searchUrl = `https://www.linkedin.com/search/results/people/?${searchParams.toString()}`;
    
    // Fetch LinkedIn search results with human-like headers
    let html = '';
    try {
      // Use LinkedIn as referer to simulate internal navigation
      const linkedInHeaders = getLinkedInHeaders('https://www.linkedin.com/feed/');
      
      const response = await fetchWithTimeoutFn(
        searchUrl,
        {
          method: 'GET',
          redirect: 'follow',
          headers: linkedInHeaders,
        },
        20000 // 20 second timeout for search
      );
      
      // Check for LinkedIn blocking
      if (response.status === 999) {
        return createErrorResponse(
          'LINKEDIN_BLOCKED',
          'LinkedIn blocked the request with 999 status (bot protection)',
          { 
            status: 999,
            hint: 'LinkedIn has strict bot protection. Try reducing request frequency or using different search terms.',
            workaround: 'Consider using LinkedIn API with authentication'
          },
          403,
          requestId
        );
      }
      
      if (!response.ok) {
        if (response.status === 403 || response.status === 429) {
          return createErrorResponse(
            'LINKEDIN_BLOCKED',
            'LinkedIn blocked the request (may require authentication or rate limited)',
            { status: response.status, hint: 'LinkedIn may require login for search results' },
            403,
            requestId
          );
        }
        
        return createErrorResponse(
          'FETCH_ERROR',
          'Failed to fetch LinkedIn search results',
          { status: response.status, url: searchUrl },
          500,
          requestId
        );
      }
      
      html = await readHtmlWithLimitFn(response, 500000); // 500KB limit for search results
      
      // Check for challenge pages
      if (html.includes('999') || html.includes('Request Denied') || html.includes('unusual traffic')) {
        return createErrorResponse(
          'LINKEDIN_BLOCKED',
          'LinkedIn 999 error detected in response (bot protection)',
          { 
            hint: 'LinkedIn detected automated access. Search cannot be scraped.',
            workaround: 'Use LinkedIn API with proper authentication'
          },
          403,
          requestId
        );
      }
      
      if (html.includes('challenge') || html.includes('security check') || html.includes('verify you\'re human')) {
        return createErrorResponse(
          'LINKEDIN_BLOCKED',
          'LinkedIn challenge page detected (bot protection)',
          { hint: 'LinkedIn is blocking automated access. Search may require authentication.' },
          403,
          requestId
        );
      }
      
      // Check if we got redirected to login
      if (html.includes('sign-in') || html.includes('login') || response.url.includes('authwall')) {
        return createErrorResponse(
          'LINKEDIN_AUTH_REQUIRED',
          'LinkedIn search requires authentication',
          { hint: 'Search results require login to view' },
          401,
          requestId
        );
      }
      
    } catch (fetchError) {
      return createErrorResponse(
        'FETCH_ERROR',
        'Failed to fetch LinkedIn search results',
        { message: fetchError.message, url: searchUrl },
        500,
        requestId
      );
    }
    
    // Parse search results
    const results = parseLinkedInSearchResults(html, query);
    
    // Limit results to requested amount
    const limitedResults = results.slice(0, searchLimit);
    
    return createSuccessResponse(
      {
        query,
        results: limitedResults,
        totalFound: results.length,
        returned: limitedResults.length,
        searchUrl,
        extractedAt: new Date().toISOString(),
      },
      requestId
    );
    
  } catch (error) {
    return createErrorResponse(
      'INTERNAL_ERROR',
      'Internal server error',
      { message: error.message },
      500,
      requestId
    );
  }
}
