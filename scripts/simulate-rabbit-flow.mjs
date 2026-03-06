import { buildRabbitAnswer, buildRabbitIntel } from '../src/routes/extension.ts';
import { runAutomaticSelfHeal } from '../src/services/self-heal.js';

const env = {
  SANITY_PROJECT_ID: 'demo-project',
  SANITY_TOKEN: 'demo-token',
  SANITY_DATASET: 'production',
  SANITY_API_VERSION: '2023-10-01',
};

const state = {
  mutations: [],
  account: {
    _id: 'account-acme',
    accountKey: 'acme-key',
    domain: 'acme.com',
    rootDomain: 'acme.com',
    canonicalUrl: 'https://acme.com/',
    companyName: 'Acme',
    name: 'Acme',
    opportunityScore: 88,
    profileCompleteness: {
      score: 42,
      gaps: ['benchmarks', 'leadership'],
    },
  },
  repairAccount: {
    _id: 'account-repair',
    accountKey: 'repair-key',
    domain: 'repair.io',
    rootDomain: 'repair.io',
    canonicalUrl: 'https://repair.io/',
    companyName: 'Repair Inc',
    name: 'Repair Inc',
    technologies: [{ _ref: 'tech-1' }],
    leadership: [{ _ref: 'person-1' }],
    benchmarks: { estimatedEmployees: '250' },
    classification: { industry: 'SaaS' },
  },
  repairPack: {
    _id: 'accountPack-repair-key',
    accountKey: 'repair-key',
    payload: {
      scan: { technologies: ['React'] },
      discovery: { pages: ['https://repair.io/about'] },
      crawl: { pages: ['https://repair.io/pricing'] },
      evidence: { entities: ['pricing'] },
      brief: { sections: ['summary'] },
      verification: { verified: ['employees'] },
    },
  },
  person: {
    _id: 'person-jane',
    name: 'Jane Buyer',
    email: 'jane@acme.com',
    headline: 'VP of Revenue',
    currentCompany: 'Acme',
    currentTitle: 'VP of Revenue',
    relatedAccountKey: 'acme-key',
    seniorityLevel: 'vp',
    roleCategory: 'sales',
  },
  connection: {
    _id: 'network-john',
    name: 'John Warm',
    company: 'Acme',
    title: 'Advisor',
    tier: 'A',
    relationshipStrength: 0.91,
    lastTouchedAt: '2026-02-05T12:00:00.000Z',
    linkedinUrl: 'https://linkedin.com/in/johnwarm',
  },
  interactions: [
    {
      _id: 'interaction-1',
      userPrompt: 'Prepare renewal plan',
      gptResponse: 'Watch expansion timing',
      timestamp: '2026-02-05T14:00:00.000Z',
      followUpNeeded: true,
      contextTags: ['renewal'],
    },
  ],
  learnings: [
    {
      _id: 'learning-1',
      title: 'High-interest account pattern',
      summary: 'Renewal pages with direct contacts tend to convert fastest.',
      relevanceScore: 0.88,
      patternType: 'account_interest',
      recommendedActions: ['Use contact info immediately'],
    },
  ],
  duplicateJobs: [
    { _id: 'job-1', entityId: 'account-acme', accountKey: 'acme-key', goal: 'refresh', goalKey: 'refresh', createdAt: '2026-02-06T12:00:00.000Z', status: 'queued' },
    { _id: 'job-2', entityId: 'account-acme', accountKey: 'acme-key', goal: 'refresh', goalKey: 'refresh', createdAt: '2026-02-06T11:00:00.000Z', status: 'queued' },
    { _id: 'job-3', entityId: 'account-acme', accountKey: 'acme-key', goal: 'refresh', goalKey: 'refresh', createdAt: '2026-02-06T10:00:00.000Z', status: 'pending' },
  ],
  legacyLearnings: [
    { _id: 'learning-legacy', title: 'Workflow insight', summary: 'A reusable workflow pattern.' },
  ],
};

global.fetch = async (url, options = {}) => {
  const value = typeof url === 'string' ? url : url.url;
  if (value.includes('/data/query/')) {
    const query = decodeURIComponent(new URL(value).searchParams.get('query') || '');
    return jsonResponse({ result: queryResult(query) });
  }

  if (value.includes('/data/mutate/')) {
    const body = JSON.parse(options.body || '{"mutations":[]}');
    state.mutations.push(...(body.mutations || []));
    return jsonResponse({ results: [{ id: 'mock' }] });
  }

  throw new Error(`Unhandled fetch in simulation: ${value}`);
};

