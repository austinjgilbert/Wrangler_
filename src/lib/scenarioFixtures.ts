import type {
  Account,
  ActionCandidate,
  Person,
  ScenarioFixture,
  SignalEvent,
} from '../../shared/types.ts';

const NOW = '2026-03-07T12:00:00.000Z';

function account(id: string, name: string, overrides: Partial<Account> = {}): Account {
  return {
    _type: 'account',
    _id: id,
    accountKey: id,
    name,
    companyName: name,
    domain: `${id}.example.com`,
    description: `${name} account fixture`,
    industry: 'Software',
    opportunityScore: 72,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function person(id: string, name: string, accountRef: string, overrides: Partial<Person> = {}): Person {
  return {
    _type: 'person',
    _id: id,
    personKey: id,
    name,
    currentCompany: accountRef,
    currentTitle: 'VP Digital',
    seniorityLevel: 'vp',
    isDecisionMaker: true,
    companyRef: { _type: 'reference', _ref: accountRef },
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function signal(id: string, accountRef: string, signalType: string, strength: number, overrides: Partial<SignalEvent> = {}): SignalEvent {
  return {
    _type: 'signal',
    _id: id,
    id,
    source: 'website_scan',
    signalType,
    account: { _type: 'reference', _ref: accountRef },
    person: null,
    strength,
    timestamp: NOW,
    metadata: { summary: `${signalType} signal`, baseStrength: strength, decayedStrength: strength },
    ...overrides,
  };
}

function candidate(id: string, accountRef: string, actionType: ActionCandidate['actionType'], overrides: Partial<ActionCandidate> = {}): ActionCandidate {
  return {
    _type: 'actionCandidate',
    _id: id,
    id,
    account: { _type: 'reference', _ref: accountRef },
    person: null,
    signals: [],
    signalRefs: [],
    patternMatch: 'scan.follow_up_required',
    opportunityScore: 60,
    confidence: 0.6,
    confidenceBreakdown: {
      dataConfidence: 0.6,
      entityConfidence: 0.6,
      patternConfidence: 0.6,
      actionConfidence: 0.6,
      draftConfidence: 0.55,
      updatedAt: NOW,
    },
    actionType,
    urgency: 'medium',
    whyNow: 'Fixture why now.',
    evidence: ['Fixture evidence'],
    evidenceRefs: [],
    draftStatus: actionType === 'send_email' ? 'ready' : 'not_started',
    recommendedNextStep: 'Fixture next step.',
    missingData: [],
    expirationTime: '2026-03-10T12:00:00.000Z',
    lifecycleStatus: 'active',
    observedAt: NOW,
    lastValidatedAt: NOW,
    staleAfter: '2026-03-10T12:00:00.000Z',
    refreshPriority: 70,
    uncertaintyState: 'likely',
    scoringVersion: 'scoring.fixture',
    patternVersion: 'pattern.fixture',
    draftPolicyVersion: 'draft.fixture',
    strategyVersion: 'strategy.fixture',
    rankingPolicyVersion: 'ranking.fixture',
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

const fusionAccount = account('acct-fusion', 'FusionCo', { opportunityScore: 88 });
const fusionPerson = person('person-fusion', 'Alex Fusion', 'acct-fusion', { linkedinUrl: 'https://linkedin.com/in/alex-fusion' });
const weakAccount = account('acct-weak', 'WeakCo', { opportunityScore: 34, description: '' });
const contradictionAccount = account('acct-contradict', 'ContradictCo', { opportunityScore: 68 });
const abmSparseAccount = account('acct-abm', 'ABM Co', { opportunityScore: 79, description: '' });
const legacyAccount = account('acct-legacy', 'LegacyCMS Inc', {
  opportunityScore: 84,
  technologyStack: { legacySystems: ['Sitecore'], migrationOpportunities: ['cms-replatform'], painPoints: ['content-ops'] },
});

export const scenarioFixtures: ScenarioFixture[] = [
  {
    id: 'strong-signal-fusion',
    name: 'Strong Signal Fusion',
    description: 'Signup plus pricing and intent should create an immediate outbound action.',
    now: NOW,
    inputBundle: {
      accounts: [fusionAccount],
      people: [fusionPerson],
      signals: [
        signal('sig-signup', 'acct-fusion', 'signup', 0.95),
        signal('sig-pricing', 'acct-fusion', 'pricing_page_visit', 0.88),
        signal('sig-intent', 'acct-fusion', 'intent_spike', 0.82),
      ],
      actionCandidates: [
        candidate('cand-fusion', 'acct-fusion', 'send_email', {
          person: { _type: 'reference', _ref: 'person-fusion' },
          patternMatch: 'scan.execution_ready',
          signals: ['signup', 'pricing_page_visit', 'intent_spike'],
          opportunityScore: 89,
          confidence: 0.86,
        }),
      ],
    },
    expectation: {
      expectedActionType: 'send_email',
      expectedPriorityRange: { min: 80, max: 100 },
      expectedConfidenceRange: { min: 0.75, max: 1 },
      expectedPattern: 'scan.execution_ready',
    },
  },
  {
    id: 'weak-signal-only',
    name: 'Weak Signal Only',
    description: 'A weak website-only signal should not look execution-ready.',
    now: NOW,
    inputBundle: {
      accounts: [weakAccount],
      signals: [signal('sig-weak', 'acct-weak', 'website_scan', 0.22)],
      actionCandidates: [
        candidate('cand-weak', 'acct-weak', 'run_targeted_research', {
          opportunityScore: 42,
          confidence: 0.34,
          missingData: ['target_person', 'technology_validation'],
        }),
      ],
    },
    expectation: {
      expectedActionType: 'run_targeted_research',
      expectedPriorityRange: { min: 20, max: 60 },
      expectedConfidenceRange: { min: 0.2, max: 0.5 },
      expectedPattern: 'scan.follow_up_required',
    },
  },
  {
    id: 'contradictory-evidence',
    name: 'Contradictory Evidence',
    description: 'Conflicting account sizing evidence should lower confidence and bias toward validation.',
    now: NOW,
    inputBundle: {
      accounts: [contradictionAccount],
      signals: [
        signal('sig-contradict-a', 'acct-contradict', 'website_scan', 0.64, { metadata: { summary: 'Enterprise migration initiative' } }),
        signal('sig-contradict-b', 'acct-contradict', 'website_scan', 0.58, { metadata: { summary: 'Small team with limited budget' } }),
      ],
      actionCandidates: [
        candidate('cand-contradict', 'acct-contradict', 'run_targeted_research', {
          confidence: 0.4,
          uncertaintyState: 'contradictory',
          missingData: ['needs_validation'],
        }),
      ],
    },
    expectation: {
      expectedActionType: 'run_targeted_research',
      expectedPriorityRange: { min: 30, max: 70 },
      expectedConfidenceRange: { min: 0.2, max: 0.55 },
      expectedPattern: 'scan.follow_up_required',
    },
  },
  {
    id: 'strategy-update-propagation',
    name: 'Strategy Update Propagation',
    description: 'Strategy changes should still preserve explainable email output.',
    now: NOW,
    inputBundle: {
      accounts: [fusionAccount],
      people: [fusionPerson],
      signals: [signal('sig-strategy', 'acct-fusion', 'signup', 0.9)],
      actionCandidates: [candidate('cand-strategy', 'acct-fusion', 'send_email', {
        person: { _type: 'reference', _ref: 'person-fusion' },
        patternMatch: 'scan.execution_ready',
        strategyVersion: 'strategy.superuser.fixture',
      })],
      context: { strategyNote: 'Prioritize platform consolidation buyers.' },
    },
    expectation: {
      expectedActionType: 'send_email',
      expectedPriorityRange: { min: 70, max: 100 },
      expectedConfidenceRange: { min: 0.6, max: 1 },
      expectedPattern: 'scan.execution_ready',
    },
  },
  {
    id: 'operator-correction-learning',
    name: 'Operator Correction Learning',
    description: 'Corrective feedback should not produce a higher-confidence execution action.',
    now: NOW,
    inputBundle: {
      accounts: [contradictionAccount],
      actionCandidates: [candidate('cand-feedback', 'acct-contradict', 'send_email', {
        confidence: 0.52,
        uncertaintyState: 'needs_validation',
      })],
    },
    expectation: {
      expectedActionType: 'send_email',
      expectedPriorityRange: { min: 40, max: 75 },
      expectedConfidenceRange: { min: 0.3, max: 0.65 },
      expectedPattern: 'scan.follow_up_required',
    },
  },
  {
    id: 'high-volume-action-queue',
    name: 'High Volume Queue',
    description: 'A large action set should remain rankable without duplicates dominating.',
    now: NOW,
    inputBundle: {
      accounts: [fusionAccount, legacyAccount, abmSparseAccount],
      actionCandidates: [
        candidate('cand-hv-1', 'acct-fusion', 'send_email', { opportunityScore: 92, confidence: 0.9, patternMatch: 'scan.execution_ready' }),
        candidate('cand-hv-2', 'acct-legacy', 'make_call', { opportunityScore: 86, confidence: 0.82, patternMatch: 'scan.migration_signal' }),
        candidate('cand-hv-3', 'acct-abm', 'run_targeted_research', { opportunityScore: 63, confidence: 0.55 }),
      ],
    },
    expectation: {
      expectedActionType: 'make_call',
      expectedPriorityRange: { min: 50, max: 70 },
      expectedConfidenceRange: { min: 0.75, max: 1 },
      expectedPattern: 'scan.migration_signal',
    },
  },
  {
    id: 'stale-evidence-refresh',
    name: 'Stale Evidence Refresh',
    description: 'Stale evidence should lower urgency and force refresh pressure.',
    now: NOW,
    inputBundle: {
      accounts: [account('acct-stale', 'StaleCo', { updatedAt: '2025-12-01T00:00:00.000Z', lastEnrichedAt: '2025-12-01T00:00:00.000Z' })],
      actionCandidates: [candidate('cand-stale', 'acct-stale', 'run_targeted_research', {
        opportunityScore: 50,
        confidence: 0.38,
        uncertaintyState: 'stale',
      })],
    },
    expectation: {
      expectedActionType: 'run_targeted_research',
      expectedPriorityRange: { min: 20, max: 65 },
      expectedConfidenceRange: { min: 0.2, max: 0.5 },
      expectedPattern: 'scan.follow_up_required',
    },
  },
  {
    id: 'legacy-cms-displacement',
    name: 'Legacy CMS Displacement',
    description: 'Legacy stack and migration pain should produce a strong migration-oriented action.',
    now: NOW,
    inputBundle: {
      accounts: [legacyAccount],
      actionCandidates: [candidate('cand-legacy', 'acct-legacy', 'make_call', {
        opportunityScore: 87,
        confidence: 0.83,
        patternMatch: 'scan.migration_signal',
        signals: ['migration:cms-replatform', 'pain:content-ops'],
      })],
    },
    expectation: {
      expectedActionType: 'make_call',
      expectedPriorityRange: { min: 50, max: 70 },
      expectedConfidenceRange: { min: 0.7, max: 1 },
      expectedPattern: 'scan.migration_signal',
    },
  },
  {
    id: 'abm-account-sparse-data',
    name: 'ABM Sparse Data',
    description: 'Good account, sparse data should rank but bias toward research.',
    now: NOW,
    inputBundle: {
      accounts: [abmSparseAccount],
      actionCandidates: [candidate('cand-abm', 'acct-abm', 'run_targeted_research', {
        opportunityScore: 66,
        confidence: 0.48,
        missingData: ['target_person', 'account_description'],
      })],
    },
    expectation: {
      expectedActionType: 'run_targeted_research',
      expectedPriorityRange: { min: 35, max: 55 },
      expectedConfidenceRange: { min: 0.35, max: 0.6 },
      expectedPattern: 'scan.follow_up_required',
    },
  },
  {
    id: 'signup-immediate-action',
    name: 'Signup Immediate Action',
    description: 'A high-intent signup should remain urgent and actionable.',
    now: NOW,
    inputBundle: {
      accounts: [fusionAccount],
      people: [fusionPerson],
      signals: [signal('sig-signup-immediate', 'acct-fusion', 'signup', 0.97)],
      actionCandidates: [candidate('cand-signup', 'acct-fusion', 'send_email', {
        person: { _type: 'reference', _ref: 'person-fusion' },
        opportunityScore: 91,
        confidence: 0.88,
        patternMatch: 'scan.execution_ready',
      })],
    },
    expectation: {
      expectedActionType: 'send_email',
      expectedPriorityRange: { min: 75, max: 100 },
      expectedConfidenceRange: { min: 0.75, max: 1 },
      expectedPattern: 'scan.execution_ready',
    },
  },
];
