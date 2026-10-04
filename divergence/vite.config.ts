import { defineConfig } from 'vite';

// Relative base: the build works from any folder (Home Assistant /local/, nginx, `npx serve`).
export default defineConfig({
  base: './',
  build: { outDir: 'dist', target: 'es2020', assetsInlineLimit: 0, chunkSizeWarningLimit: 1200 },
});
