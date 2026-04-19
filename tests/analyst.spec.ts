import { test, expect } from '@playwright/test';
import { ANALYST_TEST_CLIENT, analystSeed, loginAs } from './test-helpers';

async function openAnalystQueue(page: import('@playwright/test').Page) {
  await loginAs(page, 'analyst@fastkwacha.com', 'analyst123', analystSeed);
  await expect(page.getByText(/Risk Pipeline|Analyst Console/i).first()).toBeVisible({ timeout: 20000 });
  await page.getByTestId('tab-QUEUE').click();
  await expect(page.getByText(/Analyst Queue \(/i)).toBeVisible({ timeout: 15000 });
  const applicantRow = page.getByTestId('queue-item').first();
  await expect(applicantRow).toBeVisible({ timeout: 10000 });
  await expect(applicantRow).toContainText(new RegExp(ANALYST_TEST_CLIENT, 'i'));
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
    await expect(page.getByText(/Risk Pipeline|Analyst Console/i).first()).toBeVisible({ timeout: 20000 });

    // 3. Navigate to Analysis Queue
    console.log('Attempting to switch to QUEUE tab...');
    const queueTab = page.getByTestId('tab-QUEUE');
    
    // Try regular click
    await queueTab.click();
    
    // Check if it switched. If not, try forced click or evaluate
    try {
      await expect(page.getByText(/Analyst Queue \(/i)).toBeVisible({ timeout: 5000 });
    } catch (e) {
      console.log('Regular click failed to switch tab, trying forced click...');
      await queueTab.click({ force: true });
      try {
        await expect(page.getByText(/Analyst Queue \(/i)).toBeVisible({ timeout: 5000 });
      } catch (e2) {
        console.log('Forced click failed, using evaluate...');
        await page.evaluate(() => {
          const btn = document.querySelector('[data-testid="tab-QUEUE"]') as HTMLButtonElement;
          if (btn) btn.click();
        });
      }
    }

    // Wait for the heading to appear
    await expect(page.getByText(/Analyst Queue \(/i)).toBeVisible({ timeout: 15000 });

    // 4. Verify Applicant
    const applicantRow = page.getByTestId('queue-item').first();
    await applicantRow.waitFor({ state: 'attached', timeout: 10000 });
    await expect(applicantRow).toBeVisible({ timeout: 10000 });
    await expect(applicantRow).toContainText(new RegExp(ANALYST_TEST_CLIENT, 'i'));
    await applicantRow.click();

    // 5. Manual CRB Flow
    await page.getByRole('button', { name: /MANUAL CRB/i }).click();
    const scoreInput = page.locator('input[type="number"]').first();
    await expect(scoreInput).toBeVisible();
    await scoreInput.fill('710');
    // The button text in App.tsx is "Commit to Immutable Audit"
    await page.getByRole('button', { name: /commit/i }).click();

    // 6. Referral Flow
    await page.getByRole('button', { name: /refer back/i }).first().click();
    const textarea = page.locator('textarea');
    await expect(textarea).toBeVisible();
    await textarea.fill('Needs secondary proof of income (Programmatic Test V14)');
    await page.getByRole('button', { name: /income clarification required/i }).click();
    await page.getByRole('button', { name: /confirm decision/i }).click();

    // 7. History Check
    console.log('Switching to HISTORY tab...');
    await page.getByTestId('tab-HISTORY').click({ force: true });
    await expect(page.getByText(/Programmatic Test V14|Manual CRB/i).first()).toBeVisible({ timeout: 15000 });
    
    console.log('E2E Test Finalized Successfully!');
  });

  test('Complete Analysis advances the analyst case without errors', async ({ page }) => {
    await openAnalystQueue(page);

    await page.getByRole('button', { name: /complete analysis/i }).click();
    await page.getByRole('button', { name: /strong income stability/i }).click();
    await page.getByRole('button', { name: /confirm decision/i }).click();

    await expect(page.getByText(/No applications in analysis\./i)).toBeVisible({ timeout: 15000 });
  });

  test('Recommend Rejection removes the analyst case without errors', async ({ page }) => {
    await openAnalystQueue(page);

    await page.getByRole('button', { name: /recommend rejection/i }).click();
    await page.getByRole('button', { name: /insufficient income/i }).click();
    await page.locator('textarea').last().fill('Income evidence is insufficient for this requested amount.');
    await page.getByRole('button', { name: /confirm decision/i }).click();

    await expect(page.getByText(/No applications in analysis\./i)).toBeVisible({ timeout: 15000 });
  });
});
