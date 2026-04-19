# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: role-dashboards.spec.ts >> Role dashboard coordination >> manager can override and approve from the command center
- Location: tests\role-dashboards.spec.ts:65:3

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: locator.click: Test timeout of 30000ms exceeded.
Call log:
  - waiting for getByRole('button', { name: /strong income stability/i })

```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic [ref=e4]:
    - generic [ref=e6]:
      - img [ref=e7]
      - text: System Error
    - generic [ref=e9]:
      - paragraph [ref=e10]: Cannot read properties of undefined (reading 'toLocaleString')
      - paragraph [ref=e11]: "TypeError: Cannot read properties of undefined (reading 'toLocaleString') at ReceiptViewerModal (http://localhost:3000/src/App.tsx?t=1776640548629:4356:50) at Object.react_stack_bottom_frame (http://localhost:3000/node_modules/.vite/deps/react-dom_client.js?v=cef10dd3:18509:20) at renderWithHooks (http://localhost:3000/node_modules/.vite/deps/react-dom_client.js?v=cef10dd3:5654:24) at updateFunctionComponent (http://localhost:3000/node_modules/.vite/deps/react-dom_client.js?v=cef10dd3:7475:21) at beginWork (http://localhost:3000/node_modules/.vite/deps/react-dom_client.js?v=cef10dd3:8525:20) at runWithFiberInDEV (http://localhost:3000/node_modules/.vite/deps/react-dom_client.js?v=cef10dd3:997:72) at performUnitOfWork (http://localhost:3000/node_modules/.vite/deps/react-dom_client.js?v=cef10dd3:12561:98) at workLoopSync (http://localhost:3000/node_modules/.vite/deps/react-dom_client.js?v=cef10dd3:12424:43) at renderRootSync (http://localhost:3000/node_modules/.vite/deps/react-dom_client.js?v=cef10dd3:12408:13) at performWorkOnRoot (http://localhost:3000/node_modules/.vite/deps/react-dom_client.js?v=cef10dd3:11827:37)"
      - button "Reload Application" [ref=e12]
  - generic [ref=e13]: "0"
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
> 73  |     await page.getByRole('button', { name: /strong income stability/i }).click();
      |                                                                          ^ Error: locator.click: Test timeout of 30000ms exceeded.
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
  154 |     await expectHeading(page, /Management Control Room/i);
  155 |     await page.getByRole('button', { name: 'Decision Queue', exact: true }).click();
  156 |     await expect(page.getByText(/Loans Awaiting Decision/i)).toBeVisible();
  157 |     await expect(page.getByRole('button', { name: new RegExp(ANALYST_TEST_CLIENT, 'i') })).toBeVisible();
  158 |   });
  159 | });
  160 | 
```