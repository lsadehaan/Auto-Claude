/**
 * Create runtime stubs for externalized packages
 *
 * This script creates minimal stub packages in node_modules for packages
 * that are externalized during bundling. These stubs provide the minimum
 * API surface needed to satisfy imports without bundling problematic code.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const stubs = {
  'electron-log': {
    'package.json': {
      name: 'electron-log',
      version: '999.0.0-stub',
      type: 'module',
      main: './main.js',
      exports: {
        '.': './main.js',
        './main': './main.js',
        './main.js': './main.js',
        './renderer': './main.js',
        './renderer.js': './main.js',
      },
    },
    'main.js': `/**
 * electron-log stub for web server
 * Console-based logger implementation
 */

const logger = {
  info: (...args) => console.log('[INFO]', ...args),
  error: (...args) => console.error('[ERROR]', ...args),
  warn: (...args) => console.warn('[WARN]', ...args),
  debug: (...args) => console.debug('[DEBUG]', ...args),
  verbose: (...args) => console.log('[VERBOSE]', ...args),
  log: (...args) => console.log(...args),
  silly: (...args) => console.log('[SILLY]', ...args),
  initialize: () => {},
  transports: {
    file: { level: 'info' },
    console: { level: 'info' },
  },
  scope: (name) => logger,
};

export default logger;
export const { info, error, warn, debug, verbose, log, silly, initialize, transports, scope } = logger;
`,
  },

  'electron-updater': {
    'package.json': {
      name: 'electron-updater',
      version: '999.0.0-stub',
      type: 'module',
      main: './index.js',
    },
    'index.js': `/**
 * electron-updater stub for web server
 * Auto-updates don't apply in web context
 */

const autoUpdater = {
  checkForUpdates: async () => null,
  downloadUpdate: async () => [],
  quitAndInstall: () => {},
  on: () => autoUpdater,
  once: () => autoUpdater,
  removeListener: () => autoUpdater,
  setFeedURL: () => {},
  getFeedURL: () => '',
  channel: 'latest',
};

export { autoUpdater };
export default autoUpdater;
`,
  },

  '@lydell/node-pty': {
    'package.json': {
      name: '@lydell/node-pty',
      version: '999.0.0-stub',
      type: 'module',
      main: './index.js',
    },
    'index.js': `/**
 * node-pty stub for web server
 * Terminal emulation not supported in web context
 */

export const spawn = () => {
  throw new Error('Terminal emulation not supported in web server context');
};

export default { spawn };
`,
  },
};

// Create stubs in node_modules
console.log('[create-stubs] Creating runtime stubs for externalized packages...');

for (const [name, files] of Object.entries(stubs)) {
  const dir = path.join(__dirname, '../node_modules', name);

  // Create directory (handle scoped packages like @lydell/node-pty)
  fs.mkdirSync(dir, { recursive: true });

  // Write each file
  for (const [filename, content] of Object.entries(files)) {
    const filePath = path.join(dir, filename);
    const fileContent = typeof content === 'string'
      ? content
      : JSON.stringify(content, null, 2);

    fs.writeFileSync(filePath, fileContent);
  }

  console.log(`[create-stubs] ✓ Created stub: ${name}`);
}

console.log('[create-stubs] All stubs created successfully');
