import { callLlm } from './llm.ts';
import { fetchLatestMoltbotConfig } from './sanity.ts';
import { getActivePolicyContext } from './policyVersioningService.ts';
import type {
  Account,
  ActionCandidate,
  DraftingOutput,
  Person,
  SignalEvent,
} from '../../shared/types.ts';

type DraftingContext = {
  actionCandidate: ActionCandidate;
  account?: Account | null;
  person?: Person | null;
  signals?: SignalEvent[];
  detectedTechnologies?: string[];
};

type DraftingOptions = {
  objective?: string;
  tone?: string;
  maxEmailWords?: number;
  includeSubject?: boolean;
};

type RegenerateDraftInput = DraftingContext & {
  previousDraft?: Partial<DraftingOutput> | null;
  operatorFeedback?: string;
  objective?: string;
  tone?: string;
};

type DraftingStrategy = {
  operatingRules: string[];
  toneRules: string[];
  values: string[];
};

export async function generateEmailDraft(
  env: any,
  input: DraftingContext & DraftingOptions,
): Promise<DraftingOutput> {
  const policyContext = await getActivePolicyContext(env).catch(() => ({
    draftPolicyVersion: 'draft.default',
    strategyVersion: 'strategy.default',
  }));
  const strategy = await loadDraftingStrategy(env);
  const context = buildDraftContext(input);
  const messages = [
    {
      role: 'system' as const,
      content:
        'You generate SDR outreach drafts tied to a recommended action candidate. ' +
        'Return valid JSON only with keys: "outreachAngle", "personaFraming", "evidenceReference", "sanityPositioning", "subject", "shortEmailDraft", "callOpeningLine". ' +
        'Use only the provided context. Mention detected technologies, signals, and pattern matches when relevant. ' +
        'Keep the email short, human, and specific. Avoid hype. Avoid fabricated claims. ' +
        'Follow any strategy, tone, and operating guidance included in the context.',
    },
    {
      role: 'user' as const,
      content: [
        `Objective: ${input.objective || 'Create a high-quality first-touch outreach draft tied to the action candidate.'}`,
        `Tone: ${input.tone || 'Concise, credible, consultative, operator-ready.'}`,
        `Max email words: ${input.maxEmailWords || 120}`,
        '',
        context,
        '',
        renderStrategyGuidance(strategy),
        '',
        'Return JSON only.',
      ].join('\n'),
    },
  ];

  const result = await callLlm(env, messages, {
    temperature: 0.2,
    maxTokens: 1600,
    json: true,
  });

  let parsed: any = {};
  try {
    parsed = JSON.parse(result.content);
  } catch {
    parsed = {};
  }

  const fallback = buildFallbackDraft(input);
  return {
    actionCandidateId: input.actionCandidate.id,
    confidenceBreakdown: input.actionCandidate.confidenceBreakdown,
    draftPolicyVersion: policyContext.draftPolicyVersion || input.actionCandidate.draftPolicyVersion || 'draft.default',
    strategyVersion: policyContext.strategyVersion || input.actionCandidate.strategyVersion || 'strategy.default',
    outreachAngle: cleanField(parsed.outreachAngle || fallback.outreachAngle),
    personaFraming: cleanField(parsed.personaFraming || fallback.personaFraming),
    evidenceReference: cleanField(parsed.evidenceReference || fallback.evidenceReference),
    sanityPositioning: cleanField(parsed.sanityPositioning || fallback.sanityPositioning),
    subject: cleanField(parsed.subject || fallback.subject || ''),
    shortEmailDraft: cleanField(parsed.shortEmailDraft || fallback.shortEmailDraft),
    callOpeningLine: cleanField(parsed.callOpeningLine || fallback.callOpeningLine),
    generatedAt: new Date().toISOString(),
    model: result.model,
    usage: result.usage,
  };
}

export async function generateCallAngle(
  env: any,
  input: DraftingContext & Pick<DraftingOptions, 'tone'>,
): Promise<Pick<DraftingOutput, 'actionCandidateId' | 'outreachAngle' | 'personaFraming' | 'evidenceReference' | 'callOpeningLine' | 'generatedAt' | 'model' | 'usage'>> {
  const draft = await generateEmailDraft(env, {
    ...input,
    objective: 'Generate a tight phone opening and call angle that references the best evidence.',
    tone: input.tone || 'Brief, direct, confident, conversational.',
    maxEmailWords: 80,
  });

  return {
    actionCandidateId: draft.actionCandidateId,
    outreachAngle: draft.outreachAngle,
    personaFraming: draft.personaFraming,
    evidenceReference: draft.evidenceReference,
    callOpeningLine: draft.callOpeningLine,
    generatedAt: draft.generatedAt,
    model: draft.model,
    usage: draft.usage,
  };
}

