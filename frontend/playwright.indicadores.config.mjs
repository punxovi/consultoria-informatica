import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir:'./tests/e2e',testMatch:'indicadores.spec.mjs',workers:1,
  use:{baseURL:'http://127.0.0.1:4331',browserName:'chromium',channel:process.platform==='win32'?'msedge':undefined,headless:true,screenshot:'only-on-failure'},
  globalSetup:'./tests/helpers/iniciar-expediente.mjs',
});
