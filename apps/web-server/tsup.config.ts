import { defineConfig } from 'tsup';
import path from 'path';
import type { Plugin } from 'esbuild';

/**
 * tsup configuration for Auto-Claude Web Server
 *
 * Key feature: Uses esbuild plugins to inject our shims in place of Electron modules.
 * This allows us to import Electron IPC handler code directly, and at bundle time,
 * all imports of 'projectStore' are redirected to our web-server shim.
 */

const __dirname = path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Z]:)/, '$1');

/**
 * Plugin to redirect project-store imports from frontend to our shim
 */
function projectStoreShimPlugin(): Plugin {
  const shimPath = path.resolve(__dirname, 'src/electron-shim/project-store.ts');

  return {
    name: 'project-store-shim',
    setup(build) {
      // Match any import that ends with 'project-store' (with or without extension)
      // This catches: '../project-store', '../../project-store', './project-store', etc.
      build.onResolve({ filter: /project-store(\.ts|\.js)?$/ }, (args) => {
        // Only redirect if it's a relative import from the frontend directory
        if (args.importer.includes('frontend') && args.path.includes('project-store')) {
          return { path: shimPath };
        }
        return null;
      });
    },
  };
}

/**
 * Plugin to redirect shared constants/types imports
 */
function sharedModulesPlugin(): Plugin {
  const frontendShared = path.resolve(__dirname, '../frontend/src/shared');

  return {
    name: 'shared-modules',
    setup(build) {
      // Match imports from shared directory within frontend
      build.onResolve({ filter: /^\.\.\/.*shared/ }, (args) => {
        if (args.importer.includes('frontend')) {
          // Resolve relative paths to the shared directory
          const resolved = path.resolve(path.dirname(args.importer), args.path);
          // Add .ts extension if needed
          const tsPath = resolved.endsWith('.ts') ? resolved : resolved + '.ts';
          const indexPath = path.join(resolved, 'index.ts');

          // Check which one exists (esbuild will handle this properly)
          return { path: tsPath };
        }
        return null;
      });
    },
  };
}

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node20',
  platform: 'node',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  splitting: false,

  // Add banner to define __dirname and __filename for ESM
  // Use var instead of const to allow redeclaration
  banner: {
    js: `import { fileURLToPath as __fileURLToPath } from 'url';
import { dirname as __dirname_fn } from 'path';
var __filename = __fileURLToPath(import.meta.url);
var __dirname = __dirname_fn(__filename);`,
  },

  // Bundle external packages that we import from frontend
  noExternal: [
    // Include frontend modules we import (they'll be bundled)
  ],

  // Don't bundle node_modules
  external: [
    'express',
    'ws',
    'bcrypt',
    'cookie-parser',
    'cors',
    'dotenv',
    'uuid',
    'chokidar',
    '@lydell/node-pty',
  ],

  esbuildPlugins: [
    projectStoreShimPlugin(),
    sharedModulesPlugin(),
  ],

  esbuildOptions(options) {
    const frontendMain = path.resolve(__dirname, '../frontend/src/main');
    const frontendShared = path.resolve(__dirname, '../frontend/src/shared');

    // Alias for module specifiers (not relative paths)
    options.alias = {
      // Alias for Electron module (we provide shims)
      'electron': path.resolve(__dirname, 'src/electron-shim/electron.ts'),

      // Alias frontend paths for direct imports using @ notation
      '@electron/ipc-handlers': path.join(frontendMain, 'ipc-handlers'),
      '@electron/changelog': path.join(frontendMain, 'changelog'),
      '@electron/agent': path.join(frontendMain, 'agent'),
      '@shared': frontendShared,
    };
  },
});
