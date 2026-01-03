import { defineConfig } from 'tsup';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

// Get current directory for resolving stub paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: false,
  splitting: false,
  sourcemap: true,
  clean: true,
  outDir: 'dist',
  platform: 'node',

  // Don't bundle Electron-specific packages and native modules - we'll provide runtime shims
  external: [
    'electron-log',
    'electron-updater',
    '@lydell/node-pty', // Native terminal emulation module
  ],

  // Inject __dirname and __filename for ESM compatibility
  banner: {
    js: `import { fileURLToPath as __fileURLToPath } from 'url';
import { dirname as __dirname_func } from 'path';
const __filename = __fileURLToPath(import.meta.url);
const __dirname = __dirname_func(__filename);`,
  },
  // Alias imports for web compatibility
  esbuildOptions(options) {
    options.alias = {
      // Redirect Electron imports to electron-to-web
      'electron': 'electron-to-web/main',
    };
    options.platform = 'node';
  },
});
