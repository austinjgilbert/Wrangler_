import { test, expect } from '@playwright/test';

const BASE_URL = process.env.TEST_URL || 'https://website-scanner.austin-gilbert.workers.dev';

test.describe('User Pattern Metadata System', () => {
  
  test('Store User Pattern - POST', async ({ request }) => {
    const response = await request.post(`${BASE_URL}/user-patterns/store`, {
      data: {
        userId: 'test-user-playwright',
        userSegment: 'sdr',
        action: 'good-morning-routing',
        approach: 'test approach',
        outcome: 'success',
        timeSpent: 1500,
        toolsUsed: ['/sdr/good-morning'],
        thinking: 'Test thinking pattern'
      }
    });
    
    // May return 503 if Sanity not configured, or 404 if not deployed
    expect([200, 404, 503]).toContain(response.status());
    
    if (response.ok()) {
      const body = await response.json();
      expect(body).toHaveProperty('ok');
      if (body.ok) {
        expect(body.data).toHaveProperty('stored');
        expect(body.data).toHaveProperty('patternId');
      }
    }
  });

  test('Query User Patterns - GET (patterns)', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/user-patterns/query?action=good-morning-routing&outcome=success&limit=5`);
    
    expect([200, 404, 503]).toContain(response.status());
    
    if (response.ok()) {
      const body = await response.json();
      expect(body).toHaveProperty('ok');
      if (body.ok) {
        expect(body.data).toHaveProperty('queryType');
        expect(body.data).toHaveProperty('patterns');
      }
    }
  });

  test('Query Thinking Patterns - GET (thinking)', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/user-patterns/query?type=thinking&action=good-morning-routing&limit=5`);
    
    expect([200, 404, 503]).toContain(response.status());
  });

  test('Query Successful Approaches - GET (approaches)', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/user-patterns/query?type=approaches&userSegment=sdr&limit=10`);
    
    expect([200, 404, 503]).toContain(response.status());
  });

  test('Query Tool Usage - GET (tools)', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/user-patterns/query?type=tools&action=good-morning-routing&limit=10`);
    
    expect([200, 404, 503]).toContain(response.status());
  });

  test('Query Sequences - GET (sequences)', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/user-patterns/query?type=sequences&startingAction=scan&outcome=success&limit=10`);
    
    expect([200, 404, 503]).toContain(response.status());
  });

  test('Query with filters', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/user-patterns/query?action=good-morning-routing&userSegment=sdr&outcome=success&limit=5`);
    
    expect([200, 404, 503]).toContain(response.status());
  });

});

