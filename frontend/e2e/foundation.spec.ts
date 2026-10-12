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
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('القائمة الرقمية');
      expect(errors).toEqual([]);
    });
  });
}