export async function regenerateDraft(
  env: any,
  input: RegenerateDraftInput,
): Promise<DraftingOutput> {
  const policyContext = await getActivePolicyContext(env).catch(() => ({
    draftPolicyVersion: 'draft.default',
    strategyVersion: 'strategy.default',
  }));
  const strategy = await loadDraftingStrategy(env);
  const context = buildDraftContext(input);
  const previous = input.previousDraft || {};
  const messages = [
    {
      role: 'system' as const,
      content:
        'You regenerate SDR drafts from operator feedback. Return valid JSON only with keys: ' +
        '"outreachAngle", "personaFraming", "evidenceReference", "sanityPositioning", "subject", "shortEmailDraft", "callOpeningLine". ' +
        'Preserve valid evidence-backed details, improve clarity, and use only provided facts.',
    },
    {
      role: 'user' as const,
      content: [
        `Objective: ${input.objective || 'Improve the existing action-linked draft while keeping it grounded.'}`,
        `Tone: ${input.tone || 'Crisp, specific, natural.'}`,
        '',
        context,
        '',
        renderStrategyGuidance(strategy),
        '',
        'Previous draft:',
        JSON.stringify(previous, null, 2),
        '',
        `Operator feedback: ${input.operatorFeedback || 'Tighten the draft and make the angle more actionable.'}`,
        '',
        'Return JSON only.',
      ].join('\n'),
    },
  ];

  const result = await callLlm(env, messages, {
    temperature: 0.2,
    maxTokens: 1800,
    json: true,
  });

  let parsed: any = {};
  try {
    parsed = JSON.parse(result.content);
  } catch {
    parsed = {};
  }

  const fallback = buildFallbackDraft(input);
  return {
    actionCandidateId: input.actionCandidate.id,
    confidenceBreakdown: input.actionCandidate.confidenceBreakdown,
    draftPolicyVersion: policyContext.draftPolicyVersion || input.actionCandidate.draftPolicyVersion || 'draft.default',
    strategyVersion: policyContext.strategyVersion || input.actionCandidate.strategyVersion || 'strategy.default',
    outreachAngle: cleanField(parsed.outreachAngle || previous.outreachAngle || fallback.outreachAngle),
    personaFraming: cleanField(parsed.personaFraming || previous.personaFraming || fallback.personaFraming),
    evidenceReference: cleanField(parsed.evidenceReference || previous.evidenceReference || fallback.evidenceReference),
    sanityPositioning: cleanField(parsed.sanityPositioning || previous.sanityPositioning || fallback.sanityPositioning),
    subject: cleanField(parsed.subject || previous.subject || fallback.subject || ''),
    shortEmailDraft: cleanField(parsed.shortEmailDraft || previous.shortEmailDraft || fallback.shortEmailDraft),
    callOpeningLine: cleanField(parsed.callOpeningLine || previous.callOpeningLine || fallback.callOpeningLine),
    generatedAt: new Date().toISOString(),
    model: result.model,
    usage: result.usage,
  };
}

function buildDraftContext(input: DraftingContext): string {
  const accountName = input.account?.companyName || input.account?.name || input.account?.domain || 'Unknown account';
  const personName = input.person?.name || 'Unknown person';
  const personTitle = input.person?.currentTitle || input.person?.title || 'Unknown title';
  const technologies = collectDetectedTechnologies(input).slice(0, 8);
  const signals = (input.signals || [])
    .map((signal) => `${signal.signalType} (${signal.source}, strength ${Number(signal.strength || 0).toFixed(2)})`)
    .slice(0, 6);
  const candidateSignals = (input.actionCandidate.signals || []).slice(0, 6);
  const evidence = (input.actionCandidate.evidence || []).slice(0, 6);

  return [
    `Account: ${accountName}`,
    `Person: ${personName}`,
    `Persona title: ${personTitle}`,
    `Action type: ${input.actionCandidate.actionType}`,
    `Pattern match: ${input.actionCandidate.patternMatch || 'Unknown'}`,
    `Opportunity score: ${input.actionCandidate.opportunityScore}`,
    `Confidence: ${input.actionCandidate.confidence}`,
    `Why now: ${input.actionCandidate.whyNow || 'Unknown'}`,
    `Recommended next step: ${input.actionCandidate.recommendedNextStep || 'Unknown'}`,
    `Detected technologies: ${technologies.length ? technologies.join(', ') : 'Unknown / not provided'}`,
    `Signals: ${signals.length ? signals.join('; ') : candidateSignals.length ? candidateSignals.join('; ') : 'Unknown / not provided'}`,
    `Evidence: ${evidence.length ? evidence.join('; ') : 'Unknown / not provided'}`,
    `Missing data: ${(input.actionCandidate.missingData || []).length ? input.actionCandidate.missingData.join(', ') : 'None noted'}`,
    'Sanity positioning guidance: frame Sanity as the content operating system for structured content, orchestration, governance, reuse, and faster execution across teams.',
  ].join('\n');
}

