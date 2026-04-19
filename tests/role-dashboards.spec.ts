import { test, expect } from '@playwright/test';
import { agentSeed, ANALYST_TEST_CLIENT, analystSeed, expectHeading, expectStatCardValue, loginAs, MANAGER_TEST_CLIENT, managerSeed, openSidebarModule } from './test-helpers';

test.describe('Role dashboard coordination', () => {
  test('admin login reaches governance modules', async ({ page }) => {
    await loginAs(page, 'admin@fastkwacha.com', 'admin123');

    await expectHeading(page, /Admin Command Center/i);
    await expect(page.getByText(/Pending Agent Approval Queue/i)).toBeVisible();

    await openSidebarModule(page, 'Users');
    await expectHeading(page, /User Management/i);

    await openSidebarModule(page, 'Automation Center');
    await expectHeading(page, /Automation Center/i);

    await openSidebarModule(page, 'Settings');
    await expectHeading(page, /Settings/i);
  });

  test('officer login reaches processing modules', async ({ page }) => {
    await loginAs(page, 'officer@fastkwacha.com', 'officer123');

    await expectHeading(page, /Officer Command Center/i);
    await expect(page.getByText(/Priority Review Queue/i)).toBeVisible();

    await page.getByRole('button', { name: /review queue/i }).click();
    await expectHeading(page, /Credit Approvals/i);

    await openSidebarModule(page, 'Applications');
    await expectHeading(page, /Client Registration & Loan Application/i);

    await openSidebarModule(page, 'Repayments');
    await expectHeading(page, /Repayment Ledger/i);

    await openSidebarModule(page, 'Reports');
    await expectHeading(page, /BI & Insights/i);
  });

  test('manager login reaches analytics and automation modules', async ({ page }) => {
    await loginAs(page, 'manager@fastkwacha.com', 'manager123', managerSeed);

    await expectHeading(page, /Management Control Room/i);
    await expect(page.getByRole('button', { name: 'Decision Queue', exact: true })).toBeVisible();
    await expect(page.getByText(/Context Ribbon/i)).toBeVisible();
    await expectStatCardValue(page, 'Active Loans', '0');
    await expectStatCardValue(page, "Today's Approvals", '0');

    await page.getByRole('button', { name: 'Decision Queue', exact: true }).click();
    await expect(page.getByText(/Loans Awaiting Decision/i)).toBeVisible();
    await expect(page.getByText(new RegExp(MANAGER_TEST_CLIENT, 'i')).first()).toBeVisible();
    await page.getByPlaceholder(/Add note, override rationale, or send-back instruction/i).fill('Approved from manager command center during browser coordination test.');
    await page.getByRole('button', { name: /approve application/i }).click();
    await page.getByRole('button', { name: /strong income stability/i }).click();
    await page.getByRole('button', { name: /confirm decision/i }).click();
    await expect(page.getByRole('button', { name: new RegExp(MANAGER_TEST_CLIENT, 'i') })).toHaveCount(0);
    await expect(page.getByText(/No applications currently require manager intervention\./i)).toBeVisible();
    await expectStatCardValue(page, 'Active Loans', '0');
    await expectStatCardValue(page, "Today's Approvals", '0');

    await openSidebarModule(page, 'Automation Center');
    await expectHeading(page, /Automation Center/i);
  });

  test('manager can override and approve from the command center', async ({ page }) => {
    await loginAs(page, 'manager@fastkwacha.com', 'manager123', managerSeed);

    await expectHeading(page, /Management Control Room/i);
    await page.getByRole('button', { name: 'Decision Queue', exact: true }).click();
    await expect(page.getByText(new RegExp(MANAGER_TEST_CLIENT, 'i')).first()).toBeVisible();
    await page.getByPlaceholder(/Add note, override rationale, or send-back instruction/i).fill('Override approved during manager browser test.');
    await page.getByRole('button', { name: /Override & Approve/i }).click();
    await page.getByRole('button', { name: /strong income stability/i }).click();
    await page.getByLabel(/flag as risk override/i).check();
    await page.locator('textarea').last().fill('Override approved during manager browser test.');
    await page.getByRole('button', { name: /confirm decision/i }).click();
    await expect(page.getByRole('button', { name: new RegExp(MANAGER_TEST_CLIENT, 'i') })).toHaveCount(0);
    await expect(page.getByText(/No applications currently require manager intervention\./i)).toBeVisible();
    await expectStatCardValue(page, 'Active Loans', '0');
    await expectStatCardValue(page, "Today's Approvals", '0');
  });

  test('agent login reaches field operations modules', async ({ page }) => {
    await loginAs(page, 'agent.test@fastkwacha.com', 'agent123', agentSeed);

    await expectHeading(page, /Agent Mission Control/i);
    await expect(page.getByRole('heading', { name: /Priority Collections/i })).toBeVisible();
    await expect(page.getByText(/Mary Banda/i).first()).toBeVisible();

    await openSidebarModule(page, 'Clients');
    await expectHeading(page, /Client Management/i);

    await openSidebarModule(page, 'Due Loans');
    await expectHeading(page, /Due & Overdue Tracking/i);

    await openSidebarModule(page, 'Transactions');
    await expectHeading(page, /Transaction History/i);

    await openSidebarModule(page, 'Payments');
    await expectHeading(page, /Payment Collection/i);
    await expect(page.getByText(/Step 1: Select Client & Loan/i)).toBeVisible();
    await page.locator('button').filter({ hasText: /Mary Banda/i }).first().click();
    await page.locator('button').filter({ hasText: /Loan #AGENT-LO/i }).first().click();
    await page.getByRole('button', { name: /continue to payment/i }).click();
    await expect(page.getByText(/Repayment Amount/i)).toBeVisible();
    await page.locator('input[type="number"]').fill('20000');
    await page.getByRole('button', { name: /confirm collection/i }).click();
    await expect(page.getByText(/Payment Successful/i)).toBeVisible();
    await expect(page.getByText(/Official Receipt/i)).toBeVisible();
    await expect(page.getByText(/MWK 20,000/i).first()).toBeVisible();
  });

  test('credit analyst login reaches audit and case modules', async ({ page }) => {
    await loginAs(page, 'analyst@fastkwacha.com', 'analyst123');

    await expectHeading(page, /Risk Pipeline|Analyst Queue|ANALYST_CONSOLE/i);

    await openSidebarModule(page, 'Audit Logs');
    await expectHeading(page, /Audit & Activity Logs/i);

    await openSidebarModule(page, 'Transactions Audit');
    await expectHeading(page, /Transactions Audit/i);

    await openSidebarModule(page, 'Cases');
    await expectHeading(page, /Case Management/i);
  });

  test('completed analyst case becomes visible in manager decision queue', async ({ page }) => {
    await loginAs(page, 'analyst@fastkwacha.com', 'analyst123', analystSeed);

    await expectHeading(page, /Risk Pipeline|Analyst Queue|ANALYST_CONSOLE/i);
    await page.getByTestId('tab-QUEUE').click();
    await expect(page.getByText(/Analyst Queue \(1\)/i)).toBeVisible();
    await page.getByTestId('queue-item').first().click();
    await page.getByRole('button', { name: /manual crb/i }).click();
    await page.locator('input[type="number"]').first().fill('710');
    await page.getByRole('button', { name: /commit/i }).click();
    await page.getByRole('button', { name: /complete analysis/i }).click();
    await page.getByRole('button', { name: /strong income stability/i }).click();
    await page.getByRole('button', { name: /confirm decision/i }).click();
    await expect(page.getByText(/No applications in analysis\./i)).toBeVisible();

    const handoffState = await page.evaluate(() => window.localStorage.getItem('fastkwacha_local_apps'));

    await loginAs(page, 'manager@fastkwacha.com', 'manager123', {
      ...managerSeed,
      fastkwacha_local_apps: JSON.parse(handoffState || '[]'),
      fastkwacha_local_clients: [
        ...(Array.isArray(managerSeed.fastkwacha_local_clients) ? managerSeed.fastkwacha_local_clients : []),
        ...(Array.isArray(analystSeed.fastkwacha_local_clients) ? analystSeed.fastkwacha_local_clients : []),
      ],
    });

    await expectHeading(page, /Management Control Room/i);
    await page.getByRole('button', { name: 'Decision Queue', exact: true }).click();
    await expect(page.getByText(/Loans Awaiting Decision/i)).toBeVisible();
    await expect(page.getByRole('button', { name: new RegExp(ANALYST_TEST_CLIENT, 'i') })).toBeVisible();
  });
});
