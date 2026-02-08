import { test, expect } from '@playwright/test';

const BASE_URL = process.env.TEST_URL || 'https://website-scanner.austin-gilbert.workers.dev';

test.describe('API Endpoints - Complete System Test', () => {
  
  test('Health Check Endpoint', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/health`);
    
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body).toHaveProperty('status');
  });

  test('Scan Endpoint - GET', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/scan?url=https://example.com`);
    expect([200, 503]).toContain(response.status());
    const body = await response.json();
    expect(body).toHaveProperty('ok');
    if (response.ok() && body.ok && body.data) {
      expect(body.data).toHaveProperty('stored');
      if (body.data.stored) {
        expect(body.data.stored).toHaveProperty('accountKey');
      }
    }
  });

  test('Search Endpoint - POST', async ({ request }) => {
    const response = await request.post(`${BASE_URL}/search`, {
      data: { query: 'test search query', limit: 5 }
    });
    expect([200, 503]).toContain(response.status());
    const body = await response.json();
    expect(body).toHaveProperty('ok');
    expect(body).toHaveProperty('requestId');
  });

  test('Discover Endpoint - POST', async ({ request }) => {
    const response = await request.post(`${BASE_URL}/discover`, {
      data: { url: 'https://example.com', budget: 10 }
    });
    expect([200, 503]).toContain(response.status());
    const body = await response.json();
    expect(body).toHaveProperty('ok');
    expect(body).toHaveProperty('requestId');
  });

  test('Crawl Endpoint - POST', async ({ request }) => {
    const response = await request.post(`${BASE_URL}/crawl`, {
      data: { url: 'https://example.com', depth: 1, budget: 5 }
    });
    expect([200, 503]).toContain(response.status());
    const body = await response.json();
    expect(body).toHaveProperty('ok');
  });

  test('Extract Endpoint - POST', async ({ request }) => {
    const response = await request.post(`${BASE_URL}/extract`, {
      data: { url: 'https://example.com', mode: 'fast' }
    });
    expect([200, 503]).toContain(response.status());
    const body = await response.json();
    expect(body).toHaveProperty('ok');
    if (response.ok() && body.ok && body.data) {
      expect(body.data).toHaveProperty('excerpts');
      expect(body.data).toHaveProperty('finalUrl');
    }
  });

  test('Verify Endpoint - POST', async ({ request }) => {
    const response = await request.post(`${BASE_URL}/verify`, {
      data: { claims: ['Test claim'], sources: ['https://example.com'] }
    });
    expect([200, 503]).toContain(response.status());
    const body = await response.json();
    expect(body).toHaveProperty('ok');
  });

  test('Query Endpoint - POST', async ({ request }) => {
    const response = await request.post(`${BASE_URL}/query`, {
      data: {
        query: '*[_type == "account"][0...5]'
      }
    });
    
    // May return 503 if Sanity not configured, which is acceptable
    expect([200, 503]).toContain(response.status());
  });

});

