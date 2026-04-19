# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: analyst.spec.ts >> Credit Analyst E2E Flow >> Complete Analysis advances the analyst case without errors
- Location: tests\analyst.spec.ts:90:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByTestId('queue-item').first()
Expected: visible
Timeout: 10000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 10000ms
  - waiting for getByTestId('queue-item').first()

```

# Page snapshot

```yaml
- generic [ref=e2]:
  - region "Notifications alt+T"
  - generic [ref=e3]:
    - complementary [ref=e4]:
      - generic [ref=e5]:
        - img [ref=e7]
        - heading "FASTKWACHA" [level=1] [ref=e13]
      - navigation [ref=e14]:
        - button "Dashboard" [ref=e15]:
          - img [ref=e17]
          - generic [ref=e22]: Dashboard
        - button "Audit Logs" [ref=e23]:
          - img [ref=e25]
          - generic [ref=e27]: Audit Logs
        - button "Repayment Audit" [ref=e28]:
          - img [ref=e30]
          - generic [ref=e33]: Repayment Audit
        - button "Transactions Audit" [ref=e34]:
          - img [ref=e36]
          - generic [ref=e40]: Transactions Audit
        - button "Anomalies" [ref=e41]:
          - img [ref=e43]
          - generic [ref=e45]: Anomalies
        - button "Reports" [ref=e46]:
          - img [ref=e48]
          - generic [ref=e50]: Reports
        - button "User Activity" [ref=e51]:
          - img [ref=e53]
          - generic [ref=e58]: User Activity
        - button "Cases" [ref=e59]:
          - img [ref=e61]
          - generic [ref=e64]: Cases
        - button "Settings" [ref=e65]:
          - img [ref=e67]
          - generic [ref=e70]: Settings
      - generic [ref=e71]:
        - generic [ref=e73]:
          - paragraph [ref=e74]: Active Session
          - paragraph [ref=e77]: CREDIT_ANALYST AUTHORITY
          - paragraph [ref=e78]: analyst@fastkwacha.com
        - button "Logout" [ref=e79]:
          - img
          - generic [ref=e80]: Logout
    - main [ref=e81]:
      - generic [ref=e82]:
        - generic [ref=e83]:
          - heading "Institutional Dashboard" [level=1] [ref=e84]
          - paragraph [ref=e85]: Operational overview for Central Branch • Q3 FY24
        - generic [ref=e86]:
          - generic [ref=e87]:
            - button "Export CSV" [ref=e88]
            - button "+ New Application" [ref=e89]
          - separator [ref=e90]
          - button [ref=e92]:
            - img [ref=e93]
      - generic [ref=e100]:
        - generic [ref=e102]:
          - generic [ref=e103]:
            - button "Dashboard" [ref=e104]:
              - img [ref=e105]
              - generic [ref=e110]: Dashboard
            - button "Analysis Queue" [active] [ref=e111]:
              - img [ref=e112]
              - generic [ref=e115]: Analysis Queue
            - button "Smart Fix" [ref=e116]:
              - img [ref=e117]
              - generic [ref=e119]: Smart Fix
            - button "Insights" [ref=e120]:
              - img [ref=e121]
              - generic [ref=e124]: Insights
            - button "History" [ref=e125]:
              - img [ref=e126]
              - generic [ref=e130]: History
          - generic [ref=e131]:
            - generic [ref=e132]: ANALYST_CONSOLE_v5
            - button "MANUAL CRB" [disabled]:
              - img
              - text: MANUAL CRB
            - button "FETCH CRB" [disabled]:
              - img
              - text: FETCH CRB
        - generic [ref=e135]:
          - generic [ref=e136]:
            - generic [ref=e137]:
              - heading "Analyst Queue (0)" [level=3] [ref=e138]
              - button [ref=e140]:
                - img
            - paragraph [ref=e142]: No applications in analysis.
          - generic [ref=e144]:
            - img [ref=e145]
            - paragraph [ref=e148]: Select an application from the queue
