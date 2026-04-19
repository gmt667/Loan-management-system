# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: role-dashboards.spec.ts >> Role dashboard coordination >> completed analyst case becomes visible in manager decision queue
- Location: tests\role-dashboards.spec.ts:128:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByText(/Analyst Queue \(1\)/i)
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for getByText(/Analyst Queue \(1\)/i)

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
  33  |     await openSidebarModule(page, 'Repayments');
  34  |     await expectHeading(page, /Repayment Ledger/i);
  35  | 
  36  |     await openSidebarModule(page, 'Reports');
  37  |     await expectHeading(page, /BI & Insights/i);
  38  |   });
  39  | 
  40  |   test('manager login reaches analytics and automation modules', async ({ page }) => {
  41  |     await loginAs(page, 'manager@fastkwacha.com', 'manager123', managerSeed);
  42  | 
  43  |     await expectHeading(page, /Management Control Room/i);
  44  |     await expect(page.getByRole('button', { name: 'Decision Queue', exact: true })).toBeVisible();
  45  |     await expect(page.getByText(/Context Ribbon/i)).toBeVisible();
  46  |     await expectStatCardValue(page, 'Active Loans', '0');
  47  |     await expectStatCardValue(page, "Today's Approvals", '0');
  48  | 
  49  |     await page.getByRole('button', { name: 'Decision Queue', exact: true }).click();
  50  |     await expect(page.getByText(/Loans Awaiting Decision/i)).toBeVisible();
  51  |     await expect(page.getByText(new RegExp(MANAGER_TEST_CLIENT, 'i')).first()).toBeVisible();
  52  |     await page.getByPlaceholder(/Add note, override rationale, or send-back instruction/i).fill('Approved from manager command center during browser coordination test.');
  53  |     await page.getByRole('button', { name: /approve application/i }).click();
  54  |     await page.getByRole('button', { name: /strong income stability/i }).click();
  55  |     await page.getByRole('button', { name: /confirm decision/i }).click();
  56  |     await expect(page.getByRole('button', { name: new RegExp(MANAGER_TEST_CLIENT, 'i') })).toHaveCount(0);
  57  |     await expect(page.getByText(/No applications currently require manager intervention\./i)).toBeVisible();
  58  |     await expectStatCardValue(page, 'Active Loans', '0');
  59  |     await expectStatCardValue(page, "Today's Approvals", '0');
  60  | 
  61  |     await openSidebarModule(page, 'Automation Center');
  62  |     await expectHeading(page, /Automation Center/i);
  63  |   });
  64  | 
  65  |   test('manager can override and approve from the command center', async ({ page }) => {
  66  |     await loginAs(page, 'manager@fastkwacha.com', 'manager123', managerSeed);
  67  | 
  68  |     await expectHeading(page, /Management Control Room/i);
  69  |     await page.getByRole('button', { name: 'Decision Queue', exact: true }).click();
  70  |     await expect(page.getByText(new RegExp(MANAGER_TEST_CLIENT, 'i')).first()).toBeVisible();
  71  |     await page.getByPlaceholder(/Add note, override rationale, or send-back instruction/i).fill('Override approved during manager browser test.');
  72  |     await page.getByRole('button', { name: /Override & Approve/i }).click();
  73  |     await page.getByRole('button', { name: /strong income stability/i }).click();
  74  |     await page.getByLabel(/flag as risk override/i).check();
  75  |     await page.locator('textarea').last().fill('Override approved during manager browser test.');
  76  |     await page.getByRole('button', { name: /confirm decision/i }).click();
  77  |     await expect(page.getByRole('button', { name: new RegExp(MANAGER_TEST_CLIENT, 'i') })).toHaveCount(0);
  78  |     await expect(page.getByText(/No applications currently require manager intervention\./i)).toBeVisible();
  79  |     await expectStatCardValue(page, 'Active Loans', '0');
  80  |     await expectStatCardValue(page, "Today's Approvals", '0');
  81  |   });
  82  | 
  83  |   test('agent login reaches field operations modules', async ({ page }) => {
  84  |     await loginAs(page, 'agent.test@fastkwacha.com', 'agent123', agentSeed);
  85  | 
  86  |     await expectHeading(page, /Agent Mission Control/i);
  87  |     await expect(page.getByRole('heading', { name: /Priority Collections/i })).toBeVisible();
  88  |     await expect(page.getByText(/Mary Banda/i).first()).toBeVisible();
  89  | 
  90  |     await openSidebarModule(page, 'Clients');
  91  |     await expectHeading(page, /Client Management/i);
  92  | 
  93  |     await openSidebarModule(page, 'Due Loans');
  94  |     await expectHeading(page, /Due & Overdue Tracking/i);
  95  | 
  96  |     await openSidebarModule(page, 'Transactions');
  97  |     await expectHeading(page, /Transaction History/i);
  98  | 
  99  |     await openSidebarModule(page, 'Payments');
  100 |     await expectHeading(page, /Payment Collection/i);
  101 |     await expect(page.getByText(/Step 1: Select Client & Loan/i)).toBeVisible();
  102 |     await page.locator('button').filter({ hasText: /Mary Banda/i }).first().click();
  103 |     await page.locator('button').filter({ hasText: /Loan #AGENT-LO/i }).first().click();
  104 |     await page.getByRole('button', { name: /continue to payment/i }).click();
  105 |     await expect(page.getByText(/Repayment Amount/i)).toBeVisible();
  106 |     await page.locator('input[type="number"]').fill('20000');
  107 |     await page.getByRole('button', { name: /confirm collection/i }).click();
  108 |     await expect(page.getByText(/Payment Successful/i)).toBeVisible();
  109 |     await expect(page.getByText(/Official Receipt/i)).toBeVisible();
  110 |     await expect(page.getByText(/MWK 20,000/i).first()).toBeVisible();
  111 |   });
  112 | 
  113 |   test('credit analyst login reaches audit and case modules', async ({ page }) => {
  114 |     await loginAs(page, 'analyst@fastkwacha.com', 'analyst123');
  115 | 
  116 |     await expectHeading(page, /Risk Pipeline|Analyst Queue|ANALYST_CONSOLE/i);
  117 | 
  118 |     await openSidebarModule(page, 'Audit Logs');
  119 |     await expectHeading(page, /Audit & Activity Logs/i);
  120 | 
  121 |     await openSidebarModule(page, 'Transactions Audit');
  122 |     await expectHeading(page, /Transactions Audit/i);
  123 | 
  124 |     await openSidebarModule(page, 'Cases');
  125 |     await expectHeading(page, /Case Management/i);
  126 |   });
  127 | 
  128 |   test('completed analyst case becomes visible in manager decision queue', async ({ page }) => {
  129 |     await loginAs(page, 'analyst@fastkwacha.com', 'analyst123', analystSeed);
  130 | 
  131 |     await expectHeading(page, /Risk Pipeline|Analyst Queue|ANALYST_CONSOLE/i);
  132 |     await page.getByTestId('tab-QUEUE').click();
> 133 |     await expect(page.getByText(/Analyst Queue \(1\)/i)).toBeVisible();
      |                                                          ^ Error: expect(locator).toBeVisible() failed
  134 |     await page.getByTestId('queue-item').first().click();
  135 |     await page.getByRole('button', { name: /manual crb/i }).click();
  136 |     await page.locator('input[type="number"]').first().fill('710');
  137 |     await page.getByRole('button', { name: /commit/i }).click();
  138 |     await page.getByRole('button', { name: /complete analysis/i }).click();
  139 |     await page.getByRole('button', { name: /strong income stability/i }).click();
  140 |     await page.getByRole('button', { name: /confirm decision/i }).click();
  141 |     await expect(page.getByText(/No applications in analysis\./i)).toBeVisible();
  142 | 
  143 |     const handoffState = await page.evaluate(() => window.localStorage.getItem('fastkwacha_local_apps'));
  144 | 
  145 |     await loginAs(page, 'manager@fastkwacha.com', 'manager123', {
  146 |       ...managerSeed,
  147 |       fastkwacha_local_apps: JSON.parse(handoffState || '[]'),
  148 |       fastkwacha_local_clients: [
  149 |         ...(Array.isArray(managerSeed.fastkwacha_local_clients) ? managerSeed.fastkwacha_local_clients : []),
  150 |         ...(Array.isArray(analystSeed.fastkwacha_local_clients) ? analystSeed.fastkwacha_local_clients : []),
  151 |       ],
  152 |     });
  153 | 
  154 |     await expectHeading(page, /Management Control Room/i);
  155 |     await page.getByRole('button', { name: 'Decision Queue', exact: true }).click();
  156 |     await expect(page.getByText(/Loans Awaiting Decision/i)).toBeVisible();
  157 |     await expect(page.getByRole('button', { name: new RegExp(ANALYST_TEST_CLIENT, 'i') })).toBeVisible();
  158 |   });
  159 | });
  160 | 
```