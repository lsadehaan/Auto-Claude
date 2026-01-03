import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

/**
 * Vite config for building frontend as standalone web app
 * Uses electron-to-web for IPC communication over WebSocket
 */
export default defineConfig({
  plugins: [react()],

  root: resolve(__dirname, 'src/renderer'),

  build: {
    outDir: resolve(__dirname, 'dist-web'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'src/renderer/index.web.html')
      }
    },
    sourcemap: true,
  },

  resolve: {
    alias: {
      // Redirect Electron imports to electron-to-web for renderer
      'electron': 'electron-to-web/renderer',

      // Preserve existing path aliases
      '@': resolve(__dirname, 'src/renderer'),
      '@shared': resolve(__dirname, 'src/shared'),
      '@features': resolve(__dirname, 'src/renderer/features'),
      '@components': resolve(__dirname, 'src/renderer/shared/components'),
      '@hooks': resolve(__dirname, 'src/renderer/shared/hooks'),
      '@lib': resolve(__dirname, 'src/renderer/shared/lib'),

      // Preload API needs to work in web context
      '@preload': resolve(__dirname, 'src/preload')
    }
  },

  // Define for conditional code
  define: {
    'process.env.ELECTRON': 'false',
    'process.env.WEB': 'true',
  },

  server: {
    port: 5173,
    proxy: {
      // Proxy API requests to web-server during development
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true
      },
      // WebSocket IPC endpoint
      '/ipc': {
        target: 'ws://localhost:3001',
        ws: true
      }
    }
  }
});
