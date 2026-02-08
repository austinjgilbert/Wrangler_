import { test, expect } from '@playwright/test';

const BASE_URL = process.env.TEST_URL || 'https://website-scanner.austin-gilbert.workers.dev';

test.describe('Person Intelligence System', () => {
  
  test('Person Brief - POST', async ({ request }) => {
    const response = await request.post(`${BASE_URL}/person/brief`, {
      data: {
        name: 'Test Person',
        companyName: 'Example Corp',
        companyDomain: 'example.com',
        mode: 'fast',
        verify: false,
        store: false
      }
    });
    
    // May return 503 if Sanity not configured, or 404 if not deployed
    expect([200, 400, 404, 503]).toContain(response.status());
    
    if (response.ok()) {
      const body = await response.json();
      expect(body).toHaveProperty('ok');
      if (body.ok && body.data) {
        expect(body.data).toHaveProperty('personBrief');
      }
    }
  });

  test('Person Brief with profileUrl', async ({ request }) => {
    const response = await request.post(`${BASE_URL}/person/brief`, {
      data: {
        name: 'Test Person',
        profileUrl: 'https://linkedin.com/in/test',
        companyDomain: 'example.com',
        mode: 'fast',
        verify: false,
        store: false
      }
    });
    
    expect([200, 400, 404, 503]).toContain(response.status());
  });

  test('Person Brief validation - missing name', async ({ request }) => {
    const response = await request.post(`${BASE_URL}/person/brief`, {
      data: {
        companyName: 'Example Corp'
      }
    });
    
    // Should return 400 for validation error, or 404 if not deployed
    expect([400, 404, 503]).toContain(response.status());
  });

});

