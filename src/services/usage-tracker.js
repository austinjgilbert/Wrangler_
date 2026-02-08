/**
 * Lightweight usage tracker (in-memory)
 * Tracks per-session counts and global totals.
 */

const usageState = {
  totalCount: 0,
  sessionCounts: new Map(),
  uniqueUsers: new Set(),
  lastInteraction: null,
};

function normalizeString(value) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

function truncateText(text, maxLength = 120) {
  if (!text) return null;
  const clean = String(text).trim();
  if (clean.length <= maxLength) return clean;
  return `${clean.slice(0, maxLength)}...`;
}

function hashString(input) {
  if (!input) return null;
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = ((hash << 5) - hash) + input.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

export function getSessionId(request, url) {
  if (!request) return null;
  const headerSession = normalizeString(request.headers.get('X-Session-Id'));
  const paramSession = url ? normalizeString(url.searchParams.get('sessionId')) : null;
  return headerSession || paramSession || null;
}

export function shouldRespondWithUsage(promptText) {
  if (!promptText) return false;
  const lower = promptText.toLowerCase();
  return (
    lower.includes('usage count') ||
    lower.includes('how many times have i asked') ||
    lower.includes('how many times have i asked?')
  );
}

export function recordUsage(entry) {
  if (!entry) return null;
  const {
    timestamp,
    userId,
    sessionId,
    promptLength,
    responseLength,
    promptSnippet,
  } = entry;

  const sessionKey = sessionId || 'default';
  const current = usageState.sessionCounts.get(sessionKey) || 0;
  usageState.sessionCounts.set(sessionKey, current + 1);
  usageState.totalCount += 1;

  if (userId) {
    const hashedUser = hashString(userId);
    if (hashedUser) usageState.uniqueUsers.add(hashedUser);
  }

  usageState.lastInteraction = {
    timestamp,
    sessionId: sessionId || null,
    promptLength,
    responseLength,
    message: `${timestamp} — question logged: '${promptSnippet || 'no prompt'}'`,
  };

  if (typeof console !== 'undefined' && console.log) {
    console.log(usageState.lastInteraction.message);
  }

  return usageState.lastInteraction;
}

export function getUsageSummary(sessionId = null) {
  const sessionKey = sessionId || 'default';
  const sessionCount = usageState.sessionCounts.get(sessionKey) || 0;
  return {
    sessionCount,
    totalCount: usageState.totalCount,
    uniqueUsers: usageState.uniqueUsers.size,
    lastInteraction: usageState.lastInteraction,
  };
}

export async function logUsageEntry({
  request,
  url,
  promptText,
  responseText,
  userId,
}) {
  const timestamp = new Date().toISOString();
  const sessionId = getSessionId(request, url);
  const promptLength = promptText ? String(promptText).length : 0;
  const responseLength = responseText ? String(responseText).length : 0;
  const promptSnippet = truncateText(promptText || '', 120);

  return recordUsage({
    timestamp,
    userId,
    sessionId,
    promptLength,
    responseLength,
    promptSnippet,
  });
}
