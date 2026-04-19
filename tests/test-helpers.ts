import { expect, Page } from '@playwright/test';

type LocalStorageSeed = Record<string, unknown>;

const AGENT_EMAIL = 'agent.test@fastkwacha.com';
const ANALYST_TEST_CLIENT = 'Jennifer Smith';
const MANAGER_TEST_CLIENT = 'Manager Queue Client';

export const agentSeed: LocalStorageSeed = {
  fastkwacha_local_users: [
    {
      id: 'local-agent-test',
      uid: 'local-agent-test',
      name: 'Field Agent',
      email: AGENT_EMAIL,
      role: 'AGENT',
      status: 'ACTIVE',
      phone: '+265999000111',
      nationalId: 'AGT-900111',
      address: 'Lilongwe',
      demoPassword: 'agent123',
      lastLogin: new Date().toISOString(),
      lastDevice: 'Playwright',
    },
  ],
  fastkwacha_local_clients: [
    {
      id: 'agent-client-1',
      name: 'Mary Banda',
      phone: '+265999111222',
      idNumber: 'ID-MB-001',
      status: 'ACTIVE',
      metadata: {
        createdBy: {
          email: AGENT_EMAIL,
          role: 'AGENT',
        },
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ],
  fastkwacha_local_loans: [
    {
      id: 'agent-loan-1',
      clientId: 'agent-client-1',
      clientName: 'Mary Banda',
      amount: 180000,
      outstandingBalance: 120000,
      termMonths: 6,
      status: 'ACTIVE',
      nextDueDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      assignedAgentEmail: AGENT_EMAIL,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ],
  fastkwacha_local_apps: [
    {
      id: 'agent-app-1',
      clientId: 'agent-client-1',
      clientName: 'Mary Banda',
      requestedAmount: 180000,
      amount: 180000,
      status: 'APPROVED',
      current_stage: 'FINAL_DECISION',
      monthlyIncome: 250000,
      metadata: {
        createdBy: {
          email: AGENT_EMAIL,
          role: 'AGENT',
        },
      },
      assignedAgentEmail: AGENT_EMAIL,
      originatingAgentEmail: AGENT_EMAIL,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ],
  fastkwacha_local_transactions: [
    {
      id: 'agent-tx-1',
      loanId: 'agent-loan-1',
      clientId: 'agent-client-1',
      clientName: 'Mary Banda',
      type: 'REPAYMENT',
      amount: 15000,
      method: 'CASH',
      agentEmail: AGENT_EMAIL,
      reference: 'AGENT-TX-001',
      timestamp: new Date().toISOString(),
    },
  ],
  fastkwacha_local_schedule: [],
  fastkwacha_local_workflow: [],
};

export const managerSeed: LocalStorageSeed = {
  fastkwacha_local_clients: [
    {
      id: 'manager-client-1',
      name: MANAGER_TEST_CLIENT,
      phone: '+265999333444',
      idNumber: 'ID-MGR-001',
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ],
  fastkwacha_local_apps: [
    {
      id: 'local-app-manager-1',
      clientId: 'manager-client-1',
      clientName: MANAGER_TEST_CLIENT,
      requestedAmount: 240000,
      amount: 240000,
      status: 'IN_REVIEW',
      current_stage: 'FINAL_DECISION',
      termMonths: 6,
      monthlyIncome: 180000,
      analystRecommendation: 'APPROVE',
      comment: 'Stable income, moderate risk',
      crb: {
        score: 580,
        riskLevel: 'MEDIUM',
        status: 'COMPLETED',
        source: 'MANUAL',
        checkedAt: new Date().toISOString(),
        lastChecked: new Date().toISOString(),
      },
      createdAt: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
      updatedAt: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
    },
  ],
  fastkwacha_local_products: [
    {
      id: 'manager-product-1',
      name: 'Manager Test Product',
      interestRate: 18,
      maxTerm: 12,
      minAmount: 50000,
      maxAmount: 500000,
      status: 'ACTIVE',
      charges: {
        applicationFee: { type: 'FIXED', value: 5000 },
        processingFee: { type: 'PERCENTAGE', value: 2 },
        disbursementFee: { type: 'FIXED', value: 0 },
      },
      penaltyRate: 5,
      penaltyType: 'PERCENTAGE',
    },
  ],
  fastkwacha_local_loans: [],
  fastkwacha_local_transactions: [],
  fastkwacha_local_schedule: [],
  fastkwacha_local_workflow: [],
};

export const analystSeed: LocalStorageSeed = {
  fastkwacha_local_clients: [
    {
      id: 'analyst-client-1',
      name: ANALYST_TEST_CLIENT,
      phone: '+265999555666',
      nationalId: 'ANL-001',
      residence: 'Lilongwe, Sector 4',
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ],
  fastkwacha_local_apps: [
    {
      id: 'analyst-app-1',
      clientId: 'analyst-client-1',
      clientName: ANALYST_TEST_CLIENT,
      requestedAmount: 250000,
      amount: 250000,
      status: 'IN_REVIEW',
      current_stage: 'REVIEWED',
      termMonths: 6,
      monthlyIncome: 650000,
      employmentStatus: 'EMPLOYED',
      clientSnapshot: {
        name: ANALYST_TEST_CLIENT,
        nationalId: 'ANL-001',
        phone: '+265 999 555 666',
        residence: 'Lilongwe, Sector 4',
      },
      crb: {
        score: 450,
        riskLevel: 'MEDIUM',
        hasExistingLoans: true,
        defaultHistory: false,
        reportSummary: 'Seeded analyst review case for browser verification.',
        status: 'COMPLETED',
        source: 'MANUAL',
        checkedAt: new Date().toISOString(),
      },
      createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      updatedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    },
  ],
  fastkwacha_local_workflow: [],
  fastkwacha_local_transactions: [],
  fastkwacha_local_loans: [],
  fastkwacha_local_schedule: [],
  fastkwacha_local_products: [],
};

export async function openFreshApp(page: Page, seed?: LocalStorageSeed) {
  await page.addInitScript((storageSeed) => {
    window.localStorage.clear();
    window.sessionStorage.clear();

    for (const [key, value] of Object.entries(storageSeed || {})) {
      window.localStorage.setItem(key, JSON.stringify(value));
    }
  }, seed || {});

  await page.goto('/');
}

export async function loginAs(page: Page, email: string, password: string, seed?: LocalStorageSeed) {
  await openFreshApp(page, seed);
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole('button', { name: /authorize access/i }).click();
}

export async function expectHeading(page: Page, pattern: RegExp) {
  await expect(page.getByText(pattern).first()).toBeVisible({ timeout: 20000 });
}

export async function openSidebarModule(page: Page, label: string) {
  await page.getByRole('button', { name: new RegExp(`^${escapeForRegex(label)}$`, 'i') }).click();
}

export async function expectStatCardValue(page: Page, title: string, value: string | RegExp) {
  const testId = `stat-card-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
  await expect(page.getByTestId(testId)).toContainText(value);
}

function escapeForRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export { AGENT_EMAIL, ANALYST_TEST_CLIENT, MANAGER_TEST_CLIENT };
