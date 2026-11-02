import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.spec.mjs',
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:4326',
    browserName: 'chromium',
    channel: process.env.BROWSER_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined),
    headless: true,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  globalSetup: fileURLToPath(new URL('./tests/helpers/iniciar-servidor-e2e.mjs', import.meta.url)),
});
