import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

// AETHER is packaged as a desktop application later on (Tauri). Using a
// relative base + hash routing keeps the build portable to a local webview.
export default defineConfig({
  base: './',
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    strictPort: false,
    // The AETHER engine (backend/, FastAPI) listens on 127.0.0.1:8765.
    // Proxying keeps the UI same-origin in development; a packaged build sets
    // VITE_AETHER_API to the engine URL instead.
    proxy: {
      '/api': { target: process.env.AETHER_ENGINE_URL ?? 'http://127.0.0.1:8765', changeOrigin: false },
    },
  },
});
