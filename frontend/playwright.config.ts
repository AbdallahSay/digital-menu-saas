import { defineConfig } from '@playwright/test';

const baseURL = process.env['E2E_BASE_URL'] ?? 'http://localhost:4000';

// The auth suite exercises Secure __Host- cookies and a backend that rejects
// non-HTTPS auth paths; running it against plain HTTP can only fail.
if (process.env['E2E_ADMIN_AUTH'] === '1' && !baseURL.startsWith('https://'))
  throw new Error(
    `E2E_ADMIN_AUTH=1 requires an HTTPS E2E_BASE_URL (got "${baseURL}"): ` +
      'the backend enforces HTTPS and Secure __Host- cookies on every auth path.',
  );

export default defineConfig({
  testDir: './e2e',
  workers: 1,
  use: {
    baseURL,
    viewport: { width: 390, height: 844 },
    launchOptions: process.env['CHROME_PATH'] ? { executablePath: process.env['CHROME_PATH'] } : {},
  },
});
