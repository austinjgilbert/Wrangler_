/**
 * HTML Utilities
 * HTML parsing and processing utilities
 */

/**
 * Read HTML from response with size limit
 * @param {Response} response - Fetch response
 * @param {number} maxSize - Maximum size in bytes
 * @returns {Promise<string>} - HTML content
 */
export async function readHtmlWithLimit(response, maxSize) {
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