function buildFallbackDraft(input: DraftingContext): DraftingOutput {
  const accountName = input.account?.companyName || input.account?.name || input.account?.domain || 'your team';
  const personName = input.person?.name || 'there';
  const personTitle = input.person?.currentTitle || input.person?.title || 'your role';
  const technologies = collectDetectedTechnologies(input);
  const technologyText = technologies.length ? technologies.slice(0, 3).join(', ') : 'your current stack';
  const signalText = input.signals?.length
    ? input.signals.slice(0, 2).map((signal) => signal.signalType.replace(/_/g, ' ')).join(' and ')
    : (input.actionCandidate.signals || []).slice(0, 2).join(' and ') || 'recent activity';
  const evidenceText = (input.actionCandidate.evidence || []).slice(0, 2).join('; ') || 'the evidence tied to this account';
  const patternText = input.actionCandidate.patternMatch || 'the current pattern match';

  return {
    actionCandidateId: input.actionCandidate.id,
    outreachAngle: `Use ${signalText} plus the ${patternText} pattern to start a timely modernization conversation.`,
    personaFraming: `Frame the message for ${personTitle} ownership: reduce content, technology, and execution friction without forcing a broad replatform story.`,
    evidenceReference: `Reference ${evidenceText} and the detected technologies ${technologyText}.`,
    sanityPositioning: 'Position Sanity as a flexible content operating system that helps teams unify content, model structured data, and ship faster across channels.',
    subject: `Question on ${accountName}'s current content stack`,
    shortEmailDraft: [
      `Hi ${personName},`,
      '',
      `I noticed signals around ${signalText}, and it looks like ${accountName} may be working across ${technologyText}.`,
      '',
      `Teams in a similar position usually want a cleaner way to manage structured content and move faster without adding more tooling overhead. Sanity often helps by centralizing content operations while fitting into the stack they already have.`,
      '',
      `Worth comparing notes on whether that is relevant for ${accountName}?`,
    ].join('\n'),
    callOpeningLine: `Hi ${personName}, I’m reaching out because I saw ${signalText} at ${accountName}, and I had a quick thought based on ${technologyText}.`,
    generatedAt: new Date().toISOString(),
  };
}

function collectDetectedTechnologies(input: DraftingContext): string[] {
  const fromOption = input.detectedTechnologies || [];
  const fromAccount = [
    ...(input.account?.techStack || []),
    ...(input.account?.technologyStack?.cms || []),
    ...(input.account?.technologyStack?.frameworks || []),
    ...(input.account?.technologyStack?.legacySystems || []),
  ];
  return uniqueStrings([...fromOption, ...fromAccount]).slice(0, 12);
}

async function loadDraftingStrategy(env: any): Promise<DraftingStrategy> {
  const config = await fetchLatestMoltbotConfig(env).catch(() => null);
  return {
    operatingRules: uniqueStrings(config?.operatingRules || []).slice(-8),
    toneRules: uniqueStrings(config?.toneRules || []).slice(-8),
    values: uniqueStrings(config?.values || []).slice(-6),
  };
}

function renderStrategyGuidance(strategy: DraftingStrategy): string {
  const sections = [
    'Strategy guidance:',
    `Operating rules: ${strategy.operatingRules.length ? strategy.operatingRules.join(' | ') : 'None provided.'}`,
    `Tone rules: ${strategy.toneRules.length ? strategy.toneRules.join(' | ') : 'None provided.'}`,
    `Values: ${strategy.values.length ? strategy.values.join(' | ') : 'None provided.'}`,
  ];
  return sections.join('\n');
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values || []) {
    const normalized = String(value || '').trim();
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(normalized);
  }
  return out;
}

function cleanField(value: string): string {
  return String(value || '').trim();
}
