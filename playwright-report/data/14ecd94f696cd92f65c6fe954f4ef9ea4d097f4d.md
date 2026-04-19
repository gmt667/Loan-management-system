# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: role-dashboards.spec.ts >> Role dashboard coordination >> manager login reaches analytics and automation modules
- Location: tests\role-dashboards.spec.ts:40:3

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: locator.click: Test timeout of 30000ms exceeded.
Call log:
  - waiting for getByRole('button', { name: /approve application/i })

```

# Page snapshot

```yaml
- generic [ref=e1]:
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
          - button "Automation Center" [ref=e23]:
            - img [ref=e25]
            - generic [ref=e27]: Automation Center
          - button "Settings" [ref=e28]:
            - img [ref=e30]
            - generic [ref=e33]: Settings
        - generic [ref=e34]:
          - generic [ref=e36]:
            - paragraph [ref=e37]: Active Session
            - paragraph [ref=e40]: MANAGER AUTHORITY
            - paragraph [ref=e41]: manager@fastkwacha.com
          - button "Logout" [ref=e42]:
            - img
            - generic [ref=e43]: Logout
      - main [ref=e44]:
        - generic [ref=e45]:
          - generic [ref=e46]:
            - heading "Institutional Dashboard" [level=1] [ref=e47]
            - paragraph [ref=e48]: Operational overview for Central Branch • Q3 FY24
          - generic [ref=e49]:
            - generic [ref=e50]:
              - button "Export CSV" [ref=e51]
              - button "+ New Application" [ref=e52]
            - separator [ref=e53]
            - button [ref=e55]:
              - img [ref=e56]
        - generic [ref=e63]:
          - generic [ref=e65]:
            - generic [ref=e66]:
              - generic [ref=e67]:
                - paragraph [ref=e68]: Manager Dashboard
                - heading "Management Control Room" [level=2] [ref=e69]
                - paragraph [ref=e70]: The manager does not analyze everything. The manager decides, overrides, and monitors risk at scale.
              - generic [ref=e71]:
                - generic [ref=e73]:
                  - heading "Active Loans" [level=4] [ref=e75]
                  - paragraph [ref=e76]: "0"
                  - paragraph [ref=e77]: Portfolio in force
                - generic [ref=e79]:
                  - heading "Total Disbursed" [level=4] [ref=e81]
                  - paragraph [ref=e82]: MWK 0
                  - paragraph [ref=e83]: Historic lending
                - generic [ref=e85]:
                  - heading "Outstanding" [level=4] [ref=e87]
                  - paragraph [ref=e88]: MWK 0
                  - paragraph [ref=e89]: Recoverable balance
                - generic [ref=e91]:
                  - heading "PAR %" [level=4] [ref=e93]
                  - paragraph [ref=e94]: 0.0%
                  - paragraph [ref=e95]: Healthy portfolio
                - generic [ref=e97]:
                  - heading "NPL Count" [level=4] [ref=e99]
                  - paragraph [ref=e100]: "0"
                  - paragraph [ref=e101]: Non-performing watch
                - generic [ref=e103]:
                  - heading "Today's Approvals" [level=4] [ref=e105]
                  - paragraph [ref=e106]: "0"
                  - paragraph [ref=e107]: Manager decisions
            - generic [ref=e108]:
              - button "Overview" [ref=e109]
              - button "Decision Queue" [ref=e110]
              - button "Portfolio" [ref=e111]
              - button "Risk Control" [ref=e112]
              - button "Reports" [ref=e113]
              - button "Audit" [ref=e114]
            - generic [ref=e115]:
              - generic [ref=e116]:
                - paragraph [ref=e117]: Context Ribbon
                - paragraph [ref=e118]: Decision-first tooling that changes with the active tab.
              - generic [ref=e119]:
                - button "Approve" [ref=e120]:
                  - img
                  - text: Approve
                - button "Reject" [ref=e121]:
                  - img
                  - text: Reject
                - button "Send Back" [ref=e122]:
                  - img
                  - text: Send Back
                - button "Override Risk" [ref=e123]:
                  - img
                  - text: Override Risk
          - generic [ref=e124]:
            - generic [ref=e125]:
              - generic [ref=e126]:
                - heading "Loans Awaiting Decision" [level=3] [ref=e127]
                - paragraph [ref=e128]: "Priority sorting: High risk, high amount, oldest."
              - button "Loan LOCAL-AP Manager Queue Client MWK 240,000 MEDIUM APPROVE 4h waiting" [ref=e130]:
                - generic [ref=e131]:
                  - generic [ref=e132]:
                    - paragraph [ref=e133]: Loan LOCAL-AP
                    - heading "Manager Queue Client" [level=4] [ref=e134]
                    - paragraph [ref=e135]: MWK 240,000
                  - generic [ref=e136]: MEDIUM
                - generic [ref=e137]:
                  - generic [ref=e138]: APPROVE
                  - generic [ref=e139]: 4h waiting
            - generic [ref=e140]:
              - generic [ref=e141]:
                - heading "Decision Workspace" [level=3] [ref=e142]
                - paragraph [ref=e143]: Show consequences before action.
              - generic [ref=e144]:
                - generic [ref=e145]:
                  - generic [ref=e146]:
                    - paragraph [ref=e147]: Applicant + Loan Summary
                    - paragraph [ref=e148]: Manager Queue Client
                    - paragraph [ref=e149]: MWK 240,000 over 6 months
                  - generic [ref=e150]:
                    - paragraph [ref=e151]: Analyst Recommendation
                    - paragraph [ref=e152]: APPROVE
                    - paragraph [ref=e153]: FINAL DECISION
                - generic [ref=e154]:
                  - heading "Financial Projection" [level=4] [ref=e155]
                  - generic [ref=e156]:
                    - generic [ref=e157]:
                      - paragraph [ref=e158]: Total Payable
                      - paragraph [ref=e159]: MWK 252,756
                    - generic [ref=e160]:
                      - paragraph [ref=e161]: Monthly Installment
                      - paragraph [ref=e162]: MWK 42,126
                    - generic [ref=e163]:
                      - paragraph [ref=e164]: Total Interest
                      - paragraph [ref=e165]: MWK 12,756
                    - generic [ref=e166]:
                      - paragraph [ref=e167]: Fees Applied
                      - paragraph [ref=e168]: MWK 9,800
                - generic [ref=e169]:
                  - text: Loan Product
                  - combobox [ref=e170]:
                    - option "Manager Test Product (18%)" [selected]
                - generic [ref=e171]:
                  - text: Manager Note
                  - textbox "Add note, override rationale, or send-back instruction." [active] [ref=e172]: Approved from manager command center during browser coordination test.
                - generic [ref=e173]:
                  - button "FINAL APPROVE" [ref=e174]
                  - button "FINAL REJECT" [ref=e175]
                  - button "Send Back" [ref=e176]
                  - button "Override & Approve" [ref=e177]
            - generic [ref=e178]:
              - heading "Executive Intelligence" [level=3] [ref=e180]
              - generic [ref=e181]:
                - generic [ref=e182]:
                  - paragraph [ref=e183]: Risk Snapshot
                  - paragraph [ref=e184]: "580"
                  - paragraph [ref=e185]: "Risk Level: MEDIUM"
                - generic [ref=e186]:
                  - paragraph [ref=e187]: Critical Flags
                  - paragraph [ref=e188]: Risk profile currently manageable.
                  - paragraph [ref=e189]: Debt-to-income ratio remains within expected bounds.
                - generic [ref=e190]:
                  - paragraph [ref=e191]: Decision Impact Preview
                  - paragraph [ref=e192]: "If Approved: Portfolio Risk +0.0%"
                  - paragraph [ref=e193]: "Expected Revenue: +MWK 22,556"
                  - paragraph [ref=e194]: "If Rejected: risk remains stable"
  - generic [ref=e195]: "0"
