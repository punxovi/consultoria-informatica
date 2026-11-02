import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir:'./tests/e2e',testMatch:'evidencias.integracion.spec.mjs',workers:1,timeout:60000,
  use:{baseURL:'http://127.0.0.1:4335',browserName:'chromium',channel:process.platform==='win32'?'msedge':undefined,headless:true,trace:'off'},
  globalSetup:'./tests/helpers/iniciar-evidencias-integracion.mjs',
});
