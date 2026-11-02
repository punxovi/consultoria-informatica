// @ts-check
import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import tailwindcss from '@tailwindcss/vite';
import react from '@astrojs/react';

// https://astro.build/config
export default defineConfig({
  output: 'server',
  server: {
    // Los enlaces de recuperación locales usan 127.0.0.1.
    host: '127.0.0.1',
  },
  adapter: node({
    mode: 'standalone',
  }),
  integrations: [react()],
  vite: {
    plugins: [tailwindcss()],
  },
});
