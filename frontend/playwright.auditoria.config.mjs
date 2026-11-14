import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e', testMatch: ['auditoria.spec.mjs'], workers: 1,
  use: { baseURL: 'http://127.0.0.1:4331', browserName: 'chromium', channel: process.platform === 'win32' ? 'msedge' : undefined, headless: true, screenshot: 'only-on-failure' },
  // Arranque con autenticación SSR simulada; el de expediente valida contra un Supabase inexistente.
  globalSetup: './tests/helpers/iniciar-solicitudes.mjs',
});
