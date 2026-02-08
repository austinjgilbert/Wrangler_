/**
 * Text Processing Utilities
 * HTML cleaning, extraction, and text analysis
 */

/**
 * Clean HTML to extract main text content
 * @param {string} html - HTML content
 * @returns {string}
 */
export function cleanMainText(html) {
  if (!html) return '';
  
  // Remove script and style tags
  let text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
  
  // Remove comments
  text = text.replace(/<!--[\s\S]*?-->/g, '');
  
  // Remove common navigation/footer patterns (heuristic)
  text = text.replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '');
  text = text.replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '');
  text = text.replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '');
  
  // Convert HTML entities
  text = text.replace(/&nbsp;/g, ' ');
  text = text.replace(/&amp;/g, '&');
  text = text.replace(/&lt;/g, '<');
  text = text.replace(/&gt;/g, '>');
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&#39;/g, "'");
  
  // Remove HTML tags
  text = text.replace(/<[^>]+>/g, ' ');
  
  // Normalize whitespace
  text = text.replace(/\s+/g, ' ').trim();
  
  return text;
}

/**
 * Extract title from HTML
 * @param {string} html - HTML content
 * @returns {string|null}
 */
export function extractTitle(html) {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (titleMatch) {
    return cleanMainText(titleMatch[1]);
  }
  return null;
}

/**
 * Extract site name from HTML or URL
 * @param {string} html - HTML content
 * @param {string} url - URL
 * @returns {string|null}
 */
export function extractSiteName(html, url) {
  // Try Open Graph site name
  const ogSiteMatch = html.match(/<meta[^>]*property=["']og:site_name["'][^>]*content=["']([^"']+)["']/i);
  if (ogSiteMatch) return ogSiteMatch[1].trim();
  
  // Try application name
  const appNameMatch = html.match(/<meta[^>]*name=["']application-name["'][^>]*content=["']([^"']+)["']/i);
  if (appNameMatch) return appNameMatch[1].trim();
  
  // Fallback to domain
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.replace(/^www\./, '');
  } catch (e) {
    return null;
  }
}

/**
 * Extract excerpts from text
 * @param {string} text - Text to extract from
 * @param {number} maxChars - Maximum characters per excerpt
 * @returns {Array<{id: string, text: string, selectorHint?: string, charRange?: [number, number]}>}
 */
export function extractExcerpts(text, maxChars = 500) {
  if (!text || text.length === 0) return [];
  
  const excerpts = [];
  const chunkSize = Math.max(200, Math.floor(text.length / 3));
  
  // Extract from beginning
  if (text.length > 0) {
    excerpts.push({
      id: 'excerpt-0',
      text: text.substring(0, Math.min(maxChars, text.length)),
      charRange: [0, Math.min(maxChars, text.length)],
      selectorHint: 'beginning',
    });
  }
  
  // Extract from middle
  if (text.length > chunkSize * 2) {
    const midStart = Math.floor(text.length / 2) - Math.floor(maxChars / 2);
    excerpts.push({
      id: 'excerpt-1',
      text: text.substring(midStart, midStart + maxChars),
      charRange: [midStart, midStart + maxChars],
      selectorHint: 'middle',
    });
  }
  
  // Extract from end
  if (text.length > chunkSize) {
    const endStart = Math.max(0, text.length - maxChars);
    excerpts.push({
      id: 'excerpt-2',
      text: text.substring(endStart),
      charRange: [endStart, text.length],
      selectorHint: 'end',
    });
  }
  
  return excerpts;
}

/**
 * Calculate text metadata
 * @param {string} text - Text to analyze
 * @returns {{wordCount: number, languageHint?: string, readingTimeMin?: number}}
 */
export function calculateMeta(text) {
  if (!text) return { wordCount: 0 };
  
  const words = text.trim().split(/\s+/).filter(w => w.length > 0);
  const wordCount = words.length;
  const readingTimeMin = Math.ceil(wordCount / 200); // Average reading speed: 200 words/min
  
  // Simple language detection (heuristic)
  const languageHint = text.match(/[àáâãäåæçèéêëìíîïðñòóôõöøùúûüýþÿ]/i) ? 'non-en' : 'en';
  
  return {
    wordCount,
    languageHint,
    readingTimeMin,
  };
}

