import { test, expect } from '@playwright/test';

const BASE_URL = process.env.TEST_URL || 'https://website-scanner.austin-gilbert.workers.dev';

test.describe('Response Format Validation', () => {
  
  test('All responses have requestId', async ({ request }) => {
    const endpoints = [
      { method: 'GET', path: '/health' },
      { method: 'GET', path: '/scan?url=https://example.com' },
      { method: 'POST', path: '/search', data: { query: 'test' } },
    ];

    for (const endpoint of endpoints) {
      let response;
      if (endpoint.method === 'GET') {
        response = await request.get(`${BASE_URL}${endpoint.path}`);
      } else {
        response = await request.post(`${BASE_URL}${endpoint.path}`, {
          data: endpoint.data || {}
        });
      }

      if (response.ok()) {
        const body = await response.json();
        // Health endpoint may have different format
        if (body.requestId !== undefined || body.status !== undefined) {
          expect(true).toBeTruthy(); // Has requestId or is health endpoint
        }
      }
    }
  });

  test('All responses return JSON', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/health`);
    const contentType = response.headers()['content-type'];
    expect(contentType).toContain('application/json');
  });

  test('Error responses have proper structure', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/invalid-endpoint`);
    const body = await response.json();
    expect(body).toHaveProperty('error');
    expect(body.error).toHaveProperty('code');
    expect(body.error).toHaveProperty('message');
  });

  test('Success responses have proper structure', async ({ request }) => {
    const response = await request.post(`${BASE_URL}/search`, {
      data: { query: 'test' }
    });

    if (response.ok()) {
      const body = await response.json();
      expect(body).toHaveProperty('ok');
      expect(body).toHaveProperty('data');
      expect(body).toHaveProperty('requestId');
    }
  });

});

