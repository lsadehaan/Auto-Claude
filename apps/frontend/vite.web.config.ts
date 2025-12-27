/**
 * Vite Configuration for Web SPA Build
 *
 * This config builds the renderer as a standalone SPA for web deployment.
 * It uses the web-api abstraction instead of Electron IPC.
 */

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  root: resolve(__dirname, 'src/renderer'),

  plugins: [react()],

  resolve: {
    alias: {
      '@': resolve(__dirname, 'src/renderer'),
      '@shared': resolve(__dirname, 'src/shared'),
      '@features': resolve(__dirname, 'src/renderer/features'),
      '@components': resolve(__dirname, 'src/renderer/shared/components'),
      '@hooks': resolve(__dirname, 'src/renderer/shared/hooks'),
      '@lib': resolve(__dirname, 'src/renderer/shared/lib'),
    },
  },

  build: {
    outDir: resolve(__dirname, 'dist-web'),
    emptyOutDir: true,
    sourcemap: true,

    rollupOptions: {
      input: {
        main: resolve(__dirname, 'src/renderer/index.html'),
      },
      output: {
        // Use content hashing for cache busting
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
      },
    },

    // Optimize chunk splitting
    chunkSizeWarningLimit: 1000,
  },

  server: {
    port: 5173,
    host: true,

    proxy: {
      // Proxy API requests to the web server during development
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      // Proxy WebSocket connections
      '/ws': {
        target: 'ws://localhost:3001',
        ws: true,
      },
    },

    watch: {
      ignored: [
        '**/node_modules/**',
        '**/.git/**',
        '**/.worktrees/**',
        '**/.auto-claude/**',
        '**/out/**',
        '**/dist-web/**',
      ],
    },
  },

  preview: {
    port: 4173,
    host: true,
  },

  define: {
    // Mark as web production mode - disables browser mock
    'import.meta.env.VITE_WEB_MODE': JSON.stringify('true'),
    // Git commit hash for deployment tracking
    'import.meta.env.VITE_GIT_COMMIT': JSON.stringify(process.env.VITE_GIT_COMMIT || 'dev'),
    // Ensure environment variables are available
    // For production, use relative URLs so requests go through Caddy proxy
    // For development, use localhost:3001
    'import.meta.env.VITE_API_URL': JSON.stringify(process.env.VITE_API_URL || (process.env.NODE_ENV === 'production' ? '/api' : 'http://localhost:3001/api')),
    'import.meta.env.VITE_WS_URL': JSON.stringify(process.env.VITE_WS_URL || (process.env.NODE_ENV === 'production' ? '' : 'ws://localhost:3001')),
  },
});
