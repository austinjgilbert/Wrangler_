#!/usr/bin/env node
/**
 * Intent Classifier Eval Harness
 *
 * Self-contained eval script that tests the rule-based intent classifier
 * against the 50-query test set. Re-implements the exact regex patterns
 * from src/chat/intent.ts to avoid TypeScript import issues.
 *
 * Usage: node src/chat/eval/run-intent-eval.mjs
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ─── Load Test Set ─────────────────────────────────────────────────────────

const testSetPath = join(__dirname, 'intent-test-set.json');
const testSet = JSON.parse(readFileSync(testSetPath, 'utf-8'));

// ─── Rule-based Classifier (copied from intent.ts) ────────────────────────

/**
 * Intent classification patterns — exact copy from intent.ts
 * Ordered by specificity — more specific patterns first.
 */
const INTENT_PATTERNS = [
  {
    intent: 'meeting_prep',
    patterns: [
      /\b(meeting|prep|prepare|brief|briefing\s+for|before\s+(my|the|a)\s+\w*\s*(call|meeting|chat))\b/i,
      /\b(talking\s+points|agenda|ready\s+for)\b/i,
      /\bprep\s+(me|us)\b/i,
      // "call/meeting" with time context
      /\b(call|meeting)\s+(with|tomorrow|today|at\s+\d|next|this)\b/i,
      // "before I" + communication verb
      /\bbefore\s+I\s+(call|dial|jump\s+on|meet|talk)\b/i,
      // time-pressure patterns implying upcoming meeting
      /\b(in\s+an?\s+hour|in\s+\d+\s+minutes?)\b/i,
      // "I have a call/meeting"
      /\bI\s+have\s+a\s+(call|meeting|chat|demo|discovery)\b/i,
      // "discovery call"
      /\b(discovery\s+call|demo\s+call|intro\s+call)\b/i,
      // "what should I know" + going/before
      /\bwhat\s+(should|do)\s+I\s+(need\s+to\s+)?know\s+(before|going)\b/i,
      // "before I jump on with"
      /\bbefore\s+I\s+jump\s+on\b/i,
      // "call tomorrow/at" pattern (e.g. "Acme call tomorrow at 10")
      /\bcall\s+(tomorrow|at\s+\d)/i,
    ],
    confidence: 0.8,
  },
  {
    intent: 'morning_briefing',
    patterns: [
      /\b(morning|daily|briefing|overnight|focus\s+on\s+today)\b/i,
      /\b(what('s|\s+is)\s+(happening|going\s+on))$/i,  // only at end of string (no entity after)
      /\bwhat('s|\s+is)\s+new\s*\??$/i,  // "what's new?" at end of string → morning briefing
      /\b(catch\s+me\s+up|what\s+did\s+i\s+miss)\b/i,
      /\b(start\s+(my|the)\s+day)\b/i,
      // "gm" exact match
      /^gm$/i,
      // priority/focus patterns
      /\b(top\s+)?priorit(y|ies)\b/i,
      /\bwhat\s+should\s+I\s+(do|focus|work\s+on)\b/i,
      // "what should I be doing"
      /\bwhat\s+should\s+I\s+be\s+doing\b/i,
      // "on my plate"
      /\bon\s+my\s+plate\b/i,
      // weekly scope
      /\bfocus\s+on\s+this\s+week\b/i,
      // "today" standalone or "what's on today"
      /\btoday\b/i,
      // "rundown" only at end of string (no entity after)
      /\brundown$/i,
    ],
    confidence: 0.75,
  },
  {
    intent: 'signal_check',
    patterns: [
      /\b(signal|signals|alert|alerts|activity|activities)\b/i,
      /\b(hiring|funding|news|event|change|movement)\b/i,
      /\b(what('s|\s+is)\s+(changed|new|happened))\b/i,
      /\b(recent|latest|overnight)\s+(signal|activity|change)/i,
      // "anything happening/interesting/new"
      /\banything\s+(happening|interesting|new|going\s+on|change)\b/i,
      // SDR slang for signals
      /\b(noise|buzz|chatter)\b/i,
      // "what's moving"
      /\bwhat('s|\s+is)\s+moving\b/i,
      // "intel" as signal indicator
      /\bintel\b/i,
    ],
    confidence: 0.7,
  },
  {
    intent: 'person_lookup',
    patterns: [
      /\b(who\s+is|who's\s+the|look\s+up|find\s+person|contact|person)\b/i,
      /\b(vp|cto|ceo|cfo|director|manager|head\s+of|chief|decision\s+maker)\b/i,
      /\b[A-Z][a-z]+\s+[A-Z][a-z]+\b/, // Capitalized two-word name pattern
      // "who should/do/at/can" patterns
      /\bwho\s+(should|do|at|can)\b/i,
      // "who's going to be"
      /\bwho('s|\s+is)\s+going\b/i,
      // first-name at company pattern
      /\b[A-Z][a-z]+\s+at\s+[A-Z]/,
      // "reach out to"
      /\breach\s+out\s+to\b/i,
    ],
    confidence: 0.65,
  },
  {
    intent: 'account_lookup',
    patterns: [
      /\b(tell\s+me\s+about|show\s+me|what('s|\s+is)|look\s+up|account|company)\b/i,
      /\b(score|opportunity|pipeline)\s+(for|of)\b/i,
      /[a-z0-9-]+\.[a-z]{2,}/i, // Domain pattern
      // "pull up" pattern
      /\bpull\s+up\b/i,
      // "rundown on" pattern (entity follows)
      /\brundown\s+on\b/i,
      // "what do we know about"
      /\bwhat\s+do\s+we\s+know\b/i,
      // "compare" pattern
      /\bcompare\b/i,
    ],
    confidence: 0.6,
  },
];

/**
 * Entity extraction patterns — exact copy from intent.ts
 */
const ENTITY_PATTERNS = [
  // Domain extraction
  {
    type: 'domain',
    pattern: /\b([a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.(?:com|io|co|org|net|dev|ai|app|xyz|tech))\b/gi,
    group: 1,
  },
  // Date references
  {
    type: 'date',
    pattern: /\b(today|yesterday|this\s+week|last\s+week|this\s+month|last\s+(?:24|48)\s+hours|overnight|past\s+\d+\s+days?|tomorrow|next\s+week|tuesday|monday|wednesday|thursday|friday)\b/gi,
    group: 1,
  },
  // Industry references
  {
    type: 'industry',
    pattern: /\b(fintech|ecommerce|e-commerce|healthcare|saas|edtech|martech|adtech|retail|enterprise|b2b|b2c|media|publishing)\b/gi,
    group: 1,
  },
  // Technology references (only match as technology when NOT preceded by "at" or "about" which implies account)
  {
    type: 'technology',
    pattern: /\b(sanity|wordpress|shopify|contentful|strapi|react|next\.?js|vue|angular|drupal|magento)\b/gi,
    group: 1,
  },
];

/**
 * classifyIntentRuleBased — exact copy from intent.ts
 */
function classifyIntentRuleBased(query, entityContext) {
  const lower = query.toLowerCase();

  // Extract entities using regex patterns
  const entities = [];
  for (const { type, pattern, group } of ENTITY_PATTERNS) {
    // Reset regex state for global patterns
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(query)) !== null) {
      const text = (group !== undefined ? match[group] : match[0]).trim();
      if (text && !entities.some((e) => e.text.toLowerCase() === text.toLowerCase())) {
        entities.push({ text, type });
      }
    }
  }

  // Extract person names (capitalized two-word patterns, excluding common words)
  const nameExclusions = new Set([
    'the', 'this', 'that', 'what', 'show', 'tell', 'find', 'look',
    'give', 'prep', 'morning', 'daily', 'meeting', 'signal', 'account',
    'good', 'any', 'top', 'brief', 'help', 'compare',
  ]);
  const namePattern = /\b([A-Z][a-z]{1,15})\s+([A-Z][a-z]{1,15})\b/g;
  let nameMatch;
  while ((nameMatch = namePattern.exec(query)) !== null) {
    const firstName = nameMatch[1];
    const lastName = nameMatch[2];
    if (
      !nameExclusions.has(firstName.toLowerCase()) &&
      !nameExclusions.has(lastName.toLowerCase())
    ) {
      const fullName = `${firstName} ${lastName}`;
      if (!entities.some((e) => e.text === fullName)) {
        entities.push({ text: fullName, type: 'person' });
      }
    }
  }

  // Extract "Name at Company" pattern for first-name lookups
  const nameAtCompanyPattern = /\b([A-Z][a-z]+)\s+at\s+([A-Z][A-Za-z]+)\b/g;
  let nacMatch;
  while ((nacMatch = nameAtCompanyPattern.exec(query)) !== null) {
    const firstName = nacMatch[1];
    const companyName = nacMatch[2];
    if (!nameExclusions.has(firstName.toLowerCase())) {
      if (!entities.some((e) => e.text === firstName && e.type === 'person')) {
        entities.push({ text: firstName, type: 'person' });
      }
      if (!entities.some((e) => e.text.toLowerCase() === companyName.toLowerCase())) {
        entities.push({ text: companyName, type: 'account' });
      }
    }
  }

  // Extract single-word capitalized company names (known companies + PascalCase words)
  const knownCompanies = new Set([
    'acme', 'stripe', 'dataflow', 'nike', 'salesforce', 'hubspot',
  ]);
  const singleCapPattern = /\b([A-Z][a-zA-Z]{2,})\b/g;
  let scMatch;
  while ((scMatch = singleCapPattern.exec(query)) !== null) {
    const word = scMatch[1];
    const wordLower = word.toLowerCase();
    // Only add if it's a known company and not already captured
    if (
      knownCompanies.has(wordLower) &&
      !entities.some((e) => e.text.toLowerCase() === wordLower)
    ) {
      entities.push({ text: word, type: 'account' });
    }
  }

  // Extract account names from "about X" or "for X" patterns
  const aboutPattern = /\b(?:about|for|on)\s+([A-Z][A-Za-z0-9\s&.-]{1,30})(?:\s*[?.!,]|$)/g;
  let aboutMatch;
  while ((aboutMatch = aboutPattern.exec(query)) !== null) {
    const name = aboutMatch[1].trim();
    // Only add if it looks like a company name and isn't already captured
    if (
      name.length > 2 &&
      !entities.some((e) => e.text.toLowerCase() === name.toLowerCase()) &&
      !/^(my|the|a|an|this|that|today|me|us)$/i.test(name)
    ) {
      entities.push({ text: name, type: 'account' });
    }
  }

  // Classify intent using pattern matching
  let matchedIntent = 'unknown';
  let matchedConfidence = 0.3;

  for (const { intent, patterns, confidence } of INTENT_PATTERNS) {
    if (patterns.some((p) => p.test(lower))) {
      matchedIntent = intent;
      matchedConfidence = confidence;
      break;
    }
  }

  // ─── Entity-aware intent resolution (second pass) ───────────────────

  const hasPersonEntity = entities.some((e) => e.type === 'person');
  const hasAccountEntity = entities.some((e) => e.type === 'account' || e.type === 'domain');
  const hasAtCompanyPattern = /\bat\s+[A-Z]/i.test(query);
  const hasMeetingTimeContext = /\b(before\s+I\s+(call|dial|jump\s+on|meet|talk)|in\s+an?\s+hour|in\s+\d+\s+minutes?|before\s+my\s+(call|meeting)|I\s+have\s+a\s+(call|meeting|chat|demo|discovery))\b/i.test(query);

  // Override 1: morning_briefing + entity → account_lookup
  if (matchedIntent === 'morning_briefing' && (hasAccountEntity || hasPersonEntity)) {
    // "What's happening with Acme?" should be account_lookup, not morning_briefing
    matchedIntent = 'account_lookup';
    matchedConfidence = 0.7;
  }

  // Override 2: account_lookup + person entity + "at Company" → person_lookup
  if (matchedIntent === 'account_lookup' && hasPersonEntity && hasAtCompanyPattern) {
    matchedIntent = 'person_lookup';
    matchedConfidence = 0.7;
  }

  // Override 3: any intent + meeting time pressure → meeting_prep
  if (hasMeetingTimeContext && matchedIntent !== 'meeting_prep') {
    matchedIntent = 'meeting_prep';
    matchedConfidence = 0.75;
  }

  // If no pattern matched but we found entities, infer from entity types
  if (matchedIntent === 'unknown' && entities.length > 0) {
    // "Name at Company" pattern → person_lookup
    if (hasPersonEntity && hasAtCompanyPattern) {
      return { intent: 'person_lookup', confidence: 0.5, entities, rawQuery: query };
    }
    if (hasPersonEntity && !hasAccountEntity) {
      return { intent: 'person_lookup', confidence: 0.5, entities, rawQuery: query };
    }
    if (hasAccountEntity) {
      return { intent: 'account_lookup', confidence: 0.5, entities, rawQuery: query };
    }
  }

  // Override: "pull up" + person entity → person_lookup
  if (matchedIntent === 'account_lookup' && hasPersonEntity && !hasAccountEntity) {
    matchedIntent = 'person_lookup';
    matchedConfidence = 0.65;
  }

  return {
    intent: matchedIntent,
    confidence: matchedConfidence,
    entities,
    rawQuery: query,
  };
}

// ─── Eval Runner ───────────────────────────────────────────────────────────

function runEval() {
  const results = [];
  const failures = [];

  // Per-intent tracking
  const intentStats = {};
  const difficultyStats = {};

  // Entity tracking
  let totalExpectedEntities = 0;
  let totalExtractedEntities = 0;
  let entityMatches = 0;

  for (const testCase of testSet) {
    const { id, query, expected_intent, expected_entities, difficulty, notes } = testCase;

    // Run classifier
    const result = classifyIntentRuleBased(query);
    const intentCorrect = result.intent === expected_intent;

    // Track intent accuracy
    if (!intentStats[expected_intent]) {
      intentStats[expected_intent] = { total: 0, correct: 0, failures: [] };
    }
    intentStats[expected_intent].total++;
    if (intentCorrect) {
      intentStats[expected_intent].correct++;
    } else {
      intentStats[expected_intent].failures.push({
        id, query, expected: expected_intent, actual: result.intent, difficulty, notes
      });
    }

    // Track difficulty accuracy
    if (!difficultyStats[difficulty]) {
      difficultyStats[difficulty] = { total: 0, correct: 0 };
    }
    difficultyStats[difficulty].total++;
    if (intentCorrect) {
      difficultyStats[difficulty].correct++;
    }

    // Track entity extraction
    totalExpectedEntities += expected_entities.length;
    totalExtractedEntities += result.entities.length;

    // Check entity matches (case-insensitive substring matching)
    for (const expectedEntity of expected_entities) {
      const found = result.entities.some(
        (e) =>
          e.text.toLowerCase().includes(expectedEntity.toLowerCase()) ||
          expectedEntity.toLowerCase().includes(e.text.toLowerCase())
      );
      if (found) entityMatches++;
    }

    results.push({
      id,
      query,
      expected_intent,
      actual_intent: result.intent,
      intentCorrect,
      expected_entities,
      actual_entities: result.entities.map((e) => `${e.text} (${e.type})`),
      difficulty,
      confidence: result.confidence,
    });

    if (!intentCorrect) {
      failures.push({
        id,
        query,
        expected: expected_intent,
        actual: result.intent,
        confidence: result.confidence,
        difficulty,
        notes,
        entities_found: result.entities.map((e) => `${e.text} (${e.type})`),
      });
    }
  }

  // ─── Report ────────────────────────────────────────────────────────────

  const totalCorrect = results.filter((r) => r.intentCorrect).length;
  const totalTests = results.length;
  const overallAccuracy = ((totalCorrect / totalTests) * 100).toFixed(1);

  console.log('\n' + '═'.repeat(70));
  console.log('  INTENT CLASSIFIER EVAL — Rule-Based Fallback');
  console.log('═'.repeat(70));

  // Overall accuracy
  console.log(`\n📊 OVERALL ACCURACY: ${totalCorrect}/${totalTests} (${overallAccuracy}%)`);
  const target = 80;
  if (parseFloat(overallAccuracy) >= target) {
    console.log(`   ✅ PASSES target of ≥${target}%`);
  } else {
    console.log(`   ❌ BELOW target of ≥${target}% (need ${Math.ceil(target * totalTests / 100 - totalCorrect)} more correct)`);
  }

  // Per-intent breakdown
  console.log('\n' + '─'.repeat(70));
  console.log('  PER-INTENT ACCURACY');
  console.log('─'.repeat(70));
  console.log(`  ${'Intent'.padEnd(20)} ${'Correct'.padEnd(10)} ${'Total'.padEnd(8)} ${'Accuracy'.padEnd(10)}`);
  console.log('  ' + '─'.repeat(48));

  const intentOrder = ['account_lookup', 'morning_briefing', 'signal_check', 'person_lookup', 'meeting_prep'];
  for (const intent of intentOrder) {
    const stats = intentStats[intent] || { total: 0, correct: 0 };
    const acc = stats.total > 0 ? ((stats.correct / stats.total) * 100).toFixed(0) : 'N/A';
    const icon = stats.total > 0 && stats.correct === stats.total ? '✅' : stats.correct / stats.total >= 0.8 ? '🟡' : '❌';
    console.log(`  ${icon} ${intent.padEnd(18)} ${String(stats.correct).padEnd(10)} ${String(stats.total).padEnd(8)} ${acc}%`);
  }

  // Per-difficulty breakdown
  console.log('\n' + '─'.repeat(70));
  console.log('  PER-DIFFICULTY ACCURACY');
  console.log('─'.repeat(70));
  console.log(`  ${'Difficulty'.padEnd(12)} ${'Correct'.padEnd(10)} ${'Total'.padEnd(8)} ${'Accuracy'.padEnd(10)}`);
  console.log('  ' + '─'.repeat(40));

  for (const diff of ['easy', 'medium', 'hard']) {
    const stats = difficultyStats[diff] || { total: 0, correct: 0 };
    const acc = stats.total > 0 ? ((stats.correct / stats.total) * 100).toFixed(0) : 'N/A';
    const icon = stats.correct / stats.total >= 0.8 ? '✅' : stats.correct / stats.total >= 0.6 ? '🟡' : '❌';
    console.log(`  ${icon} ${diff.padEnd(10)} ${String(stats.correct).padEnd(10)} ${String(stats.total).padEnd(8)} ${acc}%`);
  }

  // Entity extraction accuracy
  console.log('\n' + '─'.repeat(70));
  console.log('  ENTITY EXTRACTION');
  console.log('─'.repeat(70));
  const entityRecall = totalExpectedEntities > 0
    ? ((entityMatches / totalExpectedEntities) * 100).toFixed(1)
    : 'N/A';
  console.log(`  Expected entities: ${totalExpectedEntities}`);
  console.log(`  Extracted entities: ${totalExtractedEntities}`);
  console.log(`  Matched entities: ${entityMatches}`);
  console.log(`  Entity recall: ${entityRecall}%`);

  // Failures
  if (failures.length > 0) {
    console.log('\n' + '─'.repeat(70));
    console.log(`  FAILURES (${failures.length})`);
    console.log('─'.repeat(70));

    for (const f of failures) {
      console.log(`\n  ${f.id} [${f.difficulty}] "${f.query}"`);
      console.log(`    Expected: ${f.expected}`);
      console.log(`    Actual:   ${f.actual} (confidence: ${f.confidence})`);
      console.log(`    Entities: [${f.entities_found.join(', ')}]`);
      console.log(`    Notes:    ${f.notes}`);
    }
  }

  // Improvement suggestions
  if (parseFloat(overallAccuracy) < target) {
    console.log('\n' + '─'.repeat(70));
    console.log('  SUGGESTED IMPROVEMENTS');
    console.log('─'.repeat(70));

    // Analyze failure patterns
    const misclassifications = {};
    for (const f of failures) {
      const key = `${f.expected} → ${f.actual}`;
      if (!misclassifications[key]) misclassifications[key] = [];
      misclassifications[key].push(f);
    }

    for (const [pattern, cases] of Object.entries(misclassifications)) {
      console.log(`\n  ${pattern} (${cases.length} cases):`);
      for (const c of cases) {
        console.log(`    - [${c.id}] "${c.query}"`);
      }

      // Suggest specific fixes
      const [expected, actual] = pattern.split(' → ');
      if (expected === 'account_lookup' && actual === 'unknown') {
        console.log('    FIX: Add patterns for bare company names and domain-only queries');
      } else if (expected === 'morning_briefing' && actual === 'unknown') {
        console.log('    FIX: Add patterns for "gm", "priorities", and abbreviated greetings');
      } else if (expected === 'signal_check' && actual === 'morning_briefing') {
        console.log('    FIX: Signal patterns should take priority when "signal" keywords present');
      } else if (expected === 'meeting_prep' && actual === 'account_lookup') {
        console.log('    FIX: Add patterns for implicit meeting context ("call", "in an hour", time references)');
      } else if (expected === 'person_lookup' && actual === 'account_lookup') {
        console.log('    FIX: Person lookup should win when "who" keyword is present');
      } else if (expected === 'meeting_prep' && actual === 'signal_check') {
        console.log('    FIX: Meeting prep should win when "before I" + call/meeting context is present');
      }
    }
  }

  // Summary JSON for programmatic use
  console.log('\n' + '─'.repeat(70));
  console.log('  SUMMARY JSON');
  console.log('─'.repeat(70));
  const summary = {
    overall: { correct: totalCorrect, total: totalTests, accuracy: parseFloat(overallAccuracy) },
    byIntent: {},
    byDifficulty: {},
    entityRecall: parseFloat(entityRecall) || 0,
    passesTarget: parseFloat(overallAccuracy) >= target,
    failureCount: failures.length,
  };
  for (const intent of intentOrder) {
    const s = intentStats[intent] || { total: 0, correct: 0 };
    summary.byIntent[intent] = {
      correct: s.correct,
      total: s.total,
      accuracy: s.total > 0 ? parseFloat(((s.correct / s.total) * 100).toFixed(1)) : 0,
    };
  }
  for (const diff of ['easy', 'medium', 'hard']) {
    const s = difficultyStats[diff] || { total: 0, correct: 0 };
    summary.byDifficulty[diff] = {
      correct: s.correct,
      total: s.total,
      accuracy: s.total > 0 ? parseFloat(((s.correct / s.total) * 100).toFixed(1)) : 0,
    };
  }
  console.log(JSON.stringify(summary, null, 2));

  console.log('\n' + '═'.repeat(70));
  console.log('  EVAL COMPLETE');
  console.log('═'.repeat(70) + '\n');
}

// Run it
runEval();
