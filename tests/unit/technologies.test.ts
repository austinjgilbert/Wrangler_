/**
 * Tests for the technologies intelligence handlers.
 *
 * Covers:
 *   - GET /technologies/insights — merged tech docs + AI analysis
 *   - POST /technologies/analyze — trigger analysis with staleness check
 *   - GET /technologies/search — deferred stub
 */
import { describe, expect, it, vi } from 'vitest';
import {
  handleTechInsights,
  handleTechAnalyze,
  handleTechSearch,
} from '../../src/technologies.js';

// ── Mock helpers ─────────────────────────────────────────────────────────

function makeRequest(url: string, method = 'GET', body?: any): Request {
  const init: RequestInit = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) init.body = JSON.stringify(body);
  return new Request(url, init);
}

function parseResponse(response: Response) {
  return response.json();
}

const mockEnv = {};
const assertSanityConfigured = () => ({});  // returns mock client

// Realistic account with technology references + raw technologyStack
const MOCK_ACCOUNT = {
  _id: 'account.adventhealth-com',
  accountKey: 'adventhealth-com',
  companyName: 'AdventHealth',
  domain: 'adventhealth.com',
  canonicalUrl: 'https://adventhealth.com',
  technologyStack: {
    cms: ['WordPress'],
    frameworks: ['React', 'jQuery'],
    analytics: ['Google Analytics', 'Hotjar'],
    hosting: ['Cloudflare'],
    legacySystems: ['WordPress (Legacy)'],
  },
  technologies: [
    { _id: 'technology-wordpress', name: 'WordPress', slug: 'wordpress', category: 'cms', isLegacy: true, isMigrationTarget: false, lastEnrichedAt: '2026-03-20T10:00:00Z' },
    { _id: 'technology-react', name: 'React', slug: 'react', category: 'framework', isLegacy: false, isMigrationTarget: false, lastEnrichedAt: '2026-03-20T10:00:00Z' },
    { _id: 'technology-google-analytics', name: 'Google Analytics', slug: 'google-analytics', category: 'analytics', isLegacy: false, isMigrationTarget: false, lastEnrichedAt: '2026-03-20T10:00:00Z' },
  ],
};

// AccountPack with AI analysis
const MOCK_PACK_WITH_ANALYSIS = {
  _id: 'accountPack.adventhealth-com',
  accountKey: 'adventhealth-com',
  techAnalysisIndex: {
    hasTechAnalysis: true,
    lastAnalyzedAt: '2026-03-21T02:00:00Z',
  },
  techAnalysisData: JSON.stringify({
    technologies: [
      {
        name: 'WordPress',
        status: 'legacy',
        confidence: 85,
        risk: ['Plugin dependency', 'Security patches'],
        opportunity: ['Composable migration'],
        painPoints: ['Slow page loads'],
        targetPersonas: ['Engineering Lead'],
        sellingAngle: 'Legacy WordPress — perfect timing for composable CMS pitch',
        competitorUsage: '42% have migrated off WordPress',
      },
      {
        name: 'React',
        status: 'active',
        confidence: 90,
        risk: [],
        opportunity: ['Modern stack alignment'],
        painPoints: [],
        targetPersonas: ['Frontend Lead'],
        sellingAngle: 'Modern React stack — good foundation for headless CMS',
        competitorUsage: null,
      },
    ],
    summary: {
      stackMaturity: 'mixed',
      migrationReadiness: 0.7,
      topRisks: ['Legacy CMS'],
      topOpportunities: ['Headless migration'],
      overallAssessment: 'Mixed stack with legacy CMS creating drag.',
    },
    rawStackHash: 'h44wl5g',
    generatedAt: '2026-03-21T02:00:00Z',
  }),
};

const MOCK_PACK_NO_ANALYSIS = {
  _id: 'accountPack.adventhealth-com',
  accountKey: 'adventhealth-com',
  techAnalysisIndex: null,
  techAnalysisData: null,
};

/**
 * Create a mock groqQuery that returns different results based on _type filter.
 */
function createMockGroqQuery(account: any, pack: any) {
  return vi.fn().mockImplementation(async (_client: any, query: string) => {
    if (query.includes('_type == "account"')) return account;
    if (query.includes('_type == "accountPack"')) return pack;
    return null;
  });
}

// ── GET /technologies/insights ───────────────────────────────────────────

