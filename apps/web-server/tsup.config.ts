import { defineConfig } from 'tsup';

import { fileURLToPath } from 'url';
import { dirname } from 'path';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: false,
  splitting: false,
  sourcemap: true,
  clean: true,
  outDir: 'dist',
  platform: 'node',
  // Don't bundle dependencies - resolve them at runtime
  noExternal: [],
  // Inject __dirname and __filename for ESM compatibility
  banner: {
    js: `import { fileURLToPath as __fileURLToPath } from 'url';
import { dirname as __dirname_func } from 'path';
const __filename = __fileURLToPath(import.meta.url);
const __dirname = __dirname_func(__filename);`,
  },
  // Alias 'electron' to 'electron-to-web/main' so imported handlers work
  esbuildOptions(options) {
    options.alias = {
      'electron': 'electron-to-web/main'
    };
    options.platform = 'node';
  },
});
