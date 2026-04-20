import { expect, test } from '@playwright/test';
import { loginAs, openSidebarModule } from './test-helpers';

const clientSeed = {
  fastkwacha_local_users: [
    {
      id: 'local-client-test',
      uid: 'local-client-test',
      name: 'Client Test',
      email: 'client.test@fastkwacha.com',
      role: 'CLIENT',
      status: 'ACTIVE',
      phone: '+265999777888',
      nationalId: 'CLI-001',
      address: 'Blantyre',
      kycComplete: true,
      kycStatus: 'COMPLETE',
      lastLogin: new Date().toISOString(),
    },
  ],
  fastkwacha_local_clients: [
    {
      id: 'local-client-test',
      name: 'Client Test',
      phone: '+265999777888',
      idNumber: 'CLI-001',
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ],
  fastkwacha_local_loans: [
    {
      id: 'local-client-loan-1',
      clientId: 'local-client-test',
      clientName: 'Client Test',
      productName: 'Starter Loan',
      amount: 120000,
      outstandingBalance: 80000,
      repaymentAmount: 22000,
      repaymentFrequency: 'MONTHLY',
      termMonths: 6,
      status: 'ACTIVE',
      nextDueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ],
  fastkwacha_local_schedule: [
    {
      id: 'local-schedule-1',
      loanId: 'local-client-loan-1',
      installmentNumber: 1,
      dueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
      principalAmount: 18000,
      interestAmount: 4000,
      total: 22000,
      paidAmount: 0,
      penaltyAmount: 0,
      status: 'PENDING',
    },
  ],
  'fastkwacha-local-receipts': [
    {
      id: 'local-receipt-1',
      receiptId: 'FW-REP-20260420-0001',
      transactionId: 'seed-tx-1',
      transactionType: 'REPAYMENT',
      issuedAt: new Date().toISOString(),
      date: new Date().toISOString(),
      loanId: 'local-client-loan-1',
      clientId: 'local-client-test',
      clientName: 'Client Test',
      amount: 20000,
      paymentMethod: 'CASH',
      transactionReference: 'SEED-REF-1',
      authorizedBy: 'seed-agent',
      status: 'ISSUED',
    },
  ],
  'fastkwacha-local-notifications': [
    {
      id: 'local-notification-1',
      type: 'PAYMENT_REMINDER',
      title: 'Upcoming repayment due',
      message: 'Your Starter Loan installment is due soon.',
      targetRole: 'CLIENT',
      clientId: 'local-client-test',
      targetEmail: 'client.test@fastkwacha.com',
      isRead: false,
      createdAt: new Date().toISOString(),
    },
  ],
};

test.describe('Client dashboard workspace', () => {
  test('client loan, repayment, receipt, and notification modules work end to end', async ({ page }) => {
    await loginAs(page, 'client.test@fastkwacha.com', 'Client123', clientSeed);

    await expect(page.getByRole('heading', { name: /Welcome, Client/i })).toBeVisible({ timeout: 20000 });

    await openSidebarModule(page, 'Loans');
    await expect(page.getByRole('heading', { name: /Loan Management/i })).toBeVisible();
    await expect(page.getByText(/Starter Loan/i)).toBeVisible();

    await openSidebarModule(page, 'Repayments');
    await expect(page.getByRole('heading', { name: /Secure Repayments/i })).toBeVisible();
    await page.getByRole('button', { name: /pay now/i }).click();
    await expect(page.getByRole('heading', { name: /Paychangu Gateway/i })).toBeVisible();
    await page.locator('input[type="number"]').fill('10000');
    await page.getByRole('button', { name: /pay via paychangu/i }).click();
    await expect(page.getByText(/OFFICIAL RECEIPT/i)).toBeVisible({ timeout: 15000 });
    await page.getByRole('button', { name: /close receipt/i }).click();

    await openSidebarModule(page, 'Receipts');
    await expect(page.getByRole('heading', { name: /The Vault/i })).toBeVisible();
    await page.getByPlaceholder(/Search Receipt ID/i).fill('FW-REP-20260420-0001');
    await expect(page.getByText(/FW-REP-20260420-0001/i)).toBeVisible();

    await openSidebarModule(page, 'Notifications');
    await expect(page.getByRole('heading', { name: /Notifications/i })).toBeVisible();
    await expect(page.getByText(/Upcoming repayment due/i)).toBeVisible();
    await page.getByTestId('client-notification-read-local-notification-1').click();

    const notificationsState = await page.evaluate(() => JSON.parse(window.localStorage.getItem('fastkwacha-local-notifications') || '[]'));
    expect(notificationsState.find((entry: any) => entry.id === 'local-notification-1')?.isRead).toBe(true);
  });
});