describe('handleTechInsights', () => {
  it('returns 400 when accountKey is missing', async () => {
    const req = makeRequest('http://localhost/technologies/insights');
    const groq = createMockGroqQuery(null, null);
    const res = await handleTechInsights(req, 'req-1', mockEnv, groq, assertSanityConfigured);
    const body = await parseResponse(res);

    expect(res.status).toBe(400);
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 404 when account not found', async () => {
    const req = makeRequest('http://localhost/technologies/insights?accountKey=nonexistent');
    const groq = createMockGroqQuery(null, null);
    const res = await handleTechInsights(req, 'req-2', mockEnv, groq, assertSanityConfigured);
    const body = await parseResponse(res);

    expect(res.status).toBe(404);
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('returns raw tech data with needsAnalysis: true when no AI analysis exists', async () => {
    const req = makeRequest('http://localhost/technologies/insights?accountKey=adventhealth-com');
    const groq = createMockGroqQuery(MOCK_ACCOUNT, MOCK_PACK_NO_ANALYSIS);
    const res = await handleTechInsights(req, 'req-3', mockEnv, groq, assertSanityConfigured);
    const body = await parseResponse(res);

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data.needsAnalysis).toBe(true);
    expect(body.data.summary).toBeNull();
    expect(body.data.accountKey).toBe('adventhealth-com');
    expect(body.data.companyName).toBe('AdventHealth');

    // Should have technologies from both doc refs and raw stack (deduped)
    const techNames = body.data.technologies.map((t: any) => t.name);
    expect(techNames).toContain('WordPress');
    expect(techNames).toContain('React');
    expect(techNames).toContain('Google Analytics');
    // jQuery and Hotjar from raw stack (not in doc refs)
    expect(techNames).toContain('jQuery');
    expect(techNames).toContain('Hotjar');

    // All should have status but no insights
    for (const tech of body.data.technologies) {
      expect(tech.insights).toBeNull();
      expect(tech.confidence).toBe(0);
    }

    // WordPress should be marked legacy from doc metadata
    const wp = body.data.technologies.find((t: any) => t.name === 'WordPress');
    expect(wp.status).toBe('legacy');

    // Meta should reflect counts
    expect(body.data.meta.totalCount).toBeGreaterThanOrEqual(5);
    expect(body.data.meta.categoryCount).toBeGreaterThanOrEqual(3);
    expect(body.data.meta.lastAnalyzedAt).toBeNull();
  });

  it('returns enriched tech data with AI insights when analysis exists', async () => {
    const req = makeRequest('http://localhost/technologies/insights?accountKey=adventhealth-com');
    const groq = createMockGroqQuery(MOCK_ACCOUNT, MOCK_PACK_WITH_ANALYSIS);
    const res = await handleTechInsights(req, 'req-4', mockEnv, groq, assertSanityConfigured);
    const body = await parseResponse(res);

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data.needsAnalysis).toBe(false);
    expect(body.data.summary).toBeTruthy();
    expect(body.data.summary.stackMaturity).toBe('mixed');
    expect(body.data.summary.migrationReadiness).toBe(0.7);

    // WordPress should have AI insights merged
    const wp = body.data.technologies.find((t: any) => t.name === 'WordPress');
    expect(wp.status).toBe('legacy');
    expect(wp.confidence).toBe(85);
    expect(wp.insights).toBeTruthy();
    expect(wp.insights.sellingAngle).toContain('composable CMS');
    expect(wp.insights.risk).toContain('Plugin dependency');

    // React should have AI insights too
    const react = body.data.technologies.find((t: any) => t.name === 'React');
    expect(react.status).toBe('active');
    expect(react.confidence).toBe(90);

    // Techs without AI insights should still appear (from raw stack)
    const jquery = body.data.technologies.find((t: any) => t.name === 'jQuery');
    expect(jquery).toBeTruthy();
    expect(jquery.insights).toBeNull();

    // Meta should have analysis timestamp
    expect(body.data.meta.lastAnalyzedAt).toBe('2026-03-21T02:00:00Z');
  });

  it('returns grouped technologies by category', async () => {
    const req = makeRequest('http://localhost/technologies/insights?accountKey=adventhealth-com');
    const groq = createMockGroqQuery(MOCK_ACCOUNT, MOCK_PACK_NO_ANALYSIS);
    const res = await handleTechInsights(req, 'req-5', mockEnv, groq, assertSanityConfigured);
    const body = await parseResponse(res);

    expect(body.data.grouped).toBeTruthy();
    expect(body.data.grouped.cms).toBeTruthy();
    expect(body.data.grouped.cms.length).toBeGreaterThanOrEqual(1);
    expect(body.data.grouped.cms[0].name).toBe('WordPress');
  });

  it('deduplicates technologies from doc refs and raw stack', async () => {
    const req = makeRequest('http://localhost/technologies/insights?accountKey=adventhealth-com');
    const groq = createMockGroqQuery(MOCK_ACCOUNT, MOCK_PACK_NO_ANALYSIS);
    const res = await handleTechInsights(req, 'req-6', mockEnv, groq, assertSanityConfigured);
    const body = await parseResponse(res);

    // WordPress appears in both technologies[] refs and technologyStack.cms
    // Should only appear once, from the doc ref (authoritative)
    const wpCount = body.data.technologies.filter((t: any) => t.name === 'WordPress').length;
    expect(wpCount).toBe(1);

    // The WordPress entry should be from enrichment (doc ref), not scan
    const wp = body.data.technologies.find((t: any) => t.name === 'WordPress');
    expect(wp.source).toBe('enrichment');
  });
});

