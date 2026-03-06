import { test, expect } from '@playwright/test';

const BASE_URL = process.env.TEST_URL || 'http://localhost:8787';

test.describe('Account Plan Context Generator', () => {

  // ── HTML Page ─────────────────────────────────────────────────────────

  test('Context page loads with all input elements', async ({ page }) => {
    const response = await page.goto(`${BASE_URL}/account-plan/context`);
    expect(response.status()).toBe(200);
    await expect(page).toHaveTitle(/Account Plan Context/);

    // Input elements present
    await expect(page.locator('#accountName')).toBeVisible();
    await expect(page.locator('#rawInput')).toBeVisible();
    await expect(page.locator('#uploadZone')).toBeVisible();
    await expect(page.locator('#generateBtn')).toBeVisible();
    await expect(page.locator('#addSourceBtn')).toBeVisible();
  });

  test('Context page accepts query params (accountName, draftId)', async ({ page }) => {
    await page.goto(`${BASE_URL}/account-plan/context?accountName=Acme+Corp`);
    const value = await page.locator('#accountName').inputValue();
    expect(value).toBe('Acme Corp');
  });

  test('Generate button shows error when account name is empty', async ({ page }) => {
    await page.goto(`${BASE_URL}/account-plan/context`);
    await page.locator('#generateBtn').click();
    // Status should show error
    const status = page.locator('#status');
    await expect(status).toContainText(/account name/i);
    await expect(status).toHaveClass(/status--error/);
  });

  test('Generate button shows error when no input provided', async ({ page }) => {
    await page.goto(`${BASE_URL}/account-plan/context`);
    await page.locator('#accountName').fill('Test Corp');
    await page.locator('#generateBtn').click();
    const status = page.locator('#status');
    await expect(status).toContainText(/research input|screenshot|captured source/i);
  });

  test('Can add and remove captured sources', async ({ page }) => {
    await page.goto(`${BASE_URL}/account-plan/context`);
    const input = page.locator('#addSourceInput');
    const addBtn = page.locator('#addSourceBtn');
    const chips = page.locator('#capturedChips');

    // Add a URL source
    await input.fill('https://linkedin.com/company/acme');
    await addBtn.click();
    await expect(chips.locator('.chip')).toHaveCount(1);
    await expect(chips).toContainText('URL');

    // Add a note source
    await input.fill('CEO mentioned migration plans');
    await addBtn.click();
    await expect(chips.locator('.chip')).toHaveCount(2);
    await expect(chips).toContainText('Note');

    // Remove first chip
    await chips.locator('.chip-remove').first().click();
    await expect(chips.locator('.chip')).toHaveCount(1);
  });

  test('Output card is hidden initially', async ({ page }) => {
    await page.goto(`${BASE_URL}/account-plan/context`);
    const outputCard = page.locator('#outputCard');
    await expect(outputCard).toBeHidden();
  });

  // ── API Endpoints ─────────────────────────────────────────────────────

  test('POST /account-plan/context/generate returns 400 without accountName', async ({ request }) => {
    const response = await request.post(`${BASE_URL}/account-plan/context/generate`, {
      data: { rawInputText: 'some text' },
    });
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.message).toMatch(/accountName/);
  });

  test('POST /account-plan/context/generate returns 503 when LLM not configured', async ({ request }) => {
    // When LLM_API_KEY is not set, the generate endpoint should return a clear error
    const response = await request.post(`${BASE_URL}/account-plan/context/generate`, {
      data: {
        accountName: 'Test Corp',
        rawInputText: 'Test Corp is a 200-person B2B SaaS company in fintech.',
      },
    });
    const body = await response.json();
    // Either 503 (LLM not configured) or 500 (generate error wrapping LLM error) or 200 (LLM is configured)
    expect([200, 500, 503]).toContain(response.status());
    expect(body).toHaveProperty('ok');
    expect(body).toHaveProperty('requestId');

    if (response.status() === 200 && body.ok) {
      // LLM IS configured — validate the response shape
      expect(body.data).toHaveProperty('salesNavigator');
      expect(body.data).toHaveProperty('intentSignals');
      expect(body.data).toHaveProperty('stakeholders');
      expect(body.data).toHaveProperty('additionalContext');
      expect(typeof body.data.salesNavigator).toBe('string');
      expect(typeof body.data.intentSignals).toBe('string');
      expect(typeof body.data.stakeholders).toBe('string');
      expect(typeof body.data.additionalContext).toBe('string');
    } else {
      // LLM not configured — error message should mention key/config
      expect(body.error.message).toMatch(/LLM|API|key|configured/i);
    }
  });

  test('POST /account-plan/context/save stores and returns draftId', async ({ request }) => {
    const response = await request.post(`${BASE_URL}/account-plan/context/save`, {
      data: {
        accountName: 'Playwright Test Corp',
        rawInputText: 'Test research input from Playwright.',
        outputSalesNavigator: 'Test sales navigator output.',
        outputIntentSignals: 'Test intent signals output.',
        outputStakeholders: 'Test stakeholders output.',
        outputAdditionalContext: 'Test additional context output.',
      },
    });

    // Sanity might not be configured in all environments
    expect([200, 503]).toContain(response.status());
    const body = await response.json();
    expect(body).toHaveProperty('ok');

    if (response.status() === 200 && body.ok) {
      expect(body.data).toHaveProperty('draftId');
      expect(body.data.draftId).toMatch(/^abmDraft-/);
      expect(body.data).toHaveProperty('createdAt');
    }
  });

  test('POST /account-plan/context/save returns 400 without accountName', async ({ request }) => {
    const response = await request.post(`${BASE_URL}/account-plan/context/save`, {
      data: {
        outputSalesNavigator: 'stuff',
        outputIntentSignals: 'stuff',
        outputStakeholders: 'stuff',
        outputAdditionalContext: 'stuff',
      },
    });
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  test('GET /account-plan/context/recent returns drafts array', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/account-plan/context/recent`);
    expect([200, 503]).toContain(response.status());
    const body = await response.json();
    expect(body).toHaveProperty('ok');

    if (response.status() === 200 && body.ok) {
      expect(body.data).toHaveProperty('drafts');
      expect(Array.isArray(body.data.drafts)).toBe(true);
    }
  });

  test('GET /account-plan/context/recent filters by accountName', async ({ request }) => {
    const response = await request.get(
      `${BASE_URL}/account-plan/context/recent?accountName=Playwright+Test+Corp`
    );
    expect([200, 503]).toContain(response.status());
    const body = await response.json();

    if (response.status() === 200 && body.ok) {
      expect(body.data).toHaveProperty('drafts');
      expect(Array.isArray(body.data.drafts)).toBe(true);
      // All returned drafts should match the account name
      for (const draft of body.data.drafts) {
        expect(draft.accountName).toBe('Playwright Test Corp');
      }
    }
  });

  test('GET /account-plan/context/draft/:id returns 404 for nonexistent draft', async ({ request }) => {
    const response = await request.get(
      `${BASE_URL}/account-plan/context/draft/nonexistent-draft-id-xyz`
    );
    expect([404, 503]).toContain(response.status());
    const body = await response.json();
    expect(body.ok).toBe(false);
  });

  test('POST /account-plan/context/ingest creates a draft from extension data', async ({ request }) => {
    const response = await request.post(`${BASE_URL}/account-plan/context/ingest`, {
      data: {
        accountName: 'Extension Test Corp',
        selectedText: 'CEO John Smith mentioned plans to migrate from WordPress to a headless CMS.',
        pageUrl: 'https://linkedin.com/company/extension-test',
        pageTitle: 'Extension Test Corp | LinkedIn',
      },
    });

    expect([200, 503]).toContain(response.status());
    const body = await response.json();
    expect(body).toHaveProperty('ok');

    if (response.status() === 200 && body.ok) {
      expect(body.data).toHaveProperty('draftId');
      expect(body.data.draftId).toMatch(/^abmDraft-/);
      expect(body.data).toHaveProperty('accountName');
    }
  });

  // ── Method enforcement ────────────────────────────────────────────────

  test('GET /account-plan/context/generate returns 405 (POST required)', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/account-plan/context/generate`);
    expect(response.status()).toBe(405);
  });

  test('GET /account-plan/context/save returns 405 (POST required)', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/account-plan/context/save`);
    expect(response.status()).toBe(405);
  });

  test('POST /account-plan/context/recent returns 405 (GET required)', async ({ request }) => {
    const response = await request.post(`${BASE_URL}/account-plan/context/recent`, { data: {} });
    expect(response.status()).toBe(405);
  });

  // ── Save + Fetch round-trip ───────────────────────────────────────────

  test('Save then fetch draft by ID round-trip', async ({ request }) => {
    // Save a draft
    const saveResponse = await request.post(`${BASE_URL}/account-plan/context/save`, {
      data: {
        accountName: 'Round Trip Test Corp',
        rawInputText: 'Round trip test data.',
        outputSalesNavigator: 'Sales Nav block.',
        outputIntentSignals: 'Intent block.',
        outputStakeholders: 'Stakeholders block.',
        outputAdditionalContext: 'Additional block.',
      },
    });

    if (saveResponse.status() !== 200) {
      test.skip(true, 'Sanity not configured — skipping round-trip test');
      return;
    }

    const saveBody = await saveResponse.json();
    expect(saveBody.ok).toBe(true);
    const draftId = saveBody.data.draftId;

    // Fetch it back
    const fetchResponse = await request.get(
      `${BASE_URL}/account-plan/context/draft/${encodeURIComponent(draftId)}`
    );
    expect(fetchResponse.status()).toBe(200);
    const fetchBody = await fetchResponse.json();
    expect(fetchBody.ok).toBe(true);
    expect(fetchBody.data.draft.accountName).toBe('Round Trip Test Corp');
    expect(fetchBody.data.draft.outputSalesNavigator).toBe('Sales Nav block.');
    expect(fetchBody.data.draft.outputIntentSignals).toBe('Intent block.');
    expect(fetchBody.data.draft.outputStakeholders).toBe('Stakeholders block.');
    expect(fetchBody.data.draft.outputAdditionalContext).toBe('Additional block.');
  });
});
