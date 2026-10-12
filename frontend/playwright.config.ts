import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './e2e',
  workers: 1,
  use: {
    baseURL: 'http://localhost:4000',
    viewport: { width: 390, height: 844 },
    launchOptions: process.env['CHROME_PATH'] ? { executablePath: process.env['CHROME_PATH'] } : {},
  },
});
