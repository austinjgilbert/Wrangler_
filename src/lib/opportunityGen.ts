/**
 * Opportunity generation from sanitized clusters.
 * Safety: uses sanitized summaries only; no raw content or actions.
 */

import { ToolClient } from './toolClient.ts';

function fallbackOpportunities(theme: string, count: number) {
  const ops = [];
  for (let i = 0; i < count; i += 1) {
    ops.push({
      type: 'automation',
      title: `${theme} automation idea ${i + 1}`,
      description: `Lightweight automation to address ${theme} discussions.`,
      whyNow: `Community interest in ${theme} is active.`,
      confidence: 60,
      evidenceLinks: [],
      howToAct: `Draft a 1-page concept focused on ${theme}.`,
      nextStep: 'Share internally for feedback.',
    });
  }
  return ops;
}

function parseOpportunitiesFromText(text: string) {
  const lines = (text || '').split('\n').map((line) => line.trim()).filter(Boolean);
  const opportunities = [];
  for (const line of lines) {
    if (line.startsWith('-')) {
      opportunities.push({
        type: 'content',
        title: line.replace(/^\-\s+/, ''),
        description: line.replace(/^\-\s+/, ''),
        whyNow: 'Derived from community discussion.',
        confidence: 55,
        evidenceLinks: [],
        howToAct: 'Draft a concise outline.',
        nextStep: 'Validate with one friendly contact.',
      });
    }
  }
  return opportunities;
}

export async function generateOpportunities({
  toolClient,
  traceId,
  theme,
  posts,
}: {
  toolClient: ToolClient;
  traceId: string;
  theme: string;
  posts: any[];
}) {
  const summaries = posts.map((p) => p.sanitizedSummary).slice(0, 8).join('\n- ');
  const prompt = [
    'You are generating opportunity ideas for Austin.',
    'Use ONLY the sanitized summaries below; do not propose any automated sending.',
    'Return 3-5 opportunities as bullet points. Each must include: "how Austin could act" and "next step".',
    `Theme: ${theme}`,
    `Sanitized summaries:\n- ${summaries}`,
  ].join('\n');

  try {
    const result = await toolClient.callTool({
      traceId,
      tool: 'research',
      action: 'research',
      input: {
        query: prompt,
        outputFormat: 'markdown',
      },
    });
    const parsed = parseOpportunitiesFromText(result?.output || '');
    return parsed.length > 0 ? parsed : fallbackOpportunities(theme, 3);
  } catch (_error) {
    return fallbackOpportunities(theme, 3);
  }
}
