import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e', testMatch: 'diagnostico.spec.mjs', workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:4332', browserName: 'chromium',
    channel: process.env.BROWSER_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined),
    headless: true, screenshot: 'only-on-failure', trace: 'retain-on-failure',
  },
  globalSetup: './tests/helpers/iniciar-diagnostico.mjs',
});