const scenarios = [
  {
    name: 'salesforce-renewal',
    prompt: 'What should I do on this account right now?',
    payload: {
      url: 'https://acme.my.salesforce.com/lightning/r/Opportunity/123/view',
      source: 'salesforce',
      title: 'Acme Renewal Opportunity',
      rawText: 'Renewal is at risk but expand motion is live. Executive sponsor engaged. jane@acme.com (415) 555-0101.',
      headings: ['Acme Renewal', 'Decision Criteria'],
      emails: ['jane@acme.com'],
      phones: ['(415) 555-0101'],
      accounts: [{ name: 'Acme', domain: 'acme.com' }],
      people: [{ name: 'Jane Buyer', email: 'jane@acme.com' }],
      signals: [{ text: 'Renewal at risk', source: 'salesforce' }],
      links: [],
      fingerprint: 'sf-1',
    },
    assert(intel, answer) {
      expect(intel.interruptLevel === 'high', 'Salesforce flow should trigger high interrupt');
      expect(intel.opportunities.some((item) => item.type === 'crm-opportunity'), 'Salesforce flow should surface CRM opportunity');
      expect(answer.includes('Warm paths:'), 'Salesforce answer should reference warm path');
    },
  },
  {
    name: 'commonroom-champion',
    prompt: 'Why is this person important?',
    payload: {
      url: 'https://app.commonroom.io/acme/members/jane',
      source: 'commonroom',
      title: 'Jane Buyer activity',
      rawText: 'Champion user with active community engagement and job change momentum.',
      headings: ['Jane Buyer', 'Activity'],
      emails: ['jane@acme.com'],
      phones: [],
      accounts: [{ name: 'Acme', domain: 'acme.com' }],
      people: [{ name: 'Jane Buyer', email: 'jane@acme.com' }],
      signals: [{ text: 'Active in community', source: 'commonroom' }],
      links: [],
      fingerprint: 'cr-1',
    },
    assert(intel, answer) {
      expect(intel.opportunities.some((item) => item.type === 'community-activity'), 'Common Room flow should surface community activity');
      expect(answer.includes('Known account: Acme'), 'Common Room answer should anchor to account');
    },
  },
  {
    name: 'outreach-execution',
    prompt: 'How should I use this Outreach view?',
    payload: {
      url: 'https://app.outreach.io/prospects/123',
      source: 'outreach',
      title: 'Outreach Prospect',
      rawText: 'Positive reply received. Sequence task due. Direct line (415) 555-0101.',
      headings: ['Prospect', 'Activity'],
      emails: ['jane@acme.com'],
      phones: ['(415) 555-0101'],
      accounts: [{ name: 'Acme', domain: 'acme.com' }],
      people: [{ name: 'Jane Buyer', email: 'jane@acme.com' }],
      signals: [{ text: 'Positive reply', source: 'outreach' }],
      links: [],
      fingerprint: 'or-1',
    },
    assert(intel, answer) {
      expect(intel.nextActions.some((item) => item.includes('Outreach view')), 'Outreach flow should give Outreach-specific next move');
      expect(answer.includes('Contact details surfaced:'), 'Outreach answer should reference contact details');
    },
  },
];

async function main() {
  const scenarioResults = [];

  for (const scenario of scenarios) {
    const intel = await buildRabbitIntel(scenario.payload, env, buildClient());
    const answer = buildRabbitAnswer(scenario.prompt, intel, 'Stored context: Acme has an open renewal and prior follow-up.');
    scenario.assert(intel, answer);
    scenarioResults.push({
      name: scenario.name,
      interruptLevel: intel.interruptLevel,
      opportunities: intel.opportunities.map((item) => item.type),
    });
  }

  const selfHeal = await runAutomaticSelfHeal(env, { requestId: 'simulation-self-heal' });
  expect(selfHeal.ok === true, 'Self-heal should complete');
  expect(selfHeal.duplicateJobsSuperseded >= 2, 'Self-heal should supersede duplicate enrich jobs');
  expect(selfHeal.completenessRepaired >= 1, 'Self-heal should repair account completeness');
  expect(selfHeal.learningsUpgraded >= 1, 'Self-heal should upgrade legacy learnings');

  console.log(JSON.stringify({
    ok: true,
    scenarios: scenarioResults,
    selfHeal,
    mutationCount: state.mutations.length,
  }, null, 2));
}

function buildClient() {
  return {
    baseUrl: 'https://demo-project.api.sanity.io/v2023-10-01',
    queryUrl: 'https://demo-project.api.sanity.io/v2023-10-01/data/query/production',
    mutateUrl: 'https://demo-project.api.sanity.io/v2023-10-01/data/mutate/production',
    token: 'demo-token',
  };
}

function queryResult(query) {
  if (query.includes('*[_type == "account" && (domain == "acme.com"')) {
    return state.account;
  }
  if (query.includes('*[_type == "account" && accountKey == "acme-key"][0]')) {
    return state.account;
  }
  if (query.includes('*[_type == "person" && email == "jane@acme.com"')) {
    return state.person;
  }
  if (query.includes('*[_type == "person" && name match "Jane Buyer*"')) {
    return state.person;
  }
  if (query.includes('*[_type == "person" && relatedAccountKey == "acme-key"')) {
    return [state.person];
  }
  if (query.includes('*[_type == "networkPerson" && name match "Jane Buyer*"')) {
    return state.connection;
  }
  if (query.includes('*[_type == "networkPerson" && company match "Acme*"')) {
    return [state.connection];
  }
  if (query.includes('*[_type == "interaction" && (accountKey == "acme-key"')) {
    return state.interactions;
  }
  if (query.includes('*[_type == "learning" && references("account-acme")')) {
    return state.learnings;
  }
  if (query.includes('*[_type == "enrich.job" && status in ["queued", "pending"]')) {
    return state.duplicateJobs;
  }
  if (query.includes('*[_type == "account" && (!defined(profileCompleteness.score) || profileCompleteness.score == 0)]')) {
    return [{ _id: 'account-repair', accountKey: 'repair-key' }];
  }
  if (query.includes('*[_id == "account-repair"][0]')) {
    return state.repairAccount;
  }
  if (query.includes('*[_type == "accountPack" && accountKey == "repair-key"][0]')) {
    return state.repairPack;
  }
  if (query.includes('*[_type == "learning" && (!defined(patternType) || !defined(recommendedActions))]')) {
    return state.legacyLearnings;
  }
  return null;
}

function jsonResponse(payload) {
  return Promise.resolve(new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  }));
}

function expect(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

await main();
