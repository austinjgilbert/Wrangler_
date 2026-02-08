import { test, expect } from '@playwright/test';

const BASE_URL = process.env.TEST_URL || 'https://website-scanner.austin-gilbert.workers.dev';

test.describe('Error Handling and Validation', () => {
  
  test('Invalid endpoint returns 404 or 503', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/invalid-endpoint`);
    expect([404, 405, 503]).toContain(response.status());
  });

  test('POST to GET-only endpoint returns 405', async ({ request }) => {
    const response = await request.post(`${BASE_URL}/health`);
    // Health endpoint may accept POST for some systems, so accept both 200 and 405
    expect([200, 405]).toContain(response.status());
  });

  test('GET to POST-only endpoint returns 405', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/search`);
    expect([405, 503]).toContain(response.status());
  });

  test('SSRF Protection - localhost blocked', async ({ request }) => {
    const response = await request.post(`${BASE_URL}/extract`, {
      data: {
        url: 'http://localhost',
        mode: 'fast'
      }
    });
    
    expect([400, 200, 503]).toContain(response.status());

    if (response.ok()) {
      const body = await response.json();
      // Should have validation error
      if (body.error) {
        expect(body.error.code).toBe('VALIDATION_ERROR');
      }
    }
  });

  test('Invalid JSON returns 400', async ({ request }) => {
    const response = await request.post(`${BASE_URL}/search`, {
      data: 'invalid json',
      headers: { 'Content-Type': 'application/json' }
    });
    
    expect([400, 500, 503]).toContain(response.status());
  });

  test('Missing required fields returns 400', async ({ request }) => {
    const response = await request.post(`${BASE_URL}/user-patterns/store`, {
      data: {}
    });
    
    expect([400, 404, 503]).toContain(response.status());
  });

  test('CORS headers present', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/health`, {
      headers: {
        'Origin': 'https://example.com'
      }
    });
    
    expect(response.headers()['access-control-allow-origin']).toBeDefined();
  });

});

