import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: false,
  splitting: false,
  sourcemap: true,
  clean: true,
  outDir: 'dist',
  // Alias 'electron' to 'electron-to-web/main' so imported handlers work
  esbuildOptions(options) {
    options.alias = {
      'electron': 'electron-to-web/main'
    };
  },
});
