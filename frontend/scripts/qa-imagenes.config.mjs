import { defineConfig } from '@playwright/test';
import base from '../playwright.config.mjs';

export default defineConfig({
  ...base,
  testDir: '.',
  testMatch: 'qa-imagenes.spec.mjs',
  outputDir: '../test-results/qa-imagenes',
  reporter: [['list']],
});
