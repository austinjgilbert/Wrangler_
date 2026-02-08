import { test, expect } from '@playwright/test';

const BASE_URL = process.env.TEST_URL || 'http://localhost:8787';

test.describe('Account Page', () => {
  test('Account page renders for sanity.io', async ({ page }) => {
    const response = await page.goto(`${BASE_URL}/accounts/sanity.io`);
    expect(response.status()).toBe(200);
    await expect(page).toHaveTitle(/Account|sanity\.io/);
    // Page should render HTML with account content
    const body = await page.locator('body').textContent();
    expect(body).toBeTruthy();
    expect(body?.toLowerCase()).toMatch(/sanity|account|profile|completeness|technology/i);
  });

  test('Account page with query param', async ({ page }) => {
    const response = await page.goto(`${BASE_URL}/account-page?domain=sanity.io`);
    expect(response.status()).toBe(200);
    const body = await page.locator('body').textContent();
    expect(body).toBeTruthy();
    expect(body?.toLowerCase()).toMatch(/sanity|account/i);
  });

  test('Account page without domain shows usage', async ({ page }) => {
    const response = await page.goto(`${BASE_URL}/account-page`);
    expect(response.status()).toBe(200);
    await expect(page.locator('body')).toContainText(/account-page|domain/);
  });

  test('Account page for unknown domain returns 404 with message', async ({ page }) => {
    const response = await page.goto(`${BASE_URL}/accounts/this-domain-definitely-does-not-exist-xyz.invalid`);
    expect(response.status()).toBe(404);
    await expect(page.locator('body')).toContainText(/not found|scan/i);
  });
});