// ── POST /technologies/analyze ───────────────────────────────────────────

describe('handleTechAnalyze', () => {
  it('returns 400 when accountKey is missing', async () => {
    const req = makeRequest('http://localhost/technologies/analyze', 'POST', {});
    const groq = createMockGroqQuery(null, null);
    const res = await handleTechAnalyze(req, 'req-10', mockEnv, groq, vi.fn(), assertSanityConfigured, null);
    const body = await parseResponse(res);

    expect(res.status).toBe(400);
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 404 when account not found', async () => {
    const req = makeRequest('http://localhost/technologies/analyze', 'POST', { accountKey: 'nonexistent' });
    const groq = createMockGroqQuery(null, null);
    const res = await handleTechAnalyze(req, 'req-11', mockEnv, groq, vi.fn(), assertSanityConfigured, null);
    const body = await parseResponse(res);

    expect(res.status).toBe(404);
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('returns 400 when account has no technology data', async () => {
    const emptyAccount = { ...MOCK_ACCOUNT, technologyStack: {}, technologies: [] };
    const req = makeRequest('http://localhost/technologies/analyze', 'POST', { accountKey: 'adventhealth-com' });
    const groq = createMockGroqQuery(emptyAccount, MOCK_PACK_NO_ANALYSIS);
    const res = await handleTechAnalyze(req, 'req-12', mockEnv, groq, vi.fn(), assertSanityConfigured, null);
    const body = await parseResponse(res);

    expect(res.status).toBe(400);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.message).toContain('No technology data');
  });

  it('returns already_analyzed when insights exist and stack unchanged', async () => {
    const req = makeRequest('http://localhost/technologies/analyze', 'POST', { accountKey: 'adventhealth-com' });
    const groq = createMockGroqQuery(MOCK_ACCOUNT, MOCK_PACK_WITH_ANALYSIS);
    const res = await handleTechAnalyze(req, 'req-13', mockEnv, groq, vi.fn(), assertSanityConfigured, null);
    const body = await parseResponse(res);

    expect(res.status).toBe(200);
    expect(body.data.status).toBe('already_analyzed');
    expect(body.data.lastAnalyzedAt).toBe('2026-03-21T02:00:00Z');
  });

  it('triggers analysis when force: true even if insights exist', async () => {
    const req = makeRequest('http://localhost/technologies/analyze', 'POST', { accountKey: 'adventhealth-com', force: true });
    const groq = createMockGroqQuery(MOCK_ACCOUNT, MOCK_PACK_WITH_ANALYSIS);
    const res = await handleTechAnalyze(req, 'req-14', mockEnv, groq, vi.fn(), assertSanityConfigured, null);
    const body = await parseResponse(res);

    expect(res.status).toBe(200);
    expect(body.data.status).toBe('analyzing');
    expect(body.data.technologiesQueued).toBeGreaterThan(0);
    expect(body.data.rawStackHash).toBeTruthy();
  });

  it('triggers analysis when no prior insights exist', async () => {
    const req = makeRequest('http://localhost/technologies/analyze', 'POST', { accountKey: 'adventhealth-com' });
    const groq = createMockGroqQuery(MOCK_ACCOUNT, MOCK_PACK_NO_ANALYSIS);
    const res = await handleTechAnalyze(req, 'req-15', mockEnv, groq, vi.fn(), assertSanityConfigured, null);
    const body = await parseResponse(res);

    expect(res.status).toBe(200);
    expect(body.data.status).toBe('analyzing');
    expect(body.data.technologiesQueued).toBeGreaterThanOrEqual(5);
  });
});

// ── GET /technologies/search (deferred stub) ─────────────────────────────

describe('handleTechSearch', () => {
  it('returns empty results with coming-soon message', async () => {
    const req = makeRequest('http://localhost/technologies/search?tech=WordPress');
    const res = await handleTechSearch(req, 'req-20');
    const body = await parseResponse(res);

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data.accounts).toEqual([]);
    expect(body.data.total).toBe(0);
    expect(body.data.query.tech).toBe('WordPress');
    expect(body.data.message).toContain('coming');
  });

  it('passes through category query param', async () => {
    const req = makeRequest('http://localhost/technologies/search?category=cms');
    const res = await handleTechSearch(req, 'req-21');
    const body = await parseResponse(res);

    expect(body.data.query.category).toBe('cms');
  });
});
