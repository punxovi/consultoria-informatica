import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir:'./tests/e2e',testMatch:'indicadores.integracion.spec.mjs',workers:1,timeout:60000,
  use:{baseURL:'http://127.0.0.1:4336',browserName:'chromium',channel:process.platform==='win32'?'msedge':undefined,headless:true,trace:'off'},
  globalSetup:'./tests/helpers/iniciar-indicadores-integracion.mjs',
});
