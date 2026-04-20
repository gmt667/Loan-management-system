import { test, expect } from '@playwright/test';
import { ANALYST_TEST_CLIENT, analystSeed, loginAs } from './test-helpers';

async function openAnalystQueue(page: import('@playwright/test').Page) {
  await loginAs(page, 'analyst@fastkwacha.com', 'analyst123', analystSeed);
  await expect(page.getByRole('heading', { name: /Risk Assessment Terminal|Risk Pipeline|Analyst Console/i }).first()).toBeVisible({ timeout: 20000 });
  await page.getByRole('button', { name: /work queue/i }).click();
  const applicantRow = page.getByText(new RegExp(ANALYST_TEST_CLIENT, 'i')).first();
  await expect(applicantRow).toBeVisible({ timeout: 10000 });
  await applicantRow.click();
}

test.describe('Credit Analyst E2E Flow', () => {
  test('Verify Analyst Dashboard and Fallback Integrations', async ({ page }) => {
    test.setTimeout(90000);

    const consoleLogs: string[] = [];
    page.on('console', msg => {
      const text = msg.text();
      consoleLogs.push(text);
      console.log(`BROWSER_LOG: ${text}`);
    });

    // 1. Visit application with a deterministic analyst queue item
    await loginAs(page, 'analyst@fastkwacha.com', 'analyst123', analystSeed);

    // 2. Wait for Analyst Console
    await expect(page.getByRole('heading', { name: /Risk Assessment Terminal|Risk Pipeline|Analyst Console/i }).first()).toBeVisible({ timeout: 20000 });

    // 3. Navigate to Analysis Queue
    console.log('Attempting to switch to QUEUE tab...');
    const queueTab = page.getByRole('button', { name: /work queue/i });
    
    // Try regular click
    await queueTab.click();
    
    // Check if it switched. If not, try forced click or evaluate
    try {
      await expect(page.getByText(new RegExp(ANALYST_TEST_CLIENT, 'i')).first()).toBeVisible({ timeout: 5000 });
    } catch (e) {
      console.log('Regular click failed to switch tab, trying forced click...');
      await queueTab.click({ force: true });
      try {
        await expect(page.getByText(new RegExp(ANALYST_TEST_CLIENT, 'i')).first()).toBeVisible({ timeout: 5000 });
      } catch (e2) {
        throw e2;
      }
    }

    // 4. Verify Applicant
    const applicantRow = page.getByText(new RegExp(ANALYST_TEST_CLIENT, 'i')).first();
    await expect(applicantRow).toBeVisible({ timeout: 10000 });
    await applicantRow.click();

    // 5. Referral Flow
    await page.getByRole('button', { name: /^refer back$/i }).click();
    const textarea = page.locator('textarea');
    await expect(textarea).toBeVisible();
    await textarea.fill('Needs secondary proof of income (Programmatic Test V14)');
    await page.getByRole('button', { name: /need clarification/i }).click();
    await page.getByRole('button', { name: /commit recommendation to manager/i }).click();

    // 6. Confirm handoff from the analyst queue in local state
    const applicationState = await page.evaluate(() => JSON.parse(window.localStorage.getItem('fastkwacha_local_apps') || '[]'));
    expect(applicationState.find((app: any) => app.id === 'analyst-app-1')?.current_stage).toBe('REFERRED_BACK');
    
    console.log('E2E Test Finalized Successfully!');
  });

  test('Complete Analysis advances the analyst case without errors', async ({ page }) => {
    await openAnalystQueue(page);

    await page.getByRole('button', { name: /^approve$/i }).click();
    await page.getByRole('button', { name: /strong income/i }).click();
    await page.locator('textarea').fill('Strong income stability and acceptable bureau profile for escalation to manager.');
    await page.getByRole('button', { name: /commit recommendation to manager/i }).click();

    const applicationState = await page.evaluate(() => JSON.parse(window.localStorage.getItem('fastkwacha_local_apps') || '[]'));
    expect(applicationState.find((app: any) => app.id === 'analyst-app-1')?.current_stage).toBe('ANALYZED');
  });

  test('Recommend Rejection removes the analyst case without errors', async ({ page }) => {
    await openAnalystQueue(page);

    await page.getByRole('button', { name: /^reject$/i }).click();
    await page.getByRole('button', { name: /insufficient income/i }).click();
    await page.locator('textarea').fill('Income evidence is insufficient for this requested amount.');
    await page.getByRole('button', { name: /commit recommendation to manager/i }).click();

    const applicationState = await page.evaluate(() => JSON.parse(window.localStorage.getItem('fastkwacha_local_apps') || '[]'));
    expect(applicationState.find((app: any) => app.id === 'analyst-app-1')?.current_stage).toBe('ANALYZED');
  });
});
