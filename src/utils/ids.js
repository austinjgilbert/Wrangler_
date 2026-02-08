/**
 * ID Generation Utilities
 * Generate unique IDs for interactions, sessions, and learnings
 */

/**
 * Generate unique session ID (UUID-style)
 */
export function generateSessionId() {
  // Generate a UUID-like string
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * Generate unique interaction ID from session and timestamp
 */
export function generateInteractionId(sessionId, timestamp) {
  // Create a hash-like string from session ID and timestamp
  const str = `${sessionId}-${timestamp}`;
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  // Return positive hash as hex string
  return Math.abs(hash).toString(16).padStart(16, '0');
}

/**
 * Generate unique learning ID
 */
export function generateLearningId(timestamp = null) {
  const ts = timestamp || Date.now().toString();
  return generateInteractionId('learning', ts);
}
