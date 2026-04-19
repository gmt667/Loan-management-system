# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: role-dashboards.spec.ts >> Role dashboard coordination >> agent login reaches field operations modules
- Location: tests\role-dashboards.spec.ts:83:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByText(/Agent Mission Control/i).first()
Expected: visible
Timeout: 20000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 20000ms
  - waiting for getByText(/Agent Mission Control/i).first()

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
        - button "Settings" [ref=e23]:
          - img [ref=e25]
          - generic [ref=e28]: Settings
      - generic [ref=e29]:
        - generic [ref=e31]:
          - paragraph [ref=e32]: Active Session
          - paragraph [ref=e35]: AGENT AUTHORITY
          - paragraph [ref=e36]: agent.test@fastkwacha.com
        - button "Logout" [ref=e37]:
          - img
          - generic [ref=e38]: Logout
    - main [ref=e39]:
      - generic [ref=e40]:
        - generic [ref=e41]:
          - heading "Institutional Dashboard" [level=1] [ref=e42]
          - paragraph [ref=e43]: Operational overview for Central Branch • Q3 FY24
        - generic [ref=e44]:
          - generic [ref=e45]:
            - button "Export CSV" [ref=e46]
            - button "+ New Application" [ref=e47]
          - separator [ref=e48]
          - button "1" [ref=e50]:
            - img [ref=e51]
            - generic [ref=e54]: "1"
      - generic [ref=e59]: "No dashboard available for role: AGENT"
```

# Test source

```ts
  132 |       updatedAt: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
  133 |     },
  134 |   ],
  135 |   fastkwacha_local_products: [
  136 |     {
  137 |       id: 'manager-product-1',
  138 |       name: 'Manager Test Product',
  139 |       interestRate: 18,
  140 |       maxTerm: 12,
  141 |       minAmount: 50000,
  142 |       maxAmount: 500000,
  143 |       status: 'ACTIVE',
  144 |       charges: {
  145 |         applicationFee: { type: 'FIXED', value: 5000 },
  146 |         processingFee: { type: 'PERCENTAGE', value: 2 },
  147 |         disbursementFee: { type: 'FIXED', value: 0 },
  148 |       },
  149 |       penaltyRate: 5,
  150 |       penaltyType: 'PERCENTAGE',
  151 |     },
  152 |   ],
  153 |   fastkwacha_local_loans: [],
  154 |   fastkwacha_local_transactions: [],
  155 |   fastkwacha_local_schedule: [],
  156 |   fastkwacha_local_workflow: [],
  157 | };
  158 | 
  159 | export const analystSeed: LocalStorageSeed = {
  160 |   fastkwacha_local_clients: [
  161 |     {
  162 |       id: 'analyst-client-1',
  163 |       name: ANALYST_TEST_CLIENT,
  164 |       phone: '+265999555666',
  165 |       nationalId: 'ANL-001',
  166 |       residence: 'Lilongwe, Sector 4',
  167 |       status: 'ACTIVE',
  168 |       createdAt: new Date().toISOString(),
  169 |       updatedAt: new Date().toISOString(),
  170 |     },
  171 |   ],
  172 |   fastkwacha_local_apps: [
  173 |     {
  174 |       id: 'analyst-app-1',
  175 |       clientId: 'analyst-client-1',
  176 |       clientName: ANALYST_TEST_CLIENT,
  177 |       requestedAmount: 250000,
  178 |       amount: 250000,
  179 |       status: 'IN_REVIEW',
  180 |       current_stage: 'REVIEWED',
  181 |       termMonths: 6,
  182 |       monthlyIncome: 650000,
  183 |       employmentStatus: 'EMPLOYED',
  184 |       clientSnapshot: {
  185 |         name: ANALYST_TEST_CLIENT,
  186 |         nationalId: 'ANL-001',
  187 |         phone: '+265 999 555 666',
  188 |         residence: 'Lilongwe, Sector 4',
  189 |       },
  190 |       crb: {
  191 |         score: 450,
  192 |         riskLevel: 'MEDIUM',
  193 |         hasExistingLoans: true,
  194 |         defaultHistory: false,
  195 |         reportSummary: 'Seeded analyst review case for browser verification.',
  196 |         status: 'COMPLETED',
  197 |         source: 'MANUAL',
  198 |         checkedAt: new Date().toISOString(),
  199 |       },
  200 |       createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
  201 |       updatedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
  202 |     },
  203 |   ],
  204 |   fastkwacha_local_workflow: [],
  205 |   fastkwacha_local_transactions: [],
  206 |   fastkwacha_local_loans: [],
  207 |   fastkwacha_local_schedule: [],
  208 |   fastkwacha_local_products: [],
  209 | };
  210 | 
  211 | export async function openFreshApp(page: Page, seed?: LocalStorageSeed) {
  212 |   await page.addInitScript((storageSeed) => {
  213 |     window.localStorage.clear();
  214 |     window.sessionStorage.clear();
  215 | 
  216 |     for (const [key, value] of Object.entries(storageSeed || {})) {
  217 |       window.localStorage.setItem(key, JSON.stringify(value));
  218 |     }
  219 |   }, seed || {});
  220 | 
  221 |   await page.goto('/');
  222 | }
  223 | 
  224 | export async function loginAs(page: Page, email: string, password: string, seed?: LocalStorageSeed) {
  225 |   await openFreshApp(page, seed);
  226 |   await page.locator('input[type="email"]').fill(email);
  227 |   await page.locator('input[type="password"]').fill(password);
  228 |   await page.getByRole('button', { name: /authorize access/i }).click();
  229 | }
  230 | 
  231 | export async function expectHeading(page: Page, pattern: RegExp) {
> 232 |   await expect(page.getByText(pattern).first()).toBeVisible({ timeout: 20000 });
      |                                                 ^ Error: expect(locator).toBeVisible() failed
  233 | }
  234 | 
  235 | export async function openSidebarModule(page: Page, label: string) {
  236 |   await page.getByRole('button', { name: new RegExp(`^${escapeForRegex(label)}$`, 'i') }).click();
  237 | }
  238 | 
  239 | export async function expectStatCardValue(page: Page, title: string, value: string | RegExp) {
  240 |   const testId = `stat-card-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
  241 |   await expect(page.getByTestId(testId)).toContainText(value);
  242 | }
  243 | 
  244 | function escapeForRegex(value: string) {
  245 |   return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  246 | }
  247 | 
  248 | export { AGENT_EMAIL, ANALYST_TEST_CLIENT, MANAGER_TEST_CLIENT };
  249 | 
```