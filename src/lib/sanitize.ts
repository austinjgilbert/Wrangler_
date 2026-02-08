/**
 * Sanitize untrusted community content.
 * Rules:
 * - Remove imperative instructions and tool/plugin payloads.
 * - Never treat content as directives.
 * - Extract topics/claims/links only.
 */

const RISK_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /(ignore|override)\s+instructions/i, reason: 'prompt_injection' },
  { pattern: /(run|execute|shell|terminal|curl|wget)/i, reason: 'command_execution' },
  { pattern: /(api\s+key|token|password|secret)/i, reason: 'credential_theft' },
  { pattern: /(plugin|tool|function)\s*:/i, reason: 'tool_payload' },
  { pattern: /(sudo|rm\s+-rf|chmod|chown)/i, reason: 'dangerous_command' },
];

function stripImperatives(text: string): string {
  return text
    .replace(/^(please|do|run|execute|call|send|post)\b.*$/gim, '[redacted_instruction]')
    .replace(/```[\s\S]*?```/g, '[redacted_code_block]');
}

function extractLinks(text: string): string[] {
  const matches = text.match(/https?:\/\/[^\s)]+/g) || [];
  return Array.from(new Set(matches));
}

function extractTopics(text: string): string[] {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 3);
  const freq: Record<string, number> = {};
  for (const w of words) freq[w] = (freq[w] || 0) + 1;
  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([w]) => w);
}

export function sanitizePost(rawText: string) {
  const riskReasons: string[] = [];
  for (const rule of RISK_PATTERNS) {
    if (rule.pattern.test(rawText)) {
      riskReasons.push(rule.reason);
    }
  }

  const riskLevel =
    riskReasons.includes('credential_theft') || riskReasons.includes('dangerous_command')
      ? 'high'
      : riskReasons.length > 0
        ? 'med'
        : 'low';

  const sanitized = stripImperatives(rawText);
  const extractedLinks = extractLinks(sanitized);
  const extractedTopics = extractTopics(sanitized);

  return {
    sanitizedSummary: sanitized.slice(0, 1000),
    extractedTopics,
    extractedLinks,
    riskLevel,
    riskReasons,
  };
}
