/**
 * ABM Context Builder — LLM prompt templates.
 *
 * Produces the system + user prompts for the "Account Plan Context Generator"
 * that turns raw research into 4 paste-ready blocks.
 */

import type { LlmMessage } from './llm.ts';

const SYSTEM_PROMPT = `You are an Account-Based Marketing (ABM) research analyst. Your job is to distill raw research notes, screenshots, and captured web snippets into four structured context blocks for a Sales Command account plan.

RULES:
1. Use ONLY the information explicitly provided. Never invent, guess, or hallucinate details.
2. If a piece of information is not present in the input, write "Unknown / Not provided" for that item.
3. Output STRICT JSON with exactly these four keys: salesNavigator, intentSignals, stakeholders, additionalContext. Each value is a plain-text string.
4. Format each value as clean, paste-ready text with clear headings and concise bullet points. NO markdown tables. Use dashes (-) for bullets.
5. Keep each section between 100-250 words unless the input warrants more.
6. Be factual, specific, and actionable. Prioritize information that helps a sales rep prepare for outreach.

OUTPUT SCHEMA (JSON):
{
  "salesNavigator": "string — Company overview, size, industry, strategic initiatives, tech stack, buying hypothesis",
  "intentSignals": "string — Raw signals observed + your interpretation of what each signal means for timing/urgency",
  "stakeholders": "string — List of key people with: Name — Title, Focus/responsibility, Likely KPI, Outreach angle, Buying group role (economic/technical/champion/influencer/unclear)",
  "additionalContext": "string — Competitive intel, known pains, recommended approach, next steps"
}`;

const USER_PROMPT_TEMPLATE = `ACCOUNT: {{accountName}}

RAW RESEARCH INPUT:
---
{{rawInput}}
---

{{structuredDataBlock}}
{{capturedSourcesBlock}}

Generate the four account plan context blocks as JSON. Remember: use ONLY the provided information. Mark anything not explicitly stated as "Unknown / Not provided."`;

export function buildAbmPromptMessages(params: {
  accountName: string;
  rawInput: string;
  extractedScreenshotText?: string;
  capturedSources?: Array<{ type: string; value: string; title?: string }>;
  structuredData?: {
    sourceType?: string;
    accounts?: string;
    people?: string;
    technologies?: string[];
    signals?: string;
  };
}): LlmMessage[] {
  const { accountName, rawInput, extractedScreenshotText, capturedSources, structuredData } = params;

  // Merge all text inputs
  const parts: string[] = [];
  if (rawInput?.trim()) parts.push(rawInput.trim());
  if (extractedScreenshotText?.trim()) {
    parts.push(`\n[EXTRACTED FROM SCREENSHOTS]\n${extractedScreenshotText.trim()}`);
  }

  const combinedRaw = parts.join('\n\n');

  // Build structured data block from Chrome extension extraction
  let structuredDataBlock = '';
  if (structuredData) {
    const sections: string[] = [];
    if (structuredData.sourceType) {
      sections.push(`DATA SOURCE: ${structuredData.sourceType}`);
    }
    if (structuredData.accounts?.trim()) {
      sections.push(`EXTRACTED ACCOUNTS (structured):\n${formatJsonLines(structuredData.accounts, ['name', 'industry', 'about', 'website', 'headquarters', 'employeeCount', 'specialties', 'domain', 'description'])}`);
    }
    if (structuredData.people?.trim()) {
      sections.push(`EXTRACTED PEOPLE (structured):\n${formatJsonLines(structuredData.people, ['name', 'headline', 'currentTitle', 'currentCompany', 'location', 'about', 'experience', 'skills', 'connections'])}`);
    }
    if (structuredData.technologies && structuredData.technologies.length > 0) {
      sections.push(`DETECTED TECHNOLOGIES: ${structuredData.technologies.join(', ')}`);
    }
    if (structuredData.signals?.trim()) {
      sections.push(`DETECTED SIGNALS:\n${formatJsonLines(structuredData.signals, ['text', 'source'])}`);
    }
    if (sections.length > 0) {
      structuredDataBlock = `STRUCTURED DATA (extracted from ${structuredData.sourceType || 'page'} by browser extension):\n${sections.join('\n\n')}`;
    }
  }

  // Build captured sources block
  let capturedSourcesBlock = '';
  if (capturedSources && capturedSources.length > 0) {
    const lines = capturedSources.map((s, i) => {
      const label = s.type === 'url' ? 'URL' : s.type === 'selected_text' ? 'Selected Text' : 'Note';
      const title = s.title ? ` (${s.title})` : '';
      return `${i + 1}. [${label}${title}]: ${s.value}`;
    });
    capturedSourcesBlock = `CAPTURED SOURCES:\n${lines.join('\n')}`;
  }

  const userContent = USER_PROMPT_TEMPLATE
    .replace('{{accountName}}', accountName || 'Unknown Account')
    .replace('{{rawInput}}', combinedRaw || 'No research text provided.')
    .replace('{{structuredDataBlock}}', structuredDataBlock)
    .replace('{{capturedSourcesBlock}}', capturedSourcesBlock);

  return [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: userContent },
  ];
}

/**
 * Format JSON-lines data (one JSON object per line) into readable text for the LLM prompt.
 * Extracts only the specified keys to keep the prompt concise.
 */
function formatJsonLines(jsonLines: string, keys: string[]): string {
  const lines = jsonLines.split('\n').filter(l => l.trim());
  const formatted: string[] = [];
  for (const line of lines) {
    try {
      const obj = JSON.parse(line);
      const parts: string[] = [];
      for (const k of keys) {
        const v = obj[k];
        if (v == null || v === '') continue;
        if (Array.isArray(v)) {
          if (v.length === 0) continue;
          // For arrays of objects (e.g. experience), stringify briefly
          const items = v.map(item =>
            typeof item === 'object' ? Object.values(item).filter(Boolean).join(' / ') : String(item)
          );
          parts.push(`${k}: ${items.join('; ')}`);
        } else {
          parts.push(`${k}: ${String(v).substring(0, 500)}`);
        }
      }
      if (parts.length > 0) formatted.push(`- ${parts.join(' | ')}`);
    } catch {
      // Skip malformed lines
    }
  }
  return formatted.join('\n') || '(none)';
}

/**
 * Parse the LLM response into the 4 context blocks.
 * Handles edge cases: partial JSON, extra text around JSON, etc.
 */
export function parseAbmResponse(raw: string): {
  salesNavigator: string;
  intentSignals: string;
  stakeholders: string;
  additionalContext: string;
} {
  const defaults = {
    salesNavigator: 'Generation failed — please try again.',
    intentSignals: 'Generation failed — please try again.',
    stakeholders: 'Generation failed — please try again.',
    additionalContext: 'Generation failed — please try again.',
  };

  try {
    // Find the JSON object in the response (may be wrapped in markdown code fences)
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return defaults;

    const parsed = JSON.parse(jsonMatch[0]);
    return {
      salesNavigator: typeof parsed.salesNavigator === 'string' ? parsed.salesNavigator : defaults.salesNavigator,
      intentSignals: typeof parsed.intentSignals === 'string' ? parsed.intentSignals : defaults.intentSignals,
      stakeholders: typeof parsed.stakeholders === 'string' ? parsed.stakeholders : defaults.stakeholders,
      additionalContext: typeof parsed.additionalContext === 'string' ? parsed.additionalContext : defaults.additionalContext,
    };
  } catch {
    return defaults;
  }
}
