import { defineConfig } from '@playwright/test';

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
  webServer: {
    command: 'node tests/helpers/programas-servidor.mjs',
    url: 'http://127.0.0.1:4326/programas',
    reuseExistingServer: false,
    timeout: 60000,
  },
});
