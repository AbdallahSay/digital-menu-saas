import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

mkdirSync('screenshots/after', { recursive: true });

const executablePath = process.env['CHROME_PATH'] || undefined;
const browser = await chromium.launch({
  executablePath,
  headless: true,
});

async function capture(urlPath, filename, width, height) {
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  await page.goto(`http://localhost:4000${urlPath}`, { waitUntil: 'networkidle' });
  await page.screenshot({ path: `screenshots/after/${filename}`, fullPage: false });
  console.log(`Saved screenshots/after/${filename} (${width}x${height})`);
  await context.close();
}

async function run() {
  // 1. Marketing Desktop
  await capture('/', 'marketing-desktop-1440.png', 1440, 900);
  // 2. Marketing Mobile (iPhone 14 / standard 390px)
  await capture('/', 'marketing-mobile-390.png', 390, 844);
  // 3. Marketing Mobile Compact (375px)
  await capture('/', 'marketing-mobile-375.png', 375, 667);
  // 4. 404 Desktop
  await capture('/non-existent-page', 'not-found-desktop-1440.png', 1440, 900);
  // 5. 404 Mobile
  await capture('/non-existent-page', 'not-found-mobile-390.png', 390, 844);
  // 6. Demo Menu Desktop
  await capture('/r/demo', 'menu-desktop-1440.png', 1440, 900);
  // 7. Demo Menu Mobile
  await capture('/r/demo', 'menu-mobile-390.png', 390, 844);

  await browser.close();
  console.log('All screenshots captured successfully.');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