```

# Test source

```ts
  1   | import { test, expect } from '@playwright/test';
  2   | import { agentSeed, ANALYST_TEST_CLIENT, analystSeed, expectHeading, expectStatCardValue, loginAs, MANAGER_TEST_CLIENT, managerSeed, openSidebarModule } from './test-helpers';
  3   | 
  4   | test.describe('Role dashboard coordination', () => {
  5   |   test('admin login reaches governance modules', async ({ page }) => {
  6   |     await loginAs(page, 'admin@fastkwacha.com', 'admin123');
  7   | 
  8   |     await expectHeading(page, /Admin Command Center/i);
  9   |     await expect(page.getByText(/Pending Agent Approval Queue/i)).toBeVisible();
  10  | 
  11  |     await openSidebarModule(page, 'Users');
  12  |     await expectHeading(page, /User Management/i);
  13  | 
  14  |     await openSidebarModule(page, 'Automation Center');
  15  |     await expectHeading(page, /Automation Center/i);
  16  | 
  17  |     await openSidebarModule(page, 'Settings');
  18  |     await expectHeading(page, /Settings/i);
  19  |   });
  20  | 
  21  |   test('officer login reaches processing modules', async ({ page }) => {
  22  |     await loginAs(page, 'officer@fastkwacha.com', 'officer123');
  23  | 
  24  |     await expectHeading(page, /Officer Command Center/i);
  25  |     await expect(page.getByText(/Priority Review Queue/i)).toBeVisible();
  26  | 
  27  |     await page.getByRole('button', { name: /review queue/i }).click();
  28  |     await expectHeading(page, /Credit Approvals/i);
  29  | 
  30  |     await openSidebarModule(page, 'Applications');
  31  |     await expectHeading(page, /Client Registration & Loan Application/i);
  32  | 
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
> 53  |     await page.getByRole('button', { name: /approve application/i }).click();
      |                                                                      ^ Error: locator.click: Test timeout of 30000ms exceeded.
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
  133 |     await expect(page.getByText(/Analyst Queue \(1\)/i)).toBeVisible();
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
```