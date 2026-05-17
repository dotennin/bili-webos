import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { createBiliDevProxyPlugin } from './src/dev/biliProxy.js';

export default defineConfig({
  plugins: [react(), createBiliDevProxyPlugin()],
  base: './',
  build: {
    outDir: 'dist',
    target: 'chrome108',
    assetsInlineLimit: 4096,
    rollupOptions: {
      output: {
        manualChunks: {
          'shaka': ['shaka-player'],
          'react-vendor': ['react', 'react-dom'],
        }
      }
    }
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
  }
});
