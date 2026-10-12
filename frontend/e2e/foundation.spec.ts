import { test, expect } from '@playwright/test';

for (const javaScriptEnabled of [false, true]) {
  test.describe(javaScriptEnabled ? 'hydrated' : 'JavaScript disabled', () => {
    test.use({ javaScriptEnabled });

    test('mobile QR entry displays the Arabic fixture without horizontal overflow', async ({
      page,
    }) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto('/m/demo-code');
      await expect(page).toHaveURL(/\/r\/demo$/);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('مطعم التجربة');
      await expect(page.getByRole('heading', { level: 3 })).toHaveText('قهوة عربية');
      expect(await page.locator('html').getAttribute('dir')).toBe('rtl');
      await expect(page.locator('link[rel="canonical"]')).toHaveCount(1);
      await expect(page.locator('script[type="application/ld+json"]')).toHaveCount(1);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await page.getByRole('link', { name: 'الصفحة الرئيسية' }).click();
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(
        'منيو مطعمك… بشكل أذكى وأجمل',
      );
      expect(errors).toEqual([]);
    });

    test('marketing landing page renders all sections and without horizontal overflow', async ({
      page,
    }) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto('/');
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(
        'منيو مطعمك… بشكل أذكى وأجمل',
      );
      await expect(page.locator('#features')).toBeVisible();
      await expect(page.locator('#how-it-works')).toBeVisible();
      await expect(page.locator('#pricing')).toBeVisible();
      await expect(page.locator('#faq')).toBeVisible();
      await expect(page.locator('#request')).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      expect(errors).toEqual([]);
    });

    test('unknown route returns 404 with friendly illustration and home link', async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      const response = await page.goto('/unknown-missing-page');
      expect(response?.status()).toBe(404);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('الصفحة غير موجودة');
      await expect(page.getByRole('link', { name: 'العودة للصفحة الرئيسية' })).toBeVisible();
      expect(errors).toEqual([]);
    });
  });
}
