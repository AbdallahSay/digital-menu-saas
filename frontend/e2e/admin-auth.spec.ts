import { expect, test } from '@playwright/test';

/**
 * Real-browser coverage for the owner authentication flow (U02).
 *
 * Requires the full stack behind the approved same-origin HTTPS router:
 * .NET API with SQL Server, a provisioned active owner and the Angular SSR
 * host, because the backend enforces HTTPS and Secure __Host- cookies on
 * every auth path. Run with:
 *   E2E_ADMIN_AUTH=1 E2E_BASE_URL=https://<host> E2E_OWNER_EMAIL=... E2E_OWNER_PASSWORD=... npm run test:e2e
 * E2E_BASE_URL must be HTTPS; playwright.config.ts fails fast otherwise.
 * CI wiring lands with the staging harness; until then these are skipped by
 * default so the public-menu e2e suite stays hermetic.
 */
const RUN = process.env['E2E_ADMIN_AUTH'] === '1';
const EMAIL = process.env['E2E_OWNER_EMAIL'] ?? '';
const PASSWORD = process.env['E2E_OWNER_PASSWORD'] ?? '';

test.skip(!RUN, 'full backend stack with a provisioned owner is required (E2E_ADMIN_AUTH=1)');

test.describe('owner authentication', () => {
  test('issues the antiforgery cookie before login', async ({ page, context }) => {
    // The CSRF call is async after navigation: wait for it to actually
    // complete before inspecting cookies, not right after goto returns.
    const csrf = page.waitForResponse(
      (response) => response.url().includes('/api/v1/auth/csrf') && response.status() === 200,
    );
    await page.goto('/login');
    await csrf;
    const cookies = await context.cookies();
    expect(cookies.some((cookie) => cookie.name === 'XSRF-TOKEN')).toBe(true);
    expect(cookies.some((cookie) => cookie.name === '__Host-DigitalMenu.Antiforgery')).toBe(true);
  });

  test('signs in, survives reload, and signs out', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('البريد الإلكتروني').fill(EMAIL);
    await page.getByLabel('كلمة المرور').fill(PASSWORD);
    await page.getByRole('button', { name: 'دخول' }).click();

    // Successful login routes to the owner dashboard.
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('أهلاً بيك');

    // The cookie session survives a full reload.
    await page.reload();
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('أهلاً بيك');

    // Logout returns to /login and the guard blocks /admin again.
    await page.getByRole('button', { name: 'تسجيل الخروج' }).click();
    await expect(page).toHaveURL(/\/login$/);
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/login$/);
  });

  test('rejects a login POST without the CSRF header', async ({ page }) => {
    await page.goto('/login');
    const status = await page.evaluate(async () => {
      const response = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'a@b.c', password: 'some-password-12' }),
      });
      return response.status;
    });
    expect(status).toBe(400);
  });

  test('shows the generic credentials error for a wrong password', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('البريد الإلكتروني').fill(EMAIL);
    await page.getByLabel('كلمة المرور').fill('definitely-wrong-1');
    await page.getByRole('button', { name: 'دخول' }).click();
    await expect(page.getByRole('alert')).toContainText(
      'البريد الإلكتروني أو كلمة المرور غير صحيحة',
    );
    await expect(page).toHaveURL(/\/login$/);
  });
});
