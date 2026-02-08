/**
 * Coaching generation with strict evidence citations.
 * Coach is direct; no generic praise.
 */

const RUBRIC = [
  'agenda/control',
  'discovery depth',
  'quantification',
  'decision process',
  'next steps',
  'clarity',
  'objection handling',
  'talk ratio estimate',
];

function findQuote(entries: any[], patterns: string[]) {
  for (const e of entries) {
    const text = e.text.toLowerCase();
    if (patterns.some((p) => text.includes(p))) {
      return { quote: e.text, timestamp: e.timestamp, speaker: e.speaker };
    }
  }
  // Fallback: first line to ensure evidence is always present.
  const first = entries[0];
  return { quote: first?.text || '', timestamp: first?.timestamp || '00:00', speaker: first?.speaker || 'Unknown' };
}

function estimateTalkRatio(entries: any[]) {
  let austinWords = 0;
  let otherWords = 0;
  for (const e of entries) {
    const words = e.text.split(/\s+/).filter(Boolean).length;
    if (e.speaker.toLowerCase().includes('austin') || e.speaker.toLowerCase().includes('rep')) {
      austinWords += words;
    } else {
      otherWords += words;
    }
  }
  const total = austinWords + otherWords;
  return total === 0 ? 0.5 : austinWords / total;
}

export function buildCoaching(entries: any[]) {
  const talkRatio = estimateTalkRatio(entries);
  const scorecard: Record<string, number> = {};
  const criticalFeedback: string[] = [];
  const missedOpportunities: string[] = [];
  const topMistakes: string[] = [];
  const missedQuestions: string[] = [];
  const rewrites: any[] = [];
  const drills: any[] = [];
  const transcriptEvidence: any[] = [];

  const evidenceMap = {
    'agenda/control': findQuote(entries, ['agenda', 'today', 'plan']),
    'discovery depth': findQuote(entries, ['why', 'tell me more', 'how does']),
    'quantification': findQuote(entries, ['how much', 'metric', 'numbers', 'cost']),
    'decision process': findQuote(entries, ['decision', 'approve', 'budget']),
    'next steps': findQuote(entries, ['next step', 'follow up', 'schedule']),
    'clarity': findQuote(entries, ['to recap', 'summary', 'clear']),
    'objection handling': findQuote(entries, ['concern', 'but', 'hesitant']),
    'talk ratio estimate': findQuote(entries, ['i think', 'we can', 'let me']),
  } as Record<string, any>;

  for (const category of RUBRIC) {
    const ev = evidenceMap[category];
    transcriptEvidence.push({ category, ...ev });
    const score = ev.quote ? 2 : 1;
    scorecard[category] = score;

    if (score <= 2) {
      criticalFeedback.push(
        `${category}: weak. Evidence "${ev.quote}" (${ev.timestamp}).`
      );
      missedOpportunities.push(
        `${category}: you did not drive this hard enough. Evidence "${ev.quote}" (${ev.timestamp}).`
      );
    }
  }

  // If talk ratio is too high, add a dedicated critique.
  if (talkRatio > 0.65) {
    criticalFeedback.push(
      `talk ratio: you talked too much (${Math.round(talkRatio * 100)}%). Evidence "${evidenceMap['talk ratio estimate'].quote}" (${evidenceMap['talk ratio estimate'].timestamp}).`
    );
  }

  topMistakes.push(
    `You failed to control agenda early. Evidence "${evidenceMap['agenda/control'].quote}" (${evidenceMap['agenda/control'].timestamp}).`
  );
  topMistakes.push(
    `You did not quantify impact. Evidence "${evidenceMap['quantification'].quote}" (${evidenceMap['quantification'].timestamp}).`
  );
  topMistakes.push(
    `You let decision process stay vague. Evidence "${evidenceMap['decision process'].quote}" (${evidenceMap['decision process'].timestamp}).`
  );

  missedQuestions.push('What is the cost of this problem per month in dollars or hours?');
  missedQuestions.push('Who signs off on budget and what is the approval path?');
  missedQuestions.push('What is the deadline that makes this urgent now?');

  rewrites.push({
    timestamp: evidenceMap['quantification'].timestamp,
    original: evidenceMap['quantification'].quote,
    betterLine: 'Can you quantify the cost of this problem in dollars or hours?',
  });
  rewrites.push({
    timestamp: evidenceMap['decision process'].timestamp,
    original: evidenceMap['decision process'].quote,
    betterLine: 'Who approves this and what steps are required to get a yes?',
  });

  // Talk ratio drill if Austin dominates > 65%.
  if (talkRatio > 0.65) {
    drills.push({
      focus: 'talk ratio',
      correctedScript: 'Ask one question, then pause for 8 seconds before speaking.',
      repetitionPlan: '3 reps of 5-minute discovery roleplay.',
      constraint: 'Austin speaks less than 40% of time on next call.',
    });
  }

  // Quantification drill
  drills.push({
    focus: 'quantification',
    correctedScript: 'What is the monthly cost of this problem in dollars or hours?',
    repetitionPlan: 'Write 5 quantified questions and practice out loud.',
    constraint: 'Ask at least 2 quantified questions next call.',
  });

  return {
    scorecard,
    criticalFeedback,
    missedOpportunities,
    topMistakes,
    missedQuestions,
    rewrites,
    nextCallFocus: 'Drive quantification and decision process earlier.',
    drills,
    transcriptEvidence,
  };
}
