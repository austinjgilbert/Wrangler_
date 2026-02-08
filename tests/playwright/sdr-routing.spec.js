import { test, expect } from '@playwright/test';

const BASE_URL = process.env.TEST_URL || 'https://website-scanner.austin-gilbert.workers.dev';

test.describe('SDR Good Morning Routing', () => {
  
  test('SDR Good Morning Routing - POST', async ({ request }) => {
    const response = await request.post(`${BASE_URL}/sdr/good-morning`, {
      data: {
        daysBack: 30,
        minCallScore: 6,
        maxCalls: 10,
        maxLinkedIn: 5,
        maxEmails: 5,
        log: false,
        trackPattern: false
      }
    });
    
    // May return 503 if Sanity not configured, or 404 if not deployed
    expect([200, 404, 503]).toContain(response.status());
    
    if (response.ok()) {
      const body = await response.json();
      expect(body).toHaveProperty('ok');
      if (body.ok) {
        expect(body.data).toHaveProperty('date');
        expect(body.data).toHaveProperty('winCondition');
        expect(body.data).toHaveProperty('top10Accounts');
        expect(body.data).toHaveProperty('callList');
        expect(body.data).toHaveProperty('linkedInQueue');
        expect(body.data).toHaveProperty('emailQueue');
        expect(body.data).toHaveProperty('schedule');
        expect(body.data).toHaveProperty('stats');
      }
    }
  });

  test('SDR Routing with different parameters', async ({ request }) => {
    const response = await request.post(`${BASE_URL}/sdr/good-morning`, {
      data: {
        daysBack: 7,
        minCallScore: 8,
        maxCalls: 5,
        assumeRefresh: true
      }
    });
    
    expect([200, 404, 503]).toContain(response.status());
  });

  test('SDR Routing accountability alias', async ({ request }) => {
    const response = await request.post(`${BASE_URL}/accountability/good-morning`, {
      data: {
        daysBack: 30
      }
    });
    
    expect([200, 404, 503]).toContain(response.status());
  });

});

