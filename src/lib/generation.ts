/**
 * Message generation with strict style rules.
 * Uses model tool if available; falls back to templates.
 */

const STYLE_RULES = [
  'natural',
  'specific',
  'no sales pitch',
  'short',
  'respectful',
  'includes a real hook',
];

function parseOptionsFromText(text: string): string[] {
  const lines = (text || '').split('\n').map((line) => line.trim()).filter(Boolean);
  const options = lines
    .map((line) => line.replace(/^[\-\*\d\.\)]\s+/, ''))
    .filter((line) => line.length > 0);
  return options.slice(0, 3);
}

function fallbackOptions(person: any, signal: any): string[] {
  const name = person?.name || person?.displayName || 'there';
  const hook = signal?.summary || 'recent update';
  return [
    `Hi ${name} - saw ${hook}. Curious how that impacts your team?`,
    `Hey ${name}, quick note on ${hook}. If helpful, happy to share notes.`,
    `Hi ${name}, noticed ${hook}. Any changes on your roadmap?`,
  ];
}

export async function generateConversationOptions({
  toolClient,
  traceId,
  person,
  signal,
}: {
  toolClient: any;
  traceId: string;
  person: any;
  signal: any;
}): Promise<string[]> {
  const prompt = [
    'Write 2-3 short LinkedIn conversation starters.',
    `Rules: ${STYLE_RULES.join(', ')}.`,
    `Person: ${person?.name || person?.displayName} - ${person?.title || ''} at ${person?.company || ''}`,
    `Signal: ${signal?.summary || ''}`,
    'Output as 2-3 bullet points.',
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
    const options = parseOptionsFromText(result?.output || '');
    return options.length > 0 ? options : fallbackOptions(person, signal);
  } catch (_error) {
    return fallbackOptions(person, signal);
  }
}