```

# Test source

```ts
  1   | import { test, expect } from '@playwright/test';
  2   | import { ANALYST_TEST_CLIENT, analystSeed, loginAs } from './test-helpers';
  3   | 
  4   | async function openAnalystQueue(page: import('@playwright/test').Page) {
  5   |   await loginAs(page, 'analyst@fastkwacha.com', 'analyst123', analystSeed);
  6   |   await expect(page.getByText(/Risk Pipeline|Analyst Console/i).first()).toBeVisible({ timeout: 20000 });
  7   |   await page.getByTestId('tab-QUEUE').click();
  8   |   await expect(page.getByText(/Analyst Queue \(/i)).toBeVisible({ timeout: 15000 });
  9   |   const applicantRow = page.getByTestId('queue-item').first();
> 10  |   await expect(applicantRow).toBeVisible({ timeout: 10000 });
      |                              ^ Error: expect(locator).toBeVisible() failed
  11  |   await expect(applicantRow).toContainText(new RegExp(ANALYST_TEST_CLIENT, 'i'));
  12  |   await applicantRow.click();
  13  | }
  14  | 
  15  | test.describe('Credit Analyst E2E Flow', () => {
  16  |   test('Verify Analyst Dashboard and Fallback Integrations', async ({ page }) => {
  17  |     test.setTimeout(90000);
  18  | 
  19  |     const consoleLogs: string[] = [];
  20  |     page.on('console', msg => {
  21  |       const text = msg.text();
  22  |       consoleLogs.push(text);
  23  |       console.log(`BROWSER_LOG: ${text}`);
  24  |     });
  25  | 
  26  |     // 1. Visit application with a deterministic analyst queue item
  27  |     await loginAs(page, 'analyst@fastkwacha.com', 'analyst123', analystSeed);
  28  | 
  29  |     // 2. Wait for Analyst Console
  30  |     await expect(page.getByText(/Risk Pipeline|Analyst Console/i).first()).toBeVisible({ timeout: 20000 });
  31  | 
  32  |     // 3. Navigate to Analysis Queue
  33  |     console.log('Attempting to switch to QUEUE tab...');
  34  |     const queueTab = page.getByTestId('tab-QUEUE');
  35  |     
  36  |     // Try regular click
  37  |     await queueTab.click();
  38  |     
  39  |     // Check if it switched. If not, try forced click or evaluate
  40  |     try {
  41  |       await expect(page.getByText(/Analyst Queue \(/i)).toBeVisible({ timeout: 5000 });
  42  |     } catch (e) {
  43  |       console.log('Regular click failed to switch tab, trying forced click...');
  44  |       await queueTab.click({ force: true });
  45  |       try {
  46  |         await expect(page.getByText(/Analyst Queue \(/i)).toBeVisible({ timeout: 5000 });
  47  |       } catch (e2) {
  48  |         console.log('Forced click failed, using evaluate...');
  49  |         await page.evaluate(() => {
  50  |           const btn = document.querySelector('[data-testid="tab-QUEUE"]') as HTMLButtonElement;
  51  |           if (btn) btn.click();
  52  |         });
  53  |       }
  54  |     }
  55  | 
  56  |     // Wait for the heading to appear
  57  |     await expect(page.getByText(/Analyst Queue \(/i)).toBeVisible({ timeout: 15000 });
  58  | 
  59  |     // 4. Verify Applicant
  60  |     const applicantRow = page.getByTestId('queue-item').first();
  61  |     await applicantRow.waitFor({ state: 'attached', timeout: 10000 });
  62  |     await expect(applicantRow).toBeVisible({ timeout: 10000 });
  63  |     await expect(applicantRow).toContainText(new RegExp(ANALYST_TEST_CLIENT, 'i'));
  64  |     await applicantRow.click();
  65  | 
  66  |     // 5. Manual CRB Flow
  67  |     await page.getByRole('button', { name: /MANUAL CRB/i }).click();
  68  |     const scoreInput = page.locator('input[type="number"]').first();
  69  |     await expect(scoreInput).toBeVisible();
  70  |     await scoreInput.fill('710');
  71  |     // The button text in App.tsx is "Commit to Immutable Audit"
  72  |     await page.getByRole('button', { name: /commit/i }).click();
  73  | 
  74  |     // 6. Referral Flow
  75  |     await page.getByRole('button', { name: /refer back/i }).first().click();
  76  |     const textarea = page.locator('textarea');
  77  |     await expect(textarea).toBeVisible();
  78  |     await textarea.fill('Needs secondary proof of income (Programmatic Test V14)');
  79  |     await page.getByRole('button', { name: /income clarification required/i }).click();
  80  |     await page.getByRole('button', { name: /confirm decision/i }).click();
  81  | 
  82  |     // 7. History Check
  83  |     console.log('Switching to HISTORY tab...');
  84  |     await page.getByTestId('tab-HISTORY').click({ force: true });
  85  |     await expect(page.getByText(/Programmatic Test V14|Manual CRB/i).first()).toBeVisible({ timeout: 15000 });
  86  |     
  87  |     console.log('E2E Test Finalized Successfully!');
  88  |   });
  89  | 
  90  |   test('Complete Analysis advances the analyst case without errors', async ({ page }) => {
  91  |     await openAnalystQueue(page);
  92  | 
  93  |     await page.getByRole('button', { name: /complete analysis/i }).click();
  94  |     await page.getByRole('button', { name: /strong income stability/i }).click();
  95  |     await page.getByRole('button', { name: /confirm decision/i }).click();
  96  | 
  97  |     await expect(page.getByText(/No applications in analysis\./i)).toBeVisible({ timeout: 15000 });
  98  |   });
  99  | 
  100 |   test('Recommend Rejection removes the analyst case without errors', async ({ page }) => {
  101 |     await openAnalystQueue(page);
  102 | 
  103 |     await page.getByRole('button', { name: /recommend rejection/i }).click();
  104 |     await page.getByRole('button', { name: /insufficient income/i }).click();
  105 |     await page.locator('textarea').last().fill('Income evidence is insufficient for this requested amount.');
  106 |     await page.getByRole('button', { name: /confirm decision/i }).click();
  107 | 
  108 |     await expect(page.getByText(/No applications in analysis\./i)).toBeVisible({ timeout: 15000 });
  109 |   });
  110 | });
```